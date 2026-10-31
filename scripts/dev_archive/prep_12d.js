/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة استمارة الشهادة الإعدادية وكشف 12 د (Prep 12-D Exam Registration & Stats)
 * 
 * تتيح:
 * 1. فحص صفحة تسجيل الشهادة الإعدادية بالوزارة وقراءة ملخص الأعداد (المقيدين، المسجلين، المتخلفين).
 * 2. سحب أكواد الطلاب من الصفحة آلياً والتنقل بين الصفحات بسرعة وأمان.
 * 3. الربط المرجعي الصارم مع قاعدة بيانات طلاب المدرسة المسجلة في نبراس (بدون أي تخمين للديانة أو حالة القيد).
 * 4. توليد لوحة إحصاء 12 د الشاملة (العدد، الديانة، حالة القيد، النوع) والجدول التقاطعي المعتمد للجان النظام والمراقبة.
 * 5. استخراج كشف إنقاذ المتخلفين عن التسجيل بهواتف أولياء أمورهم وفصولهم لمتابعتهم الفورية.
 * 6. تصدير كشف 12 د التمهيدي للمسجلين (Excel/PDF) قبل اكتمال التسجيل وحل مشكلة حجب زر الوزارة.
 * 7. فحص وإظهار أي أزرار محجوبة لكشف 12 د الأصلي بالصفحة.
 */
'use strict';

