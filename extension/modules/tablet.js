/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة إدارة وتسجيل أجهزة التابلت المدرسي
 * NeprasTablet — قراءة ملف التابلت، المطابقة، وبناء خطة التسجيل
 */
'use strict';

(function(global) {
  if (global.NeprasTablet) return;

  /**
   * تطبيع الرقم المسلسل لجهاز التابلت
   * @param {any} val
   * @returns {string}
   */
  function cleanSerialNumber(val) {
    if (val == null) return '';
    return String(val)
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
  }

  /**
   * قراءة وتدقيق شيت تسجيل التابلت
   * يدعم الأعمدة: كود الطالب، الفصل، الرقم المسلسل، تاريخ الاستلام
   * @param {Array<Array<any>>} matrix مصفوفة الصفوف من ملف Excel
   * @returns {Object} { rows, issues, stats }
   */
  function parseTabletSheet(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) {
      return {
        rows: [],
        issues: [{ row: 1, reason: 'الملف فارغ أو لا يحتوي على صفوف بيانات' }],
        stats: { total: 0, valid: 0, duplicates: 0, rejected: 1 }
      };
    }

    // البحث الذكي عن صف الترويسة في أول 15 صفاً لدعم القوالب الإدارية الرسمية
    let headerRowIdx = 0;
    const limit = Math.min(matrix.length, 15);
    for (let i = 0; i < limit; i++) {
      const row = matrix[i] || [];
      const cellsWithText = row.filter((c) => c != null && String(c).trim() !== '').length;
      // صف الترويسة يحتوي على عدة أعمدة منفصلة (على الأقل 3 أعمدة)
      if (cellsWithText >= 3) {
        const rowText = row.map((c) => String(c || '')).join(' | ');
        if (/مسلسل|سريال|serial/i.test(rowText) && /كود|الرقم التعريفي|code/i.test(rowText)) {
          headerRowIdx = i;
          break;
        }
      }
    }

    const header = (matrix[headerRowIdx] || []).map((c) => String(c || '').trim());
    let codeIdx = -1;
    let serialIdx = -1;
    let classIdx = -1;
    let dateIdx = -1;
    let nameIdx = -1;

    for (let c = 0; c < header.length; c++) {
      const h = header[c];
      if (/كود|الرقم التعريفي|code/i.test(h) && codeIdx === -1) codeIdx = c;
      else if (/مسلسل|سريال|serial/i.test(h) && serialIdx === -1) serialIdx = c;
      else if (/فصل|class/i.test(h) && classIdx === -1) classIdx = c;
      else if (/تاريخ|date/i.test(h) && dateIdx === -1) dateIdx = c;
      else if (/اسم|name/i.test(h) && nameIdx === -1) nameIdx = c;
    }

    if (codeIdx === -1 || serialIdx === -1) {
      return {
        rows: [],
        issues: [{
          row: headerRowIdx + 1,
          reason: 'تعذر العثور على عمودي «كود الطالب» و«الرقم المسلسل» في ترويسة الملف'
        }],
        stats: { total: 0, valid: 0, duplicates: 0, rejected: matrix.length - headerRowIdx - 1 }
      };
    }

    const rows = [];
    const issues = [];
    const seenCodes = new Set();
    const seenSerials = new Set();

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0 || row.every((c) => c == null || String(c).trim() === '')) {
        continue; // تجاهل الصفوف الفارغة تماماً
      }

      const rowNum = r + 1;
      let rawCode = row[codeIdx];
      let rawSerial = row[serialIdx];
      let rawClass = classIdx !== -1 ? row[classIdx] : '';
      let rawDate = dateIdx !== -1 ? row[dateIdx] : '';

      const code = global.NeprasEgypt ? global.NeprasEgypt.cleanDigits(rawCode) : String(rawCode || '').trim();
      const serial = cleanSerialNumber(rawSerial);
      const className = String(rawClass || '').trim();
      let deliveryDate = String(rawDate || '').trim();

      if (!code) {
        issues.push({ row: rowNum, code: '', reason: 'كود الطالب فارغ أو غير صالح' });
        continue;
      }

      if (!serial || serial.length < 5) {
        issues.push({ row: rowNum, code, reason: 'الرقم المسلسل للتابلت فارغ أو غير مكتمل' });
        continue;
      }

      if (seenCodes.has(code)) {
        issues.push({ row: rowNum, code, reason: 'تكرار كود الطالب في أكثر من صف' });
        continue;
      }
      seenCodes.add(code);

      if (seenSerials.has(serial)) {
        issues.push({ row: rowNum, code, reason: 'الرقم المسلسل مكرر لطالب آخر: ' + serial });
        continue;
      }
      seenSerials.add(serial);

      // تطبيع تاريخ الاستلام إن كان رقماً تسلسلياً لـ Excel
      if (typeof rawDate === 'number' && rawDate > 30000 && rawDate < 60000) {
        const utcDays = Math.floor(rawDate - 25569);
        const d = new Date(utcDays * 86400 * 1000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        deliveryDate = yyyy + '-' + mm + '-' + dd;
      } else if (!deliveryDate) {
        // افتراضي: تاريخ اليوم بتوقيت مصر
        if (global.NeprasEgypt) {
          const stamp = global.NeprasEgypt.todayStamp();
          deliveryDate = stamp.slice(0, 4) + '-' + stamp.slice(4, 6) + '-' + stamp.slice(6, 8);
        } else {
          deliveryDate = new Date().toISOString().slice(0, 10);
        }
      }

      const studentName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';

      rows.push({
        rowNum,
        code,
        name: studentName,
        serial,
        className,
        deliveryDate
      });
    }

    return {
      rows,
      issues,
      stats: {
        total: rows.length + issues.length,
        valid: rows.length,
        rejected: issues.length
      }
    };
  }

  /**
   * تجميع خطة تسجيل التابلت حسب الفصول
   * @param {Array<Object>} rows
   * @returns {Map<string, Array<Object>>}
   */
  function groupTabletPlanByClass(rows) {
    const classGroups = new Map();
    for (const r of rows) {
      const cls = r.className || 'الكل';
      if (!classGroups.has(cls)) {
        classGroups.set(cls, []);
      }
      classGroups.get(cls).push(r);
    }
    return classGroups;
  }

  /**
   * بناء مصنف Excel لنموذج تسجيل التابلت المدرسي
   * يتبع تنسيق نبراس الإداري الكامل مع بيانات استرشادية واقعية
   * @param {Object} XLSX
   * @returns {Object} workbook
   */
  function buildTemplateWorkbook(XLSX) {
    const headers = [
      'كود الطالب',
      'اسم الطالب (اختياري)',
      'الصف الدراسي',
      'الفصل',
      'الرقم المسلسل للتابلت (S/N)',
      'تاريخ الاستلام',
      'حالة الجهاز والمشتملات'
    ];

    // بيانات استرشادية واقعية لأجهزة التابلت (أكواد وزارة وسيريالات سامسونج تابلت G615 / T505 / T585 الشائعة بالمدارس)
    const sampleRows = [
      ['12345678', 'أحمد محمد محمود إبراهيم', 'الصف الأول الثانوي', '1/1', 'R52M90ABCDE', '2026-10-15', 'تم تسليم الجهاز والجراب والشاحن والسماعة'],
      ['21024220', 'إسلام مصطفى كمال عثمان', 'الصف الأول الثانوي', '1/1', 'R52M90BCDEF', '2026-10-15', 'تم تسليم الجهاز والمشتملات بحالة جيدة'],
      ['21024221', 'مريم خالد عبد الرحمن علي', 'الصف الأول الثانوي', '1/2', 'R52M90CDEFG', '2026-10-16', 'تم تسليم الجهاز والمشتملات وبوليسة التأمين']
    ];

    if (typeof globalThis.neprasBuildMultiSheetWorkbook === 'function') {
      return globalThis.neprasBuildMultiSheetWorkbook([
        {
          name: 'التابلت_المدرسي',
          title: 'جمهورية مصر العربية — وزارة التربية والتعليم والتعليم الفني',
          infoLines: [
            'نبراس برو 2026 — نموذج تسجيل وتوزيع أجهزة التابلت المدرسي',
            'تنبيه هام: قم بتعبئة كود الطالب والرقم المسلسل (S/N المدون على ظهر الجهاز أو العلبة) وتاريخ الاستلام.'
          ],
          headers,
          rows: sampleRows,
          countLabel: 'إجمالي الأجهزة بالنموذج الاسترشادي',
          rightAlignCols: [1, 2, 6]
        }
      ]);
    }

    if (!XLSX || !XLSX.utils) throw new Error('مكتبة XLSX غير متوفرة');
    const wb = XLSX.utils.book_new();

    const titleRow1 = ['جمهورية مصر العربية — وزارة التربية والتعليم والتعليم الفني'];
    const titleRow2 = ['نبراس — نموذج تسجيل وتوزيع أجهزة التابلت المدرسي'];
    const titleRow3 = ['تنبيه هام: قم بتعبئة كود الطالب والرقم المسلسل (S/N المدون على ظهر الجهاز أو العلبة) وتاريخ الاستلام.'];

    const dataMatrix = [
      titleRow1,
      titleRow2,
      titleRow3,
      headers,
      ...sampleRows
    ];

    const ws = XLSX.utils.aoa_to_sheet(dataMatrix);
    ws['!views'] = [{ RTL: true }];

    // دمج صفوف العناوين الإدارية
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }
    ];

    ws['!cols'] = [
      { wch: 18 }, // كود الطالب
      { wch: 32 }, // اسم الطالب
      { wch: 22 }, // الصف
      { wch: 12 }, // الفصل
      { wch: 28 }, // المسلسل
      { wch: 18 }, // تاريخ الاستلام
      { wch: 45 }  // الملاحظات والمشتملات
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'التابلت_المدرسي');
    return wb;
  }

  let tabletRunCancelled = false;

  /**
   * فحص ما إذا كانت الصفحة الحالية هي صفحة التابلت بموقع الوزارة
   * يدعم فحص الرابط أو فحص وجود جدول التابلت المميز (DataTables_Table_0)
   * @returns {boolean}
   */
  function isTabletPage() {
    if (typeof location !== 'undefined' && (/student\/tablet/i.test(location.href) || /tablet/i.test(location.href))) return true;
    if (typeof document !== 'undefined') {
      const tbl = document.querySelector('table#DataTables_Table_0, table[datatable], table');
      if (tbl) {
        const thText = Array.from(tbl.querySelectorAll('th')).map((t) => t.textContent || '').join(' ');
        if (/كود/i.test(thText) && /الرقم المسلسل/i.test(thText) && /IMEI/i.test(thText)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * قراءة واستخراج جدول التابلت الحالي المعروض في صفحة الوزارة
   * يقرأ الصف والفصل المختارين بالأعلى ويستخرج بيانات الطلاب وأرقام التابلت المسجلة
   * @returns {Array<Object>}
   */
  function scrapeTabletTable() {
    if (typeof document === 'undefined') return [];
    const table = document.querySelector('table#DataTables_Table_0, table[datatable], table');
    if (!table) return [];

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    if (!rows.length) return [];

    // قراءة الصف والفصل النشطين من القوائم المنسدلة أعلى الصفحة
    let activeGrade = '';
    let activeClass = '';
    const topSelects = Array.from(document.querySelectorAll('.card-body select.form-select, select.form-select'));
    if (topSelects.length >= 2) {
      const sGrade = topSelects[0];
      const sClass = topSelects[1];
      if (sGrade && sGrade.selectedIndex >= 0) {
        activeGrade = (sGrade.options[sGrade.selectedIndex]?.text || '').trim();
        if (activeGrade.includes('اختر')) activeGrade = '';
      }
      if (sClass && sClass.selectedIndex >= 0) {
        activeClass = (sClass.options[sClass.selectedIndex]?.text || '').trim();
        if (activeClass.includes('اختر')) activeClass = '';
      }
    }

    // اكتشاف فهارس الأعمدة من ترويسة الجدول
    let codeCol = -1, nameCol = -1, nidCol = -1, classCol = -1, serialCol = -1, imeiCol = -1, dateCol = -1, statusCol = -1;
    const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
    ths.forEach((th, idx) => {
      const text = (th.textContent || '').trim();
      if (/كود|الرقم التعريفي|code/i.test(text) && codeCol === -1) codeCol = idx;
      else if (/اسم/i.test(text) && nameCol === -1) nameCol = idx;
      else if (/قومي|national/i.test(text) && nidCol === -1) nidCol = idx;
      else if (/فصل|class/i.test(text) && classCol === -1) classCol = idx;
      else if (/مسلسل|سريال|serial/i.test(text) && serialCol === -1) serialCol = idx;
      else if (/imei/i.test(text) && imeiCol === -1) imeiCol = idx;
      else if (/تاريخ/i.test(text) && dateCol === -1) dateCol = idx;
      else if (/حالة/i.test(text) && statusCol === -1) statusCol = idx;
    });

    const students = [];
    rows.forEach((tr, rIdx) => {
      const tds = tr.querySelectorAll('td');
      if (!tds.length) return;

      const getVal = (col) => {
        if (col === -1 || !tds[col]) return '';
        const input = tds[col].querySelector('input, select');
        return input ? (input.value || input.placeholder || '') : (tds[col].textContent || '').trim();
      };

      const code = getVal(codeCol) || (tds[1] ? (tds[1].textContent || '').trim() : '');
      const cleanCode = global.NeprasEgypt ? global.NeprasEgypt.cleanDigits(code) : code;
      if (!cleanCode || cleanCode.length < 4) return;

      const name = getVal(nameCol) || (tds[2] ? (tds[2].textContent || '').trim() : '');
      const nid = getVal(nidCol);
      const className = getVal(classCol) || activeClass;
      const grade = activeGrade || 'الصف الأول الثانوي';
      const serial = getVal(serialCol) || (tds[3] ? (tds[3].querySelector('input')?.value || '') : '');
      const imei = getVal(imeiCol) || (tds[4] ? (tds[4].querySelector('input')?.value || '') : '');
      const deliveryDate = getVal(dateCol) || (tds[5] ? (tds[5].querySelector('input')?.value || '') : '');
      const status = getVal(statusCol) || (serial ? 'مسجل' : 'غير مسجل');

      students.push({
        index: rIdx + 1,
        code: cleanCode,
        name,
        nationalId: nid,
        className,
        grade,
        serial,
        imei,
        deliveryDate,
        status,
        rowElement: tr
      });
    });

    return students;
  }

  /**
   * تصدير بيانات جدول التابلت الحالي إلى ملف Excel معتمد بترويسة نبراس الرسمية
   * يمكن استخدامه كنموذج جاهز معبأ بأسماء وأكواد طلاب المدرسة الحقيقيين مباشرة
   * @param {Object} XLSX
   * @param {Object} [schoolContext]
   * @returns {Object|Uint8Array} workbook
   */
  function exportTabletTableWorkbook(XLSX, schoolContext) {
    const records = scrapeTabletTable();
    if (!records.length) throw new Error('لم يتم العثور على أي صفوف بيانات في جدول التابلت بالصفحة الحالية.');

    const ctx = schoolContext || {};
    const school = ctx.school || 'المدرسة';
    const gov = ctx.governorate || '....................';
    const edara = ctx.administration || ctx.edara || '....................';
    const year = ctx.academicYear || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2026 / 2027 م');

    const headers = [
      'م',
      'كود الطالب',
      'اسم الطالب',
      'الصف الدراسي',
      'الفصل',
      'الرقم المسلسل للتابلت (S/N)',
      'رمز IMEI',
      'تاريخ الاستلام',
      'حالة التسجيل'
    ];

    const dataRows = records.map((r, i) => [
      i + 1,
      r.code,
      r.name,
      r.grade || 'الصف الأول الثانوي',
      r.className || '1',
      r.serial || '',
      r.imei || '',
      r.deliveryDate || '',
      r.status || (r.serial ? 'مسجل' : 'غير مسجل')
    ]);

    if (typeof globalThis.neprasBuildMultiSheetWorkbook === 'function') {
      return globalThis.neprasBuildMultiSheetWorkbook([
        {
          name: 'سجل_التابلت_المدرسي',
          title: `كشف تسجيل واستلام أجهزة التابلت المدرسي — ${school}`,
          infoLines: [
            `محافظة: ${gov} | إدارة: ${edara}`,
            `للعام الدراسي: ${year} — توثيق رسمي: نبراس برو 2026`
          ],
          headers,
          rows: dataRows,
          countLabel: 'إجمالي طلاب التابلت بالجدول',
          rightAlignCols: [1, 2]
        }
      ]);
    }

    if (!XLSX || !XLSX.utils) throw new Error('مكتبة XLSX غير متوفرة');
    const wb = XLSX.utils.book_new();

    const titleRow1 = [`جمهورية مصر العربية — وزارة التربية والتعليم والتعليم الفني | محافظة: ${gov} | إدارة: ${edara}`];
    const titleRow2 = [`كشف تسجيل وتسليم أجهزة التابلت المدرسي — ${school}`];
    const titleRow3 = [`للعام الدراسي: ${year} — إجمالي الأجهزة بالجدول: ${records.length} جهازاً | توثيق: نبراس برو 2026`];

    const dataMatrix = [
      titleRow1,
      titleRow2,
      titleRow3,
      headers,
      ...dataRows
    ];

    const ws = XLSX.utils.aoa_to_sheet(dataMatrix);
    ws['!views'] = [{ RTL: true }];

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } }
    ];

    ws['!cols'] = [
      { wch: 8 },  // م
      { wch: 16 }, // كود
      { wch: 32 }, // اسم
      { wch: 20 }, // صف
      { wch: 14 }, // فصل
      { wch: 26 }, // مسلسل
      { wch: 22 }, // IMEI
      { wch: 16 }, // تاريخ
      { wch: 16 }  // حالة
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'سجل_التابلت_المدرسي');
    return wb;
  }

  /**
   * تشغيل مشغل الأتمتة الميداني لتسجيل أجهزة التابلت لطلاب المدرسة بالصفحة
   * @param {Array<Object>} planRows مصفوفة الطلاب المجهزين بأكوادهم وأرقامهم المسلسلة
   * @param {Function} [onProgress] استدعاء تقدم العملية
   * @returns {Promise<Object>} { ok, matched, updated, missing }
   */
  async function startTabletRegistration(planRows, onProgress) {
    tabletRunCancelled = false;
    if (!Array.isArray(planRows) || !planRows.length) {
      throw new Error('خطة تسجيل التابلت فارغة أو لا تحتوي على بيانات طلاب.');
    }

    // 1. توسيع عرض الجدول لعرض 100 مدخل دفعة واحدة لتسجيل الطلاب المتاحين بالصفحة
    try {
      const lenSelect = document.querySelector('select[name*="DataTables_Table_0_length"], .dataTables_length select');
      if (lenSelect && lenSelect.value !== '100') {
        const opt100 = Array.from(lenSelect.options).find((o) => o.value === '100');
        if (opt100) {
          lenSelect.value = '100';
          lenSelect.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    } catch (_) {}

    const tableRecords = scrapeTabletTable();
    if (!tableRecords.length) {
      throw new Error('تعذر العثور على جدول طلاب التابلت في الصفحة الحالية. تأكد من فتح صفحة التابلت واختيار الصف.');
    }

    // بناء خريطة بحث سريعة بالكود
    const recordMap = new Map();
    tableRecords.forEach((r) => {
      recordMap.set(String(r.code).trim(), r);
    });

    let matched = 0;
    let updated = 0;
    const missing = [];

    const total = planRows.length;
    for (let i = 0; i < total; i++) {
      if (tabletRunCancelled) {
        break;
      }

      const item = planRows[i];
      const code = String(item.code || '').trim();
      const serial = cleanSerialNumber(item.serial);
      const deliveryDate = item.deliveryDate || '';

      const targetRow = recordMap.get(code);
      if (!targetRow || !targetRow.rowElement) {
        missing.push(code);
        continue;
      }

      matched++;
      const tr = targetRow.rowElement;

      // 1. تفعيل مربع الاختيار للصف لتمكين الحقول في Angular
      const chk = tr.querySelector('input[type="checkbox"]');
      if (chk) {
        if (!chk.checked) {
          chk.click();
          chk.checked = true;
          chk.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 60));
        }
      }

      // 2. تعبئة الرقم المسلسل للتابلت (maxlength 11)
      let serialInput = tr.querySelector('input[maxlength="11"], td:nth-child(4) input');
      if (!serialInput) {
        const textInputs = Array.from(tr.querySelectorAll('input[type="text"], input:not([type])'));
        serialInput = textInputs.find((inp) => !inp.readOnly) || textInputs[0];
      }

      if (serialInput && serial) {
        serialInput.removeAttribute('disabled');
        serialInput.value = serial;
        serialInput.dispatchEvent(new Event('input', { bubbles: true }));
        serialInput.dispatchEvent(new Event('change', { bubbles: true }));
        serialInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      // 3. تعبئة رمز IMEI إن توفر في الملف
      const imeiInput = tr.querySelector('td:nth-child(5) input');
      if (imeiInput && item.imei) {
        imeiInput.removeAttribute('disabled');
        imeiInput.value = String(item.imei).trim();
        imeiInput.dispatchEvent(new Event('input', { bubbles: true }));
        imeiInput.dispatchEvent(new Event('change', { bubbles: true }));
        imeiInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      // 4. تعبئة تاريخ الاستلام (placeholder="yyyy-mm-dd" أو ngbdatepicker)
      let dateInput = tr.querySelector('input[ngbdatepicker], input[placeholder*="yyyy-mm-dd"], td:nth-child(6) input');
      if (!dateInput) {
        const dateInputs = Array.from(tr.querySelectorAll('input'));
        dateInput = dateInputs.find((inp) => /date|تاريخ|yyyy/i.test(inp.getAttribute('formcontrolname') || inp.name || inp.placeholder || ''));
      }

      if (dateInput && deliveryDate) {
        dateInput.removeAttribute('disabled');
        dateInput.value = deliveryDate;
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      updated++;

      if (typeof onProgress === 'function') {
        onProgress({
          current: i + 1,
          total,
          code,
          name: item.name || targetRow.name,
          updated
        });
      }

      // فترة تهدئة قصيرة لضمان استقرار Angular DOM
      await new Promise((r) => setTimeout(r, 100));
    }

    return {
      ok: true,
      total,
      matched,
      updated,
      missing,
      canSave: true,
      cancelled: tabletRunCancelled
    };
  }

  /**
   * الضغط التلقائي على زر حفظ بعد استكمال تعبئة أجهزة التابلت بالصفحة
   * @returns {boolean}
   */
  function saveTabletChanges() {
    if (typeof document === 'undefined') return false;
    const saveBtn = document.querySelector('.buttonBlock button.btn-success, button.btn-success, button[type="submit"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'حفظ');
    if (saveBtn) {
      saveBtn.click();
      return true;
    }
    return false;
  }

  /**
   * إيقاف عملية تسجيل التابلت
   */
  function stopTabletRegistration() {
    tabletRunCancelled = true;
  }

  global.NeprasTablet = Object.freeze({
    cleanSerialNumber,
    parseTabletSheet,
    groupTabletPlanByClass,
    buildTemplateWorkbook,
    isTabletPage,
    scrapeTabletTable,
    exportTabletTableWorkbook,
    startTabletRegistration,
    saveTabletChanges,
    stopTabletRegistration
  });

})(typeof window !== 'undefined' ? window : globalThis);
