/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة استخراج وتصدير كشوف استمارة الشهادة الإعدادية الإلكترونية (كاملة البيانات)
 * (NeprasG9ExamForms - Follow-up G9 Exam Registration & Official Excel Workbooks)
 *
 * الصفحة الرسمية المستهدفة:
 * https://student.emis.gov.eg/exams/followUpG9ExamReg
 *
 * الكشوف المعتمدة:
 * 1. كشف الطلاب المتخلفين عن تسجيل استمارة التقدم لامتحان الشهادة الإعدادية (مع إثراء البيانات والتنبيه بالسداد).
 * 2. كشف الطلاب الذين قاموا بتسجيل الاستمارة الإلكترونية (كامل البيانات مع التوقيعات الثلاثية).
 * 3. كشف شامل موحد لكافة طلاب الشهادة الإعدادية بالمدرسة (شامل + مسجلين + متخلفين في مصنف واحد).
 */
'use strict';

(function(global) {
  const G9_EXAM_FOLLOWUP_PATH = '/exams/followUpG9ExamReg';

  const MODES = Object.freeze({
    UNREGISTERED: 'UNREGISTERED',
    REGISTERED: 'REGISTERED',
    MASTER: 'MASTER'
  });

  const MODE_LABELS = Object.freeze({
    UNREGISTERED: 'المتخلفون عن التسجيل',
    REGISTERED: 'المسجلون للاستمارة',
    MASTER: 'الكشف الشامل الموحد'
  });

  // أدوات تنظيف وتوحيد النصوص والأرقام
  function clean(val) {
    return String(val ?? '').replace(/\s+/g, ' ').trim();
  }

  function cleanDigits(val) {
    if (global.NeprasEgypt && typeof global.NeprasEgypt.cleanDigits === 'function') {
      return global.NeprasEgypt.cleanDigits(val);
    }
    return String(val ?? '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '')
      .trim();
  }

  /**
   * التحقق مما إذا كان الرابط يخص صفحة متابعة تسجيل استمارة الشهادة الإعدادية
   * @param {string} [url]
   * @returns {boolean}
   */
  function isG9ExamFollowUpPage(url) {
    const u = String(url || (typeof location !== 'undefined' ? location.href : ''));
    return u.toLowerCase().includes(G9_EXAM_FOLLOWUP_PATH.toLowerCase());
  }

  /**
   * قراءة معلومات شريط ترقيم الصفحات والعدادات بدقة تامة
   * @param {Document|Element} [rootDoc]
   * @returns {{current: number, total: number, totalResults: number, pageSize: number}}
   */
  function parsePaginationInfo(rootDoc) {
    const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
    const info = {
      current: 1,
      total: 1,
      totalResults: 0,
      pageSize: 10
    };

    if (!doc) return info;

    // 1. قراءة العداد الرقمي المعتمد: "1 / 9" أو "1 / 1"
    const infoSpan = doc.querySelector('.rt-page-info, [class*="page-info"], .pagination .page-info');
    if (infoSpan) {
      const txt = cleanDigits(infoSpan.textContent);
      const m = txt.match(/(\d+)\s*[/／]\s*(\d+)/);
      if (m) {
        info.current = parseInt(m[1], 10) || 1;
        info.total = parseInt(m[2], 10) || 1;
      }
    }

    // 2. قراءة إجمالي عدد النتائج: "عرض 1 – 10 من 81 نتيجة"
    const countEl = doc.querySelector('.text-muted.small, [class*="text-muted"], .results-count');
    if (countEl) {
      const countTxt = clean(countEl.textContent);
      const mCount = countTxt.match(/من\s*([\d٠-٩]+)\s*نتيجة/i);
      if (mCount) {
        info.totalResults = parseInt(cleanDigits(mCount[1]), 10) || 0;
      }
    }

    // 3. قراءة حجم الصفحة الحالي
    const sizeSelect = doc.querySelector('select#studentPageSize, select[id="studentPageSize"], select[name*="PageSize"]');
    if (sizeSelect && sizeSelect.value) {
      info.pageSize = parseInt(cleanDigits(sizeSelect.value), 10) || 10;
    }

    // تصحيح إجمالي الصفحات إذا لم يتوفر span ولكن توفر إجمالي النتائج
    if (info.total <= 1 && info.totalResults > 0 && info.pageSize > 0) {
      info.total = Math.ceil(info.totalResults / info.pageSize);
    }

    return info;
  }

  /**
   * البحث عن أزرار التبديل في الصفحة
   * @param {Document|Element} [rootDoc]
   * @returns {{unregisteredBtn: HTMLButtonElement|null, registeredBtn: HTMLButtonElement|null}}
   */
  function findModeButtons(rootDoc) {
    const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return { unregisteredBtn: null, registeredBtn: null };

    const buttons = Array.from(doc.querySelectorAll('button'));

    const unregisteredBtn = buttons.find((b) => {
      const txt = clean(b.textContent);
      return b.classList.contains('btn-info') || (txt.includes('تخلف') && txt.includes('التسجيل'));
    }) || null;

    const registeredBtn = buttons.find((b) => {
      const txt = clean(b.textContent);
      return b.classList.contains('btn-success') || (txt.includes('قاموا') && txt.includes('بتسجيل'));
    }) || null;

    return { unregisteredBtn, registeredBtn };
  }

  /**
   * استخراج وتعيين فهرس أعمدة الجدول ديناميكياً
   * @param {HTMLTableElement} table
   * @returns {{codeIdx: number, nameIdx: number, nidIdx: number, classIdx: number, statusIdx: number, actionIdx: number}}
   */
  function getTableColumnMapping(table) {
    const mapping = {
      codeIdx: 0,
      nameIdx: 1,
      nidIdx: 2,
      classIdx: 3,
      statusIdx: 4,
      actionIdx: 5
    };

    if (!table) return mapping;

    const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
    if (!ths.length) return mapping;

    ths.forEach((th, idx) => {
      const t = clean(th.textContent);
      if (t.includes('كود')) mapping.codeIdx = idx;
      else if (t.includes('اسم') || t.includes('طالب') || t.includes('تلميذ')) mapping.nameIdx = idx;
      else if (t.includes('قومي') || t.includes('الرقم')) mapping.nidIdx = idx;
      else if (t.includes('فصل') || t.includes('صف')) mapping.classIdx = idx;
      else if (t.includes('حالة') || t.includes('تسجيل')) mapping.statusIdx = idx;
      else if (t.includes('إجراء') || t.includes('طباعة') || t.includes('استمارة')) mapping.actionIdx = idx;
    });

    return mapping;
  }

  /**
   * كشف حالة تسجيل الاستمارة للطالب في الصف الواحد بدقة 100%
   * يمنع تداخل البيانات بين المسجلين والمتخلفين
   * @param {HTMLTableRowElement} tr
   * @param {NodeList|Array} cells
   * @param {Object} colMap
   * @returns {{isRegistered: boolean, statusText: string}}
   */
  function detectRowRegistrationStatus(tr, cells, colMap) {
    const rowText = clean(tr.textContent);

    // 1. فحص وجود زر أو رابط طباعة الاستمارة
    const printButton = tr.querySelector('button.btn-info, button.btn-success, button:not(.btn-danger), a.btn, [class*="print"], .fa-print, .bi-printer');
    const hasPrintBtn = Boolean(
      (printButton && (clean(printButton.textContent).includes('طباعة') || clean(printButton.textContent).includes('استمارة'))) ||
      rowText.includes('طباعة الاستمارة') ||
      rowText.includes('عرض الاستمارة')
    );

    // 2. فحص نص خانة الحالة
    const statusTextFromCol = colMap.statusIdx < cells.length ? clean(cells[colMap.statusIdx]?.textContent) : '';
    const actionTextFromCol = colMap.actionIdx < cells.length ? clean(cells[colMap.actionIdx]?.textContent) : '';

    let isRegistered = false;
    let statusText = '';

    if (hasPrintBtn) {
      isRegistered = true;
      statusText = 'تم تسجيل الاستمارة بنجاح';
    } else if (
      statusTextFromCol.includes('تم التسجيل') ||
      statusTextFromCol.includes('مسجل') ||
      statusTextFromCol.includes('تم الحفظ') ||
      actionTextFromCol.includes('مسجل')
    ) {
      isRegistered = true;
      statusText = 'تم تسجيل الاستمارة بنجاح';
    } else if (
      statusTextFromCol.includes('تخلف') ||
      statusTextFromCol.includes('لم يسجل') ||
      statusTextFromCol.includes('غير مسجل') ||
      statusTextFromCol.includes('لم يتم') ||
      rowText.includes('تخلف عن التسجيل') ||
      rowText.includes('لم تسجل')
    ) {
      isRegistered = false;
      statusText = 'متخلف عن التسجيل (لم تسجل الاستمارة)';
    } else {
      // إذا لم يتوفر زر طباعة ولم يذكر تم التسجيل فيعتبر متخلفاً
      isRegistered = false;
      statusText = statusTextFromCol || 'متخلف عن التسجيل (لم تسجل الاستمارة)';
    }

    return { isRegistered, statusText };
  }

  /**
   * قراءة صفوف جدول الطلاب المعروض بالصفحة حالياً مع كشف حالة التسجيل الفردية
   * @param {HTMLTableElement} table
   * @param {Object} [colMap]
   * @returns {Array<Object>}
   */
  function parseCurrentTableRows(table, colMap) {
    if (!table) return [];
    const map = colMap || getTableColumnMapping(table);
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const result = [];

    rows.forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      if (!cells || cells.length < 3) return;

      const rowText = clean(tr.textContent);
      if (rowText.includes('لا توجد بيانات') || rowText.includes('No data')) return;

      const code = cleanDigits(cells[map.codeIdx]?.textContent);
      const name = clean(cells[map.nameIdx]?.textContent);
      const nationalId = cleanDigits(cells[map.nidIdx]?.textContent);
      const className = map.classIdx < cells.length ? clean(cells[map.classIdx]?.textContent) : '';

      const { isRegistered, statusText } = detectRowRegistrationStatus(tr, cells, map);

      if (code || name || nationalId) {
        result.push({
          code,
          name,
          nationalId,
          className,
          regStatus: statusText,
          isRegistered
        });
      }
    });

    return result;
  }

  /**
   * إثراء وتدقيق بيانات الطالب الفردي (استخراج تاريخ الميلاد، السن في أول أكتوبر، النوع، الديانة، المحافظة، والدمج)
   * يملأ كافة البيانات الـ 13 عموداً الرسمية
   *
   * @param {Object} rawStudent
   * @param {Map<string, Object>|Object} cachedStudentsMap
   * @param {Object} schoolContext
   * @param {string} mode
   * @returns {Object}
   */
  function enrichStudentData(rawStudent, cachedStudentsMap = null, schoolContext = {}, mode = MODES.UNREGISTERED) {
    const raw = rawStudent || {};
    const code = cleanDigits(raw.code || raw['كود التلميذ'] || raw['كود الطالب']);
    let nationalId = cleanDigits(raw.nationalId || raw.nid || raw['الرقم القومي']);
    let name = clean(raw.name || raw['اسم التلميذ'] || raw['اسم الطالب']);

    // البحث في كاش قاعدة البيانات المحلية (بالرقم القومي أولاً ثم الكود)
    let cached = null;
    if (cachedStudentsMap) {
      if (typeof cachedStudentsMap.get === 'function') {
        if (nationalId) cached = cachedStudentsMap.get(nationalId);
        if (!cached && code) cached = cachedStudentsMap.get(code);
      } else if (typeof cachedStudentsMap === 'object') {
        cached = (nationalId && cachedStudentsMap[nationalId]) || (code && cachedStudentsMap[code]) || null;
      }
    }

    // إذا لم يتوفر الرقم القومي من جدول صفحة الاستمارة (لأن الصفحة تعرض الكود والاسم فقط)، يتم جلبه فوراً من كاش السحب الشامل بمطابقة الكود
    if (!nationalId && cached) {
      nationalId = cleanDigits(cached.nationalId || cached.nid || cached['الرقم القومي'] || cached.national_id || cached.nationalIdCode);
    }

    // إذا كان الاسم في الكاش رباعياً وكاملاً نعتمده
    if (cached && (cached.name || cached['اسم التلميذ'] || cached['اسم الطالب'] || cached.studentName)) {
      const cachedName = clean(cached.name || cached['اسم التلميذ'] || cached['اسم الطالب'] || cached.studentName);
      if (cachedName && cachedName.length > name.length) {
        name = cachedName;
      }
    }

    // استخراج بيانات الرقم القومي المصري الرسمي عبر NeprasEgypt
    let parsedNid = null;
    if (global.NeprasEgypt && nationalId && nationalId.length === 14) {
      parsedNid = global.NeprasEgypt.parseNationalId(nationalId);
    }

    // 1. النوع (دقيق 100% بدون أي افتراض: من الكاش أو من الرقم القومي خانة 13: فردي=ذكر، زوجي=أنثى)
    let gender = clean(raw.gender || raw['النوع'] || cached?.gender || cached?.['النوع']);
    if (!gender && parsedNid && parsedNid.gender) {
      gender = parsedNid.gender;
    }

    // 2. الديانة (عبر محرك NeprasEgypt أو الكاش الرسمي المدرسي — لا تخمين)
    let religion = '';
    if (global.NeprasEgypt && typeof global.NeprasEgypt.resolveReligion === 'function') {
      const resRel = global.NeprasEgypt.resolveReligion(cached || raw);
      if (resRel && resRel !== 'غير مسجّل') religion = resRel;
    }
    if (!religion) {
      religion = clean(raw.religion || raw['الديانة'] || cached?.religion || cached?.['الديانة']);
    }

    // 3. تاريخ الميلاد (صيغة YYYY-MM-DD الرسمية المعتمدة)
    let birthDate = clean(raw.birthDate || raw['تاريخ الميلاد'] || cached?.birthDate || cached?.['تاريخ الميلاد']);
    if (!birthDate && parsedNid && parsedNid.birthDateFormatted) {
      birthDate = parsedNid.birthDateFormatted;
    }

    // 4. السن في أول أكتوبر للعام الدراسي الحالي (سنوات، شهور، أيام)
    const academicYear = schoolContext.academicYear || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2025 / 2026');
    let ageText = '';
    if (birthDate && global.NeprasEgypt && typeof global.NeprasEgypt.ageOnOct1 === 'function') {
      let targetYear = 2025;
      const matchY = String(academicYear).match(/20\d{2}/);
      if (matchY) targetYear = parseInt(matchY[0], 10);
      const ageRes = global.NeprasEgypt.ageOnOct1(birthDate, targetYear);
      if (ageRes && ageRes.text) {
        ageText = ageRes.text;
      } else if (ageRes && Number.isFinite(ageRes.years)) {
        ageText = `${ageRes.years} سنة و ${ageRes.months || 0} شهر و ${ageRes.days || 0} يوم`;
      }
    }

    // 5. محافظة الميلاد
    let governorate = clean(raw.governorate || raw['محافظة الميلاد'] || cached?.governorate || cached?.['محافظة الميلاد']);
    if (!governorate && parsedNid && parsedNid.governorate) {
      governorate = parsedNid.governorate;
    }

    // 6. الفصل والمرحلة (مثلاً: 3/1 أو الصف الثالث الإعدادي)
    let className = clean(raw.className || raw['الفصل'] || cached?.className || cached?.['الفصل']);
    if (!className) className = 'الصف الثالث الإعدادي';

    // 7. موقف الدمج
    const isMerged = Boolean(
      raw.is_merged || raw['دمج'] || cached?.is_merged || cached?.['دمج'] ||
      String(raw.mergeStatus || cached?.mergeStatus || cached?.['الموقف من الدمج'] || '').includes('دمج')
    );
    const isMergedText = isMerged ? 'دمج تعليمي' : 'عادي';

    // 8. حالة تسجيل الاستمارة الفردية والملاحظات
    const isRegistered = raw.isRegistered !== undefined
      ? Boolean(raw.isRegistered)
      : (mode === MODES.REGISTERED);

    let regStatus = clean(raw.regStatus);
    let notes = '';

    if (isRegistered) {
      regStatus = regStatus || 'تم تسجيل الاستمارة بنجاح';
      notes = 'استمارة إلكترونية مسجلة ومطابقة للبيانات الرسمية';
    } else {
      regStatus = regStatus || 'متخلف عن التسجيل (لم تسجل الاستمارة)';
      notes = 'تنبيه بسرعة سداد الرسوم المقررة وتسجيل الاستمارة الإلكترونية قبل غلق الموقع';
    }

    return {
      code,
      name,
      nationalId,
      gender,
      religion,
      birthDate,
      ageText,
      governorate,
      className,
      isMergedText,
      regStatus,
      isRegistered,
      notes
    };
  }

  /**
   * إنشاء مواصفة ورقة إكسيل واحدة ضمن مصنف رسمي
   * @param {string} sheetName
   * @param {string} title
   * @param {Array<Object>} studentsList
   * @param {Object} schoolContext
   * @returns {Object}
   */
  function createSheetSpecification(sheetName, title, studentsList, schoolContext = {}) {
    const gov = clean(schoolContext.governorate || schoolContext.directorate) || '....................';
    const edara = clean(schoolContext.administration || schoolContext.edara) || '....................';
    const school = clean(schoolContext.schoolName || schoolContext.school) || '....................';
    const academicYear = clean(schoolContext.academicYear) || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2025 / 2026');

    const headers = [
      'م',
      'كود التلميذ',
      'اسم التلميذ',
      'الرقم القومي',
      'النوع',
      'الديانة',
      'تاريخ الميلاد',
      'السن في 1 أكتوبر',
      'محافظة الميلاد',
      'الفصل',
      'حالة التسجيل',
      'الموقف من الدمج',
      'ملاحظات'
    ];

    let boysCount = 0;
    let girlsCount = 0;

    const rows = studentsList.map((st, idx) => {
      if (st.gender === 'ذكر') boysCount++;
      else if (st.gender === 'أنثى') girlsCount++;

      return [
        idx + 1,
        st.code || '',
        st.name || '',
        st.nationalId || '',
        st.gender || '',
        st.religion || '',
        st.birthDate || '',
        st.ageText || '',
        st.governorate || '',
        st.className || '',
        st.regStatus || '',
        st.isMergedText || 'عادي',
        st.notes || ''
      ];
    });

    const totalStudents = rows.length;
    const countLabel = `إجمالي الطلاب بالكشف: ${totalStudents} طالب (بنين: ${boysCount} - بنات: ${girlsCount}) — توثيق رسمي: نبراس برو 2026`;

    return {
      name: sheetName,
      title,
      infoLines: [
        `المحافظة: ${gov}`,
        `الإدارة التعليمية: ${edara}`,
        `المدرسة: ${school}`,
        `المرحلة: التعليم الإعدادي (الصف الثالث الإعدادي) — العام الدراسي: ${academicYear}`
      ],
      headers,
      rows,
      recordCount: totalStudents,
      countLabel,
      rightAlignCols: [2], // اسم التلميذ
      numericCols: [0, 1], // م، كود التلميذ
      orientation: 'landscape',
      printFit: true,
      footerSigners: [
        'مسئول شئون الطلاب والإحصاء',
        'رئيس لجنة النظام والمراقبة (الكنترول)',
        'مدير المدرسة (يعتمد)'
      ]
    };
  }

  /**
   * بناء مصنف إكسيل رسمي ومعتمد لكشف الطلاب (المسجلين، المتخلفين، أو الشامل الموحد)
   * @param {Array<Object>} studentsList قائمة الطلاب
   * @param {Object} [schoolContext] السياق المدرسي
   * @param {string} [mode] نوع الكشف ('UNREGISTERED' | 'REGISTERED' | 'MASTER')
   * @returns {Uint8Array} محتويات ملف XLSX
   */
  function buildG9ExamWorkbook(studentsList, schoolContext = {}, mode = MODES.UNREGISTERED) {
    if (!Array.isArray(studentsList)) {
      throw new Error('قائمة الطلاب غير صالحة.');
    }

    const academicYear = clean(schoolContext.academicYear) || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2025 / 2026');

    if (typeof global.neprasBuildMultiSheetWorkbook !== 'function') {
      throw new Error('دالة neprasBuildMultiSheetWorkbook غير متوفرة في بيئة العمل.');
    }

    // إذا كان النمط شاملاً موحداً (MASTER): ننشئ 3 أوراق عمل مستقلة
    if (mode === MODES.MASTER) {
      const regList = studentsList.filter((s) => s.isRegistered);
      const unregList = studentsList.filter((s) => !s.isRegistered);

      const sheetMaster = createSheetSpecification(
        'كشف شامل موحد',
        `الكشف الشامل الموحد لجميع طلاب الشهادة الإعدادية وموقف تسجيل الاستمارة للعام الدراسي ${academicYear}`,
        studentsList,
        schoolContext
      );

      const sheetReg = createSheetSpecification(
        'المسجلون للاستمارة',
        `كشف حصر الطلاب الذين قاموا بتسجيل استمارة التقدم لامتحان الشهادة الإعدادية للعام الدراسي ${academicYear}`,
        regList,
        schoolContext
      );

      const sheetUnreg = createSheetSpecification(
        'المتخلفون عن التسجيل',
        `كشف حصر الطلاب المتخلفين عن تسجيل استمارة التقدم لامتحان الشهادة الإعدادية للعام الدراسي ${academicYear}`,
        unregList,
        schoolContext
      );

      return global.neprasBuildMultiSheetWorkbook([sheetMaster, sheetReg, sheetUnreg]);
    }

    // النمط الفردي (المتخلفون أو المسجلون)
    const isUnreg = mode === MODES.UNREGISTERED;
    const sheetName = isUnreg ? 'المتخلفون عن التسجيل' : 'المسجلون للاستمارة';
    const title = isUnreg
      ? `كشف حصر الطلاب المتخلفين عن تسجيل استمارة التقدم لامتحان الشهادة الإعدادية للعام الدراسي ${academicYear}`
      : `كشف حصر الطلاب الذين قاموا بتسجيل استمارة التقدم لامتحان الشهادة الإعدادية للعام الدراسي ${academicYear}`;

    const spec = createSheetSpecification(sheetName, title, studentsList, schoolContext);
    return global.neprasBuildMultiSheetWorkbook([spec]);
  }

  /**
   * دورة الزحف والاستخراج لجميع الصفحات المعروضة بالجدول مع معالجة ذكية ودقيقة للترقيم
   * تتنقل عبر جميع الصفحات بدون توقف عند أول 200 طالب، مع استقراء دقيق لعداد الصفحات
   *
   * @param {string} mode
   * @param {Function} [onProgress]
   * @returns {Promise<Array<Object>>}
   */
  async function scrapeAllG9Students(mode = MODES.UNREGISTERED, onProgress = null) {
    if (typeof document === 'undefined') {
      throw new Error('دالة scrapeAllG9Students تتطلب بيئة متصفح DOM نشطة.');
    }

    // 1. تفعيل زر النمط المستهدف بالصفحة إذا لزم الأمر
    const { unregisteredBtn, registeredBtn } = findModeButtons(document);
    if (mode === MODES.UNREGISTERED && unregisteredBtn) {
      if (typeof onProgress === 'function') onProgress(0, 100, 'تفعيل عرض كشف الطلاب المتخلفين عن التسجيل...');
      unregisteredBtn.click();
      await new Promise((r) => setTimeout(r, 1000));
    } else if (mode === MODES.REGISTERED && registeredBtn) {
      if (typeof onProgress === 'function') onProgress(0, 100, 'تفعيل عرض كشف الطلاب المسجلين للاستمارة...');
      registeredBtn.click();
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 2. فحص محدد حجم الصفحة studentPageSize
    const sizeSelect = document.querySelector('select#studentPageSize, select[id="studentPageSize"], select[name*="PageSize"]');
    if (sizeSelect && sizeSelect.value !== '100') {
      try {
        sizeSelect.value = '100';
        sizeSelect.dispatchEvent(new Event('input', { bubbles: true }));
        sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 800));
      } catch (_) {}
    }

    // 3. قراءة حالة الترقيم المبدئية
    let pagination = parsePaginationInfo(document);
    const totalPages = Math.max(1, pagination.total || 1);
    const totalResults = pagination.totalResults;

    const studentMap = new Map(); // مانع تكرار ذكي (بالرقم القومي أو الكود)
    let currentPage = 1;
    let safetyCounter = 0;

    while (safetyCounter < 200) {
      safetyCounter++;

      const table = document.querySelector('table');
      if (!table) break;

      const colMap = getTableColumnMapping(table);
      const pageRows = parseCurrentTableRows(table, colMap);

      pageRows.forEach((st) => {
        const key = st.nationalId || st.code || `${st.name}_${studentMap.size}`;
        if (!studentMap.has(key)) {
          studentMap.set(key, st);
        }
      });

      pagination = parsePaginationInfo(document);
      currentPage = pagination.current || currentPage;
      const effectiveTotalPages = Math.max(pagination.total || 1, currentPage);

      if (typeof onProgress === 'function') {
        const msg = `تم سحب ${studentMap.size} طالباً (الصفحة ${currentPage} من ${effectiveTotalPages})...`;
        onProgress(currentPage, effectiveTotalPages, msg);
      }

      // إذا وصلنا لآخر صفحة أو تم استيفاء كافة النتائج
      if (currentPage >= effectiveTotalPages) {
        break;
      }
      if (totalResults > 0 && studentMap.size >= totalResults) {
        break;
      }

      // العثور على زر الصفحة التالية
      const nextBtn = document.querySelector(
        '.rt-pagination button[aria-label="الصفحة التالية"], button.rt-page-btn[aria-label="الصفحة التالية"], button[aria-label*="التالية"]'
      );

      if (!nextBtn || nextBtn.disabled || nextBtn.hasAttribute('disabled')) {
        // فحص أخير للتأكد من عدم وجود صفحات تالية
        await new Promise((r) => setTimeout(r, 600));
        const retryNext = document.querySelector('.rt-pagination button[aria-label="الصفحة التالية"], button.rt-page-btn[aria-label="الصفحة التالية"]');
        if (!retryNext || retryNext.disabled) {
          break;
        }
      }

      const prevFirstCell = table.querySelector('tbody tr td')?.textContent || '';
      const oldPage = currentPage;

      // النقر على زر الصفحة التالية
      nextBtn.click();

      // الانتظار الفعلي حتى تتحدث الصفحة ورقم الصفحة في عداد rt-page-info
      let waited = 0;
      let pageAdvanced = false;

      while (waited < 6000) {
        await new Promise((r) => setTimeout(r, 200));
        waited += 200;

        const currentInfo = parsePaginationInfo(document);
        const currentFirstCell = document.querySelector('table tbody tr td')?.textContent || '';

        if (currentInfo.current > oldPage || (currentFirstCell && currentFirstCell !== prevFirstCell)) {
          pageAdvanced = true;
          currentPage = currentInfo.current;
          break;
        }

        // إذا تأخر استجابة Angular نقوم بإعادة النقر
        if (waited === 2000 && !pageAdvanced) {
          const retryBtn = document.querySelector('.rt-pagination button[aria-label="الصفحة التالية"], button.rt-page-btn[aria-label="الصفحة التالية"]');
          if (retryBtn && !retryBtn.disabled) {
            retryBtn.click();
          }
        }
      }

      if (!pageAdvanced) {
        // انتهت محاولات الانتقال
        break;
      }
    }

    const allStudents = Array.from(studentMap.values());
    return allStudents;
  }

  /**
   * استرجاع خريطة الطلاب المخزنين محلياً لدمج وإثراء البيانات
   * وإذا كانت غير متوفرة أو ناقصة، يتم جلبها في الخلفية من API المدرسة المعتمد
   * @param {Array<Object>} [passedStudents] قائمة طلاب ممررة اختيارياً من نافذة الإضافة
   * @returns {Promise<Map<string, Object>>}
   */
  async function loadCachedStudentsMap(passedStudents = null) {
    const map = new Map();

    try {
      let list = [];

      // 0. فحص القائمة الممررة مباشرة من واجهة نبراس
      if (Array.isArray(passedStudents) && passedStudents.length) {
        list = passedStudents;
      }

      // 1. فحص ذاكرة الصفحة الحالية
      if (!list.length && typeof window !== 'undefined' && Array.isArray(window.neprasCachedStudentsList) && window.neprasCachedStudentsList.length) {
        list = window.neprasCachedStudentsList;
      }

      // 2. فحص التخزين المحلي Chrome Storage بكافة المفاتيح المحتملة لقاعدة البيانات المدرسية
      if (!list.length && typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get([
          'neprasCachedStudentsList',
          'neprasSchoolStatsV1',
          'neprasLocalDB_v1'
        ]);
        if (Array.isArray(stored?.neprasCachedStudentsList) && stored.neprasCachedStudentsList.length) {
          list = stored.neprasCachedStudentsList;
        } else if (Array.isArray(stored?.neprasSchoolStatsV1?.detailRows) && stored.neprasSchoolStatsV1.detailRows.length) {
          list = stored.neprasSchoolStatsV1.detailRows;
        } else if (Array.isArray(stored?.neprasSchoolStatsV1?.rows) && stored.neprasSchoolStatsV1.rows.length) {
          list = stored.neprasSchoolStatsV1.rows;
        } else if (stored?.neprasLocalDB_v1?.students && Array.isArray(stored.neprasLocalDB_v1.students)) {
          list = stored.neprasLocalDB_v1.students;
        }
      }

      // 3. فحص NeprasLocalDB إذا كان متاحاً في البيئة
      if (!list.length && global.NeprasLocalDB && typeof global.NeprasLocalDB.getLatestSnapshot === 'function') {
        try {
          const snap = global.NeprasLocalDB.getLatestSnapshot();
          if (snap && Array.isArray(snap.students) && snap.students.length) {
            list = snap.students;
          }
        } catch (_) {}
      }

      // 4. إذا كانت القائمة لا تزال فارغة أو تفتقر لبيانات الصف الثالث، نحاول الجلب التلقائي عبر API
      if (!list.length && typeof window !== 'undefined' && typeof window.neprasApiGetSchoolStudentRows === 'function') {
        try {
          const apiRows = await window.neprasApiGetSchoolStudentRows('23'); // كود الصف الثالث الإعدادي
          if (Array.isArray(apiRows) && apiRows.length) {
            list = apiRows;
          }
        } catch (_) {}
      }

      list.forEach((st) => {
        if (!st) return;
        const code = cleanDigits(st.code || st.id || st['كود التلميذ'] || st['كود الطالب']);
        const nid = cleanDigits(st.nationalId || st.nid || st['الرقم القومي'] || st.national_id);
        if (nid) map.set(nid, st);
        if (code) map.set(code, st);
      });
    } catch (_) {}

    return map;
  }

  /**
   * استخراج بيانات وبيئة المدرسة من الصفحة أو الذاكرة
   * @returns {Object}
   */
  function extractSchoolContext() {
    const ctx = {
      governorate: '',
      administration: '',
      schoolName: '',
      academicYear: global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2025 / 2026'
    };

    if (typeof document !== 'undefined') {
      const headers = Array.from(document.querySelectorAll('h1, h2, h3, .breadcrumb, header, .school-name, #schoolName, .navbar-brand'));
      for (const h of headers) {
        const txt = clean(h.textContent);
        if (txt.includes('مدرسة') && !ctx.schoolName) ctx.schoolName = txt;
        if (txt.includes('إدارة') && !ctx.administration) ctx.administration = txt;
        if (txt.includes('محافظة') && !ctx.governorate) ctx.governorate = txt;
      }
    }

    return ctx;
  }

  /**
   * تنفيذ التصدير بالكامل: سحب الجدول -> إثراء البيانات -> إنشاء إكسيل -> التنزيل
   * @param {string} mode ('UNREGISTERED' | 'REGISTERED' | 'MASTER')
   * @param {Object} [options]
   * @returns {Promise<boolean>}
   */
  async function runG9ExamExport(mode = MODES.UNREGISTERED, options = {}) {
    const { onProgress, onComplete, onError, cachedStudents } = options;

    try {
      if (typeof onProgress === 'function') {
        onProgress(0, 100, 'جاري تهيئة كشف استمارة الشهادة الإعدادية...');
      }

      // 1. سحب بيانات الجدول من جميع الصفحات
      const rawStudents = await scrapeAllG9Students(mode, (cur, total, msg) => {
        if (typeof onProgress === 'function') onProgress(cur, total, msg);
      });

      if (!rawStudents.length) {
        throw new Error('لم يتم العثور على أي طلاب في الجدول المعروض بالصفحة.');
      }

      // 2. تحميل كاش المدرسة وإثراء البيانات
      if (typeof onProgress === 'function') {
        onProgress(80, 100, 'جاري إثراء وتدقيق بيانات الطلاب بالرقم القومي وتواريخ الميلاد والسن والديانة...');
      }

      const cachedMap = await loadCachedStudentsMap(cachedStudents);
      const schoolContext = extractSchoolContext();

      // إثراء كافة بيانات الطلاب
      const enrichedStudents = rawStudents.map((raw) => enrichStudentData(raw, cachedMap, schoolContext, mode));

      // 3. فرز وفلترة الطلاب حسب النمط المطلوب لمنع تداخل البيانات نهائياً
      let finalStudentsList = enrichedStudents;
      if (mode === MODES.UNREGISTERED) {
        finalStudentsList = enrichedStudents.filter((s) => !s.isRegistered);
      } else if (mode === MODES.REGISTERED) {
        finalStudentsList = enrichedStudents.filter((s) => s.isRegistered);
      }
      // إذا كان النمط MASTER فيبقى finalStudentsList شاملاً للجميع

      if (!finalStudentsList.length) {
        // في حال كانت الفلترة فارغة بسبب عدم وجود مسجلين أو متخلفين
        finalStudentsList = enrichedStudents;
      }

      // 4. بناء ملف الإكسيل المعتمد
      if (typeof onProgress === 'function') {
        onProgress(95, 100, 'جاري بناء وتنسيق مصنف الإكسيل المعتمد بالتوقيعات الرسمية...');
      }

      const xlsxBytes = buildG9ExamWorkbook(finalStudentsList, schoolContext, mode);

      // 5. تجهيز وتنزيل الملف
      let fileLabel = 'كشف_شامل_استمارات_الشهادة_الإعدادية';
      if (mode === MODES.UNREGISTERED) {
        fileLabel = 'كشف_المتخلفين_عن_تسجيل_استمارة_الإعدادية';
      } else if (mode === MODES.REGISTERED) {
        fileLabel = 'كشف_المسجلين_لاستمارة_الشهادة_الإعدادية';
      }

      const safeSchool = schoolContext.schoolName
        ? schoolContext.schoolName.replace(/[/\\?%*:|"<>]/g, '_').trim()
        : 'مدرستنا';
      const fileName = `${fileLabel}_${safeSchool}.xlsx`;

      const blob = new Blob([xlsxBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      if (global.neprasDialog && typeof global.neprasDialog.triggerDownload === 'function') {
        await global.neprasDialog.triggerDownload(blob, fileName, {
          title: 'تم إنشاء كشف الإكسيل بنجاح',
          message: `تم حصر وتصدير (${finalStudentsList.length}) طالباً بكشف كامل البيانات بنجاح.`,
          folder: 'استمارات الشهادة الإعدادية'
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1500);
      }

      if (typeof onComplete === 'function') {
        onComplete({ count: finalStudentsList.length, fileName });
      }

      return true;
    } catch (err) {
      if (typeof onError === 'function') onError(err);
      else console.error('[NeprasG9ExamForms Error]', err);
      return false;
    }
  }

  /**
   * حقن شريط التحكم الذكي السريع بصفحة متابعة تسجيل الاستمارة
   * (تم إيقاف حقن الشريط والأزرار بالصفحة بناءً على رغبة المستخدم للاكتفاء بنافذة الإضافة الموحدة والنظيفة)
   */
  function injectG9ExamToolbar() {
    return;
  }

  // تصدير الوحدة
  global.NeprasG9ExamForms = Object.freeze({
    MODES,
    MODE_LABELS,
    isG9ExamFollowUpPage,
    parsePaginationInfo,
    findModeButtons,
    getTableColumnMapping,
    detectRowRegistrationStatus,
    parseCurrentTableRows,
    enrichStudentData,
    buildG9ExamWorkbook,
    scrapeAllG9Students,
    runG9ExamExport,
    injectG9ExamToolbar
  });

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
