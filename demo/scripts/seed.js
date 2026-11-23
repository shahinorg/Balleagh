// Generates realistic demo data: users, ~1,500 reports over 60 days with full timelines.
// Run: npm run seed   (also runs automatically on first server start)
import { pathToFileURL } from 'node:url';
import { db, beginSeed, endSeed, createReport, act, runEscalation, userById } from '../lib/store.js';
import { buildGeo, randomPointIn } from '../lib/geo.js';
import { CATEGORIES, DEFAULT_SETTINGS, DEFAULT_CONTENT } from '../lib/config.js';

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const FIRST = ['محمد', 'أحمد', 'محمود', 'مصطفى', 'علي', 'حسن', 'عبدالله', 'إبراهيم', 'خالد', 'سيد', 'رمضان', 'عادل', 'فاطمة', 'منى', 'هبة', 'سارة', 'نجلاء', 'أسماء', 'مروة', 'رحاب', 'صابر', 'عمرو', 'شعبان', 'جمال'];
const LAST = ['عبدالحميد', 'السيد', 'عبدالعزيز', 'رمضان', 'حسين', 'عبدالرحمن', 'شحاتة', 'عويس', 'جاد', 'عبدالتواب', 'مرسي', 'قرني', 'زكي', 'عبدالغني', 'سلامة', 'فرج'];
const DESCS = {
  garbage: ['تراكم قمامة بجوار المدرسة منذ أكثر من أسبوع', 'مقلب قمامة عشوائي على مدخل القرية', 'القمامة مرمية جنب الترعة والريحة وحشة'],
  sewage: ['طفح صرف صحي في الشارع الرئيسي', 'غطاء بالوعة مكسور وخطر على الأطفال', 'مياه الصرف داخلة على البيوت'],
  water: ['انقطاع مياه الشرب من يومين', 'كسر ماسورة مياه والمياه مغرقة الشارع', 'المياه لونها متغير'],
  lighting: ['أعمدة الإنارة مطفية في الشارع كله', 'عمود إنارة مائل وخطر', 'الطريق مظلم تماماً بالليل'],
  roads: ['حفرة كبيرة في منتصف الطريق', 'الطريق غير ممهد ومليان مطبات', 'هبوط أرضي جنب الكوبري'],
  agri_encroach: ['بناء جديد على أرض زراعية بالليل', 'تبوير أرض زراعية وصب أعمدة خرسانية', 'تقسيم أرض زراعية لمباني'],
  illegal_build: ['بناء أدوار مخالفة بدون ترخيص', 'بناء على حرم الطريق'],
  state_land: ['تعدي على أرض أملاك دولة بجوار المصرف', 'تسوير أرض دولة'],
  dredging: ['تجريف طمي من أرض زراعية بلودر', 'استخراج رمل بدون ترخيص ليلاً'],
  canals: ['ردم جزء من الترعة', 'المصرف مسدود بالحشائش والمخلفات', 'نافق حيوانات في الترعة'],
  dogs: ['كلاب ضالة بتهاجم الأطفال قدام المدرسة', 'تجمع كلاب ضالة في الشارع'],
  emergency: ['حريق في مخزن قش', 'انهيار جزئي لمنزل قديم'],
  other: ['إشغال طريق من محل', 'ضوضاء من ورشة بالليل'],
};
const CAT_WEIGHTS = { garbage: 18, sewage: 13, water: 9, lighting: 10, roads: 10, agri_encroach: 9, illegal_build: 6, state_land: 4, dredging: 3, canals: 8, dogs: 5, emergency: 1, other: 4 };
const ACTIONS = { garbage: 'رفع المخلفات بمعدات الوحدة وتطهير الموقع', sewage: 'تسليك الخط وتغيير غطاء البالوعة', water: 'إصلاح الكسر بالتنسيق مع شركة المياه', lighting: 'تغيير الكشافات وإصلاح الكابل', roads: 'ردم الحفرة وتسويتها مؤقتاً', agri_encroach: 'إزالة الأعمدة وتحرير محضر', illegal_build: 'إيقاف الأعمال وتحرير محضر مخالفة', state_land: 'إزالة التعدي بالتنسيق مع أملاك الدولة', dredging: 'ضبط المعدات وتحرير محضر', canals: 'تطهير المجرى ورفع المخلفات', dogs: 'التنسيق مع الطب البيطري', emergency: 'التعامل مع الحريق بالتنسيق مع الحماية المدنية', other: 'إزالة الإشغال' };

