// Shared helpers for all demo pages.
export const STATUS_COLOR = {
  NEW: '#2563EB', ROUTED: '#2563EB', ACKNOWLEDGED: '#0891B2', IN_PROGRESS: '#D97706',
  PENDING_BUDGET: '#7C3AED', PARTIALLY_RESOLVED: '#7C3AED', RESOLVED: '#16A34A', CLOSED: '#64748B',
  REJECTED: '#B91C1C', NOT_COMPETENT: '#B91C1C', REOPENED: '#DB2777', OPS_QUEUE: '#0F766E',
};
export const PRIORITY_COLOR = { CRITICAL: '#DC2626', URGENT: '#EA580C', NORMAL: '#2563EB', LOW: '#94A3B8' };
export const BAND_COLOR = { good: '#16A34A', fair: '#EAB308', poor: '#DC2626', insufficient: '#94A3B8' };
export const BAND_AR = { good: 'جيد', fair: 'متوسط', poor: 'ضعيف', insufficient: 'بيانات غير كافية' };
export const ROLE_AR = { CITIZEN: 'مواطن', UNIT_STAFF: 'موظف وحدة', UNIT_HEAD: 'رئيس وحدة محلية', CENTER_HEAD: 'رئيس مركز', OPS_REVIEWER: 'مراجع الغرفة', OPS_SUPERVISOR: 'مشرف الغرفة', GOVERNOR: 'المحافظ', SYSTEM: 'النظام' };
export const ACTION_AR = {
  created: 'تم تقديم البلاغ', routed: 'توجيه تلقائي', routed_ops: 'تحويل لغرفة العمليات', acknowledge: 'تم الاستلام', assign: 'إسناد لموظف',
  start: 'بدء العمل', pending_budget: 'يحتاج ميزانية', partial: 'حل جزئي', resolve: 'تم الحل', reject: 'رفض البلاغ',
  not_competent: 'ليس من اختصاص الوحدة', ops_accept: 'قبول الحل', ops_return: 'إرجاع الحل للوحدة', confirm_reject: 'تأكيد الرفض',
  override_reject: 'نقض الرفض', reroute: 'إعادة توجيه', priority_changed: 'تغيير الأولوية', category_changed: 'تغيير التصنيف',
  field_visit: 'زيارة ميدانية', rate: 'تقييم المواطن', citizen_reopen: 'إعادة فتح بطلب المواطن', closed: 'إغلاق', escalated: 'تصعيد تلقائي',
  duplicate_merged: 'دمج بلاغ مكرر',
};

let META = null;
export async function meta(force = false) { if (!META || force) META = await api("/api/meta"); return META; }
export const catAr = code => META?.categories.find(c => c.code === code)?.ar || code;
export const statusAr = s => META?.statusAr[s] || s;
export const priorityAr = p => META?.priorityAr[p] || p;

// --- session (demo) ---
export function getUser(key = 'user') { try { return JSON.parse(localStorage.getItem(`ballegh:${key}`)); } catch { return null; } }
export function setUser(u, key = 'user') { try { localStorage.setItem(`ballegh:${key}`, JSON.stringify(u)); } catch {} }
let currentUserId = null;
export function useUser(id) { currentUserId = id; }

export async function api(url, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (currentUserId) headers['x-user-id'] = currentUserId;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  // staff session expired / not logged in → go to the login page (citizen pages never need it)
  if (res.status === 401 && data.login && !/^\/(citizen|index)?(\.html)?$/.test(location.pathname)) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
  }
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

