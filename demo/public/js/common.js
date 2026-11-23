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
  setTimeout(() => t.remove(), 4200);
}

export function modal({ title, body, actions = [] }) {
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><header><h3>${esc(title)}</h3><span class="spacer"></span><button class="icon-btn" data-x aria-label="إغلاق">✕</button></header><div class="body">${body}</div><footer></footer></div>`;
    const footer = bg.querySelector('footer');
    const close = v => { bg.remove(); resolve(v); };
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
  const wrap = document.createElement('div');
  wrap.className = 'umenu';
  wrap.innerHTML = `
    <button class="ubtn" type="button" aria-haspopup="menu" aria-expanded="false" title="الحساب">
      <span class="av">${esc(name.trim().charAt(0).toUpperCase())}</span>
      <span class="un">${esc(name)}</span>
      ${SVG('<path d="m6 9 6 6 6-6"/>')}
    </button>
    <div class="udrop" role="menu" hidden>
      <div class="uhead"><span class="av lg">${esc(name.trim().charAt(0).toUpperCase())}</span><div><b>${esc(name)}</b><span>${s.required ? 'حساب الموظفين' : 'وضع التطوير المحلي'}</span></div></div>
      ${until ? `<div class="uinfo">${SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}<span>الجلسة سارية حتى <b class="num">${until}</b></span></div>` : ''}
      <a class="uitem" role="menuitem" href="/demo.html">${SVG('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')}كل الشاشات</a>
      <a class="uitem" role="menuitem" href="/" target="_blank">${SVG('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>')}الموقع العام</a>
      ${s.required ? `<div class="usep"></div><a class="uitem danger" role="menuitem" href="/api/staff/logout">${SVG('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>')}تسجيل الخروج</a>` : ''}
    </div>`;
  bar.appendChild(wrap);
  const btn = wrap.querySelector('.ubtn'), drop = wrap.querySelector('.udrop');
  const set = open => { drop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); wrap.classList.toggle('open', open); };
  btn.addEventListener('click', e => { e.stopPropagation(); set(drop.hidden); });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
}