export function seed({ seedValue = 20261120, reportsCount = 4500, now = Date.now() } = {}) {
  const rand = mulberry32(seedValue);
  const pick = a => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + rand() * (b - a);
  const name = () => `${pick(FIRST)} ${pick(FIRST)} ${pick(LAST)}`;
  const geo = buildGeo();

  // nothing touches the disk until the whole dataset is built (see endSeed below)
  beginSeed({ settings: structuredClone(DEFAULT_SETTINGS), categories: structuredClone(CATEGORIES).map(c => ({ ...c, active: true })), content: structuredClone(DEFAULT_CONTENT), unitMeta: {}, users: [], reports: [], audit: [], seq: 0 });

  // users
  db.users.push({ id: 'c-demo', role: 'CITIZEN', name: 'مواطن تجريبي', phone: '01000000000', phoneVerified: true });
  db.users.push({ id: 'ops-sup', role: 'OPS_SUPERVISOR', name: 'مشرف غرفة العمليات' });
  db.users.push({ id: 'ops-rev', role: 'OPS_REVIEWER', name: 'مراجع غرفة العمليات' });
  db.users.push({ id: 'gov', role: 'GOVERNOR', name: 'السيد المحافظ' });
  for (const c of geo.centers.features) db.users.push({ id: `ch-${c.properties.id}`, role: 'CENTER_HEAD', name: `رئيس ${c.properties.name}`, centerId: c.properties.id });
  const profiles = {};
  for (const u of geo.units.features) {
    const id = u.properties.id;
    db.users.push({ id: `head-${id}`, role: 'UNIT_HEAD', name: `م. ${name()}`, unitId: id, hideReporter: true });
    const staffN = 2 + Math.floor(rand() * 2);
    for (let i = 1; i <= staffN; i++) db.users.push({ id: `staff-${id}-${i}`, role: 'UNIT_STAFF', name: name(), unitId: id, parentId: `head-${id}` });
    // performance profile: most units OK, a few strong, a few weak
    const q = rand();
    profiles[id] = q < 0.2 ? { ack: between(0.15, 0.4), res: between(0.3, 0.6), rej: 0.03, reopen: 0.04, rating: 4.5 }
      : q < 0.9 ? { ack: between(0.4, 1.1), res: between(0.6, 1.1), rej: 0.06, reopen: 0.08, rating: 3.9 }
        : { ack: between(1.4, 3), res: between(1.3, 2.4), rej: 0.18, reopen: 0.2, rating: 2.6 };
  }
  // make the story clear for the demo
  // make the story clear for the demo: pick real units by village name (fallback: fixed positions)
  const unitIds = geo.units.features.map(f => f.properties.id);
  const byName = (q, i) => geo.units.features.find(f => f.properties.villages.some(v => v.includes(q)))?.properties.id || unitIds[i % unitIds.length];
  Object.assign(profiles[byName('الغرق', 120)], { ack: 2.8, res: 2.3, rej: 0.22, reopen: 0.25, rating: 2.3 }); // weak
  Object.assign(profiles[byName('قصر رشوان', 70)], { ack: 2.2, res: 1.9, rej: 0.3, reopen: 0.15, rating: 2.6 }); // rejects a lot
  Object.assign(profiles[byName('سنهور', 90)], { ack: 0.2, res: 0.35, rej: 0.02, reopen: 0.03, rating: 4.7 }); // strong
  // pilot units: Bani Saleh + Zawyet El-Karadsa = busy, average, some late reports; Al-Sileen = responsive
  const PILOT = DEFAULT_SETTINGS.pilotUnits;
  if (profiles[PILOT[0]]) Object.assign(profiles[PILOT[0]], { ack: 0.9, res: 1.05, rej: 0.07, reopen: 0.1, rating: 3.7 });
  if (profiles[PILOT[1]]) Object.assign(profiles[PILOT[1]], { ack: 0.35, res: 0.55, rej: 0.03, reopen: 0.05, rating: 4.4 });

  const citizens = [];
  for (let i = 0; i < 420; i++) { const c = { id: `c-${i}`, role: 'CITIZEN', name: name(), phone: `010${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`, phoneVerified: true }; db.users.push(c); citizens.push(c); }

  // weighted pickers
  const catList = Object.entries(CAT_WEIGHTS).flatMap(([c, w]) => Array(w).fill(c));
  const villages = geo.villages.features;
  // more people → more reports, flattened so small villages still get some (weight = population^0.35)
  const cum = []; let tot = 0;
  for (const v of villages) { tot += Math.max(5, Math.pow(v.properties.population || 2000, 0.35)); cum.push(tot); }
  const pickVillage = () => { const x = rand() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; } return villages[lo]; };
  const hotspots = villages.slice(0, 0); // reserved

  const DAY = 86_400_000;
  const items = [];
  for (let i = 0; i < reportsCount; i++) {
    const age = Math.pow(rand(), 1.25) * 60 * DAY; // more recent → more reports
    const at = now - age;
    const cat = pick(catList);
    let v = pickVillage();
    let p = randomPointIn(v, rand);
    // a few duplicate clusters
    let catFinal = cat, atFinal = at;
    if (rand() < 0.07 && items.length) { const prev = items[Math.max(0, items.length - 1 - Math.floor(rand() * 40))]; catFinal = prev.cat; atFinal = Math.min(now - 60000, prev.at + between(0.1, 3) * DAY); p = [prev.p[0] + between(-0.0002, 0.0002), prev.p[1] + between(-0.0002, 0.0002)]; }
    items.push({ at: atFinal, cat: catFinal, p, citizen: pick(citizens), social: rand() < 0.05 });
  }
  // a few reports in areas without a unit
  for (let i = 0; i < 8; i++) {
    const area = geo.noUnitAreas.features[i % geo.noUnitAreas.features.length];
    items.push({ at: now - rand() * 20 * DAY, cat: pick(['garbage', 'state_land', 'dredging']), p: randomPointIn(area, rand), citizen: pick(citizens), social: false });
  }
  // denser activity in the pilot area so the demo has plenty to show there
  for (const [uid, n] of [[PILOT[0], 260], [PILOT[1], 140]]) {
    const vs = villages.filter(v => v.properties.unitId === uid);
    if (!vs.length) continue;
    for (let i = 0; i < n; i++) {
      const v = vs[Math.floor(rand() * vs.length)];
      items.push({ at: now - Math.pow(rand(), 1.15) * 60 * DAY, cat: pick(catList), p: randomPointIn(v, rand), citizen: pick(citizens), social: rand() < 0.06 });
    }
  }
  items.sort((a, b) => a.at - b.at);

  const MIN = 60_000;
  for (const it of items) {
    let res;
    try {
      res = createReport({
        citizenId: it.social ? null : it.citizen.id, category: it.cat, description: pick(DESCS[it.cat]),
        lng: it.p[0], lat: it.p[1], accuracy: Math.round(between(4, 25)), source: it.social ? 'social' : 'app',
        socialUrl: it.social ? 'https://facebook.com/groups/fayoum-villages/posts/demo' : null,
        actorId: it.social ? 'ops-rev' : it.citizen.id, actorRole: it.social ? 'OPS_REVIEWER' : 'CITIZEN',
        media: [{ kind: 'photo', url: `/img/placeholder/${it.cat}.svg`, fromGallery: rand() < 0.25 }],
      }, { at: it.at, skipLimit: true });
    } catch { continue; }
    const r = res.report;
    if (r.masterId || !r.unitId) continue;
    const prof = profiles[r.unitId];
    const sla = db.settings.sla[r.priority];
    const head = userById(`head-${r.unitId}`);
    const staff = db.users.filter(u => u.unitId === r.unitId && u.role === 'UNIT_STAFF');
    const tryAct = (action, actor, data, t) => { if (t > now) return false; try { act(r.id, action, actor, data, t); return true; } catch { return false; } };

    const tAck = it.at + sla.ack * MIN * prof.ack * between(0.3, 1.6);
    if (rand() < prof.rej) { tryAct('reject', head, { reason: pick(['البلاغ مكرر', 'الموقع غير صحيح', 'تم الحل قبل البلاغ', 'خارج اختصاص الوحدة']) }, tAck); continue; }
    if (!tryAct('assign', head, { assigneeId: pick(staff).id }, tAck)) continue;
    const tStart = tAck + between(10, 240) * MIN;
    if (!tryAct('start', head, {}, tStart)) continue;
    if (rand() < 0.05) { tryAct('pending_budget', head, { note: 'مدرج في خطة الرصف للربع القادم' }, tStart + between(1, 24) * 60 * MIN); continue; }
    const tRes = it.at + sla.resolve * MIN * prof.res * between(0.35, 1.5);
    const off = () => between(-0.0003, 0.0003);
    const resolveData = { actionTaken: ACTIONS[r.category], cause: 'بلاغ مواطن', executingParty: r.unitName, cost: Math.round(between(0, 25)) * 500, executedOn: new Date(tRes).toISOString().slice(0, 10), photo: `/img/placeholder/resolved.svg`, lng: r.location[0] + off(), lat: r.location[1] + off() };
    if (!tryAct('resolve', head, resolveData, Math.max(tRes, tStart + 30 * MIN))) continue;
    const tRate = r.resolvedAt + between(2, 72) * 60 * MIN;
    if (r.citizenId && rand() < 0.65) {
      const late = r.resolvedAt > r.resolveDueAt;
      const reopen = rand() < prof.reopen;
      const stars = Math.round(Math.max(1, Math.min(5, prof.rating + (late ? -0.8 : 0.3) + between(-1, 1) - (reopen ? 2 : 0))));
      if (tryAct('rate', userById(r.citizenId), { stars, resolved: !reopen }, tRate) && reopen) {
        const t2 = tRate + between(1, 3) * DAY;
        if (tryAct('start', head, {}, t2)) tryAct('resolve', head, { ...resolveData, actionTaken: 'إعادة المعالجة بعد اعتراض المواطن' }, t2 + between(1, 3) * DAY);
      }
    } else if (rand() < 0.3) {
      tryAct('ops_accept', userById('ops-rev'), {}, tRate);
    }
  }
  runEscalation(now);
  endSeed();
  return { reports: db.reports.length, users: db.users.length, audit: db.audit.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Seeding…');
  console.log(seed());
}