// --- formatting ---
const rtf = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });
export function ago(t) {
  const s = (t - Date.now()) / 1000, a = Math.abs(s);
  if (a < 60) return 'الآن';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
export function dt(t) { return new Date(t).toLocaleString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
export function dur(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m} د`;
  if (m < 1440) return `${Math.round(m / 60)} س`;
  return `${(m / 1440).toFixed(m < 14400 ? 1 : 0)} يوم`;
}
export function fmt(n, d = 0) { return n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }); }
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function statusBadge(s) { const c = STATUS_COLOR[s] || '#64748B'; return `<span class="badge" style="color:${c};background:${c}1A">${esc(statusAr(s))}</span>`; }
export function priorityBadge(p) { const c = PRIORITY_COLOR[p]; return `<span class="badge" style="color:${c};background:${c}1A">${esc(priorityAr(p))}</span>`; }
export function bandBadge(b, score) { const c = BAND_COLOR[b]; return `<span class="badge plain" style="color:${b === 'fair' ? '#854D0E' : c};background:${c}22">${score != null ? score + ' · ' : ''}${BAND_AR[b]}</span>`; }

const OPEN = ['NEW', 'ROUTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PARTIALLY_RESOLVED', 'REOPENED', 'NOT_COMPETENT', 'OPS_QUEUE'];
export function slaBar(r) {
  if (r.status === 'PENDING_BUDGET') return `<div class="sla"><div class="t" style="color:#7C3AED">العدّاد متوقف — يحتاج ميزانية</div></div>`;
  if (!OPEN.includes(r.status) || !r.resolveDueAt) {
    if (r.resolvedAt) { const late = r.resolvedAt > r.resolveDueAt; return `<div class="sla"><div class="t" style="color:${late ? '#B91C1C' : '#15803D'}">${late ? 'اتحل متأخر' : 'اتحل في المدة'}</div></div>`; }
    return '';
  }
  const start = r.acknowledgedAt ? (r.ackDueAt - 0) : r.createdAt;
  const total = r.resolveDueAt - r.createdAt, used = Date.now() - r.createdAt;
  const pct = Math.min(100, used / total * 100);
  const over = Date.now() > r.resolveDueAt;
  const color = over ? '#DC2626' : pct > 50 ? '#D97706' : '#16A34A';
  const txt = over ? `متأخر ${dur(Date.now() - r.resolveDueAt)}` : `متبقي ${dur(r.resolveDueAt - Date.now())}`;
  void start;
  return `<div class="sla"><div class="bar"><i style="width:${over ? 100 : pct}%;background:${color}"></i></div><div class="t num" style="color:${color}">${txt}</div></div>`;
}

export function toast(msg, type = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3900);
  setTimeout(() => t.remove(), 4200);
}

export function modal({ title, body, actions = [] }) {
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><header><h3>${esc(title)}</h3><span class="spacer"></span><button class="icon-btn" data-x aria-label="إغلاق">✕</button></header><div class="body">${body}</div><footer></footer></div>`;
    const footer = bg.querySelector('footer');
    const close = v => { if (bg.classList.contains('out')) return; bg.classList.add('out'); setTimeout(() => bg.remove(), REDUCED ? 0 : 160); resolve(v); };
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = `btn ${a.cls || ''}`; b.textContent = a.label;
      b.onclick = async () => {
        if (a.onClick) { b.disabled = true; try { const v = await a.onClick(bg); if (v !== false) close(v ?? a.value); } catch (e) { toast(e.message, 'err'); } finally { b.disabled = false; } }
        else close(a.value);
      };
      footer.appendChild(b);
    });
    bg.querySelector('[data-x]').onclick = () => close(null);
    bg.addEventListener('click', e => { if (e.target === bg) close(null); });
    document.body.appendChild(bg);
    bg.querySelector('input,textarea,select')?.focus();
  });
}

export function timeline(events) {
  return `<ul class="timeline">${events.slice().reverse().map(e => {
    const c = STATUS_COLOR[e.to] || (e.action === 'escalated' ? '#DC2626' : '#94A3B8');
    return `<li><span class="dot" style="background:${c}"></span><div class="what">${esc(ACTION_AR[e.action] || e.action)}${e.to ? ' · ' + esc(statusAr(e.to)) : ''}</div>
      <div class="meta num">${dt(e.at)} — ${esc(e.actorName || '')} ${e.role && e.role !== 'SYSTEM' ? '(' + esc(ROLE_AR[e.role] || e.role) + ')' : ''}</div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</li>`;
  }).join('')}</ul>`;
}

export function gallery(media = []) {
  const items = media.filter(m => m.kind !== 'audio').map(m => m.kind === 'video'
    ? `<video src="${esc(m.url)}" controls preload="metadata"></video>`
    : `<img src="${esc(m.url)}" alt="صورة البلاغ" data-zoom>`).join('');
  const audio = media.find(m => m.kind === 'audio');
  const flags = media.some(m => m.fromGallery) ? `<div class="tiny muted">⚠ صورة واحدة على الأقل من المعرض${media.find(m => m.exifTakenAt) ? ' — تاريخ الالتقاط: ' + dt(media.find(m => m.exifTakenAt).exifTakenAt) : ''}</div>` : '';
  return `<div class="gallery">${items}</div>${audio ? `<audio src="${esc(audio.url)}" controls style="width:100%;margin-top:6px"></audio>` : ''}${flags}`;
}
document.addEventListener('click', e => {
  const img = e.target.closest('img[data-zoom]');
  if (!img) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg'; bg.style.cursor = 'zoom-out';
  bg.innerHTML = `<img src="${img.src}" style="max-width:94vw;max-height:90vh;border-radius:12px">`;
  bg.onclick = () => bg.remove();
  document.body.appendChild(bg);
});

