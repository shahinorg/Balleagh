// Report detail panel shared by ops / unit / governor / center views.
import { api, esc, dt, ago, statusBadge, priorityBadge, slaBar, timeline, gallery, catAr, toast, modal, meta, ROLE_AR } from './common.js';

export async function renderDetail(el, id, { role, actions = () => '', onAction, header = '' } = {}) {
  el.innerHTML = '<div class="muted small" style="padding:16px">جاري التحميل…</div>';
  const r = await api('/api/reports/' + id);
  const M = await meta();
  const reporter = r.reporter ? (r.reporter.hidden ? '<span class="muted">مخفية بقرار غرفة العمليات</span>' : `${esc(r.reporter.name)}${r.reporter.phone ? ` · <span class="num" dir="ltr">${esc(r.reporter.phone)}</span>` : ''}`) : '';
  el.innerHTML = `<div class="detail stack" style="padding:16px">
    ${header}
    <div class="row wrap"><h2>${esc(catAr(r.category))}</h2><span class="spacer"></span>${statusBadge(r.status)} ${priorityBadge(r.priority)}</div>
    <div class="small muted"><span class="num" dir="ltr">${esc(r.code)}</span> · ${dt(r.createdAt)} (${ago(r.createdAt)}) ${r.source === 'social' ? ' · <b style="color:#1D4ED8">مصدر: سوشيال ميديا</b>' : r.source === 'chat' ? ' · <b style="color:#B06E07">💬 مصدر: المحادثة</b>' : ''}</div>
    ${r.escalation >= 2 ? `<div class="danger-note">⚠ مُصعّد إلى: <b>${['', 'رئيس الوحدة', 'رئيس المركز', 'غرفة العمليات', 'المحافظ'][r.escalation]}</b></div>` : ''}
    ${r.duplicateCount ? `<div class="hint">🔁 اتبلّغ عن نفس المشكلة <b>${r.duplicateCount + 1}</b> مرات — البلاغات المكررة اتجمعت هنا.</div>` : ''}
    ${slaBar(r)}
    ${r.media?.length ? gallery(r.media) : ''}
    ${r.description ? `<div class="card small" style="padding:12px">${esc(r.description)}</div>` : ''}
    ${Object.keys(r.guidedAnswers || {}).length ? `<dl class="kv small">${Object.entries(r.guidedAnswers).filter(([, v]) => v).map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>` : ''}
    <dl class="kv small">
      <dt>الموقع</dt><dd>${esc(r.villageName || r.noUnitArea || '—')}${r.centerName ? ' · ' + esc(r.centerName) : ''}</dd>
      <dt>الوحدة</dt><dd>${esc(r.unitName || 'غرفة العمليات بالمحافظة')}</dd>
      <dt>الإحداثيات</dt><dd class="num" dir="ltr" style="text-align:right">${r.location[1].toFixed(5)}, ${r.location[0].toFixed(5)}${r.accuracy ? ` (±${r.accuracy} م)` : ''} · ${r.locationSource === 'manual' ? 'يدوي' : 'GPS'}</dd>
      ${reporter ? `<dt>المبلّغ</dt><dd>${reporter}</dd>` : ''}
      ${r.assigneeName ? `<dt>الموظف المسؤول</dt><dd>${esc(r.assigneeName)}</dd>` : ''}
      ${r.socialUrl ? `<dt>رابط المنشور</dt><dd><a href="${esc(r.socialUrl)}" target="_blank" rel="noopener">فتح</a></dd>` : ''}
      <dt>مدة الاستلام</dt><dd class="num">${dt(r.ackDueAt)}${r.acknowledgedAt ? ` — استُلم ${dt(r.acknowledgedAt)}` : ''}</dd>
      <dt>مدة الحل</dt><dd class="num">${dt(r.resolveDueAt)}</dd>
    </dl>
    ${r.rejection ? `<div class="danger-note"><b>سبب الرفض:</b> ${esc(r.rejection.reason)}${r.rejection.sampled ? ' · <b>ضمن عينة المراجعة</b>' : ''}${r.rejection.confirmed ? ' · تم التأكيد' : ''}${r.rejection.overridden ? ' · تم نقض الرفض' : ''}</div>` : ''}
    ${r.resolution ? `<div class="card" style="padding:12px"><h3>تقرير الحل</h3><div class="gallery" style="margin-bottom:8px"><img src="${esc(r.resolution.photo)}" data-zoom alt="بعد الحل"></div>
      <dl class="kv small"><dt>الإجراء</dt><dd>${esc(r.resolution.actionTaken || '')}</dd><dt>السبب</dt><dd>${esc(r.resolution.cause || '')}</dd><dt>الجهة المنفذة</dt><dd>${esc(r.resolution.executingParty || '')}</dd><dt>التكلفة</dt><dd class="num">${r.resolution.cost ? Number(r.resolution.cost).toLocaleString('en-US') + ' ج.م' : '—'}</dd><dt>التاريخ</dt><dd class="num">${esc(r.resolution.executedOn || '')}</dd><dt>بُعد صورة الحل</dt><dd class="num">${r.resolution.distanceM} م من موقع البلاغ ✓</dd>${r.resolution.notes ? `<dt>ملاحظات</dt><dd>${esc(r.resolution.notes)}</dd>` : ''}</dl></div>` : ''}
    ${r.rating ? `<div class="card small" style="padding:12px">تقييم المواطن: <b style="color:var(--gold-500)">${'★'.repeat(r.rating.stars)}${'☆'.repeat(5 - r.rating.stars)}</b> — ${r.rating.resolved ? 'اتحلت' : '<b style="color:#B91C1C">متحلتش</b>'}</div>` : ''}
    ${r.reviews?.length ? `<div class="small"><b>المراجعات:</b> ${r.reviews.map(v => `${{ resolution_review: 'مراجعة حل', rejection_sample: 'عينة رفض', field_visit: 'زيارة ميدانية' }[v.type]}: ${v.outcome === 'match' ? '✓ مطابق' : '✗ غير مطابق'}`).join(' · ')}</div>` : ''}
    <div class="row wrap" data-actions>${actions(r, M)}</div>
    <div class="section-title">السجل الكامل (سجل التدقيق)</div>
    ${timeline(r.events)}
  </div>`;
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => onAction?.(b.dataset.act, r, b));
  return r;
}

export async function doAction(r, action, body, form) {
  const out = await api(`/api/reports/${r.id}/actions/${action}`, { method: 'POST', body: form ? undefined : body, form });
  toast('تم تنفيذ الإجراء', 'ok');
  return out;
}

export async function askReason(title, placeholder = 'اكتب السبب…', required = true) {
  return modal({
    title, body: `<label class="field"><span>السبب</span><textarea class="input" id="reason" placeholder="${esc(placeholder)}"></textarea></label>`,
    actions: [{ label: 'تأكيد', onClick: bg => { const v = bg.querySelector('#reason').value.trim(); if (required && !v) { toast('السبب إلزامي', 'err'); return false; } return v || ' '; } }, { label: 'إلغاء', cls: 'ghost', value: null }],
  });
}
export { ROLE_AR };
