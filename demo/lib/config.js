// Static reference data for the demo: categories, SLA, statuses, default settings.

export const PRIORITIES = ['CRITICAL', 'URGENT', 'NORMAL', 'LOW'];
export const PRIORITY_AR = { CRITICAL: 'حرج', URGENT: 'عاجل', NORMAL: 'عادي', LOW: 'منخفض' };

export const STATUS_AR = {
  NEW: 'جديد', ROUTED: 'محوّل للوحدة', ACKNOWLEDGED: 'تم الاستلام', IN_PROGRESS: 'جاري العمل',
  PENDING_BUDGET: 'يحتاج ميزانية', PARTIALLY_RESOLVED: 'حل جزئي', RESOLVED: 'تم الحل',
  CLOSED: 'مغلق', REJECTED: 'مرفوض', NOT_COMPETENT: 'ليس من الاختصاص', REOPENED: 'معاد فتحه',
  OPS_QUEUE: 'لدى غرفة العمليات',
};

export const OPEN_STATUSES = ['NEW', 'ROUTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING_BUDGET', 'PARTIALLY_RESOLVED', 'REOPENED', 'NOT_COMPETENT', 'OPS_QUEUE'];

export const CATEGORIES = [
  { code: 'garbage', ar: 'قمامة متراكمة', en: 'Garbage', priority: 'NORMAL',
    questions: ['هل القمامة في الشارع أم بجوار مصرف/ترعة؟'] },
  { code: 'sewage', ar: 'صرف صحي', en: 'Sewage', priority: 'URGENT',
    questions: ['هل يوجد طفح في الشارع؟', 'هل يؤثر على منازل؟'] },
  { code: 'water', ar: 'مياه الشرب', en: 'Drinking water', priority: 'URGENT',
    questions: ['انقطاع أم تلوث أم كسر ماسورة؟'] },
  { code: 'lighting', ar: 'إنارة عامة', en: 'Street lighting', priority: 'NORMAL',
    questions: ['كم عمود معطل تقريباً؟'] },
  { code: 'roads', ar: 'طرق ورصف', en: 'Roads', priority: 'NORMAL',
    questions: ['حفرة أم هبوط أم طريق غير ممهد؟'] },
  { code: 'agri_encroach', ar: 'تعدٍّ على أرض زراعية', en: 'Farmland encroachment', priority: 'URGENT',
    questions: ['هل البناء قائم أم جارٍ الآن؟', 'المساحة التقريبية؟'] },
  { code: 'illegal_build', ar: 'بناء مخالف', en: 'Illegal construction', priority: 'URGENT',
    questions: ['هل البناء جارٍ الآن؟'] },
  { code: 'state_land', ar: 'تعدٍّ على أملاك الدولة', en: 'State land encroachment', priority: 'URGENT',
    questions: ['نوع التعدي (بناء، زراعة، تسوير)؟'] },
  { code: 'dredging', ar: 'تجريف وتعدين', en: 'Soil dredging / quarrying', priority: 'URGENT',
    questions: ['هل توجد معدات في الموقع الآن؟'] },
  { code: 'canals', ar: 'مصارف وترع', en: 'Canals & drains', priority: 'NORMAL',
    questions: ['انسداد أم ردم أم مخلفات؟'] },
  { code: 'dogs', ar: 'كلاب ضالة', en: 'Stray dogs', priority: 'NORMAL', questions: [] },
  { code: 'emergency', ar: 'طوارئ (حريق / انهيار)', en: 'Emergency', priority: 'CRITICAL', emergency: true,
    questions: ['هل يوجد مصابون؟'] },
  { code: 'other', ar: 'أخرى', en: 'Other', priority: 'LOW', questions: [] },
];
// Keywords the guided chat uses to suggest a category from free text (Egyptian Arabic, spelling variants).
// Editable per category from the CMS. Matching normalizes alef/ya/ta-marbuta, so one spelling is enough.
export const DEFAULT_KEYWORDS = {
  garbage: ['زبالة', 'قمامة', 'مخلفات', 'نفايات', 'قاذورات', 'مقلب', 'كوم زبالة', 'ريحة وحشة'],
  sewage: ['مجاري', 'مجارى', 'صرف', 'طفح', 'بالوعة', 'بلاعة', 'غطا البلاعة', 'مية سودا'],
  water: ['مية الشرب', 'مياه الشرب', 'المية مقطوعة', 'انقطاع المية', 'ماسورة', 'مواسير', 'عكارة', 'مية'],
  lighting: ['نور', 'إنارة', 'اناره', 'عمود', 'لمبة', 'كشاف', 'ضلمة', 'ظلام'],
  roads: ['طريق', 'شارع', 'حفرة', 'مطب', 'رصف', 'أسفلت', 'هبوط', 'تكسير'],
  agri_encroach: ['أرض زراعية', 'ارض زراعيه', 'تبوير', 'بيبنوا في الأرض', 'بناء على الزراعية', 'تعدي على الأرض', 'أعمدة خرسانة'],
  illegal_build: ['بناء مخالف', 'مخالفة بناء', 'دور زيادة', 'أدوار مخالفة', 'من غير ترخيص', 'بدون ترخيص'],
  state_land: ['أملاك دولة', 'أرض الدولة', 'أرض حكومة', 'وضع يد', 'تسوير'],
  dredging: ['تجريف', 'لودر', 'حفار', 'رمل', 'طفلة', 'طمي', 'تعدين'],
  canals: ['ترعة', 'مصرف', 'ردم', 'حشائش', 'ورد النيل', 'مسقة'],
  dogs: ['كلاب', 'كلب', 'سعران', 'عضة'],
  emergency: ['حريق', 'حريقة', 'نار', 'ولعت', 'انهيار', 'وقع البيت', 'بيت وقع', 'مصابين', 'ماس كهربائي'],
  other: [],
};
CATEGORIES.forEach(c => { c.keywords = DEFAULT_KEYWORDS[c.code] || []; });
export const CATEGORY = Object.fromEntries(CATEGORIES.map(c => [c.code, c]));