export function brandHtml(sub = 'منصة بلاغات محافظة الفيوم') {
  return `<a class="brand" href="/"><img src="/brand/ballegh-mark.svg" alt=""><span><b>بلّغ</b><small>${esc(sub)}</small></span></a>`;
}

// Short two-tone chime for new reports (no audio file needed)
let audioCtx = null;
export function chime() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const t = audioCtx.currentTime;
    [[880, 0], [1320, 0.14]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
      o.connect(g).connect(audioCtx.destination); o.start(t + d); o.stop(t + d + 0.4);
    });
  } catch {}
}

// Staff navigation shared by ops / map / reports / governor / admin
const NAV = [
  ['ops', '/ops.html', 'غرفة العمليات'],
  ['list', '/list.html', 'البلاغات'],
  ['map', '/map.html', 'الخريطة'],
  ['reports', '/reports.html', 'التقارير'],
  ['governor', '/governor.html', 'لوحة المحافظ'],
  ['unit', '/unit.html', 'الوحدة المحلية'],
  ['admin', '/admin.html', 'الإعدادات'],
];
export function navHtml(active) {
  return `<nav class="snav" aria-label="التنقل">${NAV.map(([k, href, t]) => `<a href="${href}" class="${k === active ? 'on' : ''}">${t}</a>`).join('')}</nav>`;
}
const SVG = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export function mountNav(active) {
  const bar = document.querySelector('.topbar');
  if (!bar || bar.querySelector('.snav')) return;
  const brand = bar.querySelector('#brand') || bar.firstElementChild;
  brand.insertAdjacentHTML('afterend', navHtml(active));
  mountUserMenu(bar);
}

// Account menu at the end of the staff top bar: avatar + name, dropdown with session info and logout
async function mountUserMenu(bar) {
  if (bar.querySelector('.umenu')) return;
  let s = { loggedIn: true, required: false, user: null, expiresAt: null };
  try { s = await fetch('/api/staff/session', { cache: 'no-store' }).then(r => r.json()); } catch {}
  const name = s.user || 'موظف';
  const until = s.expiresAt ? new Date(s.expiresAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : null;
  // The role belongs to the account, so it is shown here — not as a switch in the top bar.
  // In the demo one login stands in for every role; the switch below is labelled as a demo aid.
  const page = location.pathname.replace(/\.html$/, '');
  const opsPage = /^\/(ops|list|admin|map|reports|presentation)$/.test(page);
  const opsRole = (() => { try { return localStorage.getItem('ballegh:ops') || 'ops-sup'; } catch { return 'ops-sup'; } })();
  const roleLabel = page === '/governor' ? 'المحافظ' : page === '/unit' ? 'رئيس وحدة محلية' : opsRole === 'ops-rev' ? 'مراجع غرفة العمليات' : 'مشرف غرفة العمليات';
  const switchTo = opsRole === 'ops-rev' ? ['ops-sup', 'مشرف الغرفة'] : ['ops-rev', 'مراجع الغرفة'];
  const wrap = document.createElement('div');
  wrap.className = 'umenu';
  wrap.innerHTML = `
    <button class="ubtn" type="button" aria-haspopup="menu" aria-expanded="false" title="الحساب">
      <span class="av">${esc(name.trim().charAt(0).toUpperCase())}</span>
      <span class="un">${esc(name)}</span>
      ${SVG('<path d="m6 9 6 6 6-6"/>')}
    </button>
    <div class="udrop" role="menu" hidden>
      <div class="uhead"><span class="av lg">${esc(name.trim().charAt(0).toUpperCase())}</span><div><b>${esc(name)}</b><span class="urole">${roleLabel}</span></div></div>
      ${until ? `<div class="uinfo">${SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}<span>الجلسة سارية حتى <b class="num">${until}</b></span></div>` : ''}
      ${opsPage ? `<button class="uitem" type="button" role="menuitem" data-switch="${switchTo[0]}">${SVG('<path d="M7 7h11l-3-3M17 17H6l3 3"/>')}التبديل إلى ${switchTo[1]} <span class="demo-tag">للعرض</span></button>` : ''}
      <a class="uitem" role="menuitem" href="/demo.html">${SVG('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')}كل الشاشات</a>
      <a class="uitem" role="menuitem" href="/" target="_blank">${SVG('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>')}الموقع العام</a>
      ${s.required ? `<div class="usep"></div><a class="uitem danger" role="menuitem" href="/api/staff/logout">${SVG('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>')}تسجيل الخروج</a>` : ''}
    </div>`;
  bar.appendChild(wrap);
  const btn = wrap.querySelector('.ubtn'), drop = wrap.querySelector('.udrop');
  const set = open => { drop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); wrap.classList.toggle('open', open); };
  btn.addEventListener('click', e => { e.stopPropagation(); set(drop.hidden); });
  wrap.querySelector('[data-switch]')?.addEventListener('click', e => {
    try { localStorage.setItem('ballegh:ops', e.currentTarget.dataset.switch); } catch {}
    location.reload();
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
}

// ---------- Collapsible sidebars ----------
// host: the grid that holds the sidebar; its CSS uses --sbs (inline-start sidebar width) or --sbe (inline-end),
// and sets them to 0 under .sbs-off / .sbe-off. State is remembered per page in localStorage.
export function collapsibleSide(host, { key, edge = 'start', title = 'القائمة' } = {}) {
  if (!host) return;
  const cls = edge === 'start' ? 'sbs-off' : 'sbe-off', k = 'ballegh:sb:' + key;
  let off = false; try { off = localStorage.getItem(k) === '1'; } catch {}
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'sb-toggle'; btn.dataset.edge = edge;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const apply = () => {
    host.classList.toggle(cls, off);
    btn.setAttribute('aria-expanded', String(!off));
    btn.title = (off ? 'إظهار ' : 'إخفاء ') + title; btn.setAttribute('aria-label', btn.title);
  };
  host.classList.add('sb-host', 'sb-noanim'); apply(); host.appendChild(btn);
  requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove('sb-noanim')));
  btn.onclick = () => {
    off = !off; try { localStorage.setItem(k, off ? '1' : '0'); } catch {}
    apply();
    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  };
  return btn;
}

