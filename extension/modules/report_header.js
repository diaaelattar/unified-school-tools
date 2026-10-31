/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة الترويسة الموحّدة للتقارير الرسمية (HTML / Print / Excel)
 * NeprasReportHeader — بناء هيدر التقارير الرسمي المتوافق مع معايير وزارة التربية والتعليم
 */
'use strict';

(function(global) {
  if (global.NeprasReportHeader) return;

  // شعار وزارة التربية والتعليم والتعليم الفني (نسخة Base64 مدمجة عالية الدقة)
  const MINISTRY_LOGO_B64 = "data:image/png;base64,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";

  /**
   * بناء ترويسة HTML الرسمية للتقارير والمطبوعات
   * تُطابق نموذج وزارة التربية والتعليم المعتمد مع إضافة «نبراس برو 2026»
   * @param {Object} options
   * @param {string} options.title عنوان الكشف الرئيسي (مثال: كشف مناداة طلاب اللجنة)
   * @param {string} [options.academicYear] العام الدراسي (افتراضي: 2026 / 2027 م)
   * @param {string} [options.stageOrDetail] الصف الدراسي أو التفصيل (مثال: الصف الثالث)
   * @param {string} [options.governorate] المحافظة (مثال: الجيزة)
   * @param {string} [options.administration] الإدارة التعليمية (مثال: العمرانية التعليمية)
   * @param {string} [options.school] اسم المدرسة (مثال: الشهيد محمد سليمان سلامة ع)
   * @param {string} [options.proBadge] شارة الإصدار (افتراضي: نبراس برو 2026)
   * @param {boolean} [options.showLogo] إظهار الشعار (افتراضي: true)
   * @param {string} [options.logo] رابط أو Base64 لشعار مخصص للمدرسة (اختياري)
   * @param {string} [options.schoolLogo] بديل لشعار المدرسة المخصص
   * @returns {string} كود HTML للترويسة
   */
  function buildHtmlHeader(options) {
    const opts = options || {};
    const esc = global.NeprasEscape ? global.NeprasEscape.html : (t) => String(t || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    const gov = opts.governorate || opts.directorate || '....................';
    const edara = opts.administration || opts.edara || '....................';
    const school = opts.school || opts.schoolName || '....................';
    const title = opts.title || 'تقرير مدرسي معتمد';
    const year = opts.academicYear || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2026 / 2027 م');
    const detail = opts.stageOrDetail || '';
    const badge = opts.proBadge || 'نبراس برو 2026';
    const showLogo = opts.showLogo !== false;
    const logoSrc = opts.logo || opts.schoolLogo || MINISTRY_LOGO_B64;

    return `
<div class="nepras-report-official-header" style="border: 2px solid #000; border-radius: 8px; padding: 10px 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; direction: rtl; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; box-sizing: border-box; background: #fff; page-break-inside: avoid;">
  <!-- اليمين: التبعية الإدارية والمدرسة -->
  <div style="text-align: right; font-size: 11pt; font-weight: bold; line-height: 1.6; min-width: 170px; color: #000;">
    <div>محافظة: ${esc(gov)}</div>
    <div>إدارة: ${esc(edara)}</div>
    <div>مدرسة: ${esc(school)}</div>
  </div>

  <!-- الوسط: عنوان التقرير والعام الدراسي والتفصيل -->
  <div style="text-align: center; flex: 1; padding: 0 12px;">
    <div style="font-size: 15pt; font-weight: 900; text-decoration: underline; color: #000; margin-bottom: 3px; letter-spacing: 0.3px;">
      ${esc(title)}
    </div>
    <div style="font-size: 12pt; font-weight: bold; color: #111; margin-bottom: 2px;">
      للعام الدراسي: ${esc(year)}
    </div>
    ${detail ? `<div style="font-size: 11pt; font-weight: bold; color: #1e3a8a;">${esc(detail)}</div>` : ''}
  </div>

  <!-- اليسار: شعار المدرسة أو الوزارة المعتمد + نبراس برو 2026 -->
  <div style="text-align: center; min-width: 130px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
    ${showLogo ? `<img src="${logoSrc}" alt="شعار المدرسة" style="width: 46px; height: 46px; object-fit: contain; margin-bottom: 3px;" />` : ''}
    <div style="font-size: 9pt; font-weight: 800; color: #1e3a8a; letter-spacing: 0.5px; white-space: nowrap;">${esc(badge)}</div>
  </div>
</div>
<hr style="border: none; border-top: 3px solid #000; margin: 0 0 14px 0;" />
`;
  }

  global.NeprasReportHeader = Object.freeze({
    LOGO_B64: MINISTRY_LOGO_B64,
    buildHtmlHeader
  });

})(typeof window !== 'undefined' ? window : globalThis);
