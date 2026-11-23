// Ballegh demo server — Express + Socket.IO, in-memory store persisted to data/db.json.
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import compression from 'compression';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, db, load, save, createReport, act, runEscalation, userById, reportById, verifyAudit, httpError, audit, unitName, getCat } from './lib/store.js';
import { buildGeo, locate } from './lib/geo.js';
import { computeKpis } from './lib/kpi.js';
import { PRIORITY_AR, STATUS_AR, OPEN_STATUSES } from './lib/config.js';
import { seed } from './scripts/seed.js';

const PORT = Number(process.env.PORT) || 4000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : process.env.DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(HERE, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

if (!load()) { console.log('No usable data — generating demo data…'); const t = Date.now(); console.log(seed(), `in ${Date.now() - t} ms`); }

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', true);

// ---------- staff access gate ----------
// When DEMO_PASSWORD is set (on the hosting), staff screens and staff APIs need a staff login:
// /login.html sets a signed, HttpOnly session cookie (12 h). HTTP Basic auth still works for scripts.
// The public site, the citizen app and citizen API calls stay open.
const ACCESS_USER = process.env.DEMO_USER || 'admin';
const ACCESS_PASS = process.env.DEMO_PASSWORD || '';
const SESSION_SECRET = crypto.createHash('sha256').update(`ballegh:${process.env.SESSION_SECRET || ''}:${ACCESS_PASS}`).digest();
const SESSION_MS = 12 * 3_600_000;
const COOKIE = 'ballegh_staff';
const STAFF_PAGES = /^\/(ops|unit|governor|admin|map|reports|report|demo|presentation)(\.html)?$/;
const PUBLIC_API = new Set(['/api/meta', '/api/geo', '/api/locate', '/api/content', '/api/public/stats', '/api/auth/otp', '/api/auth/verify', '/api/health', '/api/staff/login', '/api/staff/logout', '/api/staff/session']);
const sameSecret = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sign = exp => crypto.createHmac('sha256', SESSION_SECRET).update(`${ACCESS_USER}|${exp}`).digest('base64url');
const cookieOf = (req, name) => (req.headers.cookie || '').split(/;\s*/).map(c => c.split('=')).find(([k]) => k === name)?.slice(1).join('=');
function hasStaffAccess(req) {
  if (!ACCESS_PASS) return true;
  const c = cookieOf(req, COOKIE);
  if (c) { const [exp, sig] = c.split('.'); if (Number(exp) > Date.now() && sig && sameSecret(sig, sign(exp))) return true; }
  const h = req.get('authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  const [u, ...p] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
  return u === ACCESS_USER && sameSecret(p.join(':'), ACCESS_PASS);
}
app.use((req, res, next) => {
  const p = req.path;
  const isPage = STAFF_PAGES.test(p);
  let needsStaff = isPage;
  if (!needsStaff && p.startsWith('/api/') && !PUBLIC_API.has(p)) {
    const u = userById(req.get('x-user-id'));
    const citizenCall = u?.role === 'CITIZEN' && (p === '/api/reports' || /^\/api\/reports\/[\w-]+(\/actions\/rate)?$/.test(p));
    needsStaff = !citizenCall;
  }
  if (needsStaff) res.set('Cache-Control', 'no-store');
  if (!needsStaff || hasStaffAccess(req)) return next();
  if (isPage) return res.redirect(302, `/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  res.status(401).json({ error: 'مطلوب تسجيل دخول الموظفين', login: '/login.html' });
});

// login with simple brute-force protection: 8 failed attempts per IP per 15 minutes
const failures = new Map();
// Accepts JSON (the login page's script) and a plain HTML form POST (works even before/without JavaScript,
// so the password is never sent in a URL). Form posts get redirects instead of JSON.
const safeNext = n => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/api/')) ? n : '/demo.html';
app.post('/api/staff/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const isForm = req.is('application/x-www-form-urlencoded');
  const body = req.body || {};
  const next = safeNext(body.next);
  const fail = (status, code, error) => isForm
    ? res.redirect(303, `/login.html?error=${code}&next=${encodeURIComponent(next)}`)
    : res.status(status).json({ error });
  if (!ACCESS_PASS) return isForm ? res.redirect(303, next) : res.json({ ok: true, open: true });
  const ip = req.ip || 'x', now = Date.now();
  const f = (failures.get(ip) || []).filter(t => now - t < 15 * 60_000);
  if (f.length >= 8) return fail(429, 'locked', 'محاولات كتير غلط — جرّب تاني بعد ربع ساعة');
  const user = body.user ?? body.username, password = body.password;
  if (!(String(user || '').trim() === ACCESS_USER && sameSecret(password || '', ACCESS_PASS))) {
    f.push(now); failures.set(ip, f);
    return fail(401, 'bad', 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  failures.delete(ip);
  const exp = now + SESSION_MS;
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.set('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
  if (isForm) return res.redirect(303, next);
  res.json({ ok: true });
});
app.get('/api/staff/logout', (_req, res) => {
  res.set('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`).set('Cache-Control', 'no-store').redirect(302, '/login.html');
});
app.get('/api/staff/session', (req, res) => {
  const loggedIn = hasStaffAccess(req);
  const exp = Number((cookieOf(req, COOKIE) || '').split('.')[0]) || null;
  res.set('Cache-Control', 'no-store').json({ loggedIn, required: !!ACCESS_PASS, user: loggedIn && ACCESS_PASS ? ACCESS_USER : null, expiresAt: loggedIn && exp > Date.now() ? exp : null });
});

app.use(express.static(path.join(HERE, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(UPLOADS));
app.use('/brand', express.static(path.join(HERE, '..', 'brand')));
app.get('/api/health', (_req, res) => res.json({ ok: true, reports: db.reports.length, uptime: Math.round(process.uptime()) }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${path.extname(file.originalname || '') || (file.mimetype.startsWith('video') ? '.mp4' : file.mimetype.startsWith('audio') ? '.webm' : '.jpg')}`),
  }),
  limits: { fileSize: 150 * 1024 * 1024, files: 7 },
});

// --- demo "auth": the client sends x-user-id; real system uses OTP / OAuth + JWT ---
function actor(req) {
  const u = userById(req.get('x-user-id'));
  if (!u) throw httpError(401, 'مستخدم غير معروف');
  if (u.active === false) throw httpError(403, 'هذا الحساب معطّل');
  return u;
}
const wrap = fn => (req, res) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { res.status(e.status || 500).json({ error: e.message }); if (!e.status) console.error(e); } };

// Visibility: what each role can see of a report
function view(r, u, { full = false } = {}) {
  const citizen = r.citizenId ? userById(r.citizenId) : null;
  const unitHead = u.role === 'UNIT_HEAD' || u.role === 'UNIT_STAFF' ? userById(`head-${r.unitId}`) : null;
  const hide = unitHead ? (unitHead.hideReporter ?? db.settings.hideReporterDefault) : false;
  const base = {
    id: r.id, code: r.code, category: r.category, status: r.status, priority: r.priority, location: r.location,
    villageName: r.villageName, unitId: r.unitId, unitName: r.unitName, centerId: r.centerId, centerName: r.centerName,
    noUnitArea: r.noUnitArea, source: r.source, createdAt: r.createdAt, updatedAt: r.updatedAt, ackDueAt: r.ackDueAt,
    resolveDueAt: r.resolveDueAt, acknowledgedAt: r.acknowledgedAt, resolvedAt: r.resolvedAt, closedAt: r.closedAt,
    duplicateCount: r.duplicateCount, escalation: r.escalation, assigneeId: r.assigneeId, reopenCount: r.reopenCount,
    thumb: r.media?.[0]?.url, rated: !!r.rating, sampled: !!r.rejection?.sampled, stars: r.rating?.stars ?? null, citizenResolved: r.rating ? r.rating.resolved : null,
    rejectReason: r.rejection?.reason || null, rejectConfirmed: !!r.rejection?.confirmed, rejectOverridden: !!r.rejection?.overridden, slaPausedMs: r.slaPausedMs || 0,
  };
  if (!full) return base;
  const assignee = r.assigneeId ? userById(r.assigneeId) : null;
  return {
    ...base, description: r.description, guidedAnswers: r.guidedAnswers, media: r.media, accuracy: r.accuracy,
    locationSource: r.locationSource, socialUrl: r.socialUrl, resolution: r.resolution, rating: r.rating,
    rejection: r.rejection, reviews: r.reviews, prioritySource: r.prioritySource, slaPausedMs: r.slaPausedMs,
    assigneeName: assignee?.name || null,
    reporter: u.role === 'CITIZEN' ? null : hide ? { hidden: true } : citizen ? { name: citizen.name, phone: citizen.phone } : { name: 'غرفة العمليات (سوشيال ميديا)' },
    duplicates: db.reports.filter(d => d.masterId === r.id).map(d => ({ code: d.code, createdAt: d.createdAt })),
    events: r.events.map(e => ({ ...e, actorName: e.actorId === 'system' ? 'النظام' : (userById(e.actorId)?.name || '—') })),
  };
}
function scopeFilter(u) {
  switch (u.role) {
    case 'CITIZEN': return r => r.citizenId === u.id;
    case 'UNIT_HEAD': return r => r.unitId === u.id.replace('head-', '') && !r.masterId;
    case 'UNIT_STAFF': return r => r.unitId === u.unitId && !r.masterId && (r.assigneeId === u.id);
    case 'CENTER_HEAD': return r => r.centerId === u.centerId && !r.masterId;
    default: return r => !r.masterId;
  }
}
const masterOf = r => (r.masterId ? reportById(r.masterId) : r);

// --- reference ---
app.get('/api/info', wrap(() => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  return { port: PORT, lan: ips.map(ip => `http://${ip}:${PORT}`) };
}));
app.get('/api/meta', wrap(() => ({ categories: db.categories, statusAr: STATUS_AR, priorityAr: PRIORITY_AR, settings: db.settings })));
let geoCache = null;
app.get('/api/geo', wrap((_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const key = JSON.stringify(db.unitMeta);
  if (geoCache?.key === key) return geoCache.body;
  const g = buildGeo();
  const body = { ...g, units: { ...g.units, features: g.units.features.map(f => ({ ...f, properties: { ...f.properties, name: unitName(f.properties.id, f.properties.name), defaultName: f.properties.name } })) } };
  geoCache = { key, body };
  return body;
}));
app.get('/api/content', wrap(() => db.content));
app.get('/api/locate', wrap(req => locate(Number(req.query.lng), Number(req.query.lat))));
app.get('/api/users', wrap(req => db.users.filter(u => u.role !== 'CITIZEN' || u.id === 'c-demo').filter(u => !req.query.role || u.role === req.query.role)
  .filter(u => req.query.all || u.active !== false)
  .map(u => ({ id: u.id, role: u.role, name: u.name, unitId: u.unitId, centerId: u.centerId, hideReporter: u.hideReporter, phone: u.role === 'CITIZEN' ? undefined : u.phone, email: u.email, active: u.active !== false, parentId: u.parentId }))));

// --- citizen login (demo OTP = 1234) ---
app.post('/api/auth/otp', wrap(req => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (!/^01[0125]\d{8}$/.test(phone)) throw httpError(400, 'رقم موبايل مصري غير صحيح');
  return { sent: true, demoCode: '1234' };
}));
app.post('/api/auth/verify', wrap(req => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (req.body.code !== '1234') throw httpError(400, 'الكود غير صحيح');
  let u = db.users.find(x => x.role === 'CITIZEN' && x.phone === phone);
  if (!u) { u = { id: `c-${crypto.randomUUID().slice(0, 8)}`, role: 'CITIZEN', name: req.body.name || 'مواطن', phone, phoneVerified: true }; db.users.push(u); save(); }
  return { id: u.id, name: u.name, phone: u.phone };
}));

// --- reports ---
app.get('/api/reports', wrap(req => {
  const u = actor(req);
  const days = Number(req.query.days) || 0;
  const from = days ? Date.now() - days * 86_400_000 : 0;
  const list = db.reports.filter(scopeFilter(u)).filter(r => r.createdAt >= from);
  if (u.role === 'CITIZEN') return list.sort((a, b) => b.createdAt - a.createdAt).map(r => ({ ...view(masterOf(r), u), id: r.id, code: r.code, createdAt: r.createdAt, isDuplicate: !!r.masterId }));
  return list.map(r => view(r, u));
}));
app.get('/api/reports/:id', wrap(req => {
  const u = actor(req);
  const r = reportById(req.params.id);
  if (!r || !scopeFilter(u)(r) && !(u.role === 'CITIZEN' && r.citizenId === u.id)) throw httpError(404, 'البلاغ غير موجود');
  if (u.role === 'CITIZEN' && r.masterId) return { ...view(masterOf(r), u, { full: true }), id: r.id, code: r.code, isDuplicate: true, masterCode: masterOf(r).code };
  return view(r, u, { full: true });
}));

app.post('/api/reports', upload.array('media', 6), wrap(req => {
  const u = actor(req);
  if (!['CITIZEN', 'OPS_SUPERVISOR', 'OPS_REVIEWER'].includes(u.role)) throw httpError(403, 'غير مصرح');
  const b = req.body;
  const files = req.files || [];
  const photos = files.filter(f => f.mimetype.startsWith('image'));
  const videos = files.filter(f => f.mimetype.startsWith('video'));
  const audio = files.filter(f => f.mimetype.startsWith('audio'));
  if (photos.length > 5) throw httpError(400, 'الحد الأقصى 5 صور');
  if (videos.length > 1 || (videos.length && photos.length)) throw httpError(400, 'فيديو واحد فقط أو حتى 5 صور');
  const meta = b.mediaMeta ? JSON.parse(b.mediaMeta) : [];
  const media = [...photos, ...videos].map((f, i) => ({ kind: f.mimetype.startsWith('video') ? 'video' : 'photo', url: `/uploads/${f.filename}`, size: f.size, ...(meta[i] || {}) }));
  if (audio[0]) media.push({ kind: 'audio', url: `/uploads/${audio[0].filename}`, size: audio[0].size });
  const social = u.role !== 'CITIZEN';
  const { report, master } = createReport({
    citizenId: social ? null : u.id, category: b.category, description: b.description,
    guidedAnswers: b.guidedAnswers ? JSON.parse(b.guidedAnswers) : {}, lng: Number(b.lng), lat: Number(b.lat),
    accuracy: b.accuracy ? Number(b.accuracy) : null, locationSource: b.locationSource || 'gps', media,
    source: social ? (b.source || 'social') : 'app', socialUrl: b.socialUrl, actorId: u.id, actorRole: u.role,
  });
  if (master) io.emit('report:update', view(master, { role: 'OPS_SUPERVISOR' }));
  else io.emit('report:new', view(report, { role: 'OPS_SUPERVISOR' }));
  return { id: report.id, code: report.code, duplicateOf: master?.code || null, unitName: report.unitName, noUnitArea: report.noUnitArea, status: report.status, priority: report.priority };
}));

app.post('/api/reports/:id/actions/:action', upload.single('photo'), wrap(req => {
  const u = actor(req);
  const data = { ...req.body };
  if (req.file) data.photo = `/uploads/${req.file.filename}`;
  ['lng', 'lat', 'stars', 'cost'].forEach(k => { if (data[k] !== undefined && data[k] !== '') data[k] = Number(data[k]); });
  if (data.resolved !== undefined) data.resolved = data.resolved === true || data.resolved === 'true';
  const r = act(req.params.id, req.params.action, u, data);
  io.emit('report:update', view(r, { role: 'OPS_SUPERVISOR' }));
  return view(r, u, { full: true });
}));

app.get('/api/kpis', wrap(req => {
  const u = actor(req);
  const q = req.query;
  const filter = (q.center || q.unit || q.category || q.source) ? r => (!q.center || r.centerId === q.center) && (!q.unit || r.unitId === q.unit) && (!q.category || r.category === q.category) && (!q.source || r.source === q.source) : null;
  const k = computeKpis({ days: Number(q.days) || 30, from: q.from ? Number(q.from) : undefined, to: q.to ? Number(q.to) : undefined, filter, filterKey: JSON.stringify([q.center, q.unit, q.category, q.source]) });
  if (u.role === 'UNIT_HEAD' || u.role === 'UNIT_STAFF') {
    const mine = k.units.find(x => x.id === u.unitId);
    return { days: k.days, unit: mine }; // own rank only — not the full list
  }
  if (u.role === 'CENTER_HEAD') return { ...k, units: k.units.filter(x => x.centerId === u.centerId), alerts: k.alerts.filter(a => !a.unitId || k.units.find(x => x.id === a.unitId)?.centerId === u.centerId) };
  if (u.role === 'CITIZEN') throw httpError(403, 'غير مصرح');
  return k;
}));

app.get('/api/audit/verify', wrap(() => verifyAudit()));
app.get('/api/audit', wrap(req => {
  const u = actor(req);
  if (!['OPS_SUPERVISOR', 'OPS_REVIEWER', 'GOVERNOR'].includes(u.role)) throw httpError(403, 'غير مصرح');
  const rows = req.query.entityId ? db.audit.filter(a => a.entityId === req.query.entityId) : db.audit.slice(-200);
  return rows.map(a => ({ ...a, actorName: a.actorId === 'system' ? 'النظام' : userById(a.actorId)?.name }));
}));

app.put('/api/settings', wrap(req => {
  const u = actor(req);
  if (u.role !== 'OPS_SUPERVISOR') throw httpError(403, 'الإعدادات لمشرف الغرفة فقط');
  const allowed = ['pilotUnits', 'dailyLimit', 'dupRadiusM', 'dupDays', 'dupBump1', 'dupBump2', 'resolutionRadiusM', 'autoCloseDays', 'rejectionSamplePct', 'hideReporterDefault', 'transparencyPage', 'sla', 'weights', 'thresholds', 'seasonalRules', 'escalation', 'reportSchedules'];
  const before = structuredClone(db.settings);
  const changed = [];
  for (const k of allowed) if (req.body[k] !== undefined && JSON.stringify(req.body[k]) !== JSON.stringify(db.settings[k])) { db.settings[k] = req.body[k]; changed.push(k); }
  if (req.body.weights) { const sum = Object.values(req.body.weights).reduce((a, b) => a + Number(b), 0); if (sum !== 100) { db.settings = before; throw httpError(400, `مجموع الأوزان لازم يكون 100 (الحالي ${sum})`); } }
  if (changed.length) audit({ actorId: u.id, actorRole: u.role, entity: 'settings', entityId: 'settings', action: 'settings_updated', note: changed.join(', ') });
  if (req.body.unitHide) for (const [unitId, hide] of Object.entries(req.body.unitHide)) { const h = userById(`head-${unitId}`); if (h) h.hideReporter = !!hide; }
  save();
  io.emit('settings:update', db.settings);
  return { settings: db.settings, changed, before };
}));

// ---------- CMS ----------
const requireSup = req => { const u = actor(req); if (u.role !== 'OPS_SUPERVISOR') throw httpError(403, 'لمشرف غرفة العمليات فقط'); return u; };

app.put('/api/content', wrap(req => {
  const u = requireSup(req);
  const keys = ['heroTitle', 'heroSubtitle', 'announcement', 'steps', 'faq', 'emergency', 'contact'];
  for (const k of keys) if (req.body[k] !== undefined) db.content[k] = req.body[k];
  audit({ actorId: u.id, actorRole: u.role, entity: 'content', entityId: 'landing', action: 'content_updated', note: Object.keys(req.body).join(', ') });
  save(); io.emit('content:update', db.content);
  return db.content;
}));

app.put('/api/categories', wrap(req => {
  const u = requireSup(req);
  const list = req.body;
  if (!Array.isArray(list) || !list.length) throw httpError(400, 'قائمة غير صالحة');
  const codes = new Set();
  for (const c of list) {
    if (!c.ar?.trim()) throw httpError(400, 'اسم التصنيف مطلوب');
    if (!['CRITICAL', 'URGENT', 'NORMAL', 'LOW'].includes(c.priority)) throw httpError(400, 'أولوية غير صالحة');
    c.code = c.code || 'c_' + crypto.randomUUID().slice(0, 6);
    if (codes.has(c.code)) throw httpError(400, 'تكرار في كود التصنيف');
    codes.add(c.code);
    c.questions = (c.questions || []).map(q => String(q).trim()).filter(Boolean);
    c.active = c.active !== false;
  }
  // a category used by reports can be deactivated but never deleted
  for (const old of db.categories) if (!codes.has(old.code) && db.reports.some(r => r.category === old.code)) throw httpError(409, `التصنيف «${old.ar}» عليه بلاغات — عطّله بدل الحذف`);
  db.categories = list.map(c => ({ code: c.code, ar: c.ar.trim(), en: c.en || '', priority: c.priority, emergency: !!c.emergency, questions: c.questions, active: c.active }));
  audit({ actorId: u.id, actorRole: u.role, entity: 'categories', entityId: 'categories', action: 'categories_updated', note: `${db.categories.length} تصنيف` });
  save();
  return db.categories;
}));

app.post('/api/users', wrap(req => {
  const u = actor(req);
  const b = req.body;
  const isSup = u.role === 'OPS_SUPERVISOR';
  if (!isSup && !(u.role === 'UNIT_HEAD' && b.role === 'UNIT_STAFF')) throw httpError(403, 'غير مصرح');
  if (!['UNIT_STAFF', 'UNIT_HEAD', 'CENTER_HEAD', 'OPS_REVIEWER', 'OPS_SUPERVISOR', 'GOVERNOR'].includes(b.role)) throw httpError(400, 'دور غير صالح');
  if (!b.name?.trim()) throw httpError(400, 'الاسم مطلوب');
  const unitId = u.role === 'UNIT_HEAD' ? u.unitId : b.unitId;
  if (['UNIT_STAFF', 'UNIT_HEAD'].includes(b.role) && !buildGeo().units.features.some(f => f.properties.id === unitId)) throw httpError(400, 'اختار الوحدة المحلية');
  if (b.role === 'UNIT_HEAD') { const cur = db.users.find(x => x.role === 'UNIT_HEAD' && x.unitId === unitId && x.active !== false); if (cur) throw httpError(409, `الوحدة لها رئيس حالي (${cur.name}) — عطّل حسابه الأول`); }
  const id = b.role === 'UNIT_HEAD' ? `head-${unitId}` : `${b.role.toLowerCase()}-${crypto.randomUUID().slice(0, 6)}`;
  if (b.role === 'UNIT_HEAD' && userById(id)) { // replacing a head: archive old account id, new person keeps the unit's head id
    const old = userById(id); old.id = `${id}-old-${Date.now()}`;
    for (const r of db.reports) for (const e of r.events) if (e.actorId === id) e.actorId = old.id;
  }
  const nu = { id, role: b.role, name: b.name.trim(), phone: b.phone || '', email: b.email || '', unitId: ['UNIT_STAFF', 'UNIT_HEAD'].includes(b.role) ? unitId : undefined, centerId: b.role === 'CENTER_HEAD' ? b.centerId : undefined, parentId: b.role === 'UNIT_STAFF' ? `head-${unitId}` : undefined, hideReporter: b.role === 'UNIT_HEAD' ? db.settings.hideReporterDefault : undefined, active: true, createdAt: Date.now() };
  db.users.push(nu);
  audit({ actorId: u.id, actorRole: u.role, entity: 'user', entityId: nu.id, action: 'user_created', note: `${nu.name} (${nu.role})` });
  save();
  return nu;
}));

app.patch('/api/users/:id', wrap(req => {
  const u = actor(req);
  const t = userById(req.params.id);
  if (!t) throw httpError(404, 'المستخدم غير موجود');
  const isSup = u.role === 'OPS_SUPERVISOR';
  if (!isSup && !(u.role === 'UNIT_HEAD' && t.role === 'UNIT_STAFF' && t.unitId === u.unitId)) throw httpError(403, 'غير مصرح');
  if (t.id === u.id && req.body.active === false) throw httpError(400, 'لا يمكنك تعطيل حسابك');
  for (const k of ['name', 'phone', 'email']) if (req.body[k] !== undefined) t[k] = String(req.body[k]);
  if (req.body.active !== undefined) {
    t.active = !!req.body.active;
    if (!t.active && t.role === 'UNIT_STAFF') for (const r of db.reports) if (r.assigneeId === t.id && OPEN_STATUSES.includes(r.status)) r.assigneeId = null;
  }
  if (isSup && req.body.hideReporter !== undefined && t.role === 'UNIT_HEAD') t.hideReporter = !!req.body.hideReporter;
  audit({ actorId: u.id, actorRole: u.role, entity: 'user', entityId: t.id, action: 'user_updated', note: Object.keys(req.body).join(', ') });
  save();
  return { ...t };
}));

app.patch('/api/units/:id', wrap(req => {
  const u = requireSup(req);
  const f = buildGeo().units.features.find(x => x.properties.id === req.params.id);
  if (!f) throw httpError(404, 'الوحدة غير موجودة');
  const name = String(req.body.name || '').trim();
  db.unitMeta[f.properties.id] = { ...(db.unitMeta[f.properties.id] || {}), name: name && name !== f.properties.name ? name : undefined };
  audit({ actorId: u.id, actorRole: u.role, entity: 'unit', entityId: f.properties.id, action: 'unit_updated', note: name });
  save();
  return { id: f.properties.id, name: unitName(f.properties.id, f.properties.name) };
}));

app.get('/api/audit/settings', wrap(req => {
  requireSup(req);
  return db.audit.filter(a => ['settings', 'content', 'categories', 'user', 'unit'].includes(a.entity)).slice(-100).reverse().map(a => ({ ...a, actorName: userById(a.actorId)?.name }));
}));

// ---------- public (landing page) ----------
app.get('/api/public/stats', wrap(() => {
  const k = computeKpis({ days: 30 });
  const all = db.reports.filter(r => !r.masterId);
  const base = { enabled: !!db.settings.transparencyPage, units: k.units.length, villages: buildGeo().villages.features.length };
  if (!db.settings.transparencyPage) return base;
  return {
    ...base, total30: k.overall.allTotal, resolved30: all.filter(r => (r.status === 'CLOSED' || r.status === 'RESOLVED') && r.resolvedAt && r.resolvedAt > Date.now() - 30 * 86_400_000).length,
    resolvedAll: all.filter(r => r.resolution).length, onTime: k.overall.k3, satisfaction: k.overall.k6, avgResolveHours: k.overall.k2,
    byCategory: k.byCategory.slice(0, 6), centers: k.centers.map(c => ({ name: c.name, total: c.total, k4: c.k4 })),
    resolvedPoints: all.filter(r => r.resolution && r.resolvedAt > Date.now() - 60 * 86_400_000).map(r => r.location),
  };
}));

// ---------- export ----------
app.get('/api/export/reports', wrap((req, res) => {
  const u = actor(req);
  if (!['OPS_SUPERVISOR', 'OPS_REVIEWER', 'GOVERNOR', 'CENTER_HEAD'].includes(u.role)) throw httpError(403, 'غير مصرح');
  const q = req.query;
  const from = q.from ? Number(q.from) : 0, to = q.to ? Number(q.to) : Date.now();
  const rows = db.reports.filter(scopeFilter(u)).filter(r => r.createdAt >= from && r.createdAt <= to &&
    (!q.center || r.centerId === q.center) && (!q.unit || r.unitId === q.unit) && (!q.category || r.category === q.category) &&
    (!q.status || (q.status === 'open' ? OPEN_STATUSES.includes(r.status) : q.status === 'late' ? OPEN_STATUSES.includes(r.status) && Date.now() > r.resolveDueAt : r.status === q.status)));
  const d = t => t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) : '';
  const h = (a, b) => a && b ? ((b - a) / 3_600_000).toFixed(1) : '';
  const header = ['رقم البلاغ', 'تاريخ البلاغ', 'التصنيف', 'الحالة', 'الأولوية', 'القرية', 'الوحدة المحلية', 'المركز', 'المصدر', 'عدد التكرار', 'تاريخ الاستلام', 'ساعات الاستلام', 'تاريخ الحل', 'ساعات الحل', 'في المدة', 'التقييم', 'التصعيد', 'خط العرض', 'خط الطول'];
  const lines = rows.sort((a, b) => a.createdAt - b.createdAt).map(r => [r.code, d(r.createdAt), getCat(r.category)?.ar || r.category, STATUS_AR[r.status], PRIORITY_AR[r.priority], r.villageName || r.noUnitArea || '', r.unitName || 'غرفة العمليات', r.centerName || '', r.source === 'social' ? 'سوشيال ميديا' : 'التطبيق', r.duplicateCount + 1, d(r.acknowledgedAt), h(r.routedAt || r.createdAt, r.acknowledgedAt), d(r.resolvedAt), h(r.routedAt || r.createdAt, r.resolvedAt), r.resolvedAt ? (r.resolvedAt <= r.resolveDueAt ? 'نعم' : 'لا') : '', r.rating?.stars || '', r.escalation || 0, r.location[1].toFixed(6), r.location[0].toFixed(6)]);
  const csv = '\uFEFF' + [header, ...lines].map(l => l.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
  audit({ actorId: u.id, actorRole: u.role, entity: 'export', entityId: 'reports', action: 'reports_exported', note: `${lines.length} بلاغ` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ballegh-reports-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

app.post('/api/demo/reset', wrap(() => { const out = seed(); io.emit('demo:reset'); return out; }));

// escalation worker
setInterval(() => { for (const r of runEscalation()) io.emit('report:update', view(r, { role: 'OPS_SUPERVISOR' })); }, 30_000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nبلّغ — Ballegh demo running:\n  http://localhost:${PORT}`);
  console.log(`  data: ${DATA_DIR} · uploads: ${UPLOADS} · staff password: ${ACCESS_PASS ? 'ON' : 'OFF (set DEMO_PASSWORD on the hosting)'}`);
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal);
  ips.forEach(i => console.log(`  http://${i.address}:${PORT}  (from a phone on the same Wi-Fi)`));
});