// ---------- Motion: reveal on first appearance + animated numbers ----------
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const RV_SEL = '.kpi, .card, .stat, .role, .step, .tile';
const NUM_SEL = '.kpi .v, .stat b, .tiles > div > b';
const seenParents = new WeakSet();
const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; io.unobserve(e.target);
  e.target.classList.remove('rv-wait'); e.target.classList.add('rv');
  const done = () => { e.target.classList.remove('rv'); e.target.style.removeProperty('--i'); };
  e.target.addEventListener('animationend', done, { once: true });
  setTimeout(done, 1400 + (Number(e.target.style.getPropertyValue('--i')) || 0) * 45);
}), { rootMargin: '0px 0px -30px 0px' }) : null;

function reveal(nodes) {
  if (REDUCED || !io) return;
  const groups = new Map();
  nodes.forEach(n => { const p = n.parentElement; if (!p || seenParents.has(p) || n.closest('.modal-bg, #toasts, .maplibregl-map')) return; (groups.get(p) || groups.set(p, []).get(p)).push(n); });
  groups.forEach((list, p) => {
    seenParents.add(p);
    list.slice(0, 16).forEach((n, i) => { n.style.setProperty('--i', i); n.classList.add('rv-wait'); io.observe(n); });
  });
  setTimeout(() => document.querySelectorAll('.rv-wait').forEach(n => { n.classList.remove('rv-wait'); io.unobserve(n); }), 3000);
}

const lastNum = new Map();
const NUM_RE = /-?\d[\d,]*(?:\.\d+)?/;
function numKey(el) {
  const box = el.closest('.kpi, .stat, .tiles > div') || el;
  const label = (box.querySelector('.l, span')?.textContent || '').trim();
  const host = box.parentElement?.id || box.parentElement?.className || '';
  return host + '|' + label;
}
function countUp(el) {
  const txt = el.textContent, m = txt.match(NUM_RE); if (!m) return;
  const to = Number(m[0].replace(/,/g, '')); if (!Number.isFinite(to)) return;
  const key = numKey(el), from = lastNum.has(key) ? lastNum.get(key) : 0; lastNum.set(key, to);
  if (REDUCED || from === to || document.hidden) return;
  const dec = (m[0].split('.')[1] || '').length, comma = m[0].includes(',') || Math.abs(to) >= 1000;
  const pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length);
  const f = v => pre + (comma ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec)) + post;
  const t0 = performance.now(), D = from ? 600 : 900;
  if (from) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  const tick = now => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = f(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(tick); else el.textContent = txt; };
  el.textContent = f(from); requestAnimationFrame(tick);
  setTimeout(() => { if (el.textContent !== txt) el.textContent = txt; }, D + 150);
}

function scan(root) {
  if (root.nodeType !== 1) return;
  const rv = root.matches(RV_SEL) ? [root] : []; rv.push(...root.querySelectorAll(RV_SEL)); reveal(rv);
  (root.matches(NUM_SEL) ? [root] : []).concat([...root.querySelectorAll(NUM_SEL)]).forEach(countUp);
}
if (typeof document !== 'undefined') {
  const start = () => {
    scan(document.body);
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(scan); }).observe(document.body, { childList: true, subtree: true });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
}