export const DEFAULT_SETTINGS = {
  dailyLimit: 5,
  dupRadiusM: 50,
  dupDays: 14,
  dupBump1: 5,
  dupBump2: 15,
  resolutionRadiusM: 100,
  autoCloseDays: 7,
  rejectionSamplePct: 20,
  hideReporterDefault: true,
  transparencyPage: true, // demo: on so the landing page shows stats — switch off from the CMS
  // minutes
  sla: {
    CRITICAL: { ack: 60, resolve: 1440 },
    URGENT: { ack: 240, resolve: 4320 },
    NORMAL: { ack: 1440, resolve: 10080 },
    LOW: { ack: 2880, resolve: 20160 },
  },
  weights: { k3: 25, k4: 20, k6: 20, k1: 10, k5: 10, k8: 10, k9: 5 },
  thresholds: { good: 80, fair: 60 },
  seasonalRules: [
    { from: '11-01', to: '02-28', category: 'canals', priority: 'URGENT', note: 'موسم الأمطار' },
  ],
  // escalation: share of the resolve window already overdue
  escalation: { toOpsPct: 50, toGovernorPct: 100, criticalToGovernor: true },
  // pilot area the demo is built around (highlighted on maps, default unit account, citizen test location)
  pilotUnits: ['u230214', 'u230407'],
  reportSchedules: [
    { id: 'daily', name: 'الملخص اليومي', freq: 'daily', time: '08:00', type: 'summary', recipients: 'المحافظ، السكرتير العام', enabled: true },
    { id: 'weekly', name: 'تقرير أداء الوحدات الأسبوعي', freq: 'weekly', time: 'الأحد 09:00', type: 'units', recipients: 'المحافظ، رؤساء المراكز', enabled: true },
    { id: 'monthly', name: 'التقرير الشهري الشامل', freq: 'monthly', time: 'أول الشهر', type: 'full', recipients: 'المحافظ', enabled: false },
  ],
};

export const DEFAULT_CONTENT = {
  heroTitle: 'بلّغ… وصوتك هيوصل',
  heroSubtitle: 'منصة محافظة الفيوم لبلاغات المواطنين. صوّر المشكلة، والوحدة المحلية المختصة هتستلمها فوراً، وتقدر تتابعها لحد ما تتحل.',
  announcement: '',
  steps: [
    { title: 'صوّر المشكلة', text: 'اختار نوع المشكلة وصوّرها بموبايلك — صورة أو فيديو أو وصف صوتي.' },
    { title: 'الموقع بيتحدد لوحده', text: 'السيستم بيعرف القرية والوحدة المحلية المسؤولة من الـ GPS تلقائياً.' },
    { title: 'تابع لحد الحل', text: 'هيوصلك إشعار مع كل خطوة، وبعد الحل تقيّم: اتحلت ولا لأ.' },
  ],
  faq: [
    { q: 'هل لازم أسجّل باسمي؟', a: 'أيوه، التسجيل برقم الموبايل إلزامي ومفيش بلاغات مجهولة، لكن بياناتك ممكن تكون مخفية عن الوحدة المحلية.' },
    { q: 'أعرف منين إن بلاغي اتحل فعلاً؟', a: 'الوحدة لازم ترفع صورة من نفس مكان المشكلة بعد الحل، وإنت بتقيّم. لو قلت «متحلتش» البلاغ بيتفتح تاني.' },
    { q: 'لو مفيش إنترنت؟', a: 'البلاغ بيتحفظ على الموبايل ويتبعت لوحده أول ما النت يرجع.' },
    { q: 'كام بلاغ أقدر أقدّم في اليوم؟', a: 'حتى 5 بلاغات في اليوم.' },
  ],
  emergency: [
    { name: 'الحماية المدنية', number: '180' },
    { name: 'الإسعاف', number: '123' },
    { name: 'شرطة النجدة', number: '122' },
  ],
  contact: { hotline: '', email: '', address: 'ديوان عام محافظة الفيوم' },
};