(function(global) {
  if (global.NeprasPrep12D) return;

  function toLatinDigits(val) {
    if (global.NeprasEgypt?.toLatinDigits) {
      return global.NeprasEgypt.toLatinDigits(val);
    }
    return String(val ?? '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  }

  function cleanCode(code) {
    return toLatinDigits(String(code || '')).replace(/\D/g, '').trim();
  }

  function cleanPhone(phone) {
    return toLatinDigits(String(phone || '')).replace(/\D/g, '').trim();
  }

  function normalizeName(str) {
    if (!str) return '';
    return toLatinDigits(String(str))
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/عبد\s+/g, 'عبد')
      .replace(/ابو\s+/g, 'ابو')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * فحص ما إذا كانت الصفحة المفتوحة هي صفحة تسجيل استمارة الإعدادية
   * @param {Document|Element} doc
   * @returns {boolean}
   */
  function isPrepRegisterPage(doc) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return false;

    // 1. فحص عناصر Angular المميزة لصفحة الاستمارة المرفقة
    if (root.querySelector('.infoRegisterItems') ||
        root.querySelector('.totalRegister') ||
        root.querySelector('.successregisterMembers') ||
        root.querySelector('.failregisterMembers')) {
      return true;
    }

    // 2. فحص أزرار التبديل المميزة
    const buttons = root.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      const txt = (buttons[i].textContent || '').trim();
      if (txt.includes('تخلفو عن التسجيل') || txt.includes('الذين قاموا بتسجيل الاستمارة')) {
        return true;
      }
    }

    // 3. فحص عناوين الجدول المميزة
    const ths = root.querySelectorAll('th');
    let hasCode = false;
    let hasPrep = false;
    for (let i = 0; i < ths.length; i++) {
      const txt = (ths[i].textContent || '').trim();
      if (txt.includes('كود التلميذ')) hasCode = true;
      if (txt.includes('استمارة التقدم') || txt.includes('استماره التقدم')) hasPrep = true;
    }
    if (hasCode && hasPrep) return true;

    // 4. فحص أي أزرار أو نصوص تحتوي على تسجيل الاستمارة أو استمارة التقدم
    const pageText = (root.body ? root.body.textContent : root.textContent) || '';
    if (pageText.includes('استمارة التقدم للامتحان') || pageText.includes('تسجيل الاستمارة') || pageText.includes('تخلفوا عن التسجيل') || pageText.includes('المسجلين علي الاستمارة')) {
      return true;
    }

    // 5. فحص عنوان URL لصفحات التقدم للامتحانات
    const href = (typeof location !== 'undefined' ? location.href : '') || '';
    if (href.includes('moe-register') || href.includes('prep') || href.includes('register')) {
      return true;
    }

    return false;
  }

  /**
   * قراءة ملخص الأعداد المعروض في واجهة الصفحة
   * @param {Document|Element} doc
   * @returns {Object} { total: number, registered: number, missing: number, percentage: number }
   */
  function readSummaryFromPage(doc) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    const summary = {
      total: 0,
      registered: 0,
      missing: 0,
      percentage: 0
    };
    if (!root) return summary;

    const parseNum = (elem) => {
      if (!elem) return 0;
      const text = toLatinDigits(elem.textContent || '').replace(/\D/g, '');
      return parseInt(text, 10) || 0;
    };

    const totalEl = root.querySelector('.totalRegister strong') || root.querySelector('.totalRegister');
    const successEl = root.querySelector('.successregisterMembers strong') || root.querySelector('.successregisterMembers');
    const failEl = root.querySelector('.failregisterMembers strong') || root.querySelector('.failregisterMembers');

    summary.total = parseNum(totalEl);
    summary.registered = parseNum(successEl);
    summary.missing = parseNum(failEl);

    if (summary.total > 0 && summary.registered > 0) {
      summary.percentage = Number(((summary.registered / summary.total) * 100).toFixed(2));
    } else if (summary.total > 0 && summary.missing > 0 && summary.registered === 0) {
      summary.registered = Math.max(0, summary.total - summary.missing);
      summary.percentage = Number(((summary.registered / summary.total) * 100).toFixed(2));
    }

    return summary;
  }

  /**
   * استخراج الطلاب المعروضين حالياً في الجدول
   * @param {Document|Element} doc
   * @returns {Array<Object>} قائمة الطلاب بالجدول { code, name, action }
   */
  function extractVisibleTableRows(doc) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return [];

    const rows = [];
    const trs = root.querySelectorAll('table tbody tr');

    for (let i = 0; i < trs.length; i++) {
      const tr = trs[i];
      const tds = tr.querySelectorAll('td');
      if (tds.length < 2) continue;

      const codeRaw = (tds[0].textContent || '').trim();
      const code = cleanCode(codeRaw);
      const name = (tds[1].textContent || '').trim();
      const action = tds[2] ? (tds[2].textContent || '').trim() : '';

      if (code) {
        rows.push({
          code,
          name,
          action,
          rawCode: codeRaw
        });
      }
    }

    return rows;
  }

  /**
   * البحث عن أي زر أو رابط لكشف 12 د الوزاري الأصلي وإلغاء حجبه
   * @param {Document|Element} doc
   * @returns {number} عدد العناصر التي تم إظهارها
   */
  function revealHidden12DButtons(doc) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return 0;

    let count = 0;
    const candidates = root.querySelectorAll('button, a, div, span');

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const text = (el.textContent || '').trim();
      const idOrClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();

      const is12D = /12\s*د|12د|كشف\s*12|استمارة\s*12|تقرير\s*12/i.test(text) ||
                    /12d|print-12|report12|pdf/i.test(idOrClass);

      if (is12D) {
        let changed = false;
        if (el.disabled) {
          el.disabled = false;
          el.removeAttribute('disabled');
          changed = true;
        }
        if (el.style.display === 'none') {
          el.style.display = 'inline-block';
          changed = true;
        }
        if (el.style.visibility === 'hidden') {
          el.style.visibility = 'visible';
          changed = true;
        }
        if (el.hasAttribute('hidden')) {
          el.removeAttribute('hidden');
          changed = true;
        }
        if (changed) {
          el.style.border = '2px solid #19b87a';
          el.style.boxShadow = '0 0 10px rgba(25, 184, 122, 0.5)';
          el.setAttribute('title', 'تم إظهاره وتفعيله بواسطة نبراس');
          count++;
        }
      }
    }

    return count;
  }

  /**
   * تطبيع وتدقيق طالب من قاعدة بيانات المدرسة
   * @param {Object} raw
   * @returns {Object}
   */
  function normalizeStudent(raw) {
    if (global.NeprasStatsDashboard?.normalizeStudentRecord) {
      return global.NeprasStatsDashboard.normalizeStudentRecord(raw);
    }
    const clean = (v) => String(v ?? '').trim();
    const code = cleanCode(raw['كود التلميذ'] || raw['كود الطالب'] || raw.code || raw.studentCode);
    const nid = toLatinDigits(clean(raw['الرقم القومي'] || raw.nid || raw.nationalId)).replace(/\D/g, '');
    const name = clean(raw['اسم التلميذ'] || raw['اسم الطالب'] || raw['الاسم بالكامل'] || raw.name || raw.fullName);
    const cls = clean(raw['الفصل'] || raw['فصل'] || raw.className || raw.cls);
    const grade = clean(raw['الصف'] || raw['الصف الدراسي'] || raw.grade || 'الصف الثالث الإعدادي');
    const phone = cleanPhone(raw['رقم المحمول'] || raw['المحمول'] || raw['هاتف ولي الأمر'] || raw.phone || raw.mobile);
    const altPhone = cleanPhone(raw['رقم التليفون'] || raw['التليفون'] || raw['رقم بديل'] || raw.altPhone);
    const mother = clean(raw['اسم الأم'] || raw['اسم الام'] || raw.motherFullName || raw.mother);

    // الديانة الرسمية الصارمة بدون تخمين
    let religion = 'غير مسجّل';
    const rawRel = clean(raw['الديانة'] || raw['الديانه'] || raw.religion || raw.religionName);
    if (/مسيح|christian|قبط/i.test(rawRel)) religion = 'مسيحي';
    else if (/مسلم|إسلام|اسلام|muslim/i.test(rawRel)) religion = 'مسلم';
    else if (/أخرى|اخرى/i.test(rawRel)) religion = 'أخرى';
    else if (rawRel) religion = rawRel;

    // النوع الصارم
    let gender = '';
    const rawGen = clean(raw['النوع'] || raw['الجنس'] || raw.gender);
    if (/ذكر|بنين|ولد|^male$/i.test(rawGen)) gender = 'بنين';
    else if (/أنثى|انثى|بنات|بنت|^female$/i.test(rawGen)) gender = 'بنات';
    else if (nid.length === 14 && global.NeprasEgypt?.decodeNID) {
      const dec = global.NeprasEgypt.decodeNID(nid);
      if (dec?.gender) gender = dec.gender;
    }

    // حالة القيد
    let status = clean(raw['حالة القيد'] || raw['حاله القيد'] || raw['الموقف من القيد'] || raw.status || 'مستجد');
    if (!status) status = 'مستجد';

    return {
      code,
      nid,
      name,
      cls,
      grade,
      phone,
      altPhone,
      mother,
      religion,
      gender,
      status,
      raw
    };
  }

  /**
   * حساب إحصاء 12 د الشامل بالمطابقة الحتمية بين أكواد الصفحة وقاعدة بيانات المدرسة
   * 
   * @param {Array<Object>} schoolStudents قائمة طلاب المدرسة بالصف الثالث من نبراس
   * @param {Object} extractedData الأكواد المسحوبة من الصفحة
   * @param {Set<string>|Array<string>} [extractedData.missingCodes] أكواد المتخلفين عن التسجيل
   * @param {Set<string>|Array<string>} [extractedData.registeredCodes] أكواد المسجلين
   * @param {Object} [options] خيارات إضافية
   * @returns {Object} التقرير الإحصائي الصارم + كشف المسجلين + كشف المتخلفين
   */
  function computeStrict12DStats(schoolStudents, extractedData = {}, options = {}) {
    const list = Array.isArray(schoolStudents) ? schoolStudents : [];
    const missingSet = new Set(
      (extractedData.missingCodes ? Array.from(extractedData.missingCodes) : []).map(cleanCode).filter(Boolean)
    );
    const registeredSet = new Set(
      (extractedData.registeredCodes ? Array.from(extractedData.registeredCodes) : []).map(cleanCode).filter(Boolean)
    );

    // التحقق من نوع البيانات المتوفرة من الصفحة
    const hasMissingList = missingSet.size > 0;
    const hasRegisteredList = registeredSet.size > 0;

    const registeredStudents = [];
    const missingStudents = [];
    const unmatchedCodes = [];

    // تصفية وتطبيع طلاب الصف الثالث الإعدادي من مدرسة
    const targetStudents = [];
    for (let i = 0; i < list.length; i++) {
      const st = normalizeStudent(list[i]);
      if (!st.code && !st.nid && !st.name) continue;

      // فحص الصف الدراسي إذا لم تكن القائمة مفلترة مسبقاً
      if (options.filterGrade !== false) {
        const gradeNorm = st.grade || '';
        const isPrep3 = /ثالث|إعدادي|اعدادي|3|تالت/i.test(gradeNorm) ||
                        /الصف الثالث/i.test(gradeNorm) ||
                        list.length <= 1500; // إذا كانت القائمة كاملة للصف الثالث
        if (!isPrep3 && options.strictGrade) continue;
      }

      targetStudents.push(st);
    }

    // مطابقة كل طالب
    const matchedCodesInSchool = new Set();

    for (let i = 0; i < targetStudents.length; i++) {
      const st = targetStudents[i];
      let isRegistered = false;

      if (hasMissingList && !hasRegisteredList) {
        // إذا سحبنا فقط كشف المتخلفين (مثلاً 111 طالب): فكل طالب غير موجود في المتخلفين هو مسجل
        isRegistered = !missingSet.has(st.code);
      } else if (hasRegisteredList && !hasMissingList) {
        // إذا سحبنا فقط كشف المسجلين: فكل طالب غير موجود في المسجلين هو متخلف
        isRegistered = registeredSet.has(st.code);
      } else if (hasMissingList && hasRegisteredList) {
        // إذا سحبنا كلاهما
        if (missingSet.has(st.code)) {
          isRegistered = false;
        } else if (registeredSet.has(st.code)) {
          isRegistered = true;
        } else {
          // لم يظهر في أي قائمة: يعتبر متخلفاً لحين التأكد
          isRegistered = false;
        }
      } else {
        // لم يتم سحب أكواد بعد: نعتمد حالة المدرسة الافتراضية
        isRegistered = true;
      }

      if (isRegistered) {
        registeredStudents.push(st);
        matchedCodesInSchool.add(st.code);
      } else {
        missingStudents.push(st);
        matchedCodesInSchool.add(st.code);
      }
    }

    // فحص إذا كانت هناك أكواد مسحوبة من الوزارة لم يُعثر عليها في قاعدة بيانات المدرسة
    const checkExtracted = hasMissingList ? missingSet : registeredSet;
    checkExtracted.forEach(c => {
      if (!matchedCodesInSchool.has(c)) {
        unmatchedCodes.push(c);
      }
    });

    // -------------------------------------------------------------
    // حساب الإحصائيات الصارمة (بناء جداول الديانة، حالة القيد، والنوع)
    // -------------------------------------------------------------

    function createBucket() {
      return { total: 0, registered: 0, missing: 0 };
    }

    const byGender = {
      male: createBucket(),
      female: createBucket(),
      unknown: createBucket()
    };

    const byReligion = {
      muslim: createBucket(),
      christian: createBucket(),
      other: createBucket(),
      unspecified: createBucket()
    };

    const byStatus = {
      mostajad: createBucket(),  // مستجد
      baq: createBucket(),       // باق للإعادة
      manqoul: createBucket(),   // منقول
      manazel: createBucket(),   // منازل
      other: createBucket()
    };

    // الجدول التقاطعي الصارم لنموذج كشف 12 د
    // [الحالة][النوع][الديانة]
    const matrix12D = {
      mostajad: {
        maleMuslim: { total: 0, reg: 0, miss: 0 },
        maleChristian: { total: 0, reg: 0, miss: 0 },
        femaleMuslim: { total: 0, reg: 0, miss: 0 },
        femaleChristian: { total: 0, reg: 0, miss: 0 },
        total: { total: 0, reg: 0, miss: 0 }
      },
      baq: {
        maleMuslim: { total: 0, reg: 0, miss: 0 },
        maleChristian: { total: 0, reg: 0, miss: 0 },
        femaleMuslim: { total: 0, reg: 0, miss: 0 },
        femaleChristian: { total: 0, reg: 0, miss: 0 },
        total: { total: 0, reg: 0, miss: 0 }
      },
      other: {
        maleMuslim: { total: 0, reg: 0, miss: 0 },
        maleChristian: { total: 0, reg: 0, miss: 0 },
        femaleMuslim: { total: 0, reg: 0, miss: 0 },
        femaleChristian: { total: 0, reg: 0, miss: 0 },
        total: { total: 0, reg: 0, miss: 0 }
      },
      grandTotal: {
        maleMuslim: { total: 0, reg: 0, miss: 0 },
        maleChristian: { total: 0, reg: 0, miss: 0 },
        femaleMuslim: { total: 0, reg: 0, miss: 0 },
        femaleChristian: { total: 0, reg: 0, miss: 0 },
        total: { total: 0, reg: 0, miss: 0 }
      }
    };

    function processStudentInBuckets(st, isReg) {
      const field = isReg ? 'registered' : 'missing';
      const mField = isReg ? 'reg' : 'miss';

      // 1. النوع
      let gKey = 'unknown';
      if (st.gender === 'بنين') gKey = 'male';
      else if (st.gender === 'بنات') gKey = 'female';
      byGender[gKey].total++;
      byGender[gKey][field]++;

      // 2. الديانة
      let rKey = 'unspecified';
      if (st.religion === 'مسلم') rKey = 'muslim';
      else if (st.religion === 'مسيحي') rKey = 'christian';
      else if (st.religion === 'أخرى' || st.religion === 'اخرى') rKey = 'other';
      byReligion[rKey].total++;
      byReligion[rKey][field]++;

      // 3. حالة القيد
      let sKey = 'other';
      const stStatus = st.status || '';
      if (/مستجد/i.test(stStatus)) sKey = 'mostajad';
      else if (/باق|اعادة|إعادة/i.test(stStatus)) sKey = 'baq';
      else if (/منقول/i.test(stStatus)) sKey = 'manqoul';
      else if (/منازل/i.test(stStatus)) sKey = 'manazel';
      byStatus[sKey].total++;
      byStatus[sKey][field]++;

      // 4. مصفوفة 12 د الرسمية
      const rowKey = (sKey === 'mostajad') ? 'mostajad' : (sKey === 'baq') ? 'baq' : 'other';
      let cellKey = '';

      if (gKey === 'male' && rKey === 'muslim') cellKey = 'maleMuslim';
      else if (gKey === 'male' && rKey === 'christian') cellKey = 'maleChristian';
      else if (gKey === 'female' && rKey === 'muslim') cellKey = 'femaleMuslim';
      else if (gKey === 'female' && rKey === 'christian') cellKey = 'femaleChristian';

      if (cellKey) {
        matrix12D[rowKey][cellKey].total++;
        matrix12D[rowKey][cellKey][mField]++;

        matrix12D.grandTotal[cellKey].total++;
        matrix12D.grandTotal[cellKey][mField]++;
      }

      matrix12D[rowKey].total.total++;
      matrix12D[rowKey].total[mField]++;

      matrix12D.grandTotal.total.total++;
      matrix12D.grandTotal.total[mField]++;
    }

    registeredStudents.forEach(st => processStudentInBuckets(st, true));
    missingStudents.forEach(st => processStudentInBuckets(st, false));

    const totalStudents = targetStudents.length;
    const registeredCount = registeredStudents.length;
    const missingCount = missingStudents.length;
    const registeredPct = totalStudents > 0 ? Number(((registeredCount / totalStudents) * 100).toFixed(2)) : 0;
    const missingPct = totalStudents > 0 ? Number(((missingCount / totalStudents) * 100).toFixed(2)) : 0;

    return {
      summary: {
        totalStudents,
        registeredCount,
        missingCount,
        registeredPct,
        missingPct,
        unmatchedExtractedCount: unmatchedCodes.length
      },
      byGender,
      byReligion,
      byStatus,
      matrix12D,
      registeredStudents,
      missingStudents,
      unmatchedCodes
    };
  }

  /**
   * بناء مصنف Excel لكشف إنقاذ ومتابعة المتخلفين عن التسجيل بهواتفهم وفصولهم
   * 
   * @param {Array<Object>} missingStudents قائمة الطلاب المتخلفين
   * @param {Object} meta بيانات الترويسة المدرسية
   * @param {Object} XLSX مكتبة SheetJS
   * @returns {Object} مصنف Excel جاهز للتنزيل
   */
  function buildMissingRescueWorkbook(missingStudents, meta = {}, XLSX) {
    if (!XLSX || !XLSX.utils) {
      throw new Error('مكتبة XLSX غير متوفرة لتوليد ملف Excel.');
    }

    const schoolName = meta.schoolName || meta.school || 'المدرسة';
    const gov = meta.directorate || meta.governorate || 'وزارة التربية والتعليم والتعليم الفني';
    const edara = meta.administration || meta.edara || '';
    const year = meta.year || '2026 / 2027';

    const wb = XLSX.utils.book_new();
    const rows = [];

    // الترويسة الرسمية
    rows.push([gov, '', '', '', '', '', '', '', '', '']);
    rows.push([`إدارة: ${edara}`, '', '', '', '', '', '', '', '', '']);
    rows.push([`مدرسة: ${schoolName}`, '', '', '', '', '', '', '', '', `العام الدراسي: ${year}`]);
    rows.push(['']);
    rows.push(['كشف متابعة وإنقاذ الطلاب المتخلفين عن تسجيل استمارة التقدم لامتحان الشهادة الإعدادية']);
    rows.push([`إجمالي المتخلفين عن التسجيل حتى تاريخه: (${missingStudents.length}) طالباً — مطلوب سرعة التواصل قبل غلق الموقع`]);
    rows.push(['']);

    // رؤوس الأعمدة
    const headers = [
      'م',
      'كود التلميذ',
      'اسم التلميذ',
      'الرقم القومي',
      'الصف',
      'الفصل',
      'هاتف ولي الأمر',
      'هاتف بديل / محمول',
      'حالة القيد',
      'الديانة',
      'اسم الأم',
      'نتيجة التواصل والملاحظات'
    ];
    rows.push(headers);

    // ترتيب المتخلفين حسب الفصل ثم أبجدياً
    const sorted = [...missingStudents].sort((a, b) => {
      const clsComp = String(a.cls || '').localeCompare(String(b.cls || ''), 'ar', { numeric: true });
      if (clsComp !== 0) return clsComp;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

    sorted.forEach((st, idx) => {
      rows.push([
        idx + 1,
        st.code || '',
        st.name || '',
        st.nid || '',
        st.grade || 'الصف الثالث الإعدادي',
        st.cls || '—',
        st.phone || '—',
        st.altPhone || '—',
        st.status || 'مستجد',
        st.religion || '—',
        st.mother || '—',
        '' // مساحة للمسؤول لكتابة ملاحظات الاتصال
      ]);
    });

    rows.push(['']);
    rows.push(['توقيعات لجنة النظام والمتابعة المدرسية:']);
    rows.push(['مسؤول الإحصاء', '', 'مسؤول شؤون الطلاب', '', '', 'وكيل شؤون التعليم', '', '', 'مدير المدرسة', '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // ضبط عرض الأعمدة للقراءة والطباعة
    ws['!cols'] = [
      { wch: 5 },   // م
      { wch: 12 },  // الكود
      { wch: 32 },  // الاسم
      { wch: 17 },  // القومي
      { wch: 16 },  // الصف
      { wch: 10 },  // الفصل
      { wch: 14 },  // هاتف 1
      { wch: 14 },  // هاتف 2
      { wch: 12 },  // الحالة
      { wch: 10 },  // الديانة
      { wch: 26 },  // اسم الأم
      { wch: 22 }   // الملاحظات
    ];

    ws['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(wb, ws, 'المتخلفون عن التسجيل');

    return wb;
  }

  /**
   * بناء مصنف كشف 12 د التمهيدي للمسجلين والإحصاء الرسمي
   * 
   * @param {Array<Object>} registeredStudents قائمة الطلاب المسجلين
   * @param {Object} stats الإحصائيات المحسوبة
   * @param {Object} meta بيانات الترويسة المدرسية
   * @param {Object} XLSX مكتبة SheetJS
   * @returns {Object} مصنف Excel
   */
  function buildPrep12DPreviewWorkbook(registeredStudents, stats, meta = {}, XLSX) {
    if (!XLSX || !XLSX.utils) {
      throw new Error('مكتبة XLSX غير متوفرة لتوليد ملف Excel.');
    }

    const schoolName = meta.schoolName || meta.school || 'المدرسة';
    const gov = meta.directorate || meta.governorate || 'وزارة التربية والتعليم والتعليم الفني';
    const edara = meta.administration || meta.edara || '';
    const year = meta.year || '2026 / 2027';

    const wb = XLSX.utils.book_new();

    // ==========================================
    // الورقة الأولى: اللوحة الإحصائية الرسمية لكشف 12 د
    // ==========================================
    const statRows = [];
    statRows.push([gov, '', '', '', '', '', '']);
    statRows.push([`إدارة: ${edara}`, '', '', '', '', '', '']);
    statRows.push([`مدرسة: ${schoolName}`, '', '', '', '', '', `العام الدراسي: ${year}`]);
    statRows.push(['']);
    statRows.push(['استمارة إحصاء المتقدمين لامتحان الشهادة الإعدادية (نموذج 12 د)']);
    statRows.push([`إجمالي المقيدين: (${stats.summary.totalStudents}) | المسجلون: (${stats.summary.registeredCount}) بنسبة ${stats.summary.registeredPct}% | المتخلفون: (${stats.summary.missingCount})`]);
    statRows.push(['']);

    // الجدول التقاطعي الصارم لنموذج 12 د الوزاري المعتمد
    statRows.push(['الجدول التقاطعي المعتمد (الديانة والنوع وحالة القيد)']);
    statRows.push([
      'حالة القيد',
      'بنين مسلم',
      'بنين مسيحي',
      'بنات مسلم',
      'بنات مسيحي',
      'جملة المسجلين',
      'جملة المقيدين بالمدرسة'
    ]);

    const m = stats.matrix12D;
    const addRow = (label, obj) => {
      statRows.push([
        label,
        obj.maleMuslim.reg,
        obj.maleChristian.reg,
        obj.femaleMuslim.reg,
        obj.femaleChristian.reg,
        obj.total.reg,
        obj.total.total
      ]);
    };

    addRow('مستجد', m.mostajad);
    addRow('باقٍ للإعادة', m.baq);
    addRow('منقول / أخرى', m.other);
    addRow('الإجمالي العام', m.grandTotal);

    statRows.push(['']);
    statRows.push(['توزيع الطلاب حسب النوع:']);
    statRows.push(['النوع', 'إجمالي المقيدين', 'المسجلون', 'المتخلفون', 'نسبة التسجيل']);
    statRows.push(['بنين', stats.byGender.male.total, stats.byGender.male.registered, stats.byGender.male.missing, `${stats.byGender.male.total ? ((stats.byGender.male.registered / stats.byGender.male.total) * 100).toFixed(1) : 0}%`]);
    statRows.push(['بنات', stats.byGender.female.total, stats.byGender.female.registered, stats.byGender.female.missing, `${stats.byGender.female.total ? ((stats.byGender.female.registered / stats.byGender.female.total) * 100).toFixed(1) : 0}%`]);

    statRows.push(['']);
    statRows.push(['توزيع الطلاب حسب الديانة المعتمدة (إحصاء صارم بدون أي تخمين):']);
    statRows.push(['الديانة', 'إجمالي المقيدين', 'المسجلون', 'المتخلفون', 'نسبة التسجيل']);
    statRows.push(['مسلم', stats.byReligion.muslim.total, stats.byReligion.muslim.registered, stats.byReligion.muslim.missing, `${stats.byReligion.muslim.total ? ((stats.byReligion.muslim.registered / stats.byReligion.muslim.total) * 100).toFixed(1) : 0}%`]);
    statRows.push(['مسيحي', stats.byReligion.christian.total, stats.byReligion.christian.registered, stats.byReligion.christian.missing, `${stats.byReligion.christian.total ? ((stats.byReligion.christian.registered / stats.byReligion.christian.total) * 100).toFixed(1) : 0}%`]);

    statRows.push(['']);
    statRows.push(['توقيعات واعتمادات الإحصاء:']);
    statRows.push(['مسؤول الإحصاء بالمدرسة', '', 'شؤون الطلاب', '', 'مدير المدرسة', '', '']);

    const statWs = XLSX.utils.aoa_to_sheet(statRows);
    statWs['!cols'] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 }
    ];
    statWs['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(wb, statWs, 'إحصاء 12 د المعتمد');

    // ==========================================
    // الورقة الثانية: كشف 12 د التمهيدي للمسجلين
    // ==========================================
    const listRows = [];
    listRows.push([gov, '', '', '', '', '', '', '', '', '']);
    listRows.push([`إدارة: ${edara}`, '', '', '', '', '', '', '', '', '']);
    listRows.push([`مدرسة: ${schoolName}`, '', '', '', '', '', '', '', '', `العام الدراسي: ${year}`]);
    listRows.push(['']);
    listRows.push(['كشف 12 د التمهيدي — للطلاب الذين أتموا تسجيل استمارة التقدم للشهادة الإعدادية']);
    listRows.push([`عدد الطلاب المسجلين بالكشف: (${registeredStudents.length}) طالباً`]);
    listRows.push(['']);

    listRows.push([
      'م',
      'كود التلميذ',
      'اسم التلميذ (هجائياً)',
      'الرقم القومي',
      'النوع',
      'الديانة',
      'حالة القيد',
      'الفصل',
      'اسم الأم',
      'ملاحظات'
    ]);

    // ترتيب هجائي معتمد (بنين ثم بنات أو كلي)
    const sorted = [...registeredStudents].sort((a, b) => {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

    sorted.forEach((st, idx) => {
      listRows.push([
        idx + 1,
        st.code || '',
        st.name || '',
        st.nid || '',
        st.gender || '',
        st.religion || '',
        st.status || 'مستجد',
        st.cls || '—',
        st.mother || '',
        'مسجل بالاستمارة'
      ]);
    });

    listRows.push(['']);
    listRows.push(['أعضاء لجنة النظام والمراقبة بالمدرسة:']);
    listRows.push(['عضو 1', 'عضو 2', 'رئيس الكنترول', '', 'مسؤول الإحصاء', '', 'شؤون الطلاب', '', 'مدير المدرسة', '']);

    const listWs = XLSX.utils.aoa_to_sheet(listRows);
    listWs['!cols'] = [
      { wch: 5 },   // م
      { wch: 12 },  // الكود
      { wch: 34 },  // الاسم
      { wch: 17 },  // القومي
      { wch: 8 },   // النوع
      { wch: 8 },   // الديانة
      { wch: 12 },  // الحالة
      { wch: 10 },  // الفصل
      { wch: 28 },  // اسم الأم
      { wch: 15 }   // ملاحظات
    ];
    listWs['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(wb, listWs, 'كشف 12 د للطلاب المسجلين');

    return wb;
  }

  /**
   * إنشاء كود HTML لطباعة استمارة إحصاء 12 د الرسمية A4
   * @param {Object} stats
   * @param {Object} meta
   * @returns {string}
   */
  function buildHtmlPrintout(stats, meta = {}) {
    const schoolName = meta.schoolName || meta.school || 'المدرسة';
    const gov = meta.directorate || meta.governorate || 'وزارة التربية والتعليم والتعليم الفني';
    const edara = meta.administration || meta.edara || '';
    const year = meta.year || '2026 / 2027';

    const m = stats.matrix12D;

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>استمارة إحصاء 12 د — ${schoolName}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 0; direction: rtl; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .header-table td { vertical-align: top; font-weight: bold; font-size: 13px; }
    .title-box { text-align: center; border: 2px solid #111; padding: 8px 14px; margin: 8px 0 14px 0; border-radius: 6px; background: #fafafa; }
    .title-box h2 { margin: 0 0 4px 0; font-size: 17px; }
    .title-box p { margin: 0; font-size: 12px; color: #444; }
    .main-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; text-align: center; }
    .main-table th, .main-table td { border: 1px solid #111; padding: 6px 8px; font-size: 12px; }
    .main-table th { background: #f0f0f0; font-weight: bold; }
    .total-row { font-weight: bold; background: #f9f9f9; }
    .signatures-table { width: 100%; border-collapse: collapse; margin-top: 25px; text-align: center; }
    .signatures-table td { width: 33.33%; padding: 10px 4px; font-size: 13px; font-weight: bold; vertical-align: top; }
    .sig-space { height: 45px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td style="text-align: right; width: 40%;">
        ${gov}<br>
        مديرية التربية والتعليم<br>
        إدارة ${edara} التعليمية<br>
        مدرسة: ${schoolName}
      </td>
      <td style="text-align: center; width: 20%;">
        <div style="font-size: 20px;">🏛️</div>
      </td>
      <td style="text-align: left; width: 40%;">
        العام الدراسي: ${year}<br>
        امتحان الشهادة الإعدادية العامة<br>
        تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}
      </td>
    </tr>
  </table>

  <div class="title-box">
    <h2>استمارة إحصاء المتقدمين للامتحان (كشف 12 د)</h2>
    <p>إجمالي المقيدين بالصف الثالث: <b>${stats.summary.totalStudents}</b> | المسجلون للاستمارة: <b>${stats.summary.registeredCount}</b> (${stats.summary.registeredPct}%) | المتخلفون: <b>${stats.summary.missingCount}</b> (${stats.summary.missingPct}%)</p>
  </div>

  <table class="main-table">
    <thead>
      <tr>
        <th rowspan="2" style="width: 25%;">حالة القيد</th>
        <th colspan="2">بنين</th>
        <th colspan="2">بنات</th>
        <th rowspan="2" style="width: 15%;">جملة المسجلين</th>
        <th rowspan="2" style="width: 15%;">المقيدون بالمدرسة</th>
      </tr>
      <tr>
        <th>مسلم</th>
        <th>مسيحي</th>
        <th>مسلم</th>
        <th>مسيحي</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="font-weight: bold;">مستجد</td>
        <td>${m.mostajad.maleMuslim.reg}</td>
        <td>${m.mostajad.maleChristian.reg}</td>
        <td>${m.mostajad.femaleMuslim.reg}</td>
        <td>${m.mostajad.femaleChristian.reg}</td>
        <td style="font-weight: bold;">${m.mostajad.total.reg}</td>
        <td>${m.mostajad.total.total}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">باقٍ للإعادة</td>
        <td>${m.baq.maleMuslim.reg}</td>
        <td>${m.baq.maleChristian.reg}</td>
        <td>${m.baq.femaleMuslim.reg}</td>
        <td>${m.baq.femaleChristian.reg}</td>
        <td style="font-weight: bold;">${m.baq.total.reg}</td>
        <td>${m.baq.total.total}</td>
      </tr>
      <tr>
        <td style="font-weight: bold;">منقول / أخرى</td>
        <td>${m.other.maleMuslim.reg}</td>
        <td>${m.other.maleChristian.reg}</td>
        <td>${m.other.femaleMuslim.reg}</td>
        <td>${m.other.femaleChristian.reg}</td>
        <td style="font-weight: bold;">${m.other.total.reg}</td>
        <td>${m.other.total.total}</td>
      </tr>
      <tr class="total-row">
        <td>الإجمالي العام</td>
        <td>${m.grandTotal.maleMuslim.reg}</td>
        <td>${m.grandTotal.maleChristian.reg}</td>
        <td>${m.grandTotal.femaleMuslim.reg}</td>
        <td>${m.grandTotal.femaleChristian.reg}</td>
        <td>${m.grandTotal.total.reg}</td>
        <td>${m.grandTotal.total.total}</td>
      </tr>
    </tbody>
  </table>

  <table class="signatures-table">
    <tr>
      <td>
        مسؤول الإحصاء بالمدرسة<br>
        <div class="sig-space"></div>
        ....................................
      </td>
      <td>
        مسؤول شؤون الطلاب<br>
        <div class="sig-space"></div>
        ....................................
      </td>
      <td>
        مدير المدرسة<br>
        <div class="sig-space"></div>
        ....................................
      </td>
    </tr>
  </table>
  <script>window.print();</script>
</body>
</html>`;
  }

  /**
   * تفريغ وتحليل كود الصفحة المنسوخ أو الأكواد النصية يدوياً بدون الحاجة للاتصال بالتبويب
   * @param {string} input كود HTML أو قائمة نصوص
   * @returns {Object}
   */
  function parseFromHtmlOrText(input) {
    const raw = String(input || '').trim();
    if (!raw) return { ok: false, message: 'النص المدخل فارغ.' };

    let doc = null;
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      try {
        if (typeof DOMParser !== 'undefined') {
          const parser = new DOMParser();
          doc = parser.parseFromString(raw, 'text/html');
        }
      } catch (_) {
        doc = null;
      }
    }

    let summary = { total: 0, registered: 0, missing: 0, percentage: 0 };
    let rows = [];

    if (doc) {
      summary = readSummaryFromPage(doc);
      rows = extractVisibleTableRows(doc);
    }

    // إذا لم يجد صفوفاً بالجدول أو تم إدخال نص عادي / أرقام أكواد
    if (!rows.length) {
      const codeMatches = raw.match(/\b\d{7,14}\b/g) || [];
      const seen = new Set();
      codeMatches.forEach(c => {
        if (!seen.has(c)) {
          seen.add(c);
          rows.push({ code: c, name: '', action: '' });
        }
      });
    }

    const seenCodes = Array.from(new Set(rows.map(r => r.code)));

    return {
      ok: true,
      summary,
      rowsCount: rows.length,
      rows,
      codes: seenCodes,
      isMissingView: (summary.missing > 0 && seenCodes.length === summary.missing) || (summary.registered === 0)
    };
  }

  // تصدير الوحدة للبيئات المختلفة
  const NeprasPrep12D = {
    version: '1.0.0',
    isPrepRegisterPage,
    readSummaryFromPage,
    extractVisibleTableRows,
    revealHidden12DButtons,
    parseFromHtmlOrText,
    normalizeStudent,
    computeStrict12DStats,
    buildMissingRescueWorkbook,
    buildPrep12DPreviewWorkbook,
    buildHtmlPrintout
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeprasPrep12D;
  } else {
    global.NeprasPrep12D = NeprasPrep12D;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
