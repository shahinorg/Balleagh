// In-memory data store with JSON persistence, plus the report business rules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, DEFAULT_SETTINGS, DEFAULT_CONTENT, OPEN_STATUSES, PRIORITIES } from './config.js';
import { locate, distanceM, buildGeo } from './geo.js';

// DATA_DIR env lets hosting keep data outside the code folder so redeploys don't wipe it
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const db = {
  settings: structuredClone(DEFAULT_SETTINGS),
  categories: structuredClone(CATEGORIES),
  content: structuredClone(DEFAULT_CONTENT),
  unitMeta: {},
  users: [],
  reports: [],
  audit: [],
  seq: 0,
};

// Atomic write: write a temp file, then rename over the real one — a crash mid-write can't leave a broken db.json
function writeDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
let saveTimer = null;
let seeding = false;
export function save() {
  if (seeding) return; // the seed writes once, at the very end
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeDb, 500);
}
// Returns false when there's no usable data (missing, unreadable, or empty) so the caller can (re)seed.
export function load() {
  if (!fs.existsSync(DB_FILE)) return false;
  let data;
  try { data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {
    const bad = `${DB_FILE}.corrupt-${Date.now()}`;
    fs.renameSync(DB_FILE, bad);
    console.warn(`[store] db.json was unreadable (${e.message}) — moved to ${path.basename(bad)}`);
    return false;
  }
  if (!Array.isArray(data.reports) || !data.reports.length) { console.warn('[store] db.json has no reports — will regenerate demo data'); return false; }
  Object.assign(db, data);
  ensureDefaults();
  return true;
}
// Seed lifecycle: build everything in memory, persist once when complete.
export function beginSeed(next) { seeding = true; clearTimeout(saveTimer); Object.assign(db, next); }
export function endSeed() { seeding = false; writeDb(); }
export function replaceAll(next) {
  Object.assign(db, next);
  writeDb();
}

export function ensureDefaults() {
  db.settings = { ...structuredClone(DEFAULT_SETTINGS), ...db.settings };
  if (!db.categories) db.categories = structuredClone(CATEGORIES);
  db.categories.forEach(c => { if (c.active === undefined) c.active = true; });
  db.content = { ...structuredClone(DEFAULT_CONTENT), ...(db.content || {}) };
  if (!db.unitMeta) db.unitMeta = {};
}
export const getCat = code => db.categories.find(c => c.code === code);
export const unitName = (id, fallback) => db.unitMeta[id]?.name || fallback;
export const userById = id => db.users.find(u => u.id === id);
export const reportById = id => db.reports.find(r => r.id === id);

// ---------- audit (append-only, hash-chained) ----------
export function audit(entry, at = Date.now()) {
  const prev = db.audit.length ? db.audit[db.audit.length - 1].hash : '0'.repeat(64);
  const row = { id: db.audit.length + 1, at, ...entry, prevHash: prev };
  row.hash = crypto.createHash('sha256').update(prev + JSON.stringify(row)).digest('hex');
  db.audit.push(row);
  return row;
}
export function verifyAudit() {
  let prev = '0'.repeat(64);
  for (const row of db.audit) {
    const { hash, ...rest } = row;
    if (rest.prevHash !== prev) return { ok: false, brokenAt: row.id };
    const h = crypto.createHash('sha256').update(prev + JSON.stringify(rest)).digest('hex');
    if (h !== hash) return { ok: false, brokenAt: row.id };
    prev = hash;
  }
  return { ok: true, rows: db.audit.length };
}

// ---------- helpers ----------
const MIN = 60_000;
export function nextCode(at = Date.now()) {
  db.seq += 1;
  return `FY-${new Date(at).getFullYear()}-${String(db.seq).padStart(6, '0')}`;
}
function bump(priority, steps) {
  const i = Math.max(0, PRIORITIES.indexOf(priority) - steps);
  return PRIORITIES[i];
}
function seasonalPriority(category, at) {
  const d = new Date(at);
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (const r of db.settings.seasonalRules || []) {
    if (r.category !== category) continue;
    const inRange = r.from <= r.to ? (md >= r.from && md <= r.to) : (md >= r.from || md <= r.to);
    if (inRange) return r.priority;
  }
  return null;
}
export function basePriority(category, at) {
  return seasonalPriority(category, at) || getCat(category)?.priority || 'NORMAL';
}
export function applySla(r) {
  const s = db.settings.sla[r.priority];
  const from = r.routedAt || r.createdAt;
  r.ackDueAt = from + s.ack * MIN;
  r.resolveDueAt = from + s.resolve * MIN + (r.slaPausedMs || 0);
}
export function addEvent(r, ev, at = Date.now()) {
  const e = { at, ...ev };
  r.events.push(e);
  audit({ actorId: ev.actorId, actorRole: ev.role, entity: 'report', entityId: r.id, action: ev.action, from: ev.from, to: ev.to, note: ev.note }, at);
  return e;
}
function setStatus(r, to, ev, at = Date.now()) {
  const from = r.status;
  r.status = to;
  r.updatedAt = at;
  addEvent(r, { ...ev, from, to }, at);
}

// ---------- create ----------
export function createReport(input, { at = Date.now(), skipLimit = false } = {}) {
  const { citizenId, category, description, guidedAnswers, lng, lat, media = [], source = 'app', socialUrl, accuracy, locationSource = 'gps', actorId, actorRole = 'CITIZEN' } = input;
  if (!getCat(category) || getCat(category).active === false) throw httpError(400, 'تصنيف غير معروف');
  const loc = locate(lng, lat);
  if (!loc.inside) throw httpError(422, 'الموقع خارج نطاق محافظة الفيوم');

  if (!skipLimit && source === 'app') {
    const since = at - 24 * 60 * MIN;
    const count = db.reports.filter(r => r.citizenId === citizenId && r.createdAt >= since).length;
    if (count >= db.settings.dailyLimit) throw httpError(429, `وصلت للحد الأقصى اليومي (${db.settings.dailyLimit} بلاغات)`);
  }

  const r = {
    id: crypto.randomUUID(), code: nextCode(at), citizenId: citizenId || null, category,
    description: description || '', guidedAnswers: guidedAnswers || {}, location: [lng, lat],
    accuracy: accuracy ?? null, locationSource, media, source, socialUrl: socialUrl || null,
    villageId: loc.village?.id || null, villageName: loc.village?.name || null,
    unitId: loc.unit?.id || null, unitName: loc.unit ? unitName(loc.unit.id, loc.unit.name) : null,
    centerId: loc.center?.id || null, centerName: loc.center?.name || null,
    noUnitArea: loc.noUnitArea || null,
    status: 'NEW', priority: basePriority(category, at), prioritySource: 'rule',
    masterId: null, duplicateCount: 0, assigneeId: null,
    createdAt: at, updatedAt: at, routedAt: null, acknowledgedAt: null, resolvedAt: null, closedAt: null,
    slaPausedMs: 0, pausedAt: null, reopenCount: 0, escalation: 0,
    resolution: null, rating: null, reviews: [], events: [],
  };
  addEvent(r, { actorId: actorId || citizenId, role: actorRole, action: 'created', to: 'NEW', note: source === 'social' ? 'بلاغ من السوشيال ميديا' : null }, at);

  // duplicate detection
  const s = db.settings;
  const master = db.reports.find(m => !m.masterId && m.category === category && OPEN_STATUSES.includes(m.status) &&
    m.createdAt >= at - s.dupDays * 1440 * MIN && distanceM(m.location, r.location) <= s.dupRadiusM);
  if (master) {
    r.masterId = master.id;
    r.status = master.status;
    master.duplicateCount += 1;
    const steps = master.duplicateCount + 1 >= s.dupBump2 ? 2 : master.duplicateCount + 1 >= s.dupBump1 ? 1 : 0;
    const newP = master.prioritySource === 'rule' ? bump(basePriority(category, master.createdAt), steps) : master.priority;
    addEvent(master, { actorId: 'system', role: 'SYSTEM', action: 'duplicate_merged', note: `بلاغ مكرر ${r.code} — إجمالي التكرار ${master.duplicateCount + 1}` }, at);
    if (newP !== master.priority) {
      addEvent(master, { actorId: 'system', role: 'SYSTEM', action: 'priority_changed', note: `${master.priority} ← ${newP} بسبب التكرار` }, at);
      master.priority = newP; applySla(master);
    }
    master.updatedAt = at;
    db.reports.push(r);
    save();
    return { report: r, master };
  }

  // routing
  if (r.unitId) {
    r.routedAt = at;
    setStatus(r, 'ROUTED', { actorId: 'system', role: 'SYSTEM', action: 'routed', note: `توجيه تلقائي إلى ${r.unitName}` }, at);
  } else {
    setStatus(r, 'OPS_QUEUE', { actorId: 'system', role: 'SYSTEM', action: 'routed_ops', note: `خارج نطاق الوحدات (${r.noUnitArea}) — محوّل لغرفة العمليات` }, at);
  }
  applySla(r);
  db.reports.push(r);
  save();
  return { report: r };
}

// ---------- actions ----------
const ALLOWED = {
  acknowledge: { roles: ['UNIT_HEAD', 'UNIT_STAFF'], from: ['ROUTED', 'REOPENED'] },
  assign: { roles: ['UNIT_HEAD'], from: ['ROUTED', 'REOPENED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING_BUDGET', 'PARTIALLY_RESOLVED'] },
  start: { roles: ['UNIT_HEAD', 'UNIT_STAFF'], from: ['ACKNOWLEDGED', 'PENDING_BUDGET', 'PARTIALLY_RESOLVED', 'REOPENED'] },
  pending_budget: { roles: ['UNIT_HEAD'], from: ['ACKNOWLEDGED', 'IN_PROGRESS'] },
  partial: { roles: ['UNIT_HEAD', 'UNIT_STAFF'], from: ['IN_PROGRESS'] },
  resolve: { roles: ['UNIT_HEAD', 'UNIT_STAFF'], from: ['ACKNOWLEDGED', 'IN_PROGRESS', 'PARTIALLY_RESOLVED', 'REOPENED'] },
  reject: { roles: ['UNIT_HEAD'], from: ['ROUTED', 'ACKNOWLEDGED', 'REOPENED'] },
  not_competent: { roles: ['UNIT_HEAD'], from: ['ROUTED', 'ACKNOWLEDGED'] },
  ops_accept: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER'], from: ['RESOLVED'] },
  ops_return: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER'], from: ['RESOLVED'] },
  confirm_reject: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER'], from: ['REJECTED'] },
  override_reject: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER'], from: ['REJECTED'] },
  reroute: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER'], from: ['NOT_COMPETENT', 'OPS_QUEUE', 'ROUTED'] },
  set_priority: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER'], from: OPEN_STATUSES.concat(['RESOLVED']) },
  set_category: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER', 'UNIT_HEAD'], from: OPEN_STATUSES },
  field_visit: { roles: ['OPS_SUPERVISOR', 'OPS_REVIEWER'], from: null },
  rate: { roles: ['CITIZEN'], from: ['RESOLVED', 'CLOSED'] },
};

export function act(reportId, action, actor, data = {}, at = Date.now()) {
  const r = reportById(reportId);
  if (!r) throw httpError(404, 'البلاغ غير موجود');
  if (r.masterId) throw httpError(409, 'هذا بلاغ مكرر — الإجراءات تتم على البلاغ الرئيسي');
  const rule = ALLOWED[action];
  if (!rule) throw httpError(400, 'إجراء غير معروف');
  if (!rule.roles.includes(actor.role)) throw httpError(403, 'غير مصرح لهذا الدور');
  if (rule.from && !rule.from.includes(r.status)) throw httpError(409, `لا يمكن تنفيذ الإجراء والبلاغ في حالة ${r.status}`);
  if (['UNIT_HEAD', 'UNIT_STAFF'].includes(actor.role) && actor.unitId !== r.unitId) throw httpError(403, 'البلاغ خارج نطاق وحدتك');
  if (action === 'rate' && actor.id !== r.citizenId) throw httpError(403, 'التقييم لصاحب البلاغ فقط');

  const ev = { actorId: actor.id, role: actor.role };
  const resumeSla = () => { if (r.pausedAt) { r.slaPausedMs += at - r.pausedAt; r.pausedAt = null; applySla(r); } };

  switch (action) {
    case 'acknowledge':
      r.acknowledgedAt = r.acknowledgedAt || at;
      setStatus(r, 'ACKNOWLEDGED', { ...ev, action }, at); break;
    case 'assign': {
      const staff = userById(data.assigneeId);
      if (!staff || staff.unitId !== r.unitId) throw httpError(400, 'موظف غير صالح');
      r.assigneeId = staff.id;
      if (!r.acknowledgedAt) { r.acknowledgedAt = at; setStatus(r, 'ACKNOWLEDGED', { ...ev, action: 'acknowledge' }, at); }
      addEvent(r, { ...ev, action, note: `إسناد إلى ${staff.name}` }, at); break;
    }
    case 'start':
      resumeSla(); setStatus(r, 'IN_PROGRESS', { ...ev, action }, at); break;
    case 'pending_budget':
      r.pausedAt = at; setStatus(r, 'PENDING_BUDGET', { ...ev, action, note: data.note || 'يحتاج ميزانية / مدرج في خطة' }, at); break;
    case 'partial':
      setStatus(r, 'PARTIALLY_RESOLVED', { ...ev, action, note: data.note }, at); break;
    case 'resolve': {
      if (!data.photo) throw httpError(400, 'صورة الحل إلزامية');
      if (data.lng == null || data.lat == null) throw httpError(400, 'موقع صورة الحل مطلوب');
      const d = distanceM([data.lng, data.lat], r.location);
      if (d > db.settings.resolutionRadiusM) throw httpError(422, `صورة الحل على بعد ${Math.round(d)} م من موقع البلاغ — الحد المسموح ${db.settings.resolutionRadiusM} م`);
      resumeSla();
      r.resolution = { actionTaken: data.actionTaken, cause: data.cause, executingParty: data.executingParty, cost: data.cost, executedOn: data.executedOn, notes: data.notes, photo: data.photo, location: [data.lng, data.lat], distanceM: Math.round(d), by: actor.id, at };
      r.acknowledgedAt = r.acknowledgedAt || at;
      r.resolvedAt = at;
      setStatus(r, 'RESOLVED', { ...ev, action, note: data.actionTaken }, at); break;
    }
    case 'reject':
      if (!data.reason?.trim()) throw httpError(400, 'سبب الرفض إلزامي');
      r.acknowledgedAt = r.acknowledgedAt || at;
      r.rejection = { reason: data.reason, at, by: actor.id, sampled: Math.random() * 100 < db.settings.rejectionSamplePct };
      setStatus(r, 'REJECTED', { ...ev, action, note: data.reason }, at); break;
    case 'not_competent':
      setStatus(r, 'NOT_COMPETENT', { ...ev, action, note: data.reason || 'ليس من اختصاص الوحدة' }, at); break;
    case 'ops_accept':
      r.reviews.push({ type: 'resolution_review', outcome: 'match', by: actor.id, at });
      r.closedAt = at; setStatus(r, 'CLOSED', { ...ev, action, note: 'قبول الحل من غرفة العمليات' }, at); break;
    case 'ops_return':
      r.reviews.push({ type: 'resolution_review', outcome: 'mismatch', by: actor.id, at, note: data.reason });
      r.reopenCount += 1; r.resolvedAt = null;
      setStatus(r, 'REOPENED', { ...ev, action, note: data.reason || 'الحل غير مطابق' }, at); break;
    case 'confirm_reject':
      r.reviews.push({ type: 'rejection_sample', outcome: 'match', by: actor.id, at });
      r.rejection.confirmed = true; r.closedAt = at;
      setStatus(r, 'CLOSED', { ...ev, action, note: 'تأكيد الرفض' }, at); break;
    case 'override_reject':
      r.reviews.push({ type: 'rejection_sample', outcome: 'mismatch', by: actor.id, at, note: data.reason });
      r.rejection.overridden = true; r.reopenCount += 1;
      setStatus(r, 'REOPENED', { ...ev, action, note: data.reason || 'نقض الرفض — البلاغ في اختصاص الوحدة' }, at); break;
    case 'reroute': {

      const u = buildGeo().units.features.find(f => f.properties.id === data.unitId);
      if (!u) throw httpError(400, 'وحدة غير صالحة');
      r.unitId = u.properties.id; r.unitName = unitName(u.properties.id, u.properties.name); r.centerId = u.properties.centerId; r.centerName = u.properties.centerName;
      r.routedAt = at; applySla(r);
      setStatus(r, 'ROUTED', { ...ev, action, note: `إعادة توجيه إلى ${u.properties.name}` }, at); break;
    }
    case 'set_priority':
      if (!PRIORITIES.includes(data.priority)) throw httpError(400, 'أولوية غير صالحة');
      addEvent(r, { ...ev, action: 'priority_changed', note: `${r.priority} ← ${data.priority} (يدوي)` }, at);
      r.priority = data.priority; r.prioritySource = 'manual'; applySla(r); break;
    case 'set_category':
      if (!getCat(data.category)) throw httpError(400, 'تصنيف غير صالح');
      addEvent(r, { ...ev, action: 'category_changed', note: `${getCat(r.category)?.ar} ← ${getCat(data.category).ar}` }, at);
      r.category = data.category; break;
    case 'field_visit':
      r.reviews.push({ type: 'field_visit', outcome: data.outcome === 'mismatch' ? 'mismatch' : 'match', by: actor.id, at, note: data.note });
      addEvent(r, { ...ev, action, note: `زيارة ميدانية: ${data.outcome === 'mismatch' ? 'غير مطابق' : 'مطابق'}${data.note ? ' — ' + data.note : ''}` }, at); break;
    case 'rate': {
      const stars = Math.max(1, Math.min(5, Number(data.stars) || 0));
      r.rating = { stars, resolved: !!data.resolved, comment: data.comment || '', at };
      addEvent(r, { ...ev, action, note: `${stars}★ — ${data.resolved ? 'اتحلت' : 'متحلتش'}` }, at);
      if (!data.resolved) {
        r.reopenCount += 1; r.resolvedAt = null; r.closedAt = null;
        setStatus(r, 'REOPENED', { actorId: 'system', role: 'SYSTEM', action: 'citizen_reopen', note: 'المواطن أفاد بأن المشكلة لم تُحل — تصعيد لغرفة العمليات' }, at);
        r.escalation = Math.max(r.escalation, 3);
      } else if (r.status === 'RESOLVED') {
        r.closedAt = at; setStatus(r, 'CLOSED', { actorId: 'system', role: 'SYSTEM', action: 'closed', note: 'إغلاق بعد تقييم المواطن' }, at);
      }
      break;
    }
  }
  r.updatedAt = at;
  save();
  return r;
}

// ---------- escalation (run periodically) ----------
export const ESCALATION_AR = ['', 'رئيس الوحدة', 'رئيس المركز', 'غرفة العمليات', 'المحافظ'];
export function runEscalation(now = Date.now()) {
  const changed = [];
  for (const r of db.reports) {
    if (r.masterId || !OPEN_STATUSES.includes(r.status) || r.status === 'PENDING_BUDGET') continue;
    let level = 0;
    if (!r.acknowledgedAt && r.ackDueAt && now > r.ackDueAt) level = 1;
    if (r.resolveDueAt && now > r.resolveDueAt) {
      const span = r.resolveDueAt - (r.routedAt || r.createdAt);
      const over = (now - r.resolveDueAt) / span;
      const esc = db.settings.escalation;
      level = over * 100 >= esc.toGovernorPct || (esc.criticalToGovernor && r.priority === 'CRITICAL') ? 4 : over * 100 >= esc.toOpsPct ? 3 : 2;
    }
    if (level > r.escalation) {
      r.escalation = level;
      addEvent(r, { actorId: 'system', role: 'SYSTEM', action: 'escalated', note: `تصعيد تلقائي إلى ${ESCALATION_AR[level]}` }, now);
      changed.push(r);
    }
  }
  // auto-close resolved reports nobody objected to
  for (const r of db.reports) {
    if (r.status === 'RESOLVED' && r.resolvedAt && now - r.resolvedAt > db.settings.autoCloseDays * 1440 * MIN) {
      r.closedAt = now;
      setStatus(r, 'CLOSED', { actorId: 'system', role: 'SYSTEM', action: 'closed', note: `إغلاق تلقائي بعد ${db.settings.autoCloseDays} أيام بدون اعتراض` }, now);
      changed.push(r);
    }
  }
  if (changed.length) save();
  return changed;
}

export function httpError(status, message) {
  const e = new Error(message); e.status = status; return e;
}
