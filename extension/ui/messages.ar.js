/* messages.ar.js — كتالوج رسائل نبراس + errorToMessage.
   لكل رسالة: كود ثابت، نوع (kind)، عنوان (فعل + نتيجة)، نص (ما حدث وما العمل)، وإجراء اختياري.
   القواعد: لا رموز داخل النص (الأيقونة من النوع) — يُمنع ذكر API/HTTP/CORS — مصطلحات موحّدة:
   «موقع الوزارة»، «تنزيل» لجلب بيانات الموقع إلى ملف على جهازك، «تصدير» لحفظ نتائج معروضة في الأداة،
   «رفع» لملف يختاره المستخدم من جهازه، «تحميل» لإعادة تحميل الصفحة فقط. القاموس الكامل في ui/terms.ar.js. */
(() => {
  'use strict';
  if (globalThis.NeprasMessages) return;

  const RELOAD = { id: 'reload_page', label: 'إعادة تحميل الصفحة' };

  const CATALOG = {
    // التحقق من المدخلات (تظهر داخل الحقل)
    stage_required:  { kind: 'warning', title: 'اختر المرحلة الدراسية', message: 'حدّد المرحلة من القائمة أعلاه ثم أعد المحاولة.' },
    grade_required:  { kind: 'warning', title: 'اختر الصف', message: 'حدّد الصف من القائمة ثم أعد المحاولة.' },
    class_required:  { kind: 'warning', title: 'اختر الفصل', message: 'حدّد الفصل من القائمة ثم أعد المحاولة.' },
    no_data:         { kind: 'warning', title: 'لا توجد بيانات للتصدير', message: 'اختر صفًّا آخر أو تأكد من وجود طلاب فيه.' },
    // الاتصال بموقع الوزارة
    ministry_tab_required: { kind: 'warning', title: 'افتح موقع الوزارة أولًا', message: 'افتح الصفحة المطلوبة في موقع الوزارة ثم أعد المحاولة.' },
    session_missing: { kind: 'error', title: 'تعذر الاتصال بصفحة الوزارة', message: 'أعد تحميل صفحة بيانات التلميذ ثم حاول مجددًا.', action: RELOAD },
    session_expired: { kind: 'error', title: 'انتهت جلسة موقع الوزارة', message: 'سجّل الدخول من جديد في موقع الوزارة ثم أعد المحاولة.', action: RELOAD },
    ministry_denied: { kind: 'error', title: 'رفض موقع الوزارة الطلب', message: 'قد تكون الجلسة انتهت أو لا تملك صلاحية لهذه البيانات. أعد تحميل الصفحة وسجّل الدخول مجددًا.', action: RELOAD },
    ministry_busy:   { kind: 'error', title: 'موقع الوزارة لا يستجيب الآن', message: 'الخدمة مشغولة أو متوقفة مؤقتًا. انتظر دقائق ثم أعد المحاولة.' },
    network:         { kind: 'error', title: 'تعذر الاتصال بالإنترنت', message: 'تحقق من الاتصال ثم أعد المحاولة.' },
    timeout:         { kind: 'error', title: 'استغرقت العملية وقتًا أطول من المتوقع', message: 'لم يردّ موقع الوزارة في الوقت المناسب. أعد المحاولة بعد قليل.' },
    // نتائج
    stopped:         { kind: 'info', title: 'تم إيقاف العملية', message: 'حُفظ ما اكتمل قبل الإيقاف.' },
    file_saved:      { kind: 'success', title: 'تم حفظ الملف', message: '{file}' },
    generic_error:   { kind: 'error', title: 'تعذر إكمال العملية', message: 'حدثت مشكلة غير متوقعة. أعد المحاولة، وإن تكررت فأرسل بيانات المشكلة للدعم.' },
  };

  const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));

  function get(code, vars) {
    const c = CATALOG[code] || CATALOG.generic_error;
    return { code: CATALOG[code] ? code : 'generic_error', kind: c.kind, title: fill(c.title, vars), message: fill(c.message, vars), action: c.action || null };
  }

  // أنماط النصوص القديمة → رسالة كتالوج (تُستخدم في المحوّلات إلى أن تُنقل مواضع الاستدعاء إلى الأكواد)
  const LEGACY_PATTERNS = [
    [/جلسة\s*API|AUTH_HEADERS_NOT_CAPTURED|TEACHER_AUTH_HEADERS|لم يتم التقاط.*(?:جلسة|رأس)/i, 'session_missing'],
    [/لا توجد بيانات (?:لتصديرها|للتصدير)/, 'no_data'],
    [/اختر(?:ي)? المرحلة(?: الدراسية)?(?: أولًا| اولا| أولاً)?/, 'stage_required'],
  ];
  const matchLegacy = (text) => {
    const t = String(text || '');
    for (const [re, code] of LEGACY_PATTERNS) if (re.test(t)) return get(code);
    return null;
  };

  // ---- تنظيف النصوص الحرة: لا كلمات تقنية أمام المستخدم ----
  const REPLACERS = [
    [/جلسة\s*API/gi, 'جلسة الاتصال'],
    [/HTTP\s*(?:status\s*)?(\d{3})/gi, 'خطأ من موقع الوزارة (رمز $1)'],
    [/\bAPI\b/gi, 'الاتصال المباشر'],
    [/\bCORS\b/gi, 'الاتصال'],
    [/\bHTTP\b/gi, 'الاتصال'],
    [/\bJSON\b/gi, 'البيانات'],
    [/\bEndpoint\b/gi, 'الخدمة'],
    [/\bundefined\b|\bnull\b/gi, ''],
    [/\b(?:Type|Reference|Syntax)Error:?/gi, ''],
  ];
  function friendlyText(text) {
    let t = String(text == null ? '' : text);
    for (const [re, to] of REPLACERS) t = t.replace(re, to);
    return t.replace(/[ \t]{2,}/g, ' ').trim();
  }

  const TECH_TOKENS = /\b(?:API|HTTP|CORS|JSON|undefined|TypeError|ReferenceError|SyntaxError|Error:|at\s+\S+\s*\()/i;
  const hasArabic = (s) => /[\u0600-\u06FF]/.test(s);

  // يحوّل أي خطأ خام إلى رسالة مفهومة + تفاصيل فنية مطوية
  function errorToMessage(err, ctx) {
    const raw = err && typeof err === 'object' ? (err.message || String(err)) : String(err == null ? '' : err);
    const code = err && typeof err === 'object' && err.code ? String(err.code) : '';
    const probe = `${code} ${raw}`;
    let entry;
    if (/AUTH_HEADERS_NOT_CAPTURED|TEACHER_AUTH_HEADERS|NO_SESSION|لم يتم التقاط|جلسة API/i.test(probe)) entry = get('session_missing');
    else if (/\b(?:401|403)\b|unauthori[sz]ed|forbidden|token.*expired|SESSION_EXPIRED/i.test(probe)) entry = get(/\b403\b|forbidden/i.test(probe) ? 'ministry_denied' : 'session_expired');
    else if (/failed to fetch|networkerror|load failed|XHR_NETWORK|network request|ERR_INTERNET|ERR_NETWORK/i.test(probe)) entry = get('network');
    else if (/timed? ?out|timeout|انتهت مهلة|TIMEOUT/i.test(probe)) entry = get('timeout');
    else if (/\b5\d\d\b/.test(probe) && /(?:http|status|خطأ|error)/i.test(probe)) entry = get('ministry_busy');
    else if (/STOP(?:PED)?_BY_USER|USER_STOP|aborted by user|تم إيقاف|أوقف/i.test(probe)) entry = get('stopped');
    else if (hasArabic(raw) && !TECH_TOKENS.test(raw) && raw.length <= 220) {
      // رسالة عربية مكتوبة للمستخدم أصلًا: نحتفظ بها كنص، بعنوان ثابت
      entry = { ...get('generic_error'), message: friendlyText(raw) };
    } else entry = get('generic_error');
    let host = ''; try { host = location.host; } catch (_) {}
    return { ...entry, technical: { code: entry.code, original: friendlyTech(raw), sourceCode: code || undefined, host, when: new Date().toISOString(), context: ctx || undefined } };
  }
  // نُبقي النص التقني الأصلي كما هو للدعم، مع حذف أي رموز/مفاتيح محتملة
  function friendlyTech(raw) { return String(raw || '').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***').replace(/([?&](?:token|key|auth)=)[^&\s]+/gi, '$1***').slice(0, 600); }

  globalThis.NeprasMessages = Object.freeze({ CATALOG, get, matchLegacy, friendlyText, errorToMessage });
})();
