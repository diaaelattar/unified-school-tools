/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة إنذارات الغياب وقرارات الفصل الرسمية
 * NeprasAbsenceWarnings — المنظومة القانونية المتكاملة طبقاً للمادة (25) من قانون التعليم رقم 139 لسنة 1981 ولائحة الانضباط المدرسي
 *
 * قواعد التصعيد القانوني:
 *  1. الغياب المتصل: إنذار (1) بعد 5 أيام ⬅️ إنذار (2) بعد 10 أيام ⬅️ إنذار (3) بعد 12 يوماً ⬅️ إخطار وقرار الفصل بعد 15 يوماً.
 *  2. الغياب المنفصل: إنذار (1) بعد 7 أيام ⬅️ إنذار (2) بعد 14 يوماً ⬅️ إنذار (3) بعد 21 يوماً ⬅️ إخطار وقرار الفصل بعد 30 يوماً.
 */
'use strict';

(function(global) {
  if (global.NeprasAbsenceWarnings) return;

  const WARNING_RULES = Object.freeze({
    CONTINUOUS: {
      mode: 'CONTINUOUS',
      label: 'متصلة',
      first: 5,
      second: 10,
      third: 12,
      final: 15
    },
    DISCONTINUOUS: {
      mode: 'DISCONTINUOUS',
      label: 'متفرقة',
      first: 7,
      second: 14,
      third: 21,
      final: 30
    }
  });

  /**
   * تحديد تصنيف ومستوى الإنذار بناءً على عدد أيام الغياب ونوع الغياب (متصل أو منفصل)
   *
   * @param {number} days - عدد أيام الغياب
   * @param {Object|string} [optionsOrLimits] - خيارات الغياب أو حدود الأيام
   * @returns {string}
   */
  function getWarningLevel(days, optionsOrLimits) {
    const d = parseInt(days, 10) || 0;
    if (d <= 0) return '';

    let limits = optionsOrLimits;
    if (typeof optionsOrLimits === 'string') {
      const isDiscontinuous = /منفصل|متفرق|discontinuous/i.test(optionsOrLimits);
      limits = isDiscontinuous ? WARNING_RULES.DISCONTINUOUS : WARNING_RULES.CONTINUOUS;
    } else if (optionsOrLimits && typeof optionsOrLimits === 'object') {
      if (optionsOrLimits.mode) {
        const isDiscontinuous = /منفصل|متفرق|discontinuous/i.test(optionsOrLimits.mode);
        limits = isDiscontinuous ? WARNING_RULES.DISCONTINUOUS : WARNING_RULES.CONTINUOUS;
      }
    }

    // إذا لم تُحدد حدود خاصة، نعتمد التوافق الكلاسيكي التام (5، 10، 15)
    if (!limits) {
      if (d >= 15) return 'إنذار بالفصل';
      if (d >= 10) return 'إنذار ثان';
      if (d >= 5) return 'إنذار أول';
      return '';
    }

    const finalLimit = limits.final ?? 15;
    const thirdLimit = limits.third;
    const secondLimit = limits.second ?? 10;
    const firstLimit = limits.first ?? 5;

    if (d >= finalLimit) return 'إنذار بالفصل';
    if (thirdLimit && d >= thirdLimit) return 'إنذار ثالث';
    if (d >= secondLimit) return 'إنذار ثان';
    if (d >= firstLimit) return 'إنذار أول';

    return '';
  }

  /**
   * تصفية الطلاب المستحقين للإنذارات الرسمية
   * @param {Array<Object>} students
   * @param {Object} [limits]
   * @returns {Array<Object>}
   */
  function filterEligibleStudents(students, limits) {
    const out = [];
    for (const s of (students || [])) {
      const days = parseInt(s.absenceDays || s.days || s['أيام الغياب'] || s['الغياب'] || 0, 10);
      const level = getWarningLevel(days, limits);
      if (level) {
        out.push({
          code: String(s.code || s['كود الطالب'] || '').trim(),
          name: String(s.name || s['اسم الطالب'] || '').trim(),
          grade: String(s.grade || s['الصف'] || '').trim(),
          className: String(s.className || s['الفصل'] || '').trim(),
          absenceDays: days,
          level
        });
      }
    }
    return out;
  }

  /**
   * توليد نص الخطاب القانوني الدقيق للإنذار بحسب المستوى ونوع الغياب
   */
  function buildLegalBodyText(w, today, isDiscontinuous) {
    const days = w.absenceDays;
    const modeWord = isDiscontinuous ? 'أيام متفرقة' : 'أيام متصلة';

    if (w.level === 'إنذار أول') {
      return `نحيط سيادتكم علمًا بأن نجلكم قد انقطع عن الحضور والمواظبة على الدراسة بدون عذر تقبله المدرسة لمدة ( <b>${days}</b> ) ${modeWord}، وذلك حتى تاريخ: <b>${today}</b>.<br>
وبناءً على المادة (25) من قانون التعليم رقم 139 لسنة 1981 ولائحة الانضباط المدرسي، نرجو من سيادتكم المبادرة بحضور نجلكم إلى المدرسة فورًا، أو الحضور بنفسكم لتقديم عذر مقبول قانونًا يبرر هذا الغياب.<br>
وفي حال استمرار الغياب دون عذر، سنضطر آسفين لاتخاذ الإجراءات القانونية التصاعدية والتي قد تصل إلى فصل الطالب نهائيًا من المدرسة.`;
    }

    if (w.level === 'إنذار ثان') {
      return `إلحاقًا لإنذارنا الأول المرسل لسيادتكم وتطبيقاً للمادة (25) من قانون التعليم رقم 139 لسنة 1981 ولائحة الانضباط المدرسي، نحيطكم علمًا بأن نجلكم قد استمر في انقطاعه عن الدراسة، ووصلت مدة غيابه إلى ( <b>${days}</b> ) ${modeWord} حتى تاريخ: <b>${today}</b> دون تقديم أي عذر مقبول لإدارة المدرسة.<br>
لذا يرجى سرعة الحضور للمدرسة لتسوية موقف الطالب وتفادي التعرض لإجراءات الفصل النهائي وتجاوز المدة القانونية للغياب.`;
    }

    if (w.level === 'إنذار ثالث') {
      return `إلحاقًا لإنذارنا الثاني المرسل لسيادتكم وتطبيقاً للمادة (25) من قانون التعليم رقم 139 لسنة 1981 ولائحة الانضباط المدرسي، نحيطكم علمًا بأن نجلكم قد استمر في انقطاعه عن الدراسة، ووصلت مدة غيابه إلى ( <b>${days}</b> ) ${modeWord} حتى تاريخ: <b>${today}</b> دون تقديم أي عذر مقبول لإدارة المدرسة.<br>
<b>⚠️ تنبيه حاسم:</b> هذا هو الإنذار القانوني الأخير لسيادتكم قبل استنفاد كامل المدة القانونية وصدور قرار الفصل النهائي. يرجى الحضور الفوري لإدارة المدرسة لتسوية الموقف.`;
    }

    // إخطار بالفصل
    return `بناءً على الإنذارات السابقة المرسلة لسيادتكم، وطبقاً للمادة (25) من قانون التعليم رقم 139 لسنة 1981 ولائحة الانضباط المدرسي، ونظرًا لأن نجلكم قد استنفد المدة القانونية المقررة وانقطع عن المدرسة لمدة ( <b>${days}</b> ) ${modeWord} حتى تاريخ: <b>${today}</b> دون إبداء أسباب أو تقديم عذر طبي أو قانوني تقبله المدرسة.<br>
نحيط سيادتكم علمًا بأنه تقرر <b>فصل الطالب رسميًا</b> اعتبارًا من تاريخه.<br>
ويرجى الحضور إلى المدرسة خلال المدة القانونية المحددة لإعادة القيد (<b>والتي لا تتجاوز 15 يومًا من تاريخ الفصل</b>)، مصطحبين معكم الرسوم المقررة قانوناً (25 جنيهاً)، وفي حال فوات هذه المدة يسقط حق الطالب نهائياً في إعادة القيد ويُحرم من دخول امتحانات العام الدراسي الحالي.`;
  }

  /**
   * بناء كود HTML لصفحة إنذارات الغياب الرسمية المطبوعة (A4 مع إشعار استلام وتوقيعات ثلاثية)
   * @param {Array<Object>} warnings
   * @param {Object} schoolInfo
   * @param {Object} [options]
   * @returns {string}
   */
  function buildWarningsHtml(warnings, schoolInfo, options = {}) {
    const info = schoolInfo || {};
    const gov = info.governorate || info.directorate || 'الشرقية';
    const edara = info.edara || info.administration || 'فاقوس';
    const school = info.schoolName || info.school || 'ميت العز الثانوية';
    const year = info.academicYear || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2026 / 2027 م');
    const today = (global.NeprasEgypt ? global.NeprasEgypt.todayStamp() : '').replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3') || '..../..../........';
    const isDiscontinuous = options.mode === 'DISCONTINUOUS' || /منفصل/i.test(options.mode || '');

    const cleanGov = gov.replace(/^(?:محافظة|مديرية|مديرية التربية والتعليم بـ|مديرية التربية والتعليم بمحافظة)\s+/i, '').trim();
    const cleanEdara = edara.replace(/^(?:إدارة|ادارة)\s+/i, '').replace(/\s*التعليمية$/i, '').trim();
    const cleanSchool = school.replace(/^مدرسة\s+/i, '').trim();

    const defaultMinistryLogo = (global.NeprasReportHeader && global.NeprasReportHeader.LOGO_B64) || 'assets/logo.png';
    const activeLogo = info.logo || info.schoolLogo || defaultMinistryLogo;

    let html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>إنذارات الغياب الرسمية — نبراس برو 2026</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 0; background: #fff; color: #000; direction: rtl; }
  .warning-card { border: 2px solid #1F4E78; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; page-break-inside: avoid; }
  .card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #1F4E78; padding-bottom: 6px; margin-bottom: 8px; }
  .header-side { font-size: 10pt; font-weight: bold; line-height: 1.45; }
  .header-center { text-align: center; }
  .title { font-size: 13pt; font-weight: bold; color: #1F4E78; margin: 0 0 4px 0; }
  .date-badge { font-size: 9.5pt; font-weight: bold; color: #334155; }
  .student-badge { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 10.5pt; line-height: 1.6; margin: 6px 0; }
  .body-text { font-size: 10.5pt; line-height: 1.75; text-align: justify; margin: 8px 0; }
  .signatures-three { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 6px; font-weight: bold; font-size: 10.5pt; text-align: center; }
  .sig-col { flex: 1; }
  .receipt-box { border-top: 1px dashed #64748b; margin-top: 10px; padding-top: 8px; }
  .cut-notice { text-align: center; font-size: 8.5pt; color: #475569; margin: 6px 0; font-weight: bold; }
  .receipt-content { font-size: 9.5pt; line-height: 1.65; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; }
</style>
</head>
<body>`;

    for (const w of warnings) {
      const esc = global.NeprasEscape
        ? global.NeprasEscape.html
        : (t) => String(t || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

      const legalText = buildLegalBodyText(w, esc(today), isDiscontinuous);
      const isExpulsion = w.level === 'إنذار بالفصل' || w.level === 'إخطار بالفصل';
      const warningLabel = isExpulsion ? 'إخطار غياب رسمي — إخطار بالفصل' : `إخطار غياب رسمي — إنـــــــــــــذار غياب (${esc(w.level)})`;

      html += `
<div class="warning-card">
  <div class="card-header">
    <div class="header-side">
      مديرية التربية والتعليم بـ ${esc(cleanGov)}<br>
      إدارة ${esc(cleanEdara)} التعليمية<br>
      مدرسة ${esc(cleanSchool)}<br>
      شئون الطلبة
    </div>
    <div class="header-center">
      <div class="title">${warningLabel}</div>
      <div class="date-badge">بتاريخ: ${esc(today)}م — العام الدراسي: ${esc(year)}</div>
    </div>
    <div class="header-side" style="text-align: left; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;">
      ${activeLogo ? `<img src="${activeLogo}" alt="شعار المدرسة" style="height: 52px; max-width: 75px; object-fit: contain; margin-bottom: 2px;">` : ''}
      <div style="font-size: 8.5pt; color: #475569; font-weight: bold;">كود: ${esc(w.code)}</div>
    </div>
  </div>

  <div class="student-badge">
    السيد (ولي أمر الطالب) / <b>${esc(w.name)}</b><br>
    المقيد بالصف : <b>${esc(w.grade)}</b> — فصل ( <b>${esc(w.className)}</b> )
  </div>

  <div class="body-text">
    ${legalText}
  </div>

  <div class="signatures-three">
    <div class="sig-col">ش . ط<br><br>....................</div>
    <div class="sig-col">وكيل ش . ط<br><br>....................</div>
    <div class="sig-col">مدير المدرسة<br><br>....................</div>
  </div>

  <div class="cut-notice">✂️ ------------------------------------ إشعار استلام رسمي يُقطع ويُعاد لإدارة المدرسة ------------------------------------ ✂️</div>
  
  <div class="receipt-box">
    <div class="receipt-content">
      <b>إقرار استلام ولي الأمر:</b><br>
      أقر أنا ولي أمر الطالب / <b>${esc(w.name)}</b> بأنني تسلمت رسميًا ${warningLabel}، وتعهدت بالمتابعة وتسوية موقف نجلي فوراً.<br>
      الاسم بالكامل: ................................................................ الرقم القومي: .................................... التوقيع: ....................
    </div>
  </div>
</div>`;
    }

    html += `</body></html>`;
    return html;
  }

  /**
   * بناء القرار الإداري بفصل طالب لتجاوز مدة الغياب القانونية (المستند الرسمي بالمواد الأربعة)
   *
   * @param {Array<Object>|Object} students - بيانات الطالب المفصول أو قائمة المفصولين
   * @param {Object} schoolInfo - بيانات المدرسة والإدارة
   * @param {Object} [options] - خيارات: mode ('CONTINUOUS' | 'DISCONTINUOUS')
   * @returns {string} كود HTML جاهز للطباعة لقرار الفصل
   */
  function buildExpulsionDecisionHtml(students, schoolInfo, options = {}) {
    const list = Array.isArray(students) ? students : [students];
    const info = schoolInfo || {};
    const gov = info.governorate || info.directorate || 'الشرقية';
    const edara = info.edara || info.administration || 'فاقوس';
    const school = info.schoolName || info.school || 'ميت العز الثانوية';
    const year = info.academicYear || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2026 / 2027 م');
    const today = (global.NeprasEgypt ? global.NeprasEgypt.todayStamp() : '').replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3') || '..../..../........';
    const isDiscontinuous = options.mode === 'DISCONTINUOUS' || /منفصل/i.test(options.mode || '');

    const cleanGov = gov.replace(/^(?:محافظة|مديرية|مديرية التربية والتعليم بـ|مديرية التربية والتعليم بمحافظة)\s+/i, '').trim();
    const cleanEdara = edara.replace(/^(?:إدارة|ادارة)\s+/i, '').replace(/\s*التعليمية$/i, '').trim();
    const cleanSchool = school.replace(/^مدرسة\s+/i, '').trim();

    const defaultMinistryLogo = (global.NeprasReportHeader && global.NeprasReportHeader.LOGO_B64) || 'assets/logo.png';
    const activeLogo = info.logo || info.schoolLogo || defaultMinistryLogo;

    let html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>قرار إداري بفصل طالب لتجاوز الغياب القانوني — نبراس برو</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 0; background: #fff; color: #000; direction: rtl; }
  .decision-page { border: 2.5px solid #000; padding: 20px 24px; min-height: 255mm; box-sizing: border-box; page-break-after: always; position: relative; }
  .header-table { width: 100%; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
  .header-title { text-align: center; font-size: 15pt; font-weight: 800; text-decoration: underline; margin: 8px 0; }
  .preamble { font-size: 11pt; line-height: 1.85; text-align: justify; margin-bottom: 14px; }
  .article-block { margin-bottom: 12px; font-size: 11pt; line-height: 1.8; text-align: justify; }
  .article-title { font-weight: bold; text-decoration: underline; }
  .signatures-three { display: flex; justify-content: space-between; align-items: center; margin-top: 35px; font-weight: bold; font-size: 11.5pt; text-align: center; }
  .sig-col { flex: 1; }
  .checkbox-box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #000; text-align: center; line-height: 14px; font-size: 11px; margin-left: 6px; font-weight: bold; }
</style>
</head>
<body>`;

    for (const st of list) {
      const esc = global.NeprasEscape
        ? global.NeprasEscape.html
        : (t) => String(t || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

      const name = esc(st.name || st['اسم الطالب'] || '......................................................');
      const grade = esc(st.grade || st['الصف'] || '..................');
      const className = esc(st.className || st['الفصل'] || '.......');
      const code = esc(st.code || st['كود الطالب'] || '............');

      const checkContinuous = !isDiscontinuous ? '✔' : '&nbsp;';
      const checkDiscontinuous = isDiscontinuous ? '✔' : '&nbsp;';

      html += `
<div class="decision-page">
  <table class="header-table" style="border-collapse:collapse;">
    <tr>
      <td style="font-weight:bold;font-size:11pt;line-height:1.5;">
        وزارة التربية والتعليم والتعليم الفني<br>
        مديرية التربية والتعليم بـ ${esc(cleanGov)}<br>
        إدارة ${esc(cleanEdara)} التعليمية<br>
        مدرسة ${esc(cleanSchool)}<br>
        شئون الطلبة
      </td>
      <td style="text-align:center;vertical-align:middle;">
        ${activeLogo ? `<img src="${activeLogo}" alt="شعار المدرسة" style="height: 65px; max-width: 90px; object-fit: contain;">` : ''}
      </td>
      <td style="text-align:left;font-weight:bold;font-size:10pt;vertical-align:middle;">
        العام الدراسي: ${esc(year)}<br>
        كود الطالب: ${code}<br>
        تاريخ القرار: ${esc(today)}م
      </td>
    </tr>
  </table>

  <div class="header-title">قرار إداري بفصل طالب لتجاوز مدة الغياب القانونية</div>

  <div class="preamble">
    بناءً على <b>المادة (25) من قانون التعليم رقم 139 لسنة 1981</b>، والقرارات الوزارية المنظمة لقواعد الحضور والغياب ولائحة الانضباط المدرسي، ونظرًا لتجاوز الطالب المذكور أدناه المدة المقررة قانونًا للغياب بدون عذر مقبول، وبعد مراجعة سجلات الحضور والغياب الإلكترونية والورقية بالمدرسة وثبوت توجيه الإنذارات القانونية لولي الأمر في المواعيد المقررة قانوناً، تقرر ما يلي:
  </div>

  <div class="article-block">
    <span class="article-title">مادة (1):</span> يُفصل الطالب / <b>${name}</b> المقيد بالصف : <b>${grade}</b> فصل ( <b>${className}</b> ) فصلاً رسميًا من المدرسة اعتبارًا من تاريخ: <b>${esc(today)}م</b>، وذلك بسبب:
    <div style="margin-top:6px;padding-right:15px;">
      • <span class="checkbox-box">${checkContinuous}</span> انقطاعه عن الدراسة وغيابه المتصل لمدة (15) يوماً متتالية دون عذر تقبله إدارة المدرسة.<br>
      • <span class="checkbox-box">${checkDiscontinuous}</span> انقطاعه عن الدراسة وغيابه المنفصل لمدة (30) يوماً متفرقة على مدار العام الدراسي الحالي بدون عذر.
    </div>
  </div>

  <div class="article-block">
    <span class="article-title">مادة (2):</span> يتم حظر قيد الطالب بالمنظومة الإلكترونية للمدرسة وتحويل حالته إلى "<b>فصل تجاوز غياب</b>"، ويُخطر ولي الأمر بقرار الفصل رسميًا عبر البريد على عنوانه الثابت بالملف، أو عن طريق وسائل الاتصال الإلكترونية أو تليفونياً.
  </div>

  <div class="article-block">
    <span class="article-title">مادة (3):</span> يُسمح للطالب المذكور بالتقدم بطلب لإعادة القيد لمرة واحدة فقط خلال العام الدراسي، وذلك في موعد أقصاه <b>(15) يومًا من تاريخ صدور هذا القرار</b>، بشرط سداد الرسوم المقررة قانونًا بجهات التحصيل (<b>25 جنيهاً</b>)، وألا يكون قد استنفد مرات إعادة القيد المقررة للمرحلة.
  </div>

  <div class="article-block">
    <span class="article-title">مادة (4):</span> يُعمل بهذا القرار من تاريخ صدوره، وعلى أقسام المدرسة المختصة (شؤون الطلاب، مسؤول الإحصاء، والملفات) تنفيذ القرار كلٌ فيما يخصه.
  </div>

  <div style="margin-top:20px;font-weight:bold;font-size:11pt;">
    صدر القرار في تاريخ: ${esc(today)}م
  </div>

  <div class="signatures-three">
    <div class="sig-col">ش . ط<br><br>....................</div>
    <div class="sig-col">وكيل ش . ط<br><br>....................</div>
    <div class="sig-col">مدير المدرسة<br><br>....................</div>
  </div>
</div>`;
    }

    html += `</body></html>`;
    return html;
  }

  /**
   * حساب إحصائيات الغياب وتوزيع المستحقين للإنذارات
   * @param {Array<Object>} students
   * @param {Object} [limits]
   * @returns {Object}
   */
  function summarizeAbsence(students, limits) {
    const list = Array.isArray(students) ? students : [];
    let withAbsence = 0;
    let first = 0;
    let second = 0;
    let third = 0;
    let final = 0;
    let maxDays = 0;
    const eligibleList = [];

    for (const s of list) {
      const days = parseInt(s.absenceDays || s.days || s['أيام الغياب'] || s['الغياب'] || 0, 10);
      if (days > 0) withAbsence++;
      if (days > maxDays) maxDays = days;
      const level = getWarningLevel(days, limits);
      if (level === 'إنذار أول') first++;
      else if (level === 'إنذار ثان') second++;
      else if (level === 'إنذار ثالث') third++;
      else if (level === 'إنذار بالفصل' || level === 'إخطار بالفصل') final++;

      if (level) {
        eligibleList.push({
          code: String(s.code || s['كود الطالب'] || s['كود التلميذ'] || '').trim(),
          name: String(s.name || s['اسم الطالب'] || s['اسم التلميذ'] || '').trim(),
          grade: String(s.grade || s['الصف'] || '').trim(),
          className: String(s.className || s['الفصل'] || '').trim(),
          absenceDays: days,
          level
        });
      }
    }

    return {
      total: list.length,
      withAbsence,
      first,
      second,
      third,
      final,
      eligibleCount: eligibleList.length,
      maxDays,
      eligibleList
    };
  }

  /**
   * قراءة كشف غياب Excel أو CSV واستخراج بيانات الغياب
   * @param {Array<Array>} rows
   * @returns {Array<Object>}
   */
  function parseAbsenceExcel(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return [];
    let headerRowIdx = -1;
    let codeCol = -1;
    let nameCol = -1;
    let gradeCol = -1;
    let classCol = -1;
    let daysCol = -1;

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (/كود/i.test(val) && codeCol < 0) codeCol = c;
        if (/اسم/i.test(val) && nameCol < 0) nameCol = c;
        if (/صف/i.test(val) && gradeCol < 0) gradeCol = c;
        if (/فصل/i.test(val) && classCol < 0) classCol = c;
        if (/(غياب|أيام|ايام)/i.test(val) && daysCol < 0) daysCol = c;
      }
      if (codeCol >= 0 && daysCol >= 0) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx < 0) {
      headerRowIdx = 0;
      codeCol = 0;
      daysCol = Math.max(0, (Array.isArray(rows[0]) ? rows[0].length : 2) - 1);
    }

    const result = [];
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      if (!row.length) continue;
      const code = String(row[codeCol] || '').trim();
      if (!code) continue;
      const days = parseInt(row[daysCol] || 0, 10);
      result.push({
        code,
        name: nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
        grade: gradeCol >= 0 ? String(row[gradeCol] || '').trim() : '',
        className: classCol >= 0 ? String(row[classCol] || '').trim() : '',
        absenceDays: isNaN(days) ? 0 : days
      });
    }
    return result;
  }

  /**
   * بناء مصنف Excel جاهز لرصد الغياب بأسماء وصفوف طلاب المدرسة
   * @param {Array<Object>} students
   * @param {Object} schoolInfo
   * @param {Object} [xlsxLib]
   * @returns {Object}
   */
  function buildAbsenceTemplateWorkbook(students, schoolInfo, xlsxLib) {
    const X = xlsxLib || global.XLSX;
    if (!X) throw new Error('مكتبة Excel غير متوفرة');
    const list = Array.isArray(students) ? students : [];
    const header = ['م', 'كود الطالب', 'اسم الطالب', 'الصف', 'الفصل', 'أيام الغياب'];
    const data = [header];
    list.forEach((s, idx) => {
      data.push([
        idx + 1,
        String(s.code || s['كود الطالب'] || s['كود التلميذ'] || '').trim(),
        String(s.name || s['اسم الطالب'] || s['اسم التلميذ'] || '').trim(),
        String(s.grade || s['الصف'] || '').trim(),
        String(s.className || s['الفصل'] || '').trim(),
        parseInt(s.absenceDays || s.days || 0, 10) || 0
      ]);
    });
    const ws = X.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 6 }, { wch: 15 }, { wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'كشف الغياب');
    return wb;
  }

  /**
   * إرجاع نطاق الأيام الرسمي (من - إلى) لكل مستوى إنذار حسب نوع الغياب
   * @param {string} mode - CONTINUOUS | DISCONTINUOUS
   * @param {string} tier - ALL | FIRST | SECOND | THIRD | FINAL
   * @returns {{ from: number, to: (number|null), label: string }}
   */
  function getTierRange(mode, tier) {
    const isDisc = mode === 'DISCONTINUOUS' || /منفصل|متفرق|discontinuous/i.test(String(mode || ''));
    const rules = isDisc ? WARNING_RULES.DISCONTINUOUS : WARNING_RULES.CONTINUOUS;
    const t = String(tier || 'ALL').toUpperCase();
    if (t === 'FIRST') {
      return { from: rules.first, to: rules.second - 1, label: `الإنذار الأول (من ${rules.first} إلى ${rules.second - 1} يوم)` };
    }
    if (t === 'SECOND') {
      return { from: rules.second, to: rules.third - 1, label: `الإنذار الثاني (من ${rules.second} إلى ${rules.third - 1} يوم)` };
    }
    if (t === 'THIRD') {
      return { from: rules.third, to: rules.final - 1, label: `الإنذار الثالث (من ${rules.third} إلى ${rules.final - 1} يوم)` };
    }
    if (t === 'FINAL') {
      return { from: rules.final, to: null, label: `إخطار / قرار الفصل (${rules.final} يوم فأكثر)` };
    }
    return { from: rules.first, to: null, label: `جميع المستحقين (${rules.first} يوم فأكثر)` };
  }

  /**
   * تصفية قائمة الطلاب حسب نطاق أيام الغياب (من - إلى)
   * @param {Array<Object>} students
   * @param {{ from?: (number|null), to?: (number|null) }} range
   * @returns {Array<Object>}
   */
  function filterWarningsByRange(students, range) {
    const list = Array.isArray(students) ? students : [];
    const from = (range && range.from != null && range.from !== '') ? parseInt(range.from, 10) : null;
    const to = (range && range.to != null && range.to !== '') ? parseInt(range.to, 10) : null;
    return list.filter(s => {
      const days = parseInt(s.absenceDays ?? s.days ?? 0, 10) || 0;
      if (from !== null && !isNaN(from) && days < from) return false;
      if (to !== null && !isNaN(to) && days > to) return false;
      return true;
    });
  }

  global.NeprasAbsenceWarnings = Object.freeze({
    WARNING_RULES,
    getWarningLevel,
    getTierRange,
    filterWarningsByRange,
    filterEligibleStudents,
    buildWarningsHtml,
    buildExpulsionDecisionHtml,
    summarizeAbsence,
    parseAbsenceExcel,
    buildAbsenceTemplateWorkbook
  });

})(typeof window !== 'undefined' ? window : globalThis);
