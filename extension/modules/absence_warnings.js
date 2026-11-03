/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة إنذارات الغياب الرسمية
 * NeprasAbsenceWarnings — توليد نماذج الإنذارات للطباعة وبصيغة المستندات
 */
'use strict';

(function(global) {
  if (global.NeprasAbsenceWarnings) return;

  /**
   * تحديد تصنيف الإنذار بناءً على عدد أيام الغياب
   * @param {number} days
   * @param {Object} [limits]
   * @returns {string}
   */
  function getWarningLevel(days, limits) {
    const l = limits || { first: 5, second: 10, final: 15 };
    if (days >= l.final) return 'إنذار بالفصل';
    if (days >= l.second) return 'إنذار ثان';
    if (days >= l.first) return 'إنذار أول';
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
    for (const s of students) {
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
   * بناء كود HTML لصفحة إنذارات الغياب الرسمية المطبوعة (A4 مع إشعار استلام)
   * @param {Array<Object>} warnings
   * @param {Object} schoolInfo
   * @returns {string}
   */
  function buildWarningsHtml(warnings, schoolInfo) {
    const info = schoolInfo || {};
    const gov = info.governorate || '....................';
    const edara = info.edara || info.administration || '....................';
    const school = info.schoolName || info.school || '....................';
    const year = info.academicYear || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2026 / 2027 م');
    const today = (global.NeprasEgypt ? global.NeprasEgypt.todayStamp() : '').replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3') || '..../..../........';

    let html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>إنذارات الغياب الرسمية — نبراس برو 2026</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 0; background: #fff; color: #000; direction: rtl; }
  .warning-card { border: 2px solid #1F4E78; border-radius: 8px; padding: 14px; margin-bottom: 16px; page-break-inside: avoid; }
  .title { text-align: center; font-size: 14pt; font-weight: bold; color: #1F4E78; text-decoration: underline; margin: 8px 0; }
  .body-text { font-size: 11pt; line-height: 1.8; margin: 10px 0; }
  .receipt-box { border-top: 1px dashed #666; margin-top: 12px; padding-top: 10px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 20px; font-weight: bold; font-size: 11pt; }
  .cut-notice { text-align: center; font-size: 9pt; color: #666; margin: 8px 0; font-weight: bold; }
</style>
</head>
<body>`;

    for (const w of warnings) {
      const esc = global.NeprasEscape
        ? global.NeprasEscape.html
        : (t) => String(t || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
      const headerHtml = global.NeprasReportHeader?.buildHtmlHeader
        ? global.NeprasReportHeader.buildHtmlHeader({
            title: `إخطار غياب رسمي (${w.level})`,
            academicYear: year,
            stageOrDetail: `الصف: ${w.grade} — فصل: ${w.className}`,
            governorate: gov,
            administration: edara,
            school: school,
            proBadge: 'نبراس برو 2026',
            showLogo: true,
            logo: info.logo || info.schoolLogo || null
          })
        : `
  <div style="border:2px solid #000;border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <div style="font-weight:bold;font-size:10pt;">محافظة: ${esc(gov)}<br>إدارة: ${esc(edara)}<br>مدرسة: ${esc(school)}</div>
    <div style="text-align:center;"><div style="font-size:14pt;font-weight:bold;text-decoration:underline;">إخطار غياب رسمي (${esc(w.level)})</div><div style="font-size:11pt;">للعام الدراسي: ${esc(year)}</div></div>
    <div style="text-align:center;font-weight:bold;color:#1e3a8a;font-size:9pt;">
      ${(info.logo || info.schoolLogo) ? `<img src="${info.logo || info.schoolLogo}" alt="شعار المدرسة" width="40" height="40" style="width:40px;height:40px;object-fit:contain;margin-bottom:2px;"><br>` : ''}
      نبراس برو 2026
    </div>
  </div>`;

      html += `
<div class="warning-card">
  ${headerHtml}
  <div class="body-text">
    السيد ولي أمر الطالب / <b>${esc(w.name)}</b> المقيد بالصف: <b>${esc(w.grade)}</b> فصل: <b>${esc(w.className)}</b> (كود الطالب: <b>${esc(w.code)}</b>)<br>
    نحيط سيادتكم علماً بأن نجلكم قد تغيب عن المدرسة مدة قدرها (<b>${esc(w.absenceDays)}</b>) يوماً حتى تاريخه (${esc(today)}) دون عذر قانوني مقبول.<br>
    يرجى التكرم بالحضور إلى إدارة المدرسة فوراً لمقابلة لجنة شؤون الطلاب والانتظام تجنباً لاتخاذ الإجراءات والقرارات الوزارية المقررة في هذا الشأن.
  </div>
  <div class="signatures">
    <div>مسؤول شؤون الطلاب: ....................</div>
    <div>يعتمد،،، مدير المدرسة: ....................</div>
  </div>
  <div class="cut-notice">✂️ ------------------------------------ إشعار استلام رسمي يُقطع ويُعاد لإدارة المدرسة ------------------------------------ ✂️</div>
  <div class="receipt-box">
    <div style="font-weight: bold; margin-bottom: 6px; font-size: 11pt;">إقرار استلام ولي الأمر:</div>
    <div style="font-size: 10.5pt; line-height: 1.8;">
      أقر أنا ولي أمر الطالب / <b>${esc(w.name)}</b> بأنني تسلمت رسميًا الإخطار رقم (<b>${esc(w.level)}</b>) وتعهدت بانتظام نجلي في الحضور بدءاً من الغد.<br>
      الاسم بالكامل: .................................................... الرقم القومي: .................................................... التوقيع: ....................
    </div>
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
    const l = limits || { first: 5, second: 10, final: 15 };
    const list = Array.isArray(students) ? students : [];
    let withAbsence = 0;
    let first = 0;
    let second = 0;
    let final = 0;
    let maxDays = 0;
    const eligibleList = [];

    for (const s of list) {
      const days = parseInt(s.absenceDays || s.days || s['أيام الغياب'] || s['الغياب'] || 0, 10);
      if (days > 0) withAbsence++;
      if (days > maxDays) maxDays = days;
      const level = getWarningLevel(days, l);
      if (level === 'إنذار أول') first++;
      else if (level === 'إنذار ثان') second++;
      else if (level === 'إنذار بالفصل') final++;
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

  global.NeprasAbsenceWarnings = Object.freeze({
    getWarningLevel,
    filterEligibleStudents,
    buildWarningsHtml,
    summarizeAbsence,
    parseAbsenceExcel,
    buildAbsenceTemplateWorkbook
  });

})(typeof window !== 'undefined' ? window : globalThis);
