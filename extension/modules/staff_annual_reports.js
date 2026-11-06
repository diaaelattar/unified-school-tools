/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة استخراج تقارير تقويم الأداء السنوية (تقارير الكفاية) لشاغلي وظائف المعلمين وقانون الخدمة المدنية
 * (Staff Annual Performance Evaluation Reports)
 *
 * النماذج المعتمدة المدمجة:
 *  1. نموذج (1) لشاغلي وظائف المعلمين وما يعادلها — طبقاً للقانون رقم (155) لسنة 2007 المعدل (كادر المعلمين).
 *  2. نموذج تقويم أداء وظائف الإدارة المدرسية (مدير، ناظر، وكيل مدرسة).
 *  3. نموذج تقويم أداء الوظائف الإدارية والكتابية والفنية — طبقاً لقانون الخدمة المدنية رقم 81 لسنة 2016.
 *  4. نموذج تقويم أداء الخدمات المعاونة والعمال — طبقاً لقانون الخدمة المدنية رقم 81 لسنة 2016.
 */
'use strict';

(function(global) {
  if (global.NeprasStaffAnnualReports) return;

  const NS_SPREADSHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

  const REPORTS_CONFIG = Object.freeze({
    TEACHER: {
      type: 'TEACHER',
      label: 'معلم حاصل على كادر',
      subfolder: '1- تقارير المعلمين',
      templateFile: 'templates/report_teacher.xlsx',
      headerCell: 'A1',
      cells: {
        A9: (d) => `الاســــــــــــــــــــــــم : ${d.name || ''}`,
        A10: (d, ctx) => `الإدارة التي يعمل بـــها : ${ctx.finalAdmin || ''}`,
        A11: (d) => `تاريــــــخ الميــــــــــلاد : ${d.dob || ''}`,
        D11: (d) => `الرقم القومي : ${d.nid || ''}`,
        A12: (d) => `الدرجــــــة وتاريخهــــــا : ${d.grade || ''}${d.kadrDate ? ' بتاريخ ' + d.kadrDate : ''}`,
        D12: (d) => `تاريخ التسكين بالكادر : ${d.kadrStartDate || '---'}`,
        A13: (d) => `المؤهـــــــلات الدراسية : ${d.qual || ''}`,
        A14: (d) => `الوظيفة التي يشغلهــــــا : ${d.job || ''}${d.subject ? ' - ' + d.subject : ''}`,
        A45: (d) => `الاســــــــــــــــــــــــم : ${d.name || ''}`
      }
    },
    PRINCIPAL: {
      type: 'PRINCIPAL',
      label: 'وظائف الإدارة المدرسية',
      subfolder: '2- تقارير الإدارة المدرسية والقيادات',
      templateFile: 'templates/report_principal.xlsx',
      headerCell: 'A1',
      cells: {
        A9: (d) => `الاســــــــــــــــــــــــم : ${d.name || ''}`,
        A10: (d, ctx) => `الإدارة التي يعمل بـــها : ${ctx.finalAdmin || ''}`,
        A11: (d) => `تاريــــــخ الميــــــــــلاد : ${d.dob || ''}`,
        D11: (d) => `الرقم القومي : ${d.nid || ''}`,
        A12: (d) => `الدرجــــــة وتاريخهــــــا : ${d.grade || ''}${d.kadrDate ? ' بتاريخ ' + d.kadrDate : ''}`,
        D12: (d) => `تاريخ التسكين بالكادر : ${d.kadrStartDate || '---'}`,
        A13: (d) => `المؤهـــــــلات الدراسية : ${d.qual || ''}`,
        A14: (d) => `الوظيفة التي يشغلهــــــا : ${d.job || ''}${d.subject ? ' - ' + d.subject : ''}`,
        A45: (d) => `الاســــــــــــــــــــــــم : ${d.name || ''}`
      }
    },
    CLERICAL: {
      type: 'CLERICAL',
      label: 'وظائف إدارية وكتابية وفنية',
      subfolder: '3- تقارير الإداريين والكتابيين',
      templateFile: 'templates/report_clerical.xlsx',
      headerCell: 'H1',
      cells: {
        A6: (d) => `الرقم القومي : ${d.nid || ''}`,
        E6: (d) => `اسم الموظف : ${d.name || ''}`,
        C7: (d) => `المستوى الوظيفي :  ${d.grade || d.job || ''}`,
        G7: (d) => `المسمى الوظيفي : ${d.job || ''}${d.subject ? ' - ' + d.subject : ''}`,
        A8: (d, ctx) => `الإدارة : ${ctx.finalAdmin || ''}`,
        A38: (d) => `الرقم القومي : ${d.nid || ''}`,
        E38: (d) => `اسم الموظف : ${d.name || ''}`,
        C39: (d) => `المستوى الوظيفي :  ${d.grade || d.job || ''}`,
        G39: (d) => `المسمى الوظيفي : ${d.job || ''}${d.subject ? ' - ' + d.subject : ''}`,
        A40: (d, ctx) => `الإدارة : ${ctx.finalAdmin || ''}`
      }
    },
    SUPPORT: {
      type: 'SUPPORT',
      label: 'خدمات معاونة وعمال',
      subfolder: '4- تقارير الخدمات المعاونة والعمال',
      templateFile: 'templates/report_support.xlsx',
      headerCell: 'H1',
      cells: {
        A6: (d) => `الرقم القومي : ${d.nid || ''}`,
        E6: (d) => `اسم الموظف : ${d.name || ''}`,
        C7: (d) => `المستوى الوظيفي :  ${d.grade || d.job || ''}`,
        G7: (d) => `المسمى الوظيفي : ${d.job || ''}${d.subject ? ' - ' + d.subject : ''}`,
        A8: (d, ctx) => `الإدارة : ${ctx.finalAdmin || ''}`,
        A38: (d) => `الرقم القومي : ${d.nid || ''}`,
        E38: (d) => `اسم الموظف : ${d.name || ''}`,
        C39: (d) => `المستوى الوظيفي :  ${d.grade || d.job || ''}`,
        G39: (d) => `المسمى الوظيفي : ${d.job || ''}${d.subject ? ' - ' + d.subject : ''}`,
        A40: (d, ctx) => `الإدارة : ${ctx.finalAdmin || ''}`
      }
    }
  });

  /**
   * تصنيف ذكي لنوع تقرير الكفاية المناسب من المسمى الوظيفي والوصف
   */
  function normalizeArabic(text) {
    return String(text || '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase()
      .trim();
  }

  function detectReportType(rawJob, rawSubject) {
    // إزالة كلمة (مدرسة / مدرسه) لتفادي التعارض مع كلمة (مدرس)
    const job = normalizeArabic(rawJob).replace(/مدرس[ةه]/g, ' ').replace(/\s+/g, ' ').trim();
    const sub = normalizeArabic(rawSubject).replace(/مدرس[ةه]/g, ' ').replace(/\s+/g, ' ').trim();
    const full = `${job} ${sub}`.trim();

    // 1. وظائف الإدارة المدرسية والقيادات
    if (/مدير|وكيل|ناظر|اداره مدرسيه/i.test(job)) {
      return 'PRINCIPAL';
    }

    // 2. كادر المعلمين: المعلمون والأخصائيون وأمناء المكتبات والمعامل
    if (/معلم|مدرس|اخصائ|امين مكتب|امين معمل|تدريس|مشرف نشاط/i.test(job)) {
      return 'TEACHER';
    }

    // 3. الخدمات المعاونة والعمال
    if (/عامل|معاون خدمه|حارس|سائق|فني خدمات/i.test(job) || (/خدمات معاونه|عمال/i.test(full) && !/اخصائ/i.test(full))) {
      return 'SUPPORT';
    }

    // 4. الوظائف الإدارية والكتابية والفنية
    if (/ادار|كتابي|سكرتير|شؤون|شئون|كاتب|معاون ادار|امين توريدات|فني/i.test(job)) {
      return 'CLERICAL';
    }

    // 5. الافتراضي: كادر المعلمين
    return 'TEACHER';
  }

  /**
   * كتابة نص صريح داخل خلية محددة مع الحفاظ التام على التنسيقات (Border, Fill, Font, Alignment)
   */
  function writeCellTextPreservingStyle(doc, sheetData, cellRef, text) {
    const colLetters = cellRef.replace(/[0-9]/g, '');
    const rowNum = cellRef.replace(/[^0-9]/g, '');

    let rowNode = sheetData.querySelector(`row[r='${rowNum}']`);
    if (!rowNode) {
      rowNode = doc.createElementNS(NS_SPREADSHEET, 'row');
      rowNode.setAttribute('r', rowNum);
      sheetData.appendChild(rowNode);
    }

    let cellNode = rowNode.querySelector(`c[r='${cellRef}']`);
    if (!cellNode) {
      cellNode = doc.createElementNS(NS_SPREADSHEET, 'c');
      cellNode.setAttribute('r', cellRef);
      rowNode.appendChild(cellNode);
    }

    const sAttr = cellNode.getAttribute('s');
    cellNode.setAttribute('t', 'inlineStr');

    while (cellNode.firstChild) {
      cellNode.removeChild(cellNode.firstChild);
    }

    const isNode = doc.createElementNS(NS_SPREADSHEET, 'is');
    const tNode = doc.createElementNS(NS_SPREADSHEET, 't');
    tNode.setAttribute('xml:space', 'preserve');
    tNode.textContent = String(text ?? '');
    isNode.appendChild(tNode);
    cellNode.appendChild(isNode);

    if (sAttr) cellNode.setAttribute('s', sAttr);
  }

  /**
   * توليد ملف إكسيل مخصص لموظف واحد من قالبه المحفوظ
   */
  async function generateEmployeeWorkbook(templateBytes, empRecord, reportConfig, context) {
    const zipEntries = await global.NeprasTemplateFill.readZip(templateBytes);
    const targetEntry = zipEntries.find(e => e.name === 'xl/worksheets/sheet1.xml');
    if (!targetEntry) throw new Error('تعذر العثور على ورقة العمل الرئيسية في القالب.');

    const sheetXmlText = new TextDecoder('utf-8').decode(targetEntry.data);
    const doc = new DOMParser().parseFromString(sheetXmlText, 'application/xml');
    const sheetData = doc.getElementsByTagNameNS(NS_SPREADSHEET, 'sheetData')[0] || doc.getElementsByTagName('sheetData')[0];
    if (!sheetData) throw new Error('بنية ورقة العمل غير صالحة.');

    // 1. كتابة الترويسة
    const headerText = reportConfig.type === 'TEACHER' || reportConfig.type === 'PRINCIPAL'
      ? context.headerTP
      : context.headerCS;
    writeCellTextPreservingStyle(doc, sheetData, reportConfig.headerCell, headerText);

    // 2. كتابة خلايا البيانات
    for (const [cellRef, cellFn] of Object.entries(reportConfig.cells)) {
      const val = cellFn(empRecord, context);
      writeCellTextPreservingStyle(doc, sheetData, cellRef, val);
    }

    let newXmlStr = new XMLSerializer().serializeToString(doc.documentElement);
    if (!newXmlStr.startsWith('<?xml')) {
      newXmlStr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newXmlStr;
    }

    // استبدال الجزء المعدل في الأرشيف
    targetEntry.data = new TextEncoder().encode(newXmlStr);
    return global.neprasBuildZip(zipEntries);
  }

  /**
   * توليد حزمة تقارير الكفاية السنوية لجميع العاملين بصيغة ZIP مرتبة في مجلدات
   *
   * @param {Array} staffList - قائمة العاملين
   * @param {Object} schoolContext - سياق المدرسة (اسم المدرسة، الإدارة، المديرية)
   * @param {Object} io - دوال المساعدة (loadTemplate, onProgress, shouldCancel)
   * @returns {Promise<Uint8Array>} أرشيف ZIP النهائي جاهز للتنزيل
   */
  async function buildAnnualPerformanceZip(staffList, schoolContext = {}, io = {}) {
    const { loadTemplate, onProgress, shouldCancel } = io;

    if (!Array.isArray(staffList) || !staffList.length) {
      throw new Error('قائمة العاملين فارغة.');
    }

    const schoolRaw = schoolContext.schoolName || schoolContext.school || 'المدرسة';
    const adminRaw = schoolContext.administration || schoolContext.admin || 'الإدارة التعليمية';
    const dirRaw = schoolContext.directorate || schoolContext.governorate || 'المديرية';

    const cleanSchool = schoolRaw.replace(/^مدرسة\s+/i, '').trim();
    const cleanAdmin = adminRaw.replace(/^(?:إدارة|ادارة)\s+/i, '').replace(/\s*التعليمية$/i, '').trim();
    const cleanDir = dirRaw.replace(/^(?:مديرية|محافظة)\s+/i, '').trim();

    const finalAdmin = `إدارة ${cleanAdmin} التعليمية`;
    const headerTP = `مديرية التربية والتعليم بـ ${cleanDir}\nإدارة ${cleanAdmin} التعليمية\nمدرسة ${cleanSchool}`;
    const headerCS = `محافظة ${cleanDir}\nمديرية التربية والتعليم بـ ${cleanDir}\nإدارة ${cleanAdmin} التعليمية\nمدرسة ${cleanSchool}`;

    const context = {
      finalAdmin,
      cleanSchool,
      cleanAdmin,
      cleanDir,
      headerTP,
      headerCS
    };

    // 1. تحديد القوالب المطلوبة وتحميلها مسبقاً في الذاكرة
    const normalizedStaff = staffList.map(st => {
      const norm = global.NeprasStaffStats?.normalizeStaffRecord
        ? global.NeprasStaffStats.normalizeStaffRecord(st)
        : st;

      const reportType = st.reportType || detectReportType(norm.job || st.job, norm.subject || st.subject);
      return {
        ...norm,
        reportType,
        originalRecord: st
      };
    });

    const neededTypes = [...new Set(normalizedStaff.map(s => s.reportType))];
    const templateCache = new Map();

    for (const t of neededTypes) {
      const conf = REPORTS_CONFIG[t];
      if (!conf) continue;
      let tplBytes = null;
      if (typeof loadTemplate === 'function') {
        tplBytes = await loadTemplate(conf.templateFile);
      } else {
        const resp = await fetch(chrome.runtime.getURL(conf.templateFile));
        if (!resp.ok) throw new Error(`تعذر تحميل القالب المضمن: ${conf.templateFile}`);
        tplBytes = new Uint8Array(await resp.arrayBuffer());
      }
      templateCache.set(t, tplBytes);
    }

    // 2. بناء ملفات الإكسيل الفردية داخل مصفوفة ZIP
    const zipEntries = [];
    const total = normalizedStaff.length;

    for (let i = 0; i < total; i++) {
      if (typeof shouldCancel === 'function' && shouldCancel()) {
        const err = new Error('USER_ABORTED');
        err.code = 'USER_ABORTED';
        throw err;
      }

      const emp = normalizedStaff[i];
      const conf = REPORTS_CONFIG[emp.reportType] || REPORTS_CONFIG.TEACHER;
      const tplBytes = templateCache.get(conf.type);

      if (typeof onProgress === 'function') {
        onProgress(i + 1, total, emp.name || `موظف ${i + 1}`);
      }

      const empWorkbookBytes = await generateEmployeeWorkbook(tplBytes, emp, conf, context);
      const safeName = String(emp.name || `موظف_${i + 1}`).replace(/[\\/*?:"<>|]/g, '').trim();
      const entryPath = `${conf.subfolder}/تقرير_كفاية_${safeName}.xlsx`;

      zipEntries.push({
        name: entryPath,
        data: empWorkbookBytes
      });
    }

    // 3. بناء الأرشيف النهائي
    return global.neprasBuildZip(zipEntries);
  }

  // تصدير الوحدة
  global.NeprasStaffAnnualReports = Object.freeze({
    REPORTS_CONFIG,
    detectReportType,
    buildAnnualPerformanceZip
  });

})(typeof window !== 'undefined' ? window : this);
