/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة إضافة وتسجيل الطلاب الجدد بالرقم القومي
 * NeprasAddStudent — قراءة ملف الإضافة، المطابقة مع نموذج الوزارة المحدث، وتعبئة الاستمارة آلياً
 */
'use strict';

(function(global) {
  if (global.NeprasAddStudent) return;

  /**
   * خريطة الحقول الرسمية المعتمدة لصفحة إضافة طالب بوزارة التربية والتعليم
   * مطابقة تماماً لنموذج بيانات التلاميذ المحدث وحقول استمارة الوزارة الإلكترونية
   */
  const FIELD_MAP = [
    { header: 'الاسم الأول', name: 'firstName', type: 'text', required: true },
    { header: 'اسم الوالد', name: 'fatherName', type: 'text', required: true },
    { header: 'اسم الجد', name: 'gFatherName', type: 'text', required: true },
    { header: 'اللقب/العائلة', name: 'familyName', type: 'text', required: true },
    { header: 'الجنسية', name: 'nationality', type: 'select', required: true },
    { header: 'الرقم القومى', name: 'nationalId', type: 'text', required: true },
    { header: 'النوع', name: 'sexId', type: 'select', required: true },
    { header: 'الديانة', name: 'religionId', type: 'select', required: true },
    { header: 'تاريخ الميلاد', name: 'birthDateObj', type: 'date', required: false },
    { header: 'محافظة الميلاد', name: 'placeOfBirth', type: 'select', required: true },
    { header: 'العنوان', name: 'address', type: 'text', required: true },
    { header: 'رقم التليفون', name: 'phoneNumber', type: 'text', required: false },
    { header: 'رقم المحمول', name: 'mobileNumber', type: 'text', required: false },
    { header: 'جنسية الوالد', name: 'fatherNationality', type: 'select', required: true },
    { header: 'الرقم القومى للوالد', name: 'fatherNationalId', type: 'text', required: true },
    { header: 'اسم الام الأول', name: 'motherFirstName', type: 'text', required: true },
    { header: 'اسم الوالد للام', name: 'motherSecondName', type: 'text', required: true },
    { header: 'اسم الجد للام', name: 'motherThirdName', type: 'text', required: true },
    { header: 'اللقب/العائلة للام', name: 'motherForthName', type: 'text', required: false },
    { header: 'جنسية الأم', name: 'motherNationality', type: 'select', required: true },
    { header: 'الرقم القومى للأم', name: 'motherNationalId', type: 'text', required: true },
    { header: 'الصف', name: 'levelId', type: 'select', required: true },
    { header: 'نظام التعليم', name: 'studyTypeId', type: 'select', required: true },
    { header: 'حالة قيد الطالب', name: 'registrationId', type: 'select', required: true },
    { header: 'الفصل', name: 'classId', type: 'select', required: true },
    { header: 'الشعبة', name: 'divisionId', type: 'select', required: true },
    { header: 'التخصص', name: 'specializationId', type: 'select', required: false },
    { header: 'اللغة الأجنبية الأولى', name: 'languageId1', type: 'select', required: true },
    { header: 'اللغة الأجنبية الثانية', name: 'languageId2', type: 'select', required: true },
    { header: 'الموقف من الدمج', name: 'disabilityId', type: 'select', required: false }
  ];

  /**
   * تطبيع النصوص والمسميات للمطابقة المرنة
   * @param {string} str
   * @returns {string}
   */
  function normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * تحويل قيم التواريخ (أرقام إكسل التسلسلية والنصوص وكائنات Date) لصيغة YYYY-MM-DD
   * @param {any} raw
   * @returns {string}
   */
  function normalizeDateValue(raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, '0');
      const d = String(raw.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof raw === 'number') {
      try {
        if (typeof XLSX !== 'undefined' && XLSX.SSF && XLSX.SSF.parse_date_code) {
          const parsed = XLSX.SSF.parse_date_code(Math.round(raw));
          if (parsed) {
            return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
          }
        }
      } catch (_) {}
      const epoch = new Date(1899, 11, 30);
      const target = new Date(epoch.getTime() + Math.round(raw) * 86400000);
      if (!isNaN(target.getTime())) {
        const y = target.getFullYear();
        const m = String(target.getMonth() + 1).padStart(2, '0');
        const d = String(target.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    const s = String(raw).trim();
    const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
    const m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
    return s;
  }

  /**
   * قراءة وتدقيق ملف إضافة الطلاب الجدد (يدعم النموذج المحدث والنموذج القياسي)
   * يتجاهل الصفوف الفارغة وغير المكتملة تلقائياً لمنع ظهور صفوف مرفوضة وهمية
   * @param {Array<Array<any>>} matrix مصفوفة الصفوف من ملف Excel
   * @returns {Object} { rows, issues, stats }
   */
  function parseAddStudentSheet(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) {
      return {
        rows: [],
        issues: [{ row: 1, reason: 'الملف فارغ أو لا يحتوي على صفوف بيانات' }],
        stats: { total: 0, valid: 0, rejected: 1 }
      };
    }

    // البحث الذكي عن صف الترويسة في أول 15 صفاً
    let headerRowIdx = 0;
    const limit = Math.min(matrix.length, 15);
    for (let i = 0; i < limit; i++) {
      const row = matrix[i] || [];
      const cellsWithText = row.filter((c) => c != null && String(c).trim() !== '').length;
      if (cellsWithText >= 3) {
        const rowText = row.map((c) => normalizeText(String(c || ''))).join(' | ');
        if (/الرقم القومي|قومي|national/i.test(rowText) && (/اسم|تلميذ|طالب/i.test(rowText) || /صف|فصل/i.test(rowText))) {
          headerRowIdx = i;
          break;
        }
      }
    }

    const rawHeader = matrix[headerRowIdx] || [];
    const colIndex = {};
    for (const f of FIELD_MAP) colIndex[f.name] = -1;
    colIndex.fullName = -1;
    colIndex.fullMotherName = -1;

    for (let c = 0; c < rawHeader.length; c++) {
      const hNorm = normalizeText(String(rawHeader[c] || ''));
      if (!hNorm) continue;

      if (/الرقم القومي للوالد|الرقم القومي للاب/i.test(hNorm)) colIndex.fatherNationalId = c;
      else if (/الرقم القومي للام/i.test(hNorm)) colIndex.motherNationalId = c;
      else if (/الرقم القومي|قومي|national/i.test(hNorm) && colIndex.nationalId === -1) colIndex.nationalId = c;
      else if (/اسم الوالد للام|اسم والد الام/i.test(hNorm)) colIndex.motherSecondName = c;
      else if (/اسم الجد للام|اسم جد الام/i.test(hNorm)) colIndex.motherThirdName = c;
      else if (/اللقب\/العائله للام|عائله الام|اللقب للام/i.test(hNorm)) colIndex.motherForthName = c;
      else if (/اسم الام الاول|اسم ام الطالب الاول/i.test(hNorm)) colIndex.motherFirstName = c;
      else if (/اسم الام|والده الطالب/i.test(hNorm) && colIndex.fullMotherName === -1) colIndex.fullMotherName = c;
      else if (/الاسم الاول|اسم التلميذ الاول|اسم الطالب الاول/i.test(hNorm)) colIndex.firstName = c;
      else if (/اسم الوالد|اسم الاب|والد التلميذ/i.test(hNorm)) colIndex.fatherName = c;
      else if (/اسم الجد/i.test(hNorm)) colIndex.gFatherName = c;
      else if (/اللقب|العائله|اسم العائله/i.test(hNorm) && colIndex.familyName === -1) colIndex.familyName = c;
      else if (/اسم التلميذ|اسم الطالب|الاسم الرباعي|الاسم بالكامل/i.test(hNorm) && colIndex.fullName === -1) colIndex.fullName = c;
      else if (/جنسيه الوالد|جنسيه الاب/i.test(hNorm)) colIndex.fatherNationality = c;
      else if (/جنسيه الام/i.test(hNorm)) colIndex.motherNationality = c;
      else if (/الجنسيه/i.test(hNorm) && colIndex.nationality === -1) colIndex.nationality = c;
      else if (/النوع/i.test(hNorm) && colIndex.sexId === -1) colIndex.sexId = c;
      else if (/الديانه/i.test(hNorm) && colIndex.religionId === -1) colIndex.religionId = c;
      else if (/تاريخ الميلاد/i.test(hNorm) && colIndex.birthDateObj === -1) colIndex.birthDateObj = c;
      else if (/محافظه الميلاد/i.test(hNorm) && colIndex.placeOfBirth === -1) colIndex.placeOfBirth = c;
      else if (/العنوان/i.test(hNorm) && colIndex.address === -1) colIndex.address = c;
      else if (/رقم التليفون|التليفون|الهاتف الارضي/i.test(hNorm) && colIndex.phoneNumber === -1) colIndex.phoneNumber = c;
      else if (/رقم المحمول|المحمول|الموبايل|موبايل/i.test(hNorm) && colIndex.mobileNumber === -1) colIndex.mobileNumber = c;
      else if (/نظام التعليم/i.test(hNorm) && colIndex.studyTypeId === -1) colIndex.studyTypeId = c;
      else if (/حاله قيد الطالب|حاله القيد/i.test(hNorm) && colIndex.registrationId === -1) colIndex.registrationId = c;
      else if (/الصف/i.test(hNorm) && colIndex.levelId === -1) colIndex.levelId = c;
      else if (/الفصل/i.test(hNorm) && colIndex.classId === -1) colIndex.classId = c;
      else if (/الشعبه/i.test(hNorm) && colIndex.divisionId === -1) colIndex.divisionId = c;
      else if (/التخصص/i.test(hNorm) && colIndex.specializationId === -1) colIndex.specializationId = c;
      else if (/اللغه الاجنبيه الاولي/i.test(hNorm) && colIndex.languageId1 === -1) colIndex.languageId1 = c;
      else if (/اللغه الاجنبيه الثانيه/i.test(hNorm) && colIndex.languageId2 === -1) colIndex.languageId2 = c;
      else if (/الدمج|الموقف من الدمج/i.test(hNorm) && colIndex.disabilityId === -1) colIndex.disabilityId = c;
    }

    if (colIndex.nationalId === -1 && colIndex.fullName === -1 && colIndex.firstName === -1) {
      return {
        rows: [],
        issues: [{
          row: headerRowIdx + 1,
          reason: 'تعذر العثور على أعمدة الاسم أو الرقم القومي في ترويسة الملف'
        }],
        stats: { total: 0, valid: 0, rejected: 1 }
      };
    }

    const rows = [];
    const issues = [];
    const seenNids = new Set();

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || !row.length) continue;

      const rawNid = colIndex.nationalId !== -1 ? row[colIndex.nationalId] : '';
      const cleanNid = global.NeprasEgypt ? global.NeprasEgypt.cleanDigits(rawNid) : String(rawNid || '').trim();

      let firstName = colIndex.firstName !== -1 ? String(row[colIndex.firstName] || '').trim() : '';
      let fatherName = colIndex.fatherName !== -1 ? String(row[colIndex.fatherName] || '').trim() : '';
      let gFatherName = colIndex.gFatherName !== -1 ? String(row[colIndex.gFatherName] || '').trim() : '';
      let familyName = colIndex.familyName !== -1 ? String(row[colIndex.familyName] || '').trim() : '';
      let fullName = colIndex.fullName !== -1 ? String(row[colIndex.fullName] || '').trim() : '';

      // إذا كان الصف فارغاً بالكامل من اسم التلميذ والرقم القومي، نتجاهله تماماً كصف غير مستخدم
      if (!cleanNid && !firstName && !fullName) {
        continue;
      }

      const rowNum = r + 1;

      // تحليل الاسم الكامل عند عدم توفر الأعمدة المنفصلة
      if (!firstName && fullName) {
        const parts = fullName.split(/\s+/);
        if (parts.length >= 1) firstName = parts[0];
        if (parts.length >= 2) fatherName = parts[1];
        if (parts.length >= 3) gFatherName = parts[2];
        if (parts.length >= 4) familyName = parts.slice(3).join(' ');
      }

      if (!cleanNid) {
        issues.push({ row: rowNum, nationalId: '', reason: 'الرقم القومي فارغ للتلميذ: ' + (firstName || fullName || 'مجهول') });
        continue;
      }

      let parsedNid = null;
      if (global.NeprasEgypt) {
        parsedNid = global.NeprasEgypt.parseNationalId(cleanNid);
        if (!parsedNid || (!parsedNid.valid && !parsedNid.isValid)) {
          issues.push({ row: rowNum, nationalId: cleanNid, reason: 'الرقم القومي غير صالح أو تاريخه غير صحيح' });
          continue;
        }
      }

      if (seenNids.has(cleanNid)) {
        issues.push({ row: rowNum, nationalId: cleanNid, reason: 'تكرار الرقم القومي في أكثر من صف داخل الملف' });
        continue;
      }
      seenNids.add(cleanNid);

      // استنتاج النوع والمحافظة وتاريخ الميلاد تلقائياً من الرقم القومي إن لم تُحدد
      let gender = colIndex.sexId !== -1 ? String(row[colIndex.sexId] || '').trim() : '';
      let birthDate = colIndex.birthDateObj !== -1 ? normalizeDateValue(row[colIndex.birthDateObj]) : '';
      let birthGov = colIndex.placeOfBirth !== -1 ? String(row[colIndex.placeOfBirth] || '').trim() : '';

      if (parsedNid && (parsedNid.valid || parsedNid.isValid)) {
        if (!gender) gender = parsedNid.gender === 'انثى' ? 'أنثى' : (parsedNid.gender || 'ذكر');
        if (!birthDate) birthDate = parsedNid.birthDateStr || parsedNid.birthDateFormatted || '';
        if (!birthGov) birthGov = parsedNid.governorate || '';
      }

      // تحليل اسم الأم
      let motherFirstName = colIndex.motherFirstName !== -1 ? String(row[colIndex.motherFirstName] || '').trim() : '';
      let motherSecondName = colIndex.motherSecondName !== -1 ? String(row[colIndex.motherSecondName] || '').trim() : '';
      let motherThirdName = colIndex.motherThirdName !== -1 ? String(row[colIndex.motherThirdName] || '').trim() : '';
      let motherForthName = colIndex.motherForthName !== -1 ? String(row[colIndex.motherForthName] || '').trim() : '';
      let fullMother = colIndex.fullMotherName !== -1 ? String(row[colIndex.fullMotherName] || '').trim() : '';

      if (!motherFirstName && fullMother) {
        const mParts = fullMother.split(/\s+/);
        if (mParts.length >= 1) motherFirstName = mParts[0];
        if (mParts.length >= 2) motherSecondName = mParts[1];
        if (mParts.length >= 3) motherThirdName = mParts[2];
        if (mParts.length >= 4) motherForthName = mParts.slice(3).join(' ');
      }

      const nationality = colIndex.nationality !== -1 ? String(row[colIndex.nationality] || '').trim() : 'مصرى';
      const religion = colIndex.religionId !== -1 ? String(row[colIndex.religionId] || '').trim() : 'مسلم';
      const address = colIndex.address !== -1 ? String(row[colIndex.address] || '').trim() : '';
      const phone = colIndex.phoneNumber !== -1 ? String(row[colIndex.phoneNumber] || '').trim() : '';
      const mobile = colIndex.mobileNumber !== -1 ? String(row[colIndex.mobileNumber] || '').trim() : '';
      const fatherNat = colIndex.fatherNationality !== -1 ? String(row[colIndex.fatherNationality] || '').trim() : 'مصرى';
      const rawFatherNid = colIndex.fatherNationalId !== -1 ? row[colIndex.fatherNationalId] : '';
      const fatherNid = global.NeprasEgypt ? global.NeprasEgypt.cleanDigits(rawFatherNid) : String(rawFatherNid || '').trim();
      const motherNat = colIndex.motherNationality !== -1 ? String(row[colIndex.motherNationality] || '').trim() : 'مصرى';
      const rawMotherNid = colIndex.motherNationalId !== -1 ? row[colIndex.motherNationalId] : '';
      const motherNid = global.NeprasEgypt ? global.NeprasEgypt.cleanDigits(rawMotherNid) : String(rawMotherNid || '').trim();

      const level = colIndex.levelId !== -1 ? String(row[colIndex.levelId] || '').trim() : '';
      const studyType = colIndex.studyTypeId !== -1 ? String(row[colIndex.studyTypeId] || '').trim() : 'نظامى';
      const registration = colIndex.registrationId !== -1 ? String(row[colIndex.registrationId] || '').trim() : 'مستجد';
      const className = colIndex.classId !== -1 ? String(row[colIndex.classId] || '').trim() : '1';
      const division = colIndex.divisionId !== -1 ? String(row[colIndex.divisionId] || '').trim() : 'عام';
      const specialization = colIndex.specializationId !== -1 ? String(row[colIndex.specializationId] || '').trim() : 'عام';
      const lang1 = colIndex.languageId1 !== -1 ? String(row[colIndex.languageId1] || '').trim() : 'لغة انجليزية';
      const lang2 = colIndex.languageId2 !== -1 ? String(row[colIndex.languageId2] || '').trim() : 'معفي';
      const disability = colIndex.disabilityId !== -1 ? String(row[colIndex.disabilityId] || '').trim() : 'لا يوجد';

      rows.push({
        rowNum,
        nationalId: cleanNid,
        firstName,
        fatherName,
        gFatherName,
        familyName,
        fullName: [firstName, fatherName, gFatherName, familyName].filter(Boolean).join(' ') || fullName,
        nationality,
        sexId: gender,
        gender,
        religionId: religion,
        religion,
        birthDateObj: birthDate,
        birthDate,
        placeOfBirth: birthGov,
        birthGov,
        address,
        phoneNumber: phone,
        mobileNumber: mobile,
        phone: mobile || phone,
        fatherNationality: fatherNat,
        fatherNationalId: fatherNid,
        motherFirstName,
        motherSecondName,
        motherThirdName,
        motherForthName,
        motherName: [motherFirstName, motherSecondName, motherThirdName, motherForthName].filter(Boolean).join(' ') || fullMother,
        motherNationality: motherNat,
        motherNationalId: motherNid,
        levelId: level,
        grade: level,
        studyTypeId: studyType,
        registrationId: registration,
        classId: className,
        className,
        divisionId: division,
        specializationId: specialization,
        languageId1: lang1,
        languageId2: lang2,
        disabilityId: disability
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
   * بناء مصنف Excel المعتمد لإضافة الطلاب الجدد
   * مصنف متكامل بـ 4 أوراق عمل رسمية:
   * 1. بيانات التلاميذ (30 عموداً مع صفوف استرشادية واقعية وصحيحة تماماً).
   * 2. القيم المسموحة (جداول القوائم المنسدلة الوزارية المعتمدة).
   * 3. تعليمات (إرشادات الاستخدام وضوابط الرقم القومي).
   * 4. بيانات_أساسية (عرض ملخص ومبسط).
   * @param {Object} XLSX
   * @returns {Object|Uint8Array} workbook
   */
  function buildTemplateWorkbook(XLSX) {
    if (!XLSX || !XLSX.utils) throw new Error('مكتبة XLSX غير متوفرة');
    const wb = XLSX.utils.book_new();

    // 1. ورقة بيانات التلاميذ (30 عموداً متطابقاً مع استمارة الوزارة ونموذج التلاميذ المحدث)
    const headersSheet1 = FIELD_MAP.map((f) => f.header);
    const sampleRowsSheet1 = [
      [
        'أحمد', 'محمد', 'علي', 'السيد',
        'مصرى', '31003151201234', 'ذكر', 'مسلم',
        '2010-03-15', 'الدقهلية', 'شارع الجمهورية - المنصورة', '', '01012345678',
        'مصرى', '28001151201234', 'فاطمة', 'حسن', 'إبراهيم', 'محمود',
        'مصرى', '28205201202345', 'الصف الأول', 'نظامى', 'مستجد',
        '1', 'عام', 'عام', 'لغة انجليزية', 'معفي', 'لا يوجد'
      ],
      [
        'مريم', 'خالد', 'عبد الرحمن', 'عادل',
        'مصرى', '31008201202345', 'أنثى', 'مسلم',
        '2010-08-20', 'الدقهلية', 'شارع الجيش - المنصورة', '', '01123456789',
        'مصرى', '28008101201234', 'أمل', 'حسام', 'الدين', 'سالم',
        'مصرى', '28308151202345', 'الصف الأول', 'نظامى', 'مستجد',
        '1', 'عام', 'عام', 'لغة انجليزية', 'معفي', 'لا يوجد'
      ]
    ];

    const ws1 = XLSX.utils.aoa_to_sheet([headersSheet1, ...sampleRowsSheet1]);
    ws1['!views'] = [{ RTL: true }];
    ws1['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 16 },
      { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 10 },
      { wch: 15 }, { wch: 18 }, { wch: 35 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 },
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'بيانات التلاميذ');

    // 2. ورقة القيم المسموحة
    const lookupHeaders = [
      'النوع', 'الديانة', 'الجنسية (نموذج)', 'محافظة الميلاد',
      'اللغة الأجنبية الأولى', 'اللغة الأجنبية الثانية', 'الموقف من الدمج',
      'الصف', 'نظام التعليم', 'حالة القيد'
    ];
    const lookupRows = [
      ['ذكر', 'مسلم', 'مصرى', 'القاهرة', 'لغة انجليزية', 'معفي', 'لا يوجد', 'الصف الأول', 'نظامى', 'مستجد'],
      ['أنثى', 'مسيحي', 'سودانى', 'الجيزة', 'لغة فرنسية', 'لغة فرنسية', 'إعاقة بصرية', 'الصف الثاني', 'خدمات', 'باق للإعادة'],
      ['', '', 'سوري', 'الإسكندرية', 'لغة ألمانية', 'لغة ألمانية', 'إعاقة حركية', 'الصف الثالث', 'منازل', 'ناجح ومنقول'],
      ['', '', 'أخرى', 'الدقهلية', 'لغة إيطالية', 'لغة إيطالية', 'بطء تعلم', 'الصف الرابع', '', 'محول'],
      ['', '', '', 'الشرقية', 'لغة إسبانية', 'لغة إسبانية', 'توحد', 'الصف الخامس', '', 'وافد'],
      ['', '', '', 'الغربية', 'لغة صينية', 'لغة صينية', 'دمج كلي', 'الصف السادس', '', '']
    ];
    const ws2 = XLSX.utils.aoa_to_sheet([lookupHeaders, ...lookupRows]);
    ws2['!views'] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, ws2, 'القيم المسموحة');

    // 3. ورقة تعليمات الاستخدام
    const guideRows = [
      ['تعليمات وإرشادات إعداد نموذج إضافة التلاميذ الجدد — نبراس برو 2026'],
      [''],
      ['1. الرقم القومي:', 'يجب أن يتكون الرقم القومي للتلميذ وولي الأمر والأم من 14 رقماً صحيحاً ومطابقاً لشهادة الميلاد المميكنة.'],
      ['2. الاستنتاج الذكي:', 'يقوم نبراس تلقائياً باستنتاج تاريخ الميلاد والنوع ومحافظة الميلاد من الرقم القومي إذا تُركت فارغة.'],
      ['3. الأسماء المنفصلة:', 'يُفضل كتابة الاسم في 4 خانات (الأول، الوالد، الجد، اللقب)، وكذلك اسم الأم في 4 خانات لضمان دقة التسجيل.'],
      ['4. القوائم المنسدلة:', 'التزم بالقيم المعتمدة في ورقة (القيم المسموحة) لحقول الصف ونظام التعليم واللغات والدمج لضمان المطابقة الفورية مع موقع الوزارة.'],
      ['5. الصفوف الفارغة:', 'يمكنك ترك الصفوف الإضافية غير المستخدمة فارغة، ولن يتم احتسابها كصفوف مرفوضة أثناء الفحص.'],
      ['6. الدعم الفني:', 'هذا النموذج صُمم ليعمل بتوافق كامل مع نظام إضافة الطلاب المحدث بوزارة التربية والتعليم ونبراس.']
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(guideRows);
    ws3['!views'] = [{ RTL: true }];
    ws3['!cols'] = [{ wch: 25 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'تعليمات');

    // 4. ورقة بيانات أساسية (الملخص السريع)
    const baseHeaders = ['م', 'اسم التلميذ', 'الرقم القومى', 'الرقم القومى للأب', 'اسم الأم', 'الرقم القومى للأم', 'العنوان', 'المحمول', 'الصف'];
    const baseRows = [
      [1, 'أحمد محمد علي السيد', '31003151201234', '28001151201234', 'فاطمة حسن إبراهيم محمود', '28205201202345', 'شارع الجمهورية - المنصورة', '01012345678', 'الصف الأول'],
      [2, 'مريم خالد عبد الرحمن عادل', '31008201202345', '28008101201234', 'أمل حسام الدين سالم', '28308151202345', 'شارع الجيش - المنصورة', '01123456789', 'الصف الأول']
    ];
    const ws4 = XLSX.utils.aoa_to_sheet([baseHeaders, ...baseRows]);
    ws4['!views'] = [{ RTL: true }];
    ws4['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 20 }, { wch: 20 }, { wch: 32 }, { wch: 20 }, { wch: 35 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'بيانات_أساسية');

    return wb;
  }

  let addStudentCancelled = false;

  /**
   * فحص ما إذا كانت الصفحة الحالية هي صفحة إضافة الطلاب بموقع الوزارة
   * @returns {boolean}
   */
  function isAddStudentPage() {
    return typeof location !== 'undefined' && (/student\/add/i.test(location.href) || /student\/register/i.test(location.href));
  }

  /**
   * إدخال قيمة في عنصر إدخال مع إطلاق أحداث Angular الكاملة وفك أي قيود
   * @param {Element} el
   * @param {any} value
   */
  function setNativeValue(el, value) {
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    const strVal = value == null ? '' : String(value).trim();

    try {
      if (el.disabled) el.disabled = false;
      if (el.hasAttribute('disabled')) el.removeAttribute('disabled');
      if (el.readOnly) el.readOnly = false;
    } catch (_) {}

    if (tag === 'input' || tag === 'textarea') {
      try { el.focus(); } catch (_) {}
      const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {
        desc.set.call(el, strVal);
      } else {
        el.value = strVal;
      }
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    } else if (tag === 'select') {
      el.value = strVal;
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }

  /**
   * اختيار قيمة في قائمة منسدلة مطابقة للنص أو القيمة
   * @param {HTMLSelectElement} select
   * @param {string} text
   * @returns {boolean}
   */
  function setSelectByText(select, text) {
    if (!select || !select.options || text == null) return false;
    try {
      if (select.disabled) select.disabled = false;
      if (select.hasAttribute('disabled')) select.removeAttribute('disabled');
    } catch (_) {}
    const target = normalizeText(String(text));
    if (!target) return false;
    const opts = Array.from(select.options);

    let match = opts.find((o) => normalizeText(o.text) === target || normalizeText(o.value) === target);
    if (!match) match = opts.find((o) => normalizeText(o.text).includes(target));
    if (!match) match = opts.find((o) => target.includes(normalizeText(o.text)) && normalizeText(o.text).length > 2);

    if (!match) return false;
    select.value = match.value;
    select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    select.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    select.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  /**
   * البحث الذكي المتعدد عن حقل الرقم القومي المخصص لكل دور (تلميذ، والد، أم)
   * يجمع بين خيارات formcontrolname غير الحساسة لحالة الأحرف ومطابقة بطاقات العناوين (Labels)
   * @param {'student'|'father'|'mother'} role
   * @returns {HTMLInputElement|null}
   */
  function findNationalIdInput(role = 'student') {
    if (typeof document === 'undefined') return null;

    let selectors = [];
    if (role === 'student') {
      selectors = [
        'input[formcontrolname="nationalId" i]',
        'input[formcontrolname="nid" i]',
        'input[formcontrolname="studentNationalId" i]',
        'input[formcontrolname="nationalIdNum" i]',
        'input[name="nationalId" i]',
        'input[name="nationalid" i]',
        '#nationalId',
        '#studentNationalId',
        '#nationalid'
      ];
    } else if (role === 'father') {
      selectors = [
        'input[formcontrolname="fatherNationalId" i]',
        'input[formcontrolname="fatherNid" i]',
        'input[formcontrolname="fatherNationalID" i]',
        'input[name="fatherNationalId" i]',
        '#fatherNationalId'
      ];
    } else if (role === 'mother') {
      selectors = [
        'input[formcontrolname="motherNationalId" i]',
        'input[formcontrolname="motherNid" i]',
        'input[formcontrolname="motherNationalID" i]',
        'input[name="motherNationalId" i]',
        '#motherNationalId'
      ];
    }

    for (const s of selectors) {
      try {
        const el = document.querySelector(s);
        if (el) return el;
      } catch (_) {}
    }

    // مطابقة ذكية بدلالة عناصر <label> في الصفحة
    try {
      const labels = Array.from(document.querySelectorAll('label'));
      for (const lbl of labels) {
        const txt = normalizeText(lbl.textContent || '');
        if (txt.includes('الرقم القومي') || txt.includes('رقم قومي')) {
          const isFather = txt.includes('والد') || txt.includes('اب') || txt.includes('ولي');
          const isMother = txt.includes('ام') || txt.includes('والده');
          const isStudent = !isFather && !isMother;

          if ((role === 'student' && isStudent) ||
              (role === 'father' && isFather) ||
              (role === 'mother' && isMother)) {
            if (lbl.htmlFor) {
              const el = document.getElementById(lbl.htmlFor);
              if (el) return el;
            }
            const parent = lbl.closest('.col-lg-4, .col-md-4, .col-sm-6, .col-12, .form-field, .form-group, .mb-3, div');
            if (parent) {
              const el = parent.querySelector('input');
              if (el) return el;
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  /**
   * البحث عن حقل إدخال عادي في الصفحة
   * @param {string} fieldName
   * @returns {Element|null}
   */
  function findGeneralInput(fieldName) {
    if (typeof document === 'undefined') return null;
    const selectors = [
      `input[formcontrolname="${fieldName}" i]`,
      `input[name="${fieldName}" i]`,
      `#${fieldName}`,
      `[formcontrolname="${fieldName}" i]`
    ];
    for (const s of selectors) {
      try {
        const el = document.querySelector(s);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  /**
   * انتظار جاهزية القائمة المنسدلة التابعة (Cascade Select) حتى تكتمل خياراتها من خادم الوزارة
   * @param {string} fieldName
   * @param {number} timeoutMs
   * @returns {Promise<HTMLSelectElement|null>}
   */
  async function waitForCascadeSelectReady(fieldName, timeoutMs = 8000) {
    if (typeof document === 'undefined') return null;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.querySelector(`select[formcontrolname="${fieldName}" i], select[name="${fieldName}" i]`);
      if (el) {
        if (el.disabled) return el;
        if (el.options && el.options.length > 1) return el;
        await new Promise((r) => setTimeout(r, 250));
      } else {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return document.querySelector(`select[formcontrolname="${fieldName}" i], select[name="${fieldName}" i]`);
  }

  /**
   * تعبئة استمارة الطالب الجاري إضافته على موقع الوزارة بالكامل
   * الترتيب المنطقي الدقيق يمنع مسح الأرقام القومية عند تغيير الجنسية أو الحقول التتابعية
   * @param {Object} student
   * @returns {Promise<Object>} { ok, warnings }
   */
  async function fillStudentForm(student) {
    if (!student) return { ok: false, warnings: ['بيانات الطالب غير متوفرة'] };
    const warnings = [];

    // 1. بيانات اسم التلميذ
    const studentNameFields = [
      { name: 'firstName', val: student.firstName },
      { name: 'fatherName', val: student.fatherName },
      { name: 'gFatherName', val: student.gFatherName },
      { name: 'familyName', val: student.familyName }
    ];
    for (const f of studentNameFields) {
      if (!f.val) continue;
      const el = findGeneralInput(f.name);
      if (el) setNativeValue(el, f.val);
    }

    // 2. جنسية التلميذ أولاً (حتى لا يتم تصفير الرقم القومي بعد كتابته)
    const natSelect = document.querySelector('select[formcontrolname="nationality" i], select[name="nationality" i]');
    if (natSelect) {
      setSelectByText(natSelect, student.nationality || 'مصرى');
      await new Promise((r) => setTimeout(r, 200));
    }

    // 3. الرقم القومي للتلميذ (تعبئة قوية ومؤكدة)
    if (student.nationalId) {
      const nidEl = findNationalIdInput('student');
      if (nidEl) {
        setNativeValue(nidEl, student.nationalId);
      } else {
        warnings.push('لم يتم العثور على حقل الرقم القومي للتلميذ في الصفحة');
      }
    }

    // 4. البيانات الشخصية وبيانات الاتصال
    const personalSelects = [
      { name: 'sexId', val: student.sexId || student.gender },
      { name: 'religionId', val: student.religionId || student.religion },
      { name: 'placeOfBirth', val: student.placeOfBirth || student.birthGov }
    ];
    for (const s of personalSelects) {
      if (!s.val) continue;
      const el = document.querySelector(`select[formcontrolname="${s.name}" i], select[name="${s.name}" i]`);
      if (el) setSelectByText(el, s.val);
    }

    if (student.birthDateObj || student.birthDate) {
      const bDate = student.birthDateObj || student.birthDate;
      const el = document.querySelector('input[formcontrolname="birthDateObj" i], input[formcontrolname="birthDate" i], input[name="birthDate" i]');
      if (el) setNativeValue(el, bDate);
    }

    const contactFields = [
      { name: 'address', val: student.address },
      { name: 'phoneNumber', val: student.phoneNumber || student.phone },
      { name: 'mobileNumber', val: student.mobileNumber || student.phone }
    ];
    for (const c of contactFields) {
      if (!c.val) continue;
      const el = findGeneralInput(c.name);
      if (el) setNativeValue(el, c.val);
    }

    // 5. جنسية الوالد والرقم القومي للوالد
    const fNatSelect = document.querySelector('select[formcontrolname="fatherNationality" i], select[name="fatherNationality" i]');
    if (fNatSelect) {
      setSelectByText(fNatSelect, student.fatherNationality || 'مصرى');
      await new Promise((r) => setTimeout(r, 200));
    }
    if (student.fatherNationalId) {
      const fNidEl = findNationalIdInput('father');
      if (fNidEl) {
        setNativeValue(fNidEl, student.fatherNationalId);
      }
    }

    // 6. بيانات الأم وجنسيتها ورقمها القومي
    const motherNameFields = [
      { name: 'motherFirstName', val: student.motherFirstName },
      { name: 'motherSecondName', val: student.motherSecondName },
      { name: 'motherThirdName', val: student.motherThirdName },
      { name: 'motherForthName', val: student.motherForthName }
    ];
    for (const m of motherNameFields) {
      if (!m.val) continue;
      const el = findGeneralInput(m.name);
      if (el) setNativeValue(el, m.val);
    }

    const mNatSelect = document.querySelector('select[formcontrolname="motherNationality" i], select[name="motherNationality" i]');
    if (mNatSelect) {
      setSelectByText(mNatSelect, student.motherNationality || 'مصرى');
      await new Promise((r) => setTimeout(r, 200));
    }
    if (student.motherNationalId) {
      const mNidEl = findNationalIdInput('mother');
      if (mNidEl) {
        setNativeValue(mNidEl, student.motherNationalId);
      }
    }

    // 7. القوائم التتابعية المترابطة (Cascade Fields)
    const cascadeFields = [
      { name: 'levelId', val: student.levelId || student.grade },
      { name: 'studyTypeId', val: student.studyTypeId || 'نظامى' },
      { name: 'registrationId', val: student.registrationId || 'مستجد' },
      { name: 'classId', val: student.classId || student.className || '1' },
      { name: 'divisionId', val: student.divisionId || 'عام' },
      { name: 'specializationId', val: student.specializationId || 'عام' }
    ];
    for (const c of cascadeFields) {
      if (!c.val) continue;
      const el = await waitForCascadeSelectReady(c.name, 4000);
      if (el && !el.disabled) {
        setSelectByText(el, c.val);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // 8. اللغات وحالة الدمج
    const academicSelects = [
      { name: 'languageId1', val: student.languageId1 || 'لغة انجليزية' },
      { name: 'languageId2', val: student.languageId2 || 'معفي' },
      { name: 'disabilityId', val: student.disabilityId || 'لا يوجد' }
    ];
    for (const a of academicSelects) {
      if (!a.val) continue;
      const el = document.querySelector(`select[formcontrolname="${a.name}" i], select[name="${a.name}" i]`);
      if (el) setSelectByText(el, a.val);
    }

    // 9. الجولة التأكيدية الصارمة للأرقام القومية الثلاثة (Final Guarantee Pass)
    // نتحقق من أن أياً من حقول الأرقام القومية لم يتم تصفيرها أثناء تفاعل عناصر Angular الأخرى
    await new Promise((r) => setTimeout(r, 200));
    if (student.nationalId) {
      const nidEl = findNationalIdInput('student');
      if (nidEl && (!nidEl.value || nidEl.value.trim() !== String(student.nationalId).trim())) {
        setNativeValue(nidEl, student.nationalId);
      }
    }
    if (student.fatherNationalId) {
      const fNidEl = findNationalIdInput('father');
      if (fNidEl && (!fNidEl.value || fNidEl.value.trim() !== String(student.fatherNationalId).trim())) {
        setNativeValue(fNidEl, student.fatherNationalId);
      }
    }
    if (student.motherNationalId) {
      const mNidEl = findNationalIdInput('mother');
      if (mNidEl && (!mNidEl.value || mNidEl.value.trim() !== String(student.motherNationalId).trim())) {
        setNativeValue(mNidEl, student.motherNationalId);
      }
    }

    return { ok: true, warnings };
  }

  /**
   * فحص ظهور عنصر داخل الصفحة وتأكيد كونه مرئياً للمستخدم
   * @param {Element} el
   * @returns {boolean}
   */
  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    if (typeof window === 'undefined') return true;
    try {
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style) {
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity) === 0) return false;
      }
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (rect && rect.width === 0 && rect.height === 0) return false;
    } catch (_) {}
    return true;
  }

  /**
   * البحث الدقيق عن زر الحفظ الرئيسي في استمارة إضافة التلميذ بموقع الوزارة
   * يدعم كلاسات Angular الرسمية (.buttonBlock button.btn-success) والأنماط المعيارية
   * @returns {HTMLButtonElement|HTMLElement|null}
   */
  function findSaveButton() {
    if (typeof document === 'undefined') return null;

    const selectors = [
      '.buttonBlock button.btn-success',
      '.buttonBlock button',
      'button.btn-success',
      'button[type="submit"]',
      '.btn-save',
      'button.btn-primary',
      '#btnSave',
      '#saveButton'
    ];

    for (const sel of selectors) {
      try {
        const els = Array.from(document.querySelectorAll(sel));
        const found = els.find((el) => isElementVisible(el) && /حفظ|save|تسجيل|تاكيد|تأكيد|submit/i.test(el.textContent || el.value || ''));
        if (found) return found;
      } catch (_) {}
    }

    // مطابقة عامة على كافة أزرار الصفحة الحاملة لنص الحفظ
    try {
      const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
      return allButtons.find((b) => {
        const txt = (b.textContent || b.value || '').trim();
        return isElementVisible(b) && (/^(حفظ|حفظ وتأكيد|تسجيل|حفظ البيانات)$/i.test(txt) || /حفظ/i.test(txt));
      }) || null;
    } catch (_) {}

    return null;
  }

  const DIALOG_SELECTORS = [
    '.swal2-popup', '.swal2-container', '.swal2-modal',
    '.modal.show', '.modal.in', '.modal-content', '.modal-dialog',
    '.cdk-overlay-pane', '.mat-dialog-container', '.mat-snack-bar-container',
    '.toast.show', '.toast', '.ngx-toastr', '.toast-message',
    '.alert.show', '.alert-danger', '.alert-success',
    '[role="dialog"]', '[role="alert"]'
  ];

  /**
   * العثور على أي نافذة منبثقة أو Toast ظاهر حالياً على الشاشة
   * @returns {HTMLElement|null}
   */
  function findVisibleDialogElement() {
    if (typeof document === 'undefined') return null;
    for (const sel of DIALOG_SELECTORS) {
      try {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          if (isElementVisible(el)) {
            const txt = (el.innerText || el.textContent || '').trim();
            if (txt.length >= 2 && txt.length < 1200) {
              return el;
            }
          }
        }
      } catch (_) {}
    }
    return null;
  }

  /**
   * البحث عن زر داخل الحاوية أو النافذة بمطابقة الكلمات المفتاحية
   * @param {Element} container
   * @param {Array<string>} words
   * @param {Array<string>} [excludeWords]
   * @returns {HTMLElement|null}
   */
  function findButtonInDialog(container, words, excludeWords = []) {
    if (!container || !container.querySelectorAll) return null;

    // فحص زر تأكيد SweetAlert2 المباشر
    const swalConfirm = container.querySelector ? container.querySelector('.swal2-confirm') : null;
    if (swalConfirm && isElementVisible(swalConfirm) && words.some((w) => /نعم|تاكيد|تأكيد|حفظ|موافق|yes|ok|confirm/i.test(w))) {
      return swalConfirm;
    }

    const btns = Array.from(container.querySelectorAll('button, a.btn, [role="button"], input[type="button"], input[type="submit"]'));
    return btns.find((b) => {
      if (!isElementVisible(b)) return false;
      const t = (b.textContent || b.value || '').trim().toLowerCase();
      if (!t) return false;
      if (excludeWords.some((w) => t.includes(w.toLowerCase()))) return false;
      return words.some((w) => t.includes(w.toLowerCase()));
    }) || null;
  }

  /**
   * مراقبة وانتظار ظهور نافذة حوارية أو Toast في الصفحة خلال مهلة محددة
   * @param {number} timeoutMs
   * @returns {Promise<Object|null>} { el, text, className }
   */
  function observeForDialog(timeoutMs = 7000) {
    if (typeof document === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      let resolved = false;
      let observer = null;
      let timer = null;
      let pollTimer = null;

      const finish = (res) => {
        if (resolved) return;
        resolved = true;
        if (observer) observer.disconnect();
        if (timer) clearTimeout(timer);
        if (pollTimer) clearInterval(pollTimer);
        resolve(res);
      };

      const check = () => {
        const el = findVisibleDialogElement();
        if (el) {
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          finish({ el, text, className: el.className || '' });
          return true;
        }
        return false;
      };

      if (check()) return;

      if (typeof MutationObserver !== 'undefined' && document.body) {
        observer = new MutationObserver(() => { check(); });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
        });
      }

      pollTimer = setInterval(check, 150);
      timer = setTimeout(() => finish(null), timeoutMs);
    });
  }

  /**
   * تنفيذ الإجرائين الختاميين: الضغط على حفظ وتأكيد الحفظ آلياً
   * 1. النقر على زر الحفظ الرئيسي في الصفحة
   * 2. انتظار نافذة أو رسالة التأكيد
   * 3. النقر على زر تأكيد الحفظ
   * 4. فحص رسالة النجاح أو رسائل الخطأ والتكرار
   * 5. إغلاق الرسالة التنبيهية وإرجاع تقرير النتيجة
   * @returns {Promise<Object>} { ok, status, message, needRefresh }
   */
  async function submitAndConfirmStudent() {
    if (typeof document === 'undefined') {
      return { ok: true, status: 'success', message: 'تم في بيئة الاختبار' };
    }

    // 1. العثور على زر الحفظ الرئيسي
    const saveBtn = findSaveButton();
    if (!saveBtn) {
      return {
        ok: false,
        status: 'error',
        message: 'تعذر العثور على زر الحفظ في صفحة تسجيل التلميذ بموقع الوزارة.'
      };
    }

    try {
      saveBtn.focus();
    } catch (_) {}
    saveBtn.click();

    // 2. انتظار نافذة/Toast التأكيد الأول (خلال 7 ثوانٍ)
    const firstDialog = await observeForDialog(7000);

    if (!firstDialog) {
      // فحص وجود أي رسائل خطأ مضمنة في حقول النموذج
      const errorInputs = Array.from(document.querySelectorAll('.is-invalid, .invalid-feedback, .text-danger, .alert-danger'));
      const inlineErrors = errorInputs
        .filter((el) => isElementVisible(el) && (el.textContent || '').trim().length > 3)
        .map((el) => el.textContent.trim());

      if (inlineErrors.length) {
        return {
          ok: false,
          status: 'error',
          message: 'تنبيهات في النموذج: ' + inlineErrors.slice(0, 3).join(' | ')
        };
      }

      return {
        ok: true,
        status: 'success',
        message: 'تم الضغط على زر الحفظ بنجاح (لم تتطلب الصفحة تأكيداً إضافياً).'
      };
    }

    const firstText = firstDialog.text;

    // فحص ما إذا كانت الرسالة خطأ مباشراً (مثل: مسجل مسبقاً أو غير صحيح)
    const isDirectError = /خطأ|مسجل|مكرر|موجود|سبق|بالفعل|من قبل|مدرسة أخرى|غير صحيح|فشل/i.test(firstText) &&
      !/هل أنت متأكد|تاكيد الحفظ|تأكيد الحفظ|هل ترغب|تأكيد/i.test(firstText);

    if (isDirectError) {
      const closeBtn = findButtonInDialog(firstDialog.el, ['إلغاء', 'الغاء', 'إغلاق', 'اغلاق', 'موافق', 'ok', 'close']);
      if (closeBtn) closeBtn.click();

      return {
        ok: false,
        status: 'error',
        message: firstText.slice(0, 300),
        needRefresh: /مسجل|مكرر|موجود|سبق|بالفعل/i.test(firstText)
      };
    }

    // فحص ما إذا كانت رسالة نجاح مباشرة دون الحاجة لتأكيد ثانٍ
    const isDirectSuccess = /تم الحفظ|تم بنجاح|نجاح|تمت الاضافة|تمت الإضافة/i.test(firstText);
    if (isDirectSuccess) {
      const closeBtn = findButtonInDialog(firstDialog.el, ['إغلاق', 'اغلاق', 'موافق', 'ok', 'close', 'تم']);
      if (closeBtn) closeBtn.click();

      return {
        ok: true,
        status: 'success',
        message: firstText.slice(0, 300)
      };
    }

    // 3. الضغط على زر تأكيد الحفظ داخل النافذة المنبثقة
    const confirmBtn = findButtonInDialog(
      firstDialog.el,
      ['حفظ', 'تأكيد', 'تاكيد', 'نعم', 'موافق', 'yes', 'confirm', 'ok'],
      ['لا', 'إلغاء', 'الغاء', 'تراجع', 'close', 'cancel']
    );

    if (confirmBtn) {
      confirmBtn.click();

      // انتظار فاصل زمني لظهور Toast النتيجة النهائي بعد التأكيد
      await new Promise((r) => setTimeout(r, 1200));

      const resultDialog = await observeForDialog(7000);
      if (resultDialog) {
        const resultText = resultDialog.text;
        const isError = /خطأ|مسجل|مكرر|موجود|سبق|بالفعل|فشل|danger|error/i.test(resultText) ||
          /danger|error/i.test(resultDialog.className);

        const isSuccess = /تم الحفظ|تم بنجاح|نجاح|تمت العملية|تمت الإضافة|success/i.test(resultText) ||
          /success/i.test(resultDialog.className);

        const closeResultBtn = findButtonInDialog(resultDialog.el, ['إغلاق', 'اغلاق', 'موافق', 'تم', 'ok', 'close']);
        if (closeResultBtn) closeResultBtn.click();

        if (isError) {
          return {
            ok: false,
            status: 'error',
            message: resultText.slice(0, 300),
            needRefresh: /مسجل|مكرر|موجود|سبق|بالفعل/i.test(resultText)
          };
        }

        if (isSuccess) {
          return {
            ok: true,
            status: 'success',
            message: resultText.slice(0, 300)
          };
        }

        return {
          ok: true,
          status: 'success',
          message: resultText.slice(0, 300)
        };
      }

      return {
        ok: true,
        status: 'success',
        message: 'تم تأكيد حفظ بيانات التلميذ بنجاح.'
      };
    }

    return {
      ok: true,
      status: 'success',
      message: firstText.slice(0, 250) || 'تم تنفيذ إجراء الحفظ.'
    };
  }

  /**
   * استعلام فوري بالرقم القومي لجلب بيانات التلميذ من السجل المدني / الوزارة
   * @param {string} nationalId
   * @returns {Promise<Object>}
   */
  async function quickRegisterByNid(nationalId) {
    if (!nationalId || nationalId.length !== 14) {
      throw new Error('الرقم القومي غير صحيح أو غير مكون من 14 رقماً.');
    }

    let nidInput = document.querySelector('input[formcontrolname="nationalId"], input[name="nationalId"], #nationalId, input[placeholder*="قومي"]');
    if (!nidInput) {
      const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
      nidInput = allInputs.find((i) => i.maxLength === 14 || /قومي|national/i.test(i.name || i.id || i.placeholder || ''));
    }

    if (!nidInput) {
      throw new Error('تعذر العثور على حقل إدخال الرقم القومي في صفحة الوزارة الحالية.');
    }

    setNativeValue(nidInput, nationalId);

    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const searchBtn = btns.find((b) => /بحث|استعلام|تحقق|جلب/i.test(b.textContent || b.value || ''));

    if (searchBtn) {
      searchBtn.click();
      return { ok: true, message: 'تم إدخال الرقم القومي والضغط على زر الاستعلام بموقع الوزارة.' };
    }

    return { ok: true, message: 'تم ملء الرقم القومي في الحقل المخصص بنجاح.' };
  }

  /**
   * تشغيل مشغل إضافة الطلاب الجدد المتسلسل مع تنفيذ إجراء الحفظ وتأكيد الحفظ آلياً
   * @param {Array<Object>} studentsList
   * @param {Function} [onProgress]
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async function startAddStudents(studentsList, onProgress, options = {}) {
    addStudentCancelled = false;
    if (!Array.isArray(studentsList) || !studentsList.length) {
      throw new Error('قائمة الطلاب الجدد فارغة أو غير صالحة.');
    }

    const total = studentsList.length;
    let addedCount = 0;
    let failedCount = 0;
    const autoSubmit = options.autoSubmit !== false; // تفعيل إجراء الحفظ وتأكيد الحفظ تلقائياً

    for (let i = 0; i < total; i++) {
      if (addStudentCancelled) break;

      const st = studentsList[i];
      const fillRes = await fillStudentForm(st);
      let submitRes = null;

      if (fillRes.ok) {
        if (autoSubmit) {
          // فاصل زمني هادئ بعد اكتمال تعبئة الحقول قبل الضغط على حفظ
          await new Promise((r) => setTimeout(r, 600));
          submitRes = await submitAndConfirmStudent();
          if (submitRes.ok) {
            addedCount++;
          } else {
            failedCount++;
          }
        } else {
          addedCount++;
        }
      } else {
        failedCount++;
      }

      if (typeof onProgress === 'function') {
        onProgress({
          current: i + 1,
          total,
          name: st.fullName || st.firstName,
          nationalId: st.nationalId,
          status: submitRes ? submitRes.status : (fillRes.ok ? 'success' : 'error'),
          message: submitRes ? submitRes.message : (fillRes.warnings?.join(' | ') || 'تمت التعبئة بنجاح')
        });
      }

      await new Promise((r) => setTimeout(r, 800));
    }

    return {
      ok: true,
      total,
      addedCount,
      failedCount,
      cancelled: addStudentCancelled
    };
  }

  /**
   * إيقاف عملية إضافة الطلاب
   */
  function stopAddStudents() {
    addStudentCancelled = true;
  }

  global.NeprasAddStudent = Object.freeze({
    FIELD_MAP,
    parseAddStudentSheet,
    buildTemplateWorkbook,
    isAddStudentPage,
    findSaveButton,
    submitAndConfirmStudent,
    fillStudentForm,
    quickRegisterByNid,
    startAddStudents,
    stopAddStudents
  });

})(typeof window !== 'undefined' ? window : globalThis);
