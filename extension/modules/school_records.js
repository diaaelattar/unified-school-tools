/**
 * نبراس — وحدة «السجلات والكشوف» (الصحة المدرسية وسجلات الفصول والقيد وكشف 41 …)
 * جزء من نبراس الأصلي لا أداة مستقلة: تُحقن مع الوحدات المشتركة في موقعي الطلاب والمعلمين، وأزرارها كلها في نافذة نبراس،
 * وتقدّمها ونتيجتها في شريط الحالة المشترك (لا لوحة خاصة بها).
 *
 * الخصائص المدمجة:
 *  1. كشوف فحص الأنيميا والتقزم والسمنة (100 مليون صحة للتأمين الصحي - مقسمة للفصول، 35 طالباً بالصفحة للطباعة المريحة).
 *  2. سجل 5 سلوك ومواظبة (لائحة الانضباط المدرسي الوزارية - مقسم للفصول ومرتب).
 *  3. سجلات الفصول الثلاثة (الدرجات الأسبوعية، الغياب الأسبوعي، أعمال السنة المجمع - مقسمة للفصول).
 *  4. سجل الغياب والمواظبة الشهري (30 يوماً) وبيان ميزانية المدرسة.
 *  5. قوائم الفصول بنظام العمودين المصمم والموفر للورق (60+ طالباً بالصفحة).
 *  6. كشوف 41 مستجدين لشؤون الطلاب والكنترول، وكشوف لجان المناداة (20 طالباً باللجنة).
 *  7. سجلات القيد الشاملة لجميع طلاب المدرسة (شامل + مقسم للفصول).
 *  8. حصر وإدارة طلاب المنازل والدمج والإعفاءات بشكل منفصل.
 *  9. أداة تفريغ وتحميل أي جدول معروض بالصفحة فوراً.
 *
 * المعايير الصارمة:
 *  - جلب بيانات الطلاب عبر محرك Nepras Student API عالي السرعة مع دعم الجداول كاحتياطي.
 *  - التقدم والنتيجة والأخطاء في شريط الحالة المشترك (showFloatingStatus) بزر إيقاف.
 *  - دعم كامل للتوقف والإلغاء والاستئناف (Pause / Resume / Stop) مع حارس isAborted().
 *  - استايل إكسيل نبراس المعتمد بنسبة 100% عبر neprasStudentBuildMultiSheetXlsx.
 *  - التنزيل الحصري داخل مجلدات Downloads/Nepras/ المخصصة.
 */

(() => {
  'use strict';

  if (globalThis.__NEPRAS_RECORDS_LOADED__) return;
  globalThis.__NEPRAS_RECORDS_LOADED__ = true;

  // -------------------------------------------------------------
  // 1. إدارة حالة العمليات والإيقاف والاستئناف (Lifecycle & Abort)
  // -------------------------------------------------------------
  let currentOperation = null;
  let isAbortedFlag = false;

  function setRunning(opName, details = '') {
    currentOperation = opName;
    isAbortedFlag = false;
    resetSharedStop(); // عملية جديدة تبدأ نظيفة (كما تفعل بقية الوحدات)؛ كان علم الإيقاف المنفصل لهذه الوحدة لا يُصفَّر فتفشل كل عملية بعد أول إيقاف
    reportStatus(details || 'جاري تنفيذ العملية...');
    try {
      chrome.storage.local.set({
        records_running: opName,
        records_details: details,
        records_started_at: Date.now()
      });
    } catch (_) {}
  }

  function clearRunning() {
    currentOperation = null;
    isAbortedFlag = false;
    try {
      chrome.storage.local.remove(['records_running', 'records_details', 'records_started_at']);
    } catch (_) {}
  }

  // الإيقاف مشترك مع بقية الوحدات: علم window.__NEPRAS_STOP_ALL_REQUESTED__ (export.js: neprasRequestGlobalStop/neprasResetGlobalStop).
  // فيوقف «إيقاف كل العمليات» هذه الوحدة، ويوقف إيقافها طلبات الـ API الجارية.
  function sharedStopRequested() {
    try {
      if (typeof window.neprasIsGlobalStopRequested === 'function') return window.neprasIsGlobalStopRequested() === true;
      return window.__NEPRAS_STOP_ALL_REQUESTED__ === true;
    } catch (_) { return false; }
  }

  function resetSharedStop() {
    try {
      if (typeof window.neprasResetGlobalStop === 'function') window.neprasResetGlobalStop();
      else window.__NEPRAS_STOP_ALL_REQUESTED__ = false;
    } catch (_) {}
  }

  function isAborted() {
    return isAbortedFlag || sharedStopRequested();
  }

  function requestStop() {
    isAbortedFlag = true;
    try {
      if (typeof window.neprasRequestGlobalStop === 'function') window.neprasRequestGlobalStop('records_stop');
      else window.__NEPRAS_STOP_ALL_REQUESTED__ = true;
    } catch (_) {}
    reportStatus('⏹ تم طلب الإيقاف...');
  }

  // -------------------------------------------------------------
  // 2. خوارزميات فحص الرقم القومي والمؤشرات الصحية والسن
  // -------------------------------------------------------------
  // الأرقام والمحافظات والرقم القومي والسن: من modules/egypt_ids.js (مصدر واحد) مع احتياط دفاعي كامل.
  const neprasEgypt = globalThis.NeprasEgypt || {};
  const cleanDigits = (v) => (globalThis.NeprasEgypt?.cleanDigits || neprasEgypt.cleanDigits || ((val) => String(val ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '').trim()))(v);
  const parseNationalId = (idStr) => (globalThis.NeprasEgypt?.parseNationalId || neprasEgypt.parseNationalId || (() => null))(idStr);
  const ageOnOct1 = (birthDate, targetYear) => (globalThis.NeprasEgypt?.ageOnOct1 || neprasEgypt.ageOnOct1 || (() => ({ years: 0, months: 0, days: 0, formatted: '0 سنة و 0 شهر و 0 يوم', shortFormatted: '0س 0ش', text: '0 سنة و 0 شهر و 0 يوم' })))(birthDate, targetYear);
  const academicYearStart = () => (globalThis.NeprasEgypt?.academicYearStart || neprasEgypt.academicYearStart || (() => (new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1)))();
  const academicYearLabel = () => (globalThis.NeprasEgypt?.academicYearLabel || neprasEgypt.academicYearLabel || (() => `${academicYearStart()} / ${academicYearStart() + 1}`))();
  const newcomersOct1Year = () => (globalThis.NeprasEgypt?.newcomersOct1Year || neprasEgypt.newcomersOct1Year || (() => academicYearStart() + (new Date().getMonth() < 7 ? 1 : 0)))();
  const safeTodayStamp = () => (typeof globalThis.NeprasEgypt?.todayStamp === 'function' ? globalThis.NeprasEgypt.todayStamp() : new Date().toISOString().slice(0, 10));

  const NeprasEgypt = new Proxy(neprasEgypt, {
    get(target, prop) {
      if (globalThis.NeprasEgypt && prop in globalThis.NeprasEgypt) {
        return globalThis.NeprasEgypt[prop];
      }
      if (prop === 'todayStamp') return safeTodayStamp;
      return target[prop];
    }
  });

  // السن في 1 أكتوبر. بلا سنة صريحة ← 1 أكتوبر بداية العام الدراسي (أغسطس)؛ كشف 41 مستجدين يمرّر newcomersOct1Year() صراحةً.
  function calculateAgeOnOct1(birthDate, targetYear) {
    return ageOnOct1(birthDate, targetYear == null ? academicYearStart() : targetYear);
  }

  function cleanText(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function evaluateBMI(weightKg, heightCm) {
    const w = parseFloat(weightKg);
    const h = parseFloat(heightCm);
    if (!w || !h || h <= 0) return { bmi: '', category: '', evaluation: '' };

    const heightM = h / 100;
    const bmi = parseFloat((w / (heightM * heightM)).toFixed(1));
    let category = '';

    if (bmi < 16.0) category = 'نحافة شديدة';
    else if (bmi < 18.5) category = 'نحافة';
    else if (bmi < 25.0) category = 'طبيعي';
    else if (bmi < 30.0) category = 'زيادة وزن';
    else if (bmi < 35.0) category = 'سمنة';
    else category = 'سمنة مفرطة';

    return { bmi, category, evaluation: category };
  }

  function evaluateAnemia(hbVal) {
    const hb = parseFloat(hbVal);
    if (!hb || isNaN(hb)) return { hb: '', category: '', referral: '', isAnemic: false };

    let category = '';
    let referral = 'لا';

    if (hb >= 11.5) {
      category = 'سليم';
    } else if (hb >= 11.0) {
      category = 'أنيميا بسيطة';
    } else if (hb >= 8.0) {
      category = 'أنيميا متوسطة';
      referral = 'نعم (تحويل)';
    } else {
      category = 'أنيميا حادة';
      referral = 'نعم (تحويل عاجل)';
    }

    return { hb, category, referral, isAnemic: category !== 'سليم' };
  }

  // -------------------------------------------------------------
  // 3. استخراج بيانات المدرسة وسياق الترويسة المعتمدة
  // -------------------------------------------------------------
  function getPageSchoolInfo() {
    let school = 'المدرسة';

    let sharedSchool = '';
    try {
      if (typeof getSchoolNameFromPage === 'function') {
        const fromPage = cleanText(getSchoolNameFromPage());
        if (fromPage && fromPage !== 'المدرسة') sharedSchool = fromPage;
      }
    } catch (_) {}

    if (typeof document !== 'undefined') {
      const headers = Array.from(document.querySelectorAll('h1, h2, h3, .breadcrumb, header, .school-name, #schoolName'));
      for (const h of headers) {
        const txt = cleanText(h.innerText);
        if (txt.includes('مدرسة') && !sharedSchool) {
          school = txt.replace(/^.*مدرسة\s*/i, 'مدرسة ').split(/[-–|]/)[0].trim();
        }
      }
    }
    if (sharedSchool) school = sharedSchool;

    return { school, academicYear: academicYearLabel() };
  }

  const BLANK = '................';

  function sharedClassLists() {
    const shared = window.NeprasClassLists;
    if (!shared || ['collectSchoolContext', 'schoolInfoLines', 'groupStudentRecords'].some(k => typeof shared[k] !== 'function')) {
      throw new Error('وحدة قوائم الفصول غير محمّلة. حدّث الصفحة وأعد المحاولة.');
    }
    return shared;
  }

  async function loadSchoolContext(students) {
    const shared = sharedClassLists();
    reportStatus('جاري قراءة بيانات المحافظة والإدارة والمديرية...');
    const page = getPageSchoolInfo();
    const found = await shared.collectSchoolContext(
      (students || []).map(st => ({ 'الرقم القومي': st.national_id })),
      () => { if (isAborted()) throw new Error('تم إلغاء العملية.'); }
    );
    return {
      ...found,
      school: found.school || page.school,
      academicYear: found.academicYear || page.academicYear
    };
  }

  // أسطر ترويسة الكشف: أربعة أسطر للمدرسة، وسطر أخير بالعام الدراسي وبيان الكشف (عدد الطلاب أو الصفحة).
  function reportInfoLines(ctx, detail) {
    return [...sharedClassLists().schoolInfoLines(ctx), `العام الدراسي: ${ctx.academicYear} — ${detail}`, 'نبراس برو 2026'];
  }

  // -------------------------------------------------------------
  // 4. محرك جلب بيانات الطلاب عالي الدقة (Unified Student Data Engine)
  // -------------------------------------------------------------
  // صف من API الوزارة ← سجل طالب موحّد. gradeText: اسم الصف حين لا يحمله الصف نفسه.
  // الديانة الرسمية فقط (مسلم/مسيحي/أخرى)؛ «غير مسجّل» تُترك فارغة في السجل بدل تخمينها.
  function officialReligion(row) {
    try {
      const v = globalThis.NeprasEgypt && globalThis.NeprasEgypt.resolveReligion ? globalThis.NeprasEgypt.resolveReligion(row) : '';
      if (v && v !== 'غير مسجّل') return v;
    } catch (_) {}
    const direct = cleanText(row?.['الديانة'] || row?.religion || row?.__neprasApiRaw?.religion || '');
    return direct && direct !== 'غير مسجّل' ? direct : '';
  }

  function resolveStudentMerge(r, raw) {
    const obsIdRaw = raw?.obstacleId ?? raw?.disabilityId ?? r?.obstacleId ?? r?.disabilityId ?? '';
    const obsId = Number(obsIdRaw);
    const hasObsId = Number.isFinite(obsId) && obsId > 0;

    const directText = cleanText(
      r?.['الموقف من الدمج'] ||
      r?.['نوع الدمج'] ||
      r?.['حالة الدمج'] ||
      r?.['حاله الدمج'] ||
      r?.['الدمج'] ||
      r?.damg ||
      r?.integrationType ||
      raw?.obstacleName ||
      raw?.disabilityName ||
      r?.merge_type ||
      raw?.mergeType ||
      r?.merge_status ||
      raw?.mergeStatus ||
      ''
    );

    const negatives = /^(لا يوجد|لايوجد|غير مدمج|ليس مدمج|ليس من طلاب الدمج|لا ينطبق|بدون دمج|لا|0|false|غير موجود|—|-)$/i;
    const isPosText = Boolean(directText && !negatives.test(directText));
    const isFlag = Boolean(
      r?.is_merged ||
      r?.integrated === 'نعم' ||
      r?.integrated === true ||
      r?.__neprasStatsIntegrated === 'نعم' ||
      raw?.isIntegrated === true ||
      raw?.isIntegrated === 1 ||
      raw?.isIntegrated === 'true'
    );

    const isMerged = Boolean(hasObsId || isPosText || isFlag);
    let mergeType = isPosText ? directText : (cleanText(raw?.obstacleName || raw?.disabilityName || r?.damg || r?.integrationType || r?.merge_type || raw?.mergeType || ''));
    if (isMerged && (!mergeType || /^(نعم|دمج|1|true|—|-)$/i.test(mergeType))) {
      mergeType = 'دمج تعليمي';
    }

    const mergeDecision = cleanText(
      r?.merge_decision ||
      raw?.mergeDecision ||
      raw?.decisionNumber ||
      (isMerged ? 'قرار وزاري رقم 252 لسنة 2017' : '')
    );

    return { isMerged, mergeType, mergeDecision };
  }

  function resolveStudentSocialAndExemption(r, raw) {
    const fatherStatus = cleanText(
      raw?.fatherStatus ||
      raw?.fatherStatusName ||
      r?.fatherStatus ||
      r?.['حالة الأب'] ||
      r?.['حالة الاب'] ||
      r?.['الاب'] ||
      ''
    );
    const rawExemptionText = cleanText(
      r?.exemptionType ||
      r?.exemptionLabel ||
      r?.social_status ||
      r?.['الحالة الاجتماعية'] ||
      r?.['تصنيف الإعفاء'] ||
      r?.['نوع الإعفاء'] ||
      raw?.socialStatus ||
      raw?.socialStatusName ||
      raw?.exemptionType ||
      raw?.exemptionName ||
      raw?.excName ||
      ''
    );
    const cleanExemptionText = /^(—|-|لا يوجد|بدون|غير معفى|none)$/i.test(rawExemptionText) ? '' : rawExemptionText;
    const isOrphan = Boolean(
      r?.is_orphan ||
      raw?.isOrphan ||
      /متوف/.test(fatherStatus) ||
      /يتيم|يتامي|ايتام|أيتام/.test(cleanExemptionText)
    );

    let socialStatus = cleanExemptionText;
    if (!socialStatus && isOrphan) {
      socialStatus = 'يتيم الأب';
    }

    const exemptionDoc = cleanText(
      r?.exemption_doc ||
      raw?.exemptionDoc ||
      raw?.researchNumber ||
      r?.['رقم البحث'] ||
      r?.['المستند'] ||
      (r?.exemptionPercent != null && Number(r.exemptionPercent) > 0 ? `إعفاء ${Number(r.exemptionPercent)}%` : '') ||
      ''
    );

    const excClass = String(r?.exemptionClass || raw?.exemptionClass || '').trim().toLowerCase();
    const hasOfficialExemptionClass = excClass === 'full' || excClass === 'partial';
    const excKeywords = /تكافل|كرامة|كرامه|معفى|معفاة|معفاه|إعفاء|اعفاء|تخفيض|ضمان|بحث اجتماعي|شهداء|مطلقة|مطلقه|معيلة|معيله|مهجورة|مهجوره|رعاية|رعايه|أيتام|ايتام|يتيم|يتامي|أبناء العاملين|ابناء العاملين/;
    const isExempt = Boolean(isOrphan || hasOfficialExemptionClass || excKeywords.test(socialStatus) || exemptionDoc);

    return { isOrphan, socialStatus, exemptionDoc, isExempt };
  }

  function studentFromApiRow(r, gradeText, index) {
    const raw = (r && r.__neprasApiRaw) || {};
    const nid = cleanDigits(r?.['الرقم القومي'] || r?.nationalId || r?.national_id || r?.nid || raw.nationalId);
    const parsedNid = parseNationalId(nid);
    const studyTypeRaw = cleanText(r?.['نوعية التعليم'] || r?.['نوع التعليم'] || r?.['نظام التعليم'] || r?.eduSystem || r?.studyType || r?.study_type || r?.mode || raw.studyTypeName || '');
    const statusRaw = cleanText(r?.['حالة القيد'] || r?.['حالة قيد الطالب'] || r?.enrollStatus || r?.status || raw.status || '');
    const isManazel = studyTypeRaw.includes('منازل') || studyTypeRaw.includes('منزل');
    const isWorker = studyTypeRaw.includes('عمال') || studyTypeRaw.includes('عمل') || statusRaw.includes('عمال');
    const gradeName = cleanText(
      r?.['الصف'] ||
      r?.['الصف الدراسي'] ||
      r?.grade ||
      r?.gradeName ||
      r?.__neprasGrade ||
      raw.gradeName ||
      gradeText ||
      raw.className ||
      ''
    );
    const rawClassCandidate = cleanText(
      r?.['الفصل'] ||
      r?.['الفصل الدراسي'] ||
      r?.class_name ||
      r?.classRoom ||
      r?.class ||
      r?.classNumber ||
      r?.class_number ||
      raw.classNumber ||
      (r?.className && r.className !== gradeName ? r.className : '') ||
      ''
    );
    const classNum = rawClassCandidate && rawClassCandidate !== 'عام' ? rawClassCandidate : '';
    const className = classNum ? (classNum.includes('فصل') ? classNum : `فصل ${classNum}`) : 'عام';

    const mergeInfo = resolveStudentMerge(r, raw);
    const socialInfo = resolveStudentSocialAndExemption(r, raw);

    return {
      index,
      name: cleanText(r?.['اسم التلميذ'] || r?.['اسم الطالب'] || r?.['الاسم بالكامل'] || r?.fullName || r?.name || raw.studentName),
      code: cleanDigits(r?.['كود التلميذ'] || r?.['كود الطالب'] || r?.studentCode || r?.code || raw.studentCode),
      national_id: nid,
      grade: gradeName,
      class_name: className,
      class_number: classNum,
      // لا قيم مُختلَقة: النوع من الحقل الرسمي ثم الرقم القومي، والديانة وحالة القيد ونوعية التعليم من الحقول الرسمية فقط
      gender: cleanText(r?.['النوع'] || r?.gender || (parsedNid ? parsedNid.gender : '')),
      religion: officialReligion(r),
      status: statusRaw,
      study_type: studyTypeRaw,
      is_manazel: isManazel,
      is_worker: isWorker,
      phone: cleanDigits(r?.mobile || r?.phone || r?.['رقم المحمول'] || r?.['رقم التليفون'] || raw.phone || raw.mobile || raw.guardianMobile || ''),
      dob: parsedNid ? parsedNid.birthDateFormatted : cleanText(r?.dob || r?.['تاريخ الميلاد'] || raw.birthDate || ''),
      gov: parsedNid ? parsedNid.governorate : cleanText(r?.birthGov || r?.['محافظة الميلاد'] || raw.governorate || r?.gov || ''),
      is_merged: mergeInfo.isMerged,
      merge_type: mergeInfo.mergeType,
      merge_decision: mergeInfo.mergeDecision,
      is_orphan: socialInfo.isOrphan,
      social_status: socialInfo.socialStatus,
      exemption_doc: socialInfo.exemptionDoc,
      is_exempt: socialInfo.isExempt,
      guardian: cleanText(r?.guardian || r?.guardianName || r?.fatherFullName || r?.fatherName || r?.['اسم الوالد'] || raw.guardianName || ''),
      guardian_job: cleanText(r?.guardian_job || raw.guardianJob || ''),
      address: cleanText(r?.address || r?.['العنوان'] || raw.address || ''),
      nationality: cleanText(r?.nationality || r?.['الجنسية'] || raw.nationality || '')
    };
  }

  // تجميع موحّد حسب الصف والفصل عبر NeprasClassLists.groupStudentRecords (ترتيب الفصول رقميًا 1، 2، ...10، وترتيب الطلاب أبجديًا بنين ثم بنات).
  function groupStudentsByClass(list, sortMode = 'gender_boys') {
    const shared = sharedClassLists();
    const rawGroups = shared.groupStudentRecords(list, sortMode);
    return rawGroups.map((g, idx) => {
      const hasClass = g.classNo && g.classNo !== shared.NO_CLASS;
      const classTitle = hasClass ? `فصل ${g.classNo}` : shared.NO_CLASS;
      const groupName = g.gradeText ? `${g.gradeText} - ${classTitle}` : classTitle;
      const ord = g.ordinal || (idx + 1);
      const shortBase = hasClass
        ? `فصل ${ord}-${g.classNo}`
        : (g.gradeText ? `${g.gradeText.replace(/^الصف\s+/u, '')} - عام` : `مجموعة ${idx + 1}`);
      return {
        ...g,
        ordinal: ord,
        groupName,
        shortBase,
        shortSheetName(pageNum = 1, totalPages = 1) {
          const suffix = totalPages > 1 ? ` ص${pageNum}` : '';
          const cleanBase = String(shortBase).replace(/[/\\?*:[\]]/g, '-').trim();
          const maxBase = Math.max(1, 31 - suffix.length);
          return `${cleanBase.slice(0, maxBase)}${suffix}`;
        }
      };
    });
  }

  // المرحلة التي اختارها المستخدم في نافذة نبراس (تُحفظ في التخزين وتُقرأ عبر export.js). فارغة إن لم يختر.
  async function selectedStage() {
    try {
      return typeof neprasLoadSelectedStage === 'function' ? String((await neprasLoadSelectedStage()) || '') : '';
    } catch (_) {
      return '';
    }
  }

  async function fetchAllSchoolStudents() {
    const students = [];
    let apiTried = false;
    let stage = '';

    // قراءة السجل الشامل المحفوظ (neprasCachedStudentsList) وتحليل الإعفاءات والمصروفات (neprasExpensesAnalysisV1)
    // لإثراء كل طالب بالديانة والدمج والإعفاءات والبيانات التفصيلية دون أي قيم افتراضية
    const deepByKey = new Map();
    const expByKey = new Map();
    let cachedList = Array.isArray(window?.neprasCachedStudentsList) ? window.neprasCachedStudentsList : [];
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(['neprasCachedStudentsList', 'neprasExpensesAnalysisV1']);
        if (Array.isArray(stored?.neprasCachedStudentsList) && stored.neprasCachedStudentsList.length) {
          cachedList = stored.neprasCachedStudentsList;
        }
        const expRows = Array.isArray(stored?.neprasExpensesAnalysisV1?.rows) ? stored.neprasExpensesAnalysisV1.rows : [];
        for (const er of expRows) {
          if (!er || typeof er !== 'object') continue;
          const ec = cleanDigits(er.code || er.studentCode || er['كود التلميذ'] || '');
          const en = cleanDigits(er.nationalId || er['الرقم القومي'] || '');
          if (ec) expByKey.set(`c:${ec}`, er);
          if (en) expByKey.set(`n:${en}`, er);
        }
      }
    } catch (_) {}

    for (const st of cachedList) {
      if (!st || typeof st !== 'object') continue;
      const sc = cleanDigits(st.studentCode || st.code || st['كود التلميذ'] || st['كود الطالب'] || '');
      const sn = cleanDigits(st.nationalId || st.nid || st['الرقم القومي'] || '');
      if (sc) deepByKey.set(`c:${sc}`, st);
      if (sn) deepByKey.set(`n:${sn}`, st);
    }

    const enrichStudentRow = (r) => {
      if (!r || typeof r !== 'object') return r;
      const rc = cleanDigits(r['كود التلميذ'] || r['كود الطالب'] || r.studentCode || r.code || r.__neprasApiRaw?.studentCode || '');
      const rn = cleanDigits(r['الرقم القومي'] || r.nationalId || r.national_id || r.nid || r.__neprasApiRaw?.nationalId || '');
      const deepMatch = (rc && deepByKey.get(`c:${rc}`)) || (rn && deepByKey.get(`n:${rn}`)) || null;
      const expMatch = (rc && expByKey.get(`c:${rc}`)) || (rn && expByKey.get(`n:${rn}`)) || null;
      if (!deepMatch && !expMatch) return r;
      return {
        ...(deepMatch || {}),
        ...(expMatch ? {
          exemptionType: expMatch.exemptionType || expMatch.exemptionLabel || '',
          exemptionClass: expMatch.exemptionClass || '',
          exemptionPercent: expMatch.exemptionPercent,
          paid: expMatch.paid,
          financeStatus: expMatch.financeStatus || ''
        } : {}),
        ...r
      };
    };

    // 1. API الوزارة (أسرع وأدق). المصدر نفسه الذي تستعمله «إحصاء المدرسة» و«قوائم الفصول»:
    //    خطة صفوف المرحلة المختارة (أو قائمة الصف الظاهرة في الصفحة إن لم تُختر مرحلة) + جلب ثابت بإعادة المحاولة.
    //    فشل أي صف يوقف العملية باسم الصف بدل أن يُنتج كشفًا ناقصًا بصمت.
    if (typeof window.neprasApiTryRowsForGrade === 'function' && typeof neprasStatsFetchStageRows === 'function') {
      apiTried = true;
      stage = await selectedStage();
      let perGrade = [];
      try {
        perGrade = await neprasStatsFetchStageRows(stage, {
          onGrade: (g) => reportStatus(`جاري تنزيل بيانات طلاب ${g.text}...`)
        });
      } catch (err) {
        const msg = String((err && err.message) || err || '');
        if ((err && err.code === 'USER_STOPPED') || msg.includes('USER_STOPPED')) throw new Error('تم إلغاء العملية.');
        if (msg !== 'GRADE_PLAN_EMPTY' && !cachedList.length) throw err; // خطة فارغة أو توفر السجل الشامل: ننتقل للبديل
      }
      for (const { grade, rows } of perGrade) {
        rows.forEach((r) => students.push(studentFromApiRow(enrichStudentRow(r), grade.text, students.length + 1)));
      }
    }

    // 2. إذا لم ترجع الـ API أي طلاب، نعتمد أولاً على السجل الشامل المحفوظ (neprasCachedStudentsList) لأنه أدق وأغنى من جدول الصفحة الجزئي
    if (!students.length && cachedList.length) {
      cachedList.forEach((st) => {
        const enriched = enrichStudentRow(st);
        students.push(studentFromApiRow(enriched, enriched.grade || enriched['الصف'] || enriched.className || '', students.length + 1));
      });
    }

    // 3. إذا لم تتوفر بيانات في السجل الشامل، نقوم بمسح جدول الصفحة الحالي بدون اختلاق بيانات افتراضية
    if (!students.length && typeof document !== 'undefined') {
      reportStatus('جاري قراءة الجداول المعروضة في الصفحة...');
      const rows = document.querySelectorAll('table tbody tr');
      rows.forEach((tr, idx) => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 3) return;
        const rowText = tr.innerText || '';
        if (rowText.includes('لا توجد بيانات') || rowText.includes('المجموع')) return;

        let name = '', code = '', nationalId = '', className = '', grade = '', status = '', phone = '';

        cells.forEach(td => {
          const text = cleanText(td.innerText);
          const digits = cleanDigits(text);
          if (/^[23]\d{13}$/.test(digits)) nationalId = digits;
          else if (/^\d{5,9}$/.test(digits) && !code) code = digits;
          else if (text.length > 8 && !name && !/\d/.test(text)) name = text;
          else if (text.includes('فصل') || text.includes('1/') || text.includes('2/') || text.includes('3/')) className = text;
          else if (text.includes('صف') || text.includes('ابتدائي') || text.includes('إعدادي') || text.includes('ثانوي')) grade = text;
          else if (text.includes('مستجد') || text.includes('منقول') || text.includes('مقيد') || text.includes('باق') || text.includes('راسب')) status = text;
          else if (/^01[0125]\d{8}$/.test(digits)) phone = digits;
        });

        if (name || code || nationalId) {
          const enriched = enrichStudentRow({
            name: name || `طالب ${idx + 1}`,
            code: code || '',
            nationalId: nationalId || '',
            grade: grade || '',
            classRoom: className || '',
            enrollStatus: status || '',
            eduSystem: rowText.includes('منازل') ? 'منازل' : (rowText.includes('خدمات') ? 'خدمات' : (rowText.includes('عمال') ? 'عمال' : '')),
            phone: phone || ''
          });
          students.push(studentFromApiRow(enriched, grade || '', students.length + 1));
        }
      });
    }

    if (!students.length && apiTried) {
      throw new Error(!stage
        ? 'اختر المرحلة التعليمية من نافذة نبراس أولًا ثم أعد المحاولة.'
        : 'لم يتم العثور على طلاب في المرحلة المختارة. تأكد من اختيار المرحلة الصحيحة وتسجيل الدخول لموقع الوزارة.');
    }

    return students;
  }

  // -------------------------------------------------------------
  // 5. تسليم ملفات إكسيل السجلات والكشوف
  // -------------------------------------------------------------
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async function deliverNeprasBinary(arrayBuffer, defaultFilename, subfolder = '') {
    const safeFilename = String(defaultFilename).replace(/[/\\:*?"<>|]/g, '_');
    const dialog = (typeof window !== 'undefined' && window.neprasDialog) || (typeof globalThis !== 'undefined' && globalThis.neprasDialog);
    if (dialog?.triggerDownload) {
      const blob = typeof Blob !== 'undefined' ? new Blob([arrayBuffer], { type: XLSX_MIME }) : arrayBuffer;
      return dialog.triggerDownload(blob, safeFilename, {
        folder: subfolder,
        title: 'تم إنشاء ملف Excel بنجاح',
        message: 'تم حفظ الملف بنجاح.'
      });
    }
    if (typeof document === 'undefined') {
      return { finalFileName: safeFilename, downloadId: null, method: 'mock' };
    }
    const blob = new Blob([arrayBuffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = safeFilename; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    return { finalFileName: safeFilename, downloadId: null, method: 'anchor' };
  }

  async function deliverNeprasWorkbook(sheetSpecs, defaultFilename, subfolder = '') {
    if (typeof window.neprasStudentBuildMultiSheetXlsx !== 'function') {
      throw new Error('محرك إنشاء إكسيل نبراس غير متوفر في الصفحة.');
    }

    const arrayBuffer = window.neprasStudentBuildMultiSheetXlsx(sheetSpecs);
    return deliverNeprasBinary(arrayBuffer, defaultFilename, subfolder);
  }

  // -------------------------------------------------------------
  // 5.1 محرك قوالب إكسيل المخصصة ونظام النماذج الخام (Custom Templates)
  // -------------------------------------------------------------
  const TEMPLATE_DEFINITIONS = {
    behavior: {
      key: 'behavior',
      name: 'سجل 5 سلوك ومواظبة',
      filename: 'قالب_سجل_5_سلوك_ومواظبة.xlsx',
      folder: 'سجل 5 سلوك',
      title: 'سجل تقييم درجات السلوك والمواظبة (وفق القرار الوزاري لائحة الانضباط المدرسي)',
      headers: ['م', 'كود الطالب', 'اسم الطالب رباعياً', 'الديانة', 'حالة القيد', 'السلوك (3 درجات)', 'المواظبة (درجتان)', 'إجمالي السلوك (5 درجات)', 'تقييم الشهر الأول', 'تقييم الشهر الثاني', 'المجموع الكلي', 'ملاحظات الأخصائي'],
      sampleRow: [1, '1234567', 'اسم الطالب التجريبي', 'مسلم', 'مقيد', 3, 2, 5, '', '', '', '']
    },
    anemia: {
      key: 'anemia',
      name: 'كشوف فحص مبادرة 100 مليون صحة',
      filename: 'قالب_كشوف_فحص_الأنيميا_والتقزم.xlsx',
      folder: 'الصحة المدرسية',
      title: 'كشف فحص مبادرة الصحة المدرسية (الأنيميا والتقزم والسمنة للتأمين الصحي)',
      headers: ['م', 'اسم الطالب رباعياً', 'الرقم القومي (14 رقم)', 'كود الطالب', 'الصف / الفصل', 'تاريخ الميلاد', 'السن (1 أكتوبر)', 'النوع', 'تليفون ولي الأمر', 'الطول (سم)', 'الوزن (كجم)', 'الهيموجلوبين (Hb)', 'مؤشر الكتلة (BMI)', 'التصنيف', 'تحويل للتأمين'],
      sampleRow: [1, 'اسم الطالب التجريبي', '31201011234567', '1234567', '{{الصف_والفصل}}', '2012-01-01', '12 سنة و 9 شهور', 'ذكر', '01012345678', '', '', '', '', '', '']
    },
    grades: {
      key: 'grades',
      name: 'سجل الدرجات والتقييمات الأسبوعية',
      filename: 'قالب_سجل_الدرجات_الأسبوعية.xlsx',
      folder: 'سجلات الفصول',
      title: 'سجل الدرجات والتقييمات الأسبوعية وكشكول الحصة',
      headers: ['م', 'كود الطالب', 'اسم الطالب رباعياً', 'تقييم أ1', 'واجب أ1', 'تقييم أ2', 'واجب أ2', 'تقييم أ3', 'واجب أ3', 'تقييم أ4', 'واجب أ4', 'المجموع الشهري', 'الملاحظات'],
      sampleRow: [1, '1234567', 'اسم الطالب التجريبي', '', '', '', '', '', '', '', '', '', '']
    },
    absence: {
      key: 'absence',
      name: 'سجل الغياب الأسبوعي للفصل',
      filename: 'قالب_سجل_الغياب_الأسبوعي.xlsx',
      folder: 'سجلات الفصول',
      title: 'سجل رصد الغياب الأسبوعي للفصل الدراسي',
      headers: ['م', 'كود الطالب', 'اسم الطالب رباعياً', 'الأحد (1)', 'الإثنين (1)', 'الثلاثاء (1)', 'الأربعاء (1)', 'الخميس (1)', 'الأحد (2)', 'الإثنين (2)', 'الثلاثاء (2)', 'الأربعاء (2)', 'الخميس (2)', 'الأحد (3)', 'الإثنين (3)', 'الثلاثاء (3)', 'الأربعاء (3)', 'الخميس (3)', 'الأحد (4)', 'الإثنين (4)', 'الثلاثاء (4)', 'الأربعاء (4)', 'الخميس (4)', 'إجمالي الغياب', 'ملاحظات'],
      sampleRow: [1, '1234567', 'اسم الطالب التجريبي', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '0', '']
    },
    summary: {
      key: 'summary',
      name: 'سجل أعمال السنة المجمع',
      filename: 'قالب_سجل_أعمال_السنة_المجمع.xlsx',
      folder: 'سجلات الفصول',
      title: 'سجل تقييم أعمال السنة والتقييم المجمع لطلاب الفصل',
      headers: ['م', 'كود الطالب', 'اسم الطالب رباعياً', 'الديانة', 'حالة القيد', 'المهام والأنشطة (10)', 'كشكول الحصة (10)', 'التقييم الأسبوعي (20)', 'اختبار الشهر الأول (10)', 'اختبار الشهر الثاني (10)', 'السلوك والمواظبة (5)', 'إجمالي أعمال السنة (65)', 'الملاحظات'],
      sampleRow: [1, '1234567', 'اسم الطالب التجريبي', 'مسلم', 'مقيد', '', '', '', '', '', '5', '', '']
    },
    twocol: {
      key: 'twocol',
      name: 'قوائم الفصول (نظام العمودين المزدوج)',
      filename: 'قالب_قوائم_الفصول_نظام_العمودين.xlsx',
      folder: 'قوائم الفصول',
      title: 'قوائم فصول المدرسة (نظام العمودين المزدوج الموفر للورق)',
      headers: ['م (1)', 'كود الطالب', 'اسم الطالب', 'الديانة', 'حالة القيد', '│', 'م (2)', 'كود الطالب', 'اسم الطالب', 'الديانة', 'حالة القيد'],
      sampleRow: [1, '1234567', 'طالب رقم 1', 'مسلم', 'مقيد', '│', 2, '1234568', 'طالب رقم 2', 'مسلم', 'مقيد']
    },
    newcomers_41: {
      key: 'newcomers_41',
      name: 'كشف 41 مستجدين لشؤون الطلاب',
      filename: 'قالب_كشف_41_مستجدين.xlsx',
      folder: 'سجلات القيد',
      title: 'كشف 41 مستجدين المعتمد لشؤون الطلاب والكنترول',
      headers: ['م', 'كود الطالب', 'اسم الطالب رباعياً', 'الرقم القومي', 'تاريخ الميلاد', 'السن (1 أكتوبر)', 'النوع', 'الديانة', 'الجنسية', 'الصف الدراسي', 'الفصل', 'حالة القيد', 'ملاحظات'],
      sampleRow: [1, '1234567', 'اسم الطالب المستجد', '31201011234567', '2018-01-01', '6 سنوات و 9 شهور', 'ذكر', 'مسلم', 'مصري', 'الصف الأول الابتدائي', 'فصل 1/1', 'مستجد', '']
    },
    enrollment: {
      key: 'enrollment',
      name: 'سجل القيد الشامل لجميع الطلاب',
      filename: 'قالب_سجل_القيد_الشامل.xlsx',
      folder: 'سجلات القيد',
      title: 'سجل القيد الشامل لجميع طلاب المدرسة المقيدين',
      headers: ['م', 'كود الطالب', 'اسم الطالب', 'الرقم القومي', 'تاريخ الميلاد', 'السن في 1 أكتوبر', 'النوع', 'الديانة', 'الصف الدراسي', 'الفصل', 'حالة القيد', 'نوع التعليم', 'المحافظة'],
      sampleRow: [1, '1234567', 'اسم الطالب المقيد', '31201011234567', '2015-05-15', '9 سنوات و 4 شهور', 'ذكر', 'مسلم', 'الصف الرابع', 'فصل 1', 'مقيد', 'رسمي عربي', 'الجيزة']
    }
  };

  async function getCustomTemplate(templateKey) {
    return new Promise(resolve => {
      chrome.storage.local.get([`nepras_tpl_${templateKey}`], res => {
        resolve(res?.[`nepras_tpl_${templateKey}`] || null);
      });
    });
  }

  function getXLSXLib() {
    if (typeof XLSX !== 'undefined' && XLSX) return XLSX;
    if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
    if (typeof globalThis !== 'undefined' && globalThis.XLSX) return globalThis.XLSX;
    return null;
  }

  async function ensureXLSXLib() {
    if (getXLSXLib()) return getXLSXLib();
    try { if (typeof neprasEnsureLib === 'function') await neprasEnsureLib('xlsx'); } catch (_) {}
    return getXLSXLib();
  }

  async function resetCustomTemplate(templateKey) {
    return new Promise(resolve => {
      chrome.storage.local.remove([`nepras_tpl_${templateKey}`], () => resolve({ ok: true }));
    });
  }

  async function downloadBlankTemplate(templateKey) {
    const tpl = TEMPLATE_DEFINITIONS[templateKey];
    if (!tpl) throw new Error('تعريف القالب غير معروف: ' + templateKey);

    const headers = tpl.headers;
    const sampleRows = [
      tpl.sampleRow,
      tpl.sampleRow.map((v, i) => i === 0 ? 2 : (typeof v === 'string' && v.includes('1') ? v.replace('1', '2') : v)),
      tpl.sampleRow.map((v, i) => i === 0 ? 3 : (typeof v === 'string' && v.includes('1') ? v.replace('1', '3') : v))
    ];

    const sheetSpecs = [{
      name: 'النموذج المعتمد',
      title: tpl.title,
      infoLines: [
        `المحافظة: {{المحافظة}} — المديرية: {{المديرية}} — الإدارة: {{الإدارة}}`,
        `المدرسة: {{المدرسة}} — العام الدراسي: {{العام_الدراسي}}`,
        `الصف / الفصل: {{الصف_والفصل}} — تاريخ الطباعة: {{التاريخ}}`,
        `💡 ملاحظة هامة: هذا نموذج إكسيل خام مخصص للتعديل. يمكنك تغيير التنسيقات والألوان والأعمدة وإضافة شعار المدرسة بحرية تامة على Microsoft Excel، ثم رفع الملف عبر زر "اعتماد قالبك المخصص" ليستخدمه نبراس تلقائياً!`
      ],
      headers,
      rows: sampleRows,
      recordCount: sampleRows.length,
      countLabel: 'بيانات تجريبية إرشادية',
      printFit: true
    }];

    await deliverNeprasWorkbook(sheetSpecs, tpl.filename, 'قوالب_السجلات');
    return { ok: true, filename: tpl.filename };
  }

  // ---- مشترك بين محرّكي الملء: المحافظ على التنسيق (template_fill.js) والاحتياطي (SheetJS) ----

  function templateHeaderField(raw) {
    const val = cleanText(raw || '');
    if (!val) return '';
    if (/اسم/i.test(val) && !/مدرسة/i.test(val)) return 'name';
    if (/كود/i.test(val)) return 'code';
    if (/قومي|رقم_قومي|الرقم القومي/i.test(val)) return 'national_id';
    if (/تاريخ.*ميلاد|ميلاد/i.test(val)) return 'dob';
    if (/السن|سن/i.test(val)) return 'age';
    if (/نوع|النوع|جنس/i.test(val)) return 'gender';
    if (/ديانة|الديانة/i.test(val)) return 'religion';
    if (/فصل|صف/i.test(val)) return 'class';
    if (/حالة.*قيد|قيد/i.test(val)) return 'status';
    if (/هاتف|تليفون|موبايل/i.test(val)) return 'phone';
    if (val === 'م' || val === 'مسلسل') return 'serial';
    if (/سلوك/i.test(val)) return 'behavior';
    if (/مواظبة/i.test(val)) return 'attendance';
    return '';
  }

  function templateStudentValues(st, idx, groupName, reportKey) {
    const parsed = parseNationalId(st.national_id);
    const age = parsed ? calculateAgeOnOct1(parsed.birthDate, reportKey === 'newcomers_41' ? newcomersOct1Year() : undefined) : null;
    return {
      serial: idx + 1,
      code: st.code || '',
      name: st.name || '',
      national_id: st.national_id || '',
      dob: st.dob || (parsed ? parsed.birthDateFormatted : ''),
      age: age ? age.text : '',
      gender: st.gender || (parsed ? parsed.gender : ''),
      religion: st.religion || '',
      class: groupName,
      status: st.status || 'مقيد',
      phone: st.phone || '',
      behavior: 3,
      attendance: 2
    };
  }

  function templateReplacer(ctx, groupName, groupStudents) {
    const today = new Date().toLocaleDateString('ar-EG');
    const rules = [
      [/\{\{\s*(المدرسة|مدرسة|school)\s*\}\}/gi, ctx.school],
      [/\{\{\s*(الإدارة|إدارة|administration)\s*\}\}/gi, ctx.administration || BLANK],
      [/\{\{\s*(المديرية|مديرية|directorate)\s*\}\}/gi, ctx.directorate || BLANK],
      [/\{\{\s*(المحافظة|محافظة|governorate)\s*\}\}/gi, ctx.governorate || BLANK],
      [/\{\{\s*(العام_الدراسي|عام_دراسي|academic_year)\s*\}\}/gi, ctx.academicYear],
      [/\{\{\s*(الصف|grade)\s*\}\}/gi, groupStudents[0]?.grade || ''],
      [/\{\{\s*(الفصل|class)\s*\}\}/gi, groupStudents[0]?.class_name || groupName],
      [/\{\{\s*(الصف_والفصل|صف_وفصل)\s*\}\}/gi, groupName],
      [/\{\{\s*(التاريخ|تاريخ|date)\s*\}\}/gi, today],
      [/\{\{\s*(عدد_الطلاب|كثافة_الفصل|count)\s*\}\}/gi, String(groupStudents.length)]
    ];
    return (text) => {
      const hadAdministration = /\{\{\s*(الإدارة|إدارة|administration)\s*\}\}/i.test(text);
      let out = text;
      for (const [re, value] of rules) out = out.replace(re, () => String(value ?? ''));
      if (hadAdministration) out = out.replace(/(التعليمية)(\s+التعليمية)+/g, '$1');
      return out;
    };
  }

  async function fillCustomTemplateOoxml(templateBase64, groups, reportKey, ctx) {
    if (!globalThis.NeprasTemplateFill) {
      const e = new Error('محرك قوالب المحافظة على التنسيق غير محمّل');
      e.code = 'TEMPLATE_UNSUPPORTED'; e.reason = 'modules/template_fill.js غير محمّل';
      throw e;
    }
    const bytes = Uint8Array.from(atob(templateBase64), (ch) => ch.charCodeAt(0));
    const sheets = Object.entries(groups).map(([groupName, students]) => ({
      name: groupName,
      replace: templateReplacer(ctx, groupName, students),
      rows: students.map((st, idx) => templateStudentValues(st, idx, groupName, reportKey))
    }));
    return globalThis.NeprasTemplateFill.fill(bytes, sheets, { headerFieldOf: templateHeaderField });
  }

  function fillCustomTemplateBasic(templateBase64, groups, reportKey, ctx) {
    const xlsx = getXLSXLib();
    if (!xlsx) {
      throw new Error('مكتبة XLSX غير متوفرة في الصفحة لمعالجة القالب المخصص.');
    }

    const tplWb = xlsx.read(templateBase64, { type: 'base64', cellStyles: true });
    if (!tplWb.SheetNames || !tplWb.SheetNames.length) {
      throw new Error('القالب المخصص لا يحتوي على أوراق عمل صالحة.');
    }

    const srcWs = tplWb.Sheets[tplWb.SheetNames[0]];
    const newWb = xlsx.utils.book_new();
    const groupEntries = Object.entries(groups);
    const usedNames = new Set();

    function cloneWorksheet(sheet) {
      const copy = {};
      for (const k in sheet) {
        if (k.startsWith('!')) {
          if (Array.isArray(sheet[k])) {
            copy[k] = JSON.parse(JSON.stringify(sheet[k]));
          } else if (typeof sheet[k] === 'object' && sheet[k] !== null) {
            copy[k] = { ...sheet[k] };
          } else {
            copy[k] = sheet[k];
          }
        } else {
          copy[k] = { ...sheet[k] };
        }
      }
      return copy;
    }

    for (let gIdx = 0; gIdx < groupEntries.length; gIdx++) {
      const [groupName, groupStudents] = groupEntries[gIdx];
      const ws = cloneWorksheet(srcWs);
      const replace = templateReplacer(ctx, groupName, groupStudents);

      for (const cellAddr in ws) {
        if (cellAddr.startsWith('!')) continue;
        const cell = ws[cellAddr];
        if (cell && typeof cell.v === 'string') {
          cell.v = replace(cell.v);
          if (cell.w) delete cell.w;
        }
      }

      const range = xlsx.utils.decode_range(ws['!ref'] || 'A1:Z50');
      let headerRow = -1;
      const colMap = {};

      for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
        let matches = 0;
        const tempMap = {};
        for (let c = range.s.c; c <= range.e.c; c++) {
          const field = templateHeaderField(ws[xlsx.utils.encode_cell({ r, c })]?.v);
          if (field) { tempMap[c] = field; matches++; }
        }
        if (matches >= 2) {
          headerRow = r;
          Object.assign(colMap, tempMap);
          break;
        }
      }

      const startRow = headerRow >= 0 ? headerRow + 1 : 6;
      const columns = Object.keys(colMap).length
        ? Object.entries(colMap).map(([c, field]) => [parseInt(c, 10), field])
        : ['serial', 'code', 'name', 'national_id'].map((field, c) => [c, field]);
      groupStudents.forEach((st, idx) => {
        const values = templateStudentValues(st, idx, groupName, reportKey);
        for (const [c, field] of columns) {
          const v = values[field];
          ws[xlsx.utils.encode_cell({ r: startRow + idx, c })] = { t: typeof v === 'number' ? 'n' : 's', v };
        }
      });

      const endRow = Math.max(range.e.r, startRow + groupStudents.length + 5);
      const endCol = Math.max(range.e.c, 15);
      ws['!ref'] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: endRow, c: endCol } });

      let safeName = groupName.replace(/[/\\:*?"<>|[\]]/g, ' ').substring(0, 31).trim() || `ورقة ${gIdx + 1}`;
      let counter = 2;
      while (usedNames.has(safeName)) {
        const suf = ` (${counter++})`;
        safeName = `${safeName.slice(0, 31 - suf.length)}${suf}`;
      }
      usedNames.add(safeName);
      xlsx.utils.book_append_sheet(newWb, ws, safeName);
    }

    return xlsx.write(newWb, { bookType: 'xlsx', type: 'array' });
  }

  async function warnTemplateFormattingLost(reason) {
    const text = `تعذّر الحفاظ على تنسيق قالبك (${reason}).\nسيُنزَّل الملف بقيم القالب وعرض الأعمدة والدمج فقط، بلا الألوان والخطوط والحدود.\nجرّب حفظ القالب من Excel بصيغة xlsx عادية بلا مخططات، وإن تكرر فأبلغنا بالسبب أعلاه.`;
    reportStatus('⚠️ تعذّر الحفاظ على تنسيق قالبك — سيُصدَّر الملف بلا تنسيقه.');
    try { if (window.neprasDialog?.warning) await window.neprasDialog.warning(text, { title: 'تعذّر الحفاظ على تنسيق القالب' }); } catch (_) {}
  }

  async function fillCustomTemplate(templateBase64, groups, reportKey, ctx) {
    try {
      return await fillCustomTemplateOoxml(templateBase64, groups, reportKey, ctx);
    } catch (err) {
      try { console.error('[Nepras Records] تعذّر ملء القالب مع الحفاظ على تنسيقه:', err); } catch (_) {}
      await warnTemplateFormattingLost((err && (err.reason || err.message)) || 'سبب غير معروف');
      await ensureXLSXLib();
      return fillCustomTemplateBasic(templateBase64, groups, reportKey, ctx);
    }
  }

  // -------------------------------------------------------------
  // دالة مساعدة لترميز أعمدة الإكسيل (A, B, C ... AA, AB ...)
  // -------------------------------------------------------------
  function colLetter(c) {
    let s = '';
    c++;
    while (c > 0) {
      const m = (c - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      c = Math.floor((c - m) / 26);
    }
    return s;
  }

  // إضافة صف توقيعات معتمد أسفل أوراق العمل المصممة (الصحة المدرسية والغياب الشهري)
  function appendCustomSheetSignatures(ws, merges, startRow, totalCols, signers) {
    if (!Array.isArray(signers) || !signers.length) return startRow - 1;
    const sigRow = startRow + 1;
    const span = Math.max(1, Math.floor(totalCols / signers.length));
    const sigStyle = { font: { sz: 11, bold: true, color: { rgb: '1E3A8A' } }, fill: { fgColor: { rgb: 'F8FAFC' } }, alignment: { horizontal: 'center' } };
    const dotRow = sigRow + 1;
    const dotStyle = { font: { sz: 10, bold: true }, alignment: { horizontal: 'center' } };

    signers.forEach((label, idx) => {
      const sc = idx * span;
      const ec = idx === signers.length - 1 ? totalCols - 1 : Math.min(totalCols - 1, sc + span - 1);
      ws[`${colLetter(sc)}${sigRow}`] = { v: label, s: sigStyle };
      ws[`${colLetter(sc)}${dotRow}`] = { v: 'التوقيع: ............................', s: dotStyle };
      if (ec > sc) {
        merges.push({ s: { r: sigRow - 1, c: sc }, e: { r: sigRow - 1, c: ec } });
        merges.push({ s: { r: dotRow - 1, c: sc }, e: { r: dotRow - 1, c: ec } });
      }
    });
    return dotRow;
  }

  // -------------------------------------------------------------
  // باني 1: كشف مسح مبادرة 100 مليون صحة للتأمين الصحي
  // 15 عموداً، مقسم للفصول (35 طالباً بالصفحة للطباعة المريحة على ورقة A4 أفقية واحدة)
  // -------------------------------------------------------------
  const HEALTH_PAGE_SIZE = 35;

  function build100MillionSurveySheet(groupStudents, groupName, schoolCtx, pageNum = 1, totalPages = 1, pageSize = HEALTH_PAGE_SIZE) {
    const ws = {};
    const merges = [];
    const widths = [6, 28, 10, 18, 14, 10, 8, 8, 14, 12, 12, 10, 10, 14, 16];
    ws['!cols'] = widths.map(w => ({ wch: w }));
    ws['!rows'] = [{ hpt: 26 }, { hpt: 24 }, { hpt: 22 }, { hpt: 26 }, { hpt: 26 }];
    ws['!repeatRows'] = '1:5';
    ws['!orientation'] = 'landscape';

    // الترويسة ثلاثية المناطق
    ws['A1'] = { v: 'الهيئة العامة للتأمين الصحى', s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'right' } } };
    ws['D1'] = { v: 'كشف مسح مبادرة 100 مليون صحة للكشف عن الأنيميا والسمنة والتقزم', s: { font: { sz: 14, bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'center' } } };
    merges.push({ s: { r: 0, c: 3 }, e: { r: 0, c: 11 } });
    ws['O1'] = { v: `المدرسة: ${schoolCtx.school || ''}`, s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'left' } } };

    ws['A2'] = { v: `فرع / ${schoolCtx.governorate || BLANK} منطقه / ${schoolCtx.administration || BLANK}`, s: { font: { sz: 10, bold: true }, alignment: { horizontal: 'right' } } };
    ws['D2'] = { v: `الصف / الفصل: ${groupName} — العام الدراسي ${schoolCtx.academicYear || academicYearLabel()}م`, s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'center' } } };
    merges.push({ s: { r: 1, c: 3 }, e: { r: 1, c: 11 } });
    ws['O2'] = { v: 'تاريخ المسح: ..../..../202..', s: { font: { sz: 10, bold: true }, alignment: { horizontal: 'left' } } };

    ws['A3'] = { v: 'عيادة / .................', s: { font: { sz: 10, bold: true }, alignment: { horizontal: 'right' } } };
    ws['D3'] = { v: `صفحة ${pageNum} من ${totalPages} (إجمالي طلاب الكشف: ${groupStudents.length})`, s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'center' } } };
    merges.push({ s: { r: 2, c: 3 }, e: { r: 2, c: 11 } });
    ws['O3'] = { v: 'كود المدرسة: ...........', s: { font: { sz: 10, bold: true }, alignment: { horizontal: 'left' } } };

    const thStyle = { font: { color: { rgb: 'FFFFFF' }, bold: true }, fill: { fgColor: { rgb: '1E40AF' } }, alignment: { horizontal: 'center', wrapText: true } };

    // ترويسة الأعمدة المدمجة (الصف الرابع والخامس)
    ws['A4'] = { v: 'م', s: thStyle };
    merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } });
    ws['B4'] = { v: 'اسم التلميذ رباعيا', s: thStyle };
    merges.push({ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } });
    ws['C4'] = { v: 'الفصل', s: thStyle };
    merges.push({ s: { r: 3, c: 2 }, e: { r: 4, c: 2 } });
    ws['D4'] = { v: 'الرقم القومي', s: thStyle };
    merges.push({ s: { r: 3, c: 3 }, e: { r: 4, c: 3 } });
    ws['E4'] = { v: 'رقم ولى الامر', s: thStyle };
    merges.push({ s: { r: 3, c: 4 }, e: { r: 4, c: 4 } });

    ws['F4'] = { v: 'نتائج المسح', s: thStyle };
    merges.push({ s: { r: 3, c: 5 }, e: { r: 3, c: 7 } });
    ws['F5'] = { v: 'هيموجلوبين', s: thStyle };
    ws['G5'] = { v: 'طول', s: thStyle };
    ws['H5'] = { v: 'الكتلة', s: thStyle };

    ws['I4'] = { v: 'إدارة النظم', s: thStyle };
    merges.push({ s: { r: 3, c: 8 }, e: { r: 3, c: 12 } });
    ws['I5'] = { v: 'نتائج التسجيل\nسلبى / ايجابى', s: thStyle };
    ws['J5'] = { v: 'الاحالة للعيادة\nتاريخ الاحالة', s: thStyle };
    ws['K5'] = { v: 'الاحالة للعيادة\nزيارة سابقة', s: thStyle };
    ws['L5'] = { v: 'نتيجة الاحالة\nسلبى', s: thStyle };
    ws['M5'] = { v: 'نتيجة الاحالة\nايجابى', s: thStyle };

    ws['N4'] = { v: 'متابعة الزائرة', s: thStyle };
    merges.push({ s: { r: 3, c: 13 }, e: { r: 3, c: 14 } });
    ws['N5'] = { v: 'استلام نتيجة الاحالة', s: thStyle };
    ws['O5'] = { v: 'ملاحظات', s: thStyle };

    // صفوف الطلاب
    groupStudents.forEach((st, idx) => {
      const r = 6 + idx;
      ws[`A${r}`] = { v: (pageNum - 1) * pageSize + idx + 1, s: { alignment: { horizontal: 'center' } } };
      ws[`B${r}`] = { v: st.name || '', s: { alignment: { horizontal: 'right' } } };
      ws[`C${r}`] = { v: st.class_name || groupName || '', s: { alignment: { horizontal: 'center' } } };
      ws[`D${r}`] = { v: st.national_id || '', s: { alignment: { horizontal: 'center' } } };
      ws[`E${r}`] = { v: st.phone || '', s: { alignment: { horizontal: 'center' } } };
      for (let c = 5; c < 15; c++) {
        ws[`${colLetter(c)}${r}`] = { v: '', s: { alignment: { horizontal: 'center' } } };
      }
    });

    const dataEndRow = 5 + groupStudents.length;
    const finalRow = appendCustomSheetSignatures(ws, merges, dataEndRow + 1, 15, [
      'الزائرة الصحية / فريق التأمين الصحي',
      'مسئول شؤون الطلاب',
      'يعتمد / مدير المدرسة'
    ]);
    ws['!ref'] = `A1:O${finalRow}`;
    ws['!merges'] = merges;
    return ws;
  }

  // -------------------------------------------------------------
  // باني 2: سجل متابعة حالات الأنيميا والتقزم بالعيادة
  // 11 عموداً، مقسم للفصول (35 طالباً بالصفحة) وتوقيع ولي الأمر
  // -------------------------------------------------------------
  function buildHealthFollowupSheet(groupStudents, groupName, schoolCtx, pageNum = 1, totalPages = 1, pageSize = HEALTH_PAGE_SIZE) {
    const ws = {};
    const merges = [];
    const widths = [6, 28, 10, 18, 8, 8, 8, 8, 14, 14, 18];
    ws['!cols'] = widths.map(w => ({ wch: w }));
    ws['!rows'] = [{ hpt: 26 }, { hpt: 24 }, { hpt: 22 }, { hpt: 26 }, { hpt: 26 }];
    ws['!repeatRows'] = '1:5';
    ws['!orientation'] = 'landscape';

    // الترويسة
    ws['A1'] = { v: `${schoolCtx.governorate || 'المحافظة'}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };
    ws['D1'] = { v: `سجل متابعة حالات مبادرة الانيميا والتقزم والسمنة — ${groupName}`, s: { font: { sz: 13, bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'center' } } };
    merges.push({ s: { r: 0, c: 3 }, e: { r: 0, c: 9 } });
    ws['K1'] = { v: `العام الدراسي ${schoolCtx.academicYear || academicYearLabel()}`, s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'center' } } };

    ws['A2'] = { v: `${schoolCtx.administration || 'الإدارة التعليمية'}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };
    ws['K2'] = { v: `صفحة ${pageNum} من ${totalPages}`, s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'center' } } };

    ws['A3'] = { v: `${schoolCtx.school || 'المدرسة'}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };

    const thStyle = { font: { color: { rgb: 'FFFFFF' }, bold: true }, fill: { fgColor: { rgb: '1E40AF' } }, alignment: { horizontal: 'center' } };

    ws['A4'] = { v: 'م', s: thStyle };
    merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } });
    ws['B4'] = { v: 'اسم الطالب', s: thStyle };
    merges.push({ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } });
    ws['C4'] = { v: 'الفصل', s: thStyle };
    merges.push({ s: { r: 3, c: 2 }, e: { r: 4, c: 2 } });
    ws['D4'] = { v: 'الرقم القومى', s: thStyle };
    merges.push({ s: { r: 3, c: 3 }, e: { r: 4, c: 3 } });

    ws['E4'] = { v: 'نتيجة الكشف', s: thStyle };
    merges.push({ s: { r: 3, c: 4 }, e: { r: 3, c: 7 } });
    ws['E5'] = { v: 'HB', s: thStyle };
    ws['F5'] = { v: 'طول', s: thStyle };
    ws['G5'] = { v: 'وزن', s: thStyle };
    ws['H5'] = { v: 'الكتلة', s: thStyle };

    ws['I4'] = { v: 'تاريخ التحويل', s: thStyle };
    merges.push({ s: { r: 3, c: 8 }, e: { r: 4, c: 8 } });
    ws['J4'] = { v: 'الكشف بالعياده', s: thStyle };
    merges.push({ s: { r: 3, c: 9 }, e: { r: 4, c: 9 } });
    ws['K4'] = { v: 'توقيع ولى الأمر', s: thStyle };
    merges.push({ s: { r: 3, c: 10 }, e: { r: 4, c: 10 } });

    groupStudents.forEach((st, idx) => {
      const r = 6 + idx;
      ws[`A${r}`] = { v: (pageNum - 1) * pageSize + idx + 1, s: { alignment: { horizontal: 'center' } } };
      ws[`B${r}`] = { v: st.name || '', s: { alignment: { horizontal: 'right' } } };
      ws[`C${r}`] = { v: st.class_name || '', s: { alignment: { horizontal: 'center' } } };
      ws[`D${r}`] = { v: st.national_id || '', s: { alignment: { horizontal: 'center' } } };
      for (let c = 4; c < 11; c++) {
        ws[`${colLetter(c)}${r}`] = { v: '', s: { alignment: { horizontal: 'center' } } };
      }
    });

    const dataEndRow = 5 + groupStudents.length;
    const finalRow = appendCustomSheetSignatures(ws, merges, dataEndRow + 1, 11, [
      'الزائرة الصحية',
      'الأخصائي الاجتماعي',
      'يعتمد / مدير المدرسة'
    ]);
    ws['!ref'] = `A1:K${finalRow}`;
    ws['!merges'] = merges;
    return ws;
  }

  // -------------------------------------------------------------
  // باني 3: سجل الغياب والمواظبة الشهري 30 يوماً
  // 35 عموداً، الأيام والتواريخ الفعلية للشهر الحالي مع تظليل الجمعة والسبت
  // -------------------------------------------------------------
  function buildMonthlyAbsenceSheet(groupStudents, groupName, schoolCtx) {
    const ws = {};
    const merges = [];
    const widths = [6, 26, ...new Array(30).fill(4.5), 8, 7, 8];
    ws['!cols'] = widths.map(w => ({ wch: w }));
    ws['!rows'] = [{ hpt: 26 }, { hpt: 24 }, { hpt: 22 }, { hpt: 26 }, { hpt: 24 }];
    ws['!repeatRows'] = '1:5';
    ws['!orientation'] = 'landscape';

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthNameAr = now.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
    const arabicDayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    ws['A1'] = { v: `المحافظة: ${schoolCtx.governorate || BLANK}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };
    ws['E1'] = { v: 'سجل الغياب والمواظبة الشهري للفصل الدراسي', s: { font: { sz: 14, bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'center' } } };
    merges.push({ s: { r: 0, c: 4 }, e: { r: 0, c: 26 } });
    ws['AI1'] = { v: `العام الدراسي: ${schoolCtx.academicYear || academicYearLabel()}`, s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'left' } } };

    ws['A2'] = { v: `الإدارة: ${schoolCtx.administration || BLANK}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };
    ws['E2'] = { v: `الفصل: ${groupName} — شهر: ${monthNameAr} — إجمالي طلاب الفصل: ${groupStudents.length}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'center' } } };
    merges.push({ s: { r: 1, c: 4 }, e: { r: 1, c: 26 } });

    ws['A3'] = { v: `المدرسة: ${schoolCtx.school || BLANK}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };

    const thStyle = { font: { color: { rgb: 'FFFFFF' }, bold: true }, fill: { fgColor: { rgb: '1E40AF' } }, alignment: { horizontal: 'center' } };
    const thHighlight = { font: { color: { rgb: 'FFFFFF' }, bold: true }, fill: { fgColor: { rgb: '0D9488' } }, alignment: { horizontal: 'center' } };

    ws['A4'] = { v: 'م', s: thStyle };
    merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } });
    ws['B4'] = { v: 'الإســــم', s: thStyle };
    merges.push({ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } });

    const weekendColIndices = new Set();

    for (let i = 0; i < 30; i++) {
      const colIdx = 2 + i;
      const d = new Date(year, month, i + 1);
      const dayName = arabicDayNames[d.getDay()];
      const isWeekend = d.getDay() === 5 || d.getDay() === 6; // الجمعة والسبت
      if (isWeekend) weekendColIndices.add(colIdx);

      const cellRef = `${colLetter(colIdx)}4`;
      ws[cellRef] = {
        v: dayName,
        s: isWeekend
          ? { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'center' } }
          : thStyle
      };

      const numRef = `${colLetter(colIdx)}5`;
      ws[numRef] = {
        v: i + 1,
        s: {
          font: { color: { rgb: '991B1B' }, bold: true },
          fill: isWeekend ? { fgColor: { rgb: 'E2E8F0' } } : undefined,
          alignment: { horizontal: 'center' }
        }
      };
    }

    ws['AG4'] = { v: 'غياب بعذر', s: thStyle };
    merges.push({ s: { r: 3, c: 32 }, e: { r: 4, c: 32 } });
    ws['AH4'] = { v: 'بدون', s: thStyle };
    merges.push({ s: { r: 3, c: 33 }, e: { r: 4, c: 33 } });
    ws['AI4'] = { v: 'الإجمالى', s: thHighlight };
    merges.push({ s: { r: 3, c: 34 }, e: { r: 4, c: 34 } });

    groupStudents.forEach((st, idx) => {
      const r = 6 + idx;
      ws[`A${r}`] = { v: idx + 1, s: { alignment: { horizontal: 'center' } } };
      ws[`B${r}`] = { v: st.name || '', s: { alignment: { horizontal: 'right' } } };
      for (let i = 0; i < 30; i++) {
        const colIdx = 2 + i;
        const isWeekend = weekendColIndices.has(colIdx);
        ws[`${colLetter(colIdx)}${r}`] = {
          v: '',
          s: isWeekend ? { fill: { fgColor: { rgb: 'E2E8F0' } } } : undefined
        };
      }
      ws[`AG${r}`] = { v: '', s: { alignment: { horizontal: 'center' } } };
      ws[`AH${r}`] = { v: '', s: { alignment: { horizontal: 'center' } } };
      ws[`AI${r}`] = { v: 0, s: { font: { bold: true }, alignment: { horizontal: 'center' } } };
    });

    const dataEndRow = 5 + groupStudents.length;
    const finalRow = appendCustomSheetSignatures(ws, merges, dataEndRow + 1, 35, [
      'رائد الفصل',
      'مسئول شؤون الطلاب',
      'وكيل شؤون الطلاب',
      'يعتمد / مدير المدرسة'
    ]);
    ws['!ref'] = `A1:AI${finalRow}`;
    ws['!merges'] = merges;
    return ws;
  }

  // -------------------------------------------------------------
  // باني 4: بيان ميزانية المدرسة والكثافة 26 عموداً
  // -------------------------------------------------------------
  function buildSchoolBudgetStatsSheet(allStudents, schoolCtx) {
    const ws = {};
    const merges = [];
    const widths = [22, 10, ...new Array(24).fill(7)];
    ws['!cols'] = widths.map(w => ({ wch: w }));
    ws['!rows'] = [{ hpt: 32 }, { hpt: 24 }, { hpt: 22 }, { hpt: 28 }, { hpt: 26 }];
    ws['!repeatRows'] = '1:5';
    ws['!orientation'] = 'landscape';

    // الترويسة
    ws['A1'] = { v: `${schoolCtx.governorate || 'المحافظة'}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };
    ws['C1'] = { v: `بيان عام - احصاء ميزانية المدرسة للعام الدراسى ${schoolCtx.academicYear || academicYearLabel()}م`, s: { font: { sz: 15, bold: true }, fill: { fgColor: { rgb: 'BDD7EE' } }, alignment: { horizontal: 'center' } } };
    merges.push({ s: { r: 0, c: 2 }, e: { r: 0, c: 22 } });
    ws['Z1'] = { v: `العام الدراسي: ${schoolCtx.academicYear || academicYearLabel()}م`, s: { font: { sz: 11, bold: true }, alignment: { horizontal: 'center' } } };

    ws['A2'] = { v: `${schoolCtx.administration || 'الإدارة التعليمية'}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };
    ws['A3'] = { v: `${schoolCtx.school || 'المدرسة'}`, s: { font: { sz: 12, bold: true }, alignment: { horizontal: 'right' } } };

    const thStyle = { font: { color: { rgb: 'FFFFFF' }, bold: true }, fill: { fgColor: { rgb: '1E40AF' } }, alignment: { horizontal: 'center' } };
    const thSubStyle = { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'center' } };

    ws['A4'] = { v: 'الصف والفصل', s: thStyle };
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } });

    const categories = [
      { title: 'مستجد/منقول', col: 2 },
      { title: 'باق للإعادة', col: 5 },
      { title: 'منقطع', col: 8 },
      { title: 'مسلم', col: 11 },
      { title: 'مسيحى', col: 14 },
      { title: 'محول من المدرسة', col: 17 },
      { title: 'محول إلى المدرسة', col: 20 },
      { title: 'الإجمالى', col: 23 }
    ];

    categories.forEach(cat => {
      ws[`${colLetter(cat.col)}4`] = { v: cat.title, s: thStyle };
      merges.push({ s: { r: 3, c: cat.col }, e: { r: 3, c: cat.col + 2 } });
    });

    ws['A5'] = { v: 'الصف', s: thSubStyle };
    ws['B5'] = { v: 'عدد الفصول', s: thSubStyle };

    categories.forEach(cat => {
      ws[`${colLetter(cat.col)}5`] = { v: 'بنون', s: thSubStyle };
      ws[`${colLetter(cat.col + 1)}5`] = { v: 'بنات', s: thSubStyle };
      ws[`${colLetter(cat.col + 2)}5`] = { v: 'اجمالى', s: { ...thSubStyle, font: { bold: true, color: { rgb: '1E3A8A' } } } };
    });

    const gradeMap = new Map();
    (allStudents || []).forEach(s => {
      const gName = s.grade || 'الصف الأول';
      if (!gradeMap.has(gName)) {
        gradeMap.set(gName, {
          name: gName,
          classes: new Set(),
          new_trans: { boys: 0, girls: 0 },
          repeating: { boys: 0, girls: 0 },
          absent: { boys: 0, girls: 0 },
          muslim: { boys: 0, girls: 0 },
          christian: { boys: 0, girls: 0 },
          trans_from: { boys: 0, girls: 0 },
          trans_to: { boys: 0, girls: 0 },
          total: { boys: 0, girls: 0 }
        });
      }

      const g = gradeMap.get(gName);
      if (s.class_name && s.class_name !== 'عام') g.classes.add(s.class_name);

      const isFemale = s.gender === 'بنات' || s.gender === 'أنثى' || s.gender === 'انثى';
      const gKey = isFemale ? 'girls' : 'boys';

      g.total[gKey]++;

      const st = s.status || '';
      if (st.includes('باق') || st.includes('إعادة') || st.includes('معيد')) g.repeating[gKey]++;
      else if (st.includes('منقطع')) g.absent[gKey]++;
      else if (st.includes('محول من')) g.trans_from[gKey]++;
      else if (st.includes('محول إلى') || st.includes('محول')) g.trans_to[gKey]++;
      else g.new_trans[gKey]++;

      const rel = s.religion || '';
      if (rel.includes('مسيح')) g.christian[gKey]++;
      else if (rel.includes('مسلم')) g.muslim[gKey]++;
    });

    let currRow = 6;
    const kgGrades = [];
    const primaryGrades = [];

    for (const [name, g] of gradeMap.entries()) {
      if (name.includes('رياض') || name.includes('KG')) kgGrades.push(g);
      else primaryGrades.push(g);
    }

    function renderDataRow(label, data, isSummary = false, isGrand = false) {
      const r = currRow++;
      const style = isGrand
        ? { font: { bold: true, sz: 12, color: { rgb: '991B1B' } }, fill: { fgColor: { rgb: 'FEF3C7' } }, alignment: { horizontal: 'center' } }
        : isSummary
        ? { font: { bold: true, color: { rgb: '991B1B' } }, fill: { fgColor: { rgb: 'F8FAFC' } }, alignment: { horizontal: 'center' } }
        : { alignment: { horizontal: 'center' } };

      const labelStyle = { ...style, alignment: { horizontal: 'right' } };

      ws[`A${r}`] = { v: label, s: labelStyle };
      ws[`B${r}`] = { v: data.classesCount || '', s: style };

      const cats = ['new_trans', 'repeating', 'absent', 'muslim', 'christian', 'trans_from', 'trans_to', 'total'];
      cats.forEach((catKey, ci) => {
        const cBase = 2 + ci * 3;
        const bVal = data[catKey]?.boys || 0;
        const gVal = data[catKey]?.girls || 0;
        const totVal = bVal + gVal;

        ws[`${colLetter(cBase)}${r}`] = { v: bVal, s: style };
        ws[`${colLetter(cBase + 1)}${r}`] = { v: gVal, s: style };
        ws[`${colLetter(cBase + 2)}${r}`] = { v: totVal, s: { ...style, font: { bold: true } } };
      });
    }

    function sumGroup(gradesList) {
      const sum = {
        classesCount: 0,
        new_trans: { boys: 0, girls: 0 },
        repeating: { boys: 0, girls: 0 },
        absent: { boys: 0, girls: 0 },
        muslim: { boys: 0, girls: 0 },
        christian: { boys: 0, girls: 0 },
        trans_from: { boys: 0, girls: 0 },
        trans_to: { boys: 0, girls: 0 },
        total: { boys: 0, girls: 0 }
      };
      gradesList.forEach(g => {
        sum.classesCount += (g.classes?.size || 1);
        ['new_trans', 'repeating', 'absent', 'muslim', 'christian', 'trans_from', 'trans_to', 'total'].forEach(k => {
          sum[k].boys += (g[k]?.boys || 0);
          sum[k].girls += (g[k]?.girls || 0);
        });
      });
      return sum;
    }

    if (kgGrades.length > 0) {
      kgGrades.forEach(g => renderDataRow(g.name, { ...g, classesCount: g.classes.size || 1 }));
      renderDataRow('جملة رياض الأطفال', sumGroup(kgGrades), true);
    }

    if (primaryGrades.length > 0) {
      primaryGrades.forEach(g => renderDataRow(g.name, { ...g, classesCount: g.classes.size || 1 }));
      renderDataRow('جملة المرحلة', sumGroup(primaryGrades), true);
    }

    const allGrades = [...kgGrades, ...primaryGrades];
    renderDataRow('الإجمالي العام للمدرسة', sumGroup(allGrades), false, true);

    const dataEndRow = currRow - 1;
    const finalRow = appendCustomSheetSignatures(ws, merges, dataEndRow + 1, 26, [
      'مسئول الإحصاء وشؤون الطلاب',
      'وكيل شؤون الطلاب',
      'يعتمد / مدير المدرسة'
    ]);
    ws['!ref'] = `A1:Z${finalRow}`;
    ws['!merges'] = merges;
    return ws;
  }

  // -------------------------------------------------------------
  // 6. الوظائف التخصصية المدمجة (مقسمة للفصول وجاهزة للطباعة)
  // -------------------------------------------------------------

  // (1) كشف مسح مبادرة 100 مليون صحة للتأمين الصحي (مقسم للفصول، 35 طالباً بالصفحة)
  async function runAnemiaHealthExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('anemia', 'جاري تجهيز كشوف مسح مبادرة 100 مليون صحة (التأمين الصحي)...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة. تأكد من تسجيل الدخول لموقع الوزارة.');

      const ctx = await loadSchoolContext(list);
      const classGroups = groupStudentsByClass(list, sortMode);
      const pageSize = HEALTH_PAGE_SIZE;

      // فحص وجود قالب مخصص معتمد
      const customTpl = await getCustomTemplate('anemia');
      if (customTpl && customTpl.base64) {
        reportStatus(`🎨 جاري التصدير باستخدام قالبك المخصص (${customTpl.name})...`);
        const groups = {};
        classGroups.forEach(g => { groups[g.shortSheetName(1, 1)] = g.students; });
        const arrayBuffer = await fillCustomTemplate(customTpl.base64, groups, 'anemia', ctx);
        const filename = `كشف_مسح_100_مليون_صحة_مخصص_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(arrayBuffer, filename, 'الصحة المدرسية');
        reportStatus(`✅ تم تصدير كشوف الصحة المدرسية بنجاح بقالبك المخصص (${list.length} طالب في ${classGroups.length} فصل).`);
        return { ok: true, count: list.length, classesCount: classGroups.length, custom: true, filename };
      }

      if (typeof window.neprasXlsxConvertWorkbookToStyledPackage === 'function') {
        const wb = { SheetNames: [], Sheets: {} };
        for (const group of classGroups) {
          if (isAborted()) break;
          const groupStudents = group.students;
          const totalPages = Math.ceil(groupStudents.length / pageSize) || 1;
          for (let p = 0; p < totalPages; p++) {
            const pageStudents = groupStudents.slice(p * pageSize, (p + 1) * pageSize);
            const sheetName = group.shortSheetName(p + 1, totalPages);
            const ws = build100MillionSurveySheet(pageStudents, group.groupName, ctx, p + 1, totalPages, pageSize);
            wb.SheetNames.push(sheetName);
            wb.Sheets[sheetName] = ws;
          }
        }
        if (isAborted()) throw new Error('تم إلغاء العملية.');
        const bytes = window.neprasXlsxConvertWorkbookToStyledPackage(wb);
        const filename = `كشف_مسح_100_مليون_صحة_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(bytes.buffer, filename, 'الصحة المدرسية');
        reportStatus(`✅ تم تصدير كشوف مسح 100 مليون صحة المعتمدة بنجاح (${list.length} طالب مقسمين على ${classGroups.length} فصل).`);
        return { ok: true, count: list.length, classesCount: classGroups.length, filename };
      }

      // مسار احتياطي قياسي عبر sheetSpecs
      const sheetSpecs = [];
      for (const group of classGroups) {
        if (isAborted()) break;
        const groupStudents = group.students;
        const totalPages = Math.ceil(groupStudents.length / pageSize) || 1;
        for (let p = 0; p < totalPages; p++) {
          const pageStudents = groupStudents.slice(p * pageSize, (p + 1) * pageSize);
          const headers = [
            'م', 'اسم التلميذ رباعيا', 'الفصل', 'الرقم القومي', 'رقم ولى الامر',
            'هيموجلوبين', 'طول', 'الكتلة', 'نتائج التسجيل سلبى/ايجابى', 'تاريخ الاحالة',
            'زيارة سابقة', 'نتيجة الاحالة سلبى', 'نتيجة الاحالة ايجابى', 'استلام نتيجة الاحالة', 'ملاحظات'
          ];
          const rows = pageStudents.map((st, idx) => [
            p * pageSize + idx + 1,
            st.name,
            st.class_name || group.groupName,
            st.national_id || '',
            st.phone || '',
            '', '', '', '', '', '', '', '', '', ''
          ]);
          const pageSuffix = totalPages > 1 ? ` (ص ${p + 1} من ${totalPages})` : '';
          sheetSpecs.push({
            name: group.shortSheetName(p + 1, totalPages),
            title: `كشف مسح مبادرة 100 مليون صحة — ${group.groupName}${pageSuffix}`,
            infoLines: reportInfoLines(ctx, `الصفحة: ${p + 1} من ${totalPages} — عدد المقيدين بالصفحة: ${pageStudents.length} طالباً`),
            headers,
            rows,
            recordCount: pageStudents.length,
            countLabel: 'إجمالي المقيدين بالصفحة',
            printFit: true,
            orientation: 'landscape',
            repeatRows: '1:4',
            footerSigners: ['الزائرة الصحية / التأمين الصحي', 'مسئول شؤون الطلاب', 'يعتمد / مدير المدرسة']
          });
        }
      }
      if (isAborted()) throw new Error('تم إلغاء العملية.');
      const filename = `كشف_مسح_100_مليون_صحة_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'الصحة المدرسية');
      reportStatus(`✅ تم تصدير كشوف مسح 100 مليون صحة بنجاح (${list.length} طالب مقسمين على ${classGroups.length} فصل).`);
      return { ok: true, count: list.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (1.2) كشف فحص عيوب الإبصار (مبادرة عيون أطفالنا مستقبلنا للتأمين الصحي)
  async function runEyesHealthExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('eyes', 'جاري تجهيز كشوف فحص عيوب الإبصار (مبادرة عيون أطفالنا مستقبلنا)...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة. تأكد من تسجيل الدخول لموقع الوزارة.');

      const ctx = await loadSchoolContext(list);
      if (globalThis.NeprasHealthRecords?.buildHealthRecordsWorkbook) {
        reportStatus('🩺 جاري ملء القالب الرسمي المعتمد للتأمين الصحي...');
        const wb = await globalThis.NeprasHealthRecords.buildHealthRecordsWorkbook(list, {
          schoolName: ctx.school,
          administration: ctx.administration,
          academicYear: ctx.academicYear
        }, { mode: 'EYES' });
        const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const filename = `كشوف_فحص_الإبصار_عيون_أطفالنا_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(arrayBuffer, filename, 'الصحة المدرسية');
        reportStatus(`✅ تم تصدير كشوف فحص الإبصار بنجاح (${list.length} طالب).`);
        return { ok: true, count: list.length, filename };
      }
      throw new Error('وحدة سجلات الصحة غير متوفرة.');
    } catch (err) {
      reportFailure(err);
      throw err;
    } finally {
      clearRunning();
    }
  }

  // (1.1) سجل متابعة حالات الأنيميا والتقزم بالعيادة وتوقيع ولي الأمر (مقسم للفصول، 35 طالباً بالصفحة)
  async function runHealthFollowupExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('health_followup', 'جاري تجهيز سجل متابعة العيادة وتوقيع ولي الأمر...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const ctx = await loadSchoolContext(list);
      const classGroups = groupStudentsByClass(list, sortMode);
      const pageSize = HEALTH_PAGE_SIZE;

      if (typeof window.neprasXlsxConvertWorkbookToStyledPackage === 'function') {
        const wb = { SheetNames: [], Sheets: {} };
        for (const group of classGroups) {
          if (isAborted()) break;
          const groupStudents = group.students;
          const totalPages = Math.ceil(groupStudents.length / pageSize) || 1;
          for (let p = 0; p < totalPages; p++) {
            const pageStudents = groupStudents.slice(p * pageSize, (p + 1) * pageSize);
            const sheetName = group.shortSheetName(p + 1, totalPages);
            const ws = buildHealthFollowupSheet(pageStudents, group.groupName, ctx, p + 1, totalPages, pageSize);
            wb.SheetNames.push(sheetName);
            wb.Sheets[sheetName] = ws;
          }
        }
        if (isAborted()) throw new Error('تم إلغاء العملية.');
        const bytes = window.neprasXlsxConvertWorkbookToStyledPackage(wb);
        const filename = `سجل_متابعة_حالات_الأنيميا_والتقزم_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(bytes.buffer, filename, 'الصحة المدرسية');
        reportStatus(`✅ تم تصدير سجل متابعة العيادة وتوقيع ولي الأمر بنجاح (${list.length} طالب في ${classGroups.length} فصل).`);
        return { ok: true, count: list.length, classesCount: classGroups.length, filename };
      }

      // مسار احتياطي
      const sheetSpecs = [];
      for (const group of classGroups) {
        if (isAborted()) break;
        const groupStudents = group.students;
        const totalPages = Math.ceil(groupStudents.length / pageSize) || 1;
        for (let p = 0; p < totalPages; p++) {
          const pageStudents = groupStudents.slice(p * pageSize, (p + 1) * pageSize);
          const headers = ['م', 'اسم الطالب', 'الفصل', 'الرقم القومى', 'HB', 'طول', 'وزن', 'الكتلة', 'تاريخ التحويل', 'الكشف بالعياده', 'توقيع ولى الأمر'];
          const rows = pageStudents.map((st, idx) => [
            p * pageSize + idx + 1,
            st.name,
            st.class_name || group.groupName,
            st.national_id || '',
            '', '', '', '', '', '', ''
          ]);
          sheetSpecs.push({
            name: group.shortSheetName(p + 1, totalPages),
            title: `سجل متابعة حالات الأنيميا والتقزم والسمنة — ${group.groupName}`,
            infoLines: reportInfoLines(ctx, `صفحة ${p + 1} من ${totalPages} — عدد طلاب الصفحة: ${pageStudents.length}`),
            headers,
            rows,
            recordCount: pageStudents.length,
            countLabel: 'إجمالي طلاب الصفحة',
            printFit: true,
            orientation: 'landscape',
            repeatRows: '1:4',
            footerSigners: ['الزائرة الصحية', 'الأخصائي الاجتماعي', 'يعتمد / مدير المدرسة']
          });
        }
      }
      if (isAborted()) throw new Error('تم إلغاء العملية.');
      const filename = `سجل_متابعة_حالات_الأنيميا_والتقزم_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'الصحة المدرسية');
      reportStatus(`✅ تم تصدير سجل متابعة العيادة بنجاح (${list.length} طالب في ${classGroups.length} فصل).`);
      return { ok: true, count: list.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (1.2) سجل الغياب والمواظبة الشهري 30 يوماً (مقسم للفصول)
  async function runMonthlyAbsenceExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('monthly_absence', 'جاري إنشاء سجل الغياب والمواظبة الشهري (30 يوماً)...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const ctx = await loadSchoolContext(list);
      const classGroups = groupStudentsByClass(list, sortMode);

      if (typeof window.neprasXlsxConvertWorkbookToStyledPackage === 'function') {
        const wb = { SheetNames: [], Sheets: {} };
        for (const group of classGroups) {
          if (isAborted()) break;
          const sheetName = group.shortSheetName(1, 1);
          const ws = buildMonthlyAbsenceSheet(group.students, group.groupName, ctx);
          wb.SheetNames.push(sheetName);
          wb.Sheets[sheetName] = ws;
        }
        if (isAborted()) throw new Error('تم إلغاء العملية.');
        const bytes = window.neprasXlsxConvertWorkbookToStyledPackage(wb);
        const filename = `سجل_الغياب_والمواظبة_الشهري_30_يوما_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(bytes.buffer, filename, 'سجلات الفصول');
        reportStatus(`✅ تم تصدير سجل الغياب والمواظبة الشهري بنجاح (${list.length} طالب في ${classGroups.length} فصل).`);
        return { ok: true, count: list.length, classesCount: classGroups.length, filename };
      }

      // مسار احتياطي قياسي
      const dayHeaders = Array.from({ length: 30 }, (_, i) => `${i + 1}`);
      const headers = ['م', 'اسم الطالب', ...dayHeaders, 'غياب بعذر', 'بدون عذر', 'الإجمالي'];
      const sheetSpecs = classGroups.map((group) => ({
        name: group.shortSheetName(1, 1),
        title: `سجل الغياب والمواظبة الشهري — ${group.groupName}`,
        infoLines: reportInfoLines(ctx, `عدد طلاب الفصل: ${group.students.length} طالباً`),
        headers,
        rows: group.students.map((st, idx) => [idx + 1, st.name, ...new Array(30).fill(''), '', '', '0']),
        recordCount: group.students.length,
        countLabel: 'إجمالي طلاب الفصل',
        printFit: true,
        orientation: 'landscape',
        repeatRows: '1:4',
        footerSigners: ['رائد الفصل', 'مسئول شؤون الطلاب', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
      }));
      if (isAborted()) throw new Error('تم إلغاء العملية.');
      const filename = `سجل_الغياب_والمواظبة_الشهري_30_يوما_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'سجلات الفصول');
      reportStatus(`✅ تم تصدير سجل الغياب والمواظبة الشهري بنجاح (${list.length} طالب في ${classGroups.length} فصل).`);
      return { ok: true, count: list.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (1.3) بيان عام - احصاء ميزانية المدرسة والكثافة للعام الدراسي
  async function runSchoolBudgetStatsExport(passedStudents = null) {
    setRunning('school_budget', 'جاري إنشاء بيان ميزانية المدرسة والكثافة...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const ctx = await loadSchoolContext(list);
      if (typeof window.neprasXlsxConvertWorkbookToStyledPackage === 'function') {
        const wb = { SheetNames: [], Sheets: {} };
        const sheetName = 'ميزانية_المدرسة_والكثافة';
        const ws = buildSchoolBudgetStatsSheet(list, ctx);
        wb.SheetNames.push(sheetName);
        wb.Sheets[sheetName] = ws;
        const bytes = window.neprasXlsxConvertWorkbookToStyledPackage(wb);
        const filename = `بيان_عام_احصاء_ميزانية_المدرسة_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(bytes.buffer, filename, 'سجلات القيد');
        reportStatus(`✅ تم تصدير بيان ميزانية المدرسة والكثافة بنجاح (${list.length} طالب).`);
        return { ok: true, count: list.length, filename };
      }

      throw new Error('محرك تنسيق جدول الميزانية غير متوفر في الصفحة.');
    } finally {
      clearRunning();
    }
  }

  // (2) سجل 5 سلوك ومواظبة (مقسم للفصول ومرتب للطباعة المباشرة)
  async function runBehaviorRegisterExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('behavior', 'جاري إنشاء سجل 5 سلوك ومواظبة مقسماً حسب الفصول...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const ctx = await loadSchoolContext(list);
      const classGroups = groupStudentsByClass(list, sortMode);
      const sheetSpecs = [];

      // فحص وجود قالب مخصص معتمد
      const customTpl = await getCustomTemplate('behavior');
      if (customTpl && customTpl.base64) {
        reportStatus(`🎨 جاري التصدير باستخدام قالبك المخصص (${customTpl.name})...`);
        const groups = {};
        classGroups.forEach(g => { groups[g.shortSheetName(1, 1)] = g.students; });
        const arrayBuffer = await fillCustomTemplate(customTpl.base64, groups, 'behavior', ctx);
        const filename = `سجل_5_سلوك_ومواظبة_مخصص_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(arrayBuffer, filename, 'سجل 5 سلوك');
        reportStatus(`✅ تم إنشاء سجل 5 سلوك ومواظبة بنجاح بقالبك المخصص (${list.length} طالب في ${classGroups.length} فصل).`);
        return { ok: true, count: list.length, classesCount: classGroups.length, custom: true, filename };
      }

      for (const group of classGroups) {
        if (isAborted()) break;
        const groupStudents = group.students;

        const headers = [
          'م', 'كود الطالب', 'اسم الطالب رباعياً', 'النوع', 'الديانة', 'حالة القيد',
          'السلوك (3 درجات)', 'المواظبة (درجتان)', 'إجمالي السلوك (5 درجات)',
          'تقييم الشهر الأول', 'تقييم الشهر الثاني', 'المجموع الكلي', 'ملاحظات الأخصائي'
        ];

        const rows = groupStudents.map((st, idx) => [
          idx + 1,
          st.code || '',
          st.name,
          st.gender || '',
          st.religion || '',
          st.status || 'مقيد',
          3, 2, 5, // الدرجات الافتراضية الكاملة
          '', '', '', ''
        ]);

        sheetSpecs.push({
          name: group.shortSheetName(1, 1),
          title: `سجل (5) سلوك ومواظبة (لائحة الانضباط المدرسي) — ${group.groupName}`,
          infoLines: reportInfoLines(ctx, `الفصل: ${group.groupName} — إجمالي طلاب الفصل: ${groupStudents.length} طالباً وطالبة`),
          headers,
          rows,
          recordCount: groupStudents.length,
          countLabel: 'إجمالي طلاب الفصل',
          printFit: true,
          orientation: 'landscape',
          repeatRows: '1:4',
          numericCols: [0, 6, 7, 8],
          footerSigners: ['الأخصائي الاجتماعي / رائد الفصل', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
        });
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `سجل_5_سلوك_ومواظبة_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'سجل 5 سلوك');
      reportStatus(`✅ تم إنشاء سجل 5 سلوك ومواظبة بنجاح (${list.length} طالب مقسمين على ${classGroups.length} فصل).`);
      return { ok: true, count: list.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (3) سجلات الفصول الثلاثة (الدرجات، الغياب الأسبوعي، أعمال السنة - مقسمة للفصول)
  async function runClassRegistersExport(registerType = 'grades', passedStudents = null, sortMode = 'gender_boys') {
    const titles = {
      grades: 'سجل الدرجات والتقييمات الأسبوعية',
      absence: 'سجل الغياب الأسبوعي للفصل',
      summary: 'سجل أعمال السنة والتقييم المجمع'
    };
    const title = titles[registerType] || titles.grades;
    setRunning('class_registers', `جاري إنشاء ${title} مقسماً للفصول...`);

    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const ctx = await loadSchoolContext(list);
      const classGroups = groupStudentsByClass(list, sortMode);
      const sheetSpecs = [];

      // فحص وجود قالب مخصص معتمد
      const customTpl = await getCustomTemplate(registerType);
      if (customTpl && customTpl.base64) {
        reportStatus(`🎨 جاري التصدير باستخدام قالبك المخصص (${customTpl.name})...`);
        const groups = {};
        classGroups.forEach(g => { groups[g.shortSheetName(1, 1)] = g.students; });
        const arrayBuffer = await fillCustomTemplate(customTpl.base64, groups, registerType, ctx);
        const filename = `${title.replace(/\s+/g, '_')}_مخصص_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(arrayBuffer, filename, 'سجلات الفصول');
        reportStatus(`✅ تم إنشاء ${title} بنجاح بقالبك المخصص (${list.length} طالب في ${classGroups.length} فصل).`);
        return { ok: true, count: list.length, classesCount: classGroups.length, custom: true, filename };
      }

      for (const group of classGroups) {
        if (isAborted()) break;
        const groupStudents = group.students;

        let headers = [];
        let rows = [];

        if (registerType === 'absence') {
          headers = [
            'م', 'كود الطالب', 'اسم الطالب',
            'الأحد (1)', 'الإثنين (1)', 'الثلاثاء (1)', 'الأربعاء (1)', 'الخميس (1)',
            'الأحد (2)', 'الإثنين (2)', 'الثلاثاء (2)', 'الأربعاء (2)', 'الخميس (2)',
            'الأحد (3)', 'الإثنين (3)', 'الثلاثاء (3)', 'الأربعاء (3)', 'الخميس (3)',
            'الأحد (4)', 'الإثنين (4)', 'الثلاثاء (4)', 'الأربعاء (4)', 'الخميس (4)',
            'إجمالي الغياب', 'ملاحظات'
          ];
          rows = groupStudents.map((st, idx) => [
            idx + 1, st.code, st.name,
            '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '0', ''
          ]);
        } else if (registerType === 'summary') {
          headers = [
            'م', 'كود الطالب', 'اسم الطالب', 'الديانة', 'حالة القيد',
            'المهام والأنشطة (10)', 'كشكول الحصة (10)', 'التقييم الأسبوعي (20)',
            'اختبار الشهر الأول (10)', 'اختبار الشهر الثاني (10)', 'السلوك والمواظبة (5)',
            'إجمالي أعمال السنة', 'الملاحظات'
          ];
          rows = groupStudents.map((st, idx) => [
            idx + 1, st.code, st.name, st.religion || '', st.status || 'مقيد',
            '', '', '', '', '', '5', '', ''
          ]);
        } else {
          // درجات أسبوعية
          headers = [
            'م', 'كود الطالب', 'اسم الطالب',
            'تقييم أ1', 'واجب أ1', 'تقييم أ2', 'واجب أ2',
            'تقييم أ3', 'واجب أ3', 'تقييم أ4', 'واجب أ4',
            'المجموع الشهري', 'الملاحظات'
          ];
          rows = groupStudents.map((st, idx) => [
            idx + 1, st.code, st.name,
            '', '', '', '', '', '', '', '', '', ''
          ]);
        }

        sheetSpecs.push({
          name: group.shortSheetName(1, 1),
          title: `${title} — ${group.groupName}`,
          infoLines: reportInfoLines(ctx, `الفصل: ${group.groupName} — عدد طلاب الفصل: ${groupStudents.length} طالباً`),
          headers,
          rows,
          recordCount: groupStudents.length,
          countLabel: 'إجمالي طلاب الفصل',
          printFit: true,
          orientation: 'landscape',
          repeatRows: '1:4',
          numericCols: [0],
          footerSigners: ['معلم المادة / رائد الفصل', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
        });
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `${title.replace(/\s+/g, '_')}_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'سجلات الفصول');
      reportStatus(`✅ تم إنشاء ${title} بنجاح (${list.length} طالب مقسمين على ${classGroups.length} فصل).`);
      return { ok: true, count: list.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (5) قوائم الفصول بنظام العمودين المزدوج (الموفر للورق)
  async function runTwoColumnClassListsExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('two_columns', 'جاري إنشاء قوائم الفصول بنظام العمودين الموفر للورق...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const classGroups = groupStudentsByClass(list, sortMode);
      const ctx = await loadSchoolContext(list);

      // فحص وجود قالب مخصص معتمد
      const customTpl = await getCustomTemplate('twocol');
      if (customTpl && customTpl.base64) {
        reportStatus(`🎨 جاري التصدير باستخدام قالبك المخصص (${customTpl.name})...`);
        const groups = {};
        classGroups.forEach(g => { groups[g.shortSheetName(1, 1)] = g.students; });
        const arrayBuffer = await fillCustomTemplate(customTpl.base64, groups, 'twocol', ctx);
        const filename = `قوائم_الفصول_عمودين_مخصص_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(arrayBuffer, filename, 'قوائم الفصول');
        reportStatus(`✅ تم إنشاء قوائم الفصول بنجاح بقالبك المخصص (${list.length} طالب في ${classGroups.length} فصل).`);
        return { ok: true, count: list.length, classesCount: classGroups.length, custom: true, filename };
      }

      const sheetSpecs = [];
      for (const group of classGroups) {
        if (isAborted()) break;

        const groupName = group.groupName;
        const groupStudents = group.students;
        const half = Math.ceil(groupStudents.length / 2);
        const col1 = groupStudents.slice(0, half);
        const col2 = groupStudents.slice(half);

        const headers = [
          'م (1)', 'كود الطالب', 'اسم الطالب', 'الديانة', 'حالة القيد',
          '|',
          'م (2)', 'كود الطالب', 'اسم الطالب', 'الديانة', 'حالة القيد'
        ];

        const rows = [];
        for (let i = 0; i < half; i++) {
          const s1 = col1[i];
          const s2 = col2[i];
          rows.push([
            i + 1,
            s1 ? s1.code : '',
            s1 ? s1.name : '',
            s1 ? (s1.religion || '') : '',
            s1 ? (s1.status || 'مقيد') : '',
            '│',
            s2 ? half + i + 1 : '',
            s2 ? s2.code : '',
            s2 ? s2.name : '',
            s2 ? (s2.religion || '') : '',
            s2 ? (s2.status || 'مقيد') : ''
          ]);
        }

        sheetSpecs.push({
          name: group.shortSheetName(1, 1),
          title: `قائمة فصول المدرسة (نظام العمودين المزدوج) — ${groupName}`,
          infoLines: reportInfoLines(ctx, `إجمالي طلاب الفصل: ${groupStudents.length} طالباً وطالبة`),
          headers,
          rows,
          recordCount: groupStudents.length,
          countLabel: 'إجمالي المقيدين',
          printFit: true,
          orientation: 'portrait',
          repeatRows: '1:4',
          numericCols: [0, 6],
          footerSigners: ['رائد الفصل', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
        });
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `قوائم_الفصول_نظام_العمودين_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'قوائم الفصول');
      reportStatus(`✅ تم إنشاء قوائم الفصول المزدوجة بنجاح (${list.length} طالب في ${classGroups.length} فصل).`);
      return { ok: true, count: list.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (6) كشوف 41 مستجدين المعتمدة لشؤون الطلاب (كشف عام + ورقة مستقلة لكل فصل مستجدين للطباعة)
  async function runNewcomers41Export(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('newcomers_41', 'جاري إنشاء كشوف 41 مستجدين...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      // التدقيق الصارم لكشف 41 مستجدين: الصف الأول لكل مرحلة دراسية، وحالة القيد (ناجح ومنقول أو مستجد) فقط
      function isStageFirstGrade(gradeText) {
        const g = (globalThis.NeprasEgypt?.normalizeArabic ? globalThis.NeprasEgypt.normalizeArabic(gradeText) : String(gradeText || ''))
          .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
          .replace(/[أإآ]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/ى/g, 'ي')
          .trim();
        // استبعاد الصفوف الثاني والثالث والرابع والخامس والسادس (مع الحذر من كلمة ثانوي أو ثانوية)
        if (/الصف\s+(?:الثاني|الثانى|ثاني|ثانى|الثالث|ثالث|الرابع|رابع|الخامس|خامس|السادس|سادس)|kg2/i.test(g)) return false;
        if (/(?:^|\s)(?:ثاني|ثانى|ثالث|رابع|خامس|سادس)(?:\s|$)/i.test(g)) return false;
        // مطابقة الصف الأول أو KG1
        return /(?:الصف\s+)?(?:الاول|اول|أول|الأول|kg1|المستوى\s+الاول|المستوى\s+الأول)/i.test(g);
      }

      function isNewcomerRegistrationStatus(statusText) {
        const s = (globalThis.NeprasEgypt?.normalizeArabic ? globalThis.NeprasEgypt.normalizeArabic(statusText) : String(statusText || ''))
          .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
          .replace(/[أإآ]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/ى/g, 'ي')
          .trim();
        // استبعاد حالات الرسوب والبقاء للإعادة والانقطاع صراحة
        if (/باق|اعاده|إعادة|راسب|مفصول|منقطع/i.test(s)) return false;
        // مطابقة مستجد أو ناجح ومنقول
        return /مستجد|ناجح\s*و\s*منقول/i.test(s);
      }

      const newcomers = list.filter(s => isStageFirstGrade(s.grade) && isNewcomerRegistrationStatus(s.status));
      if (!newcomers.length) {
        throw new Error(`لا يوجد في المدرسة طلاب مستجدون مطابقون للشروط (الصف الأول وحالة القيد «ناجح ومنقول» أو «مستجد») من بين ${list.length} طالبًا، فلم يُنشأ الكشف. راجع الصف وحالة القيد في بيانات الطلاب.`);
      }

      const ctx = await loadSchoolContext(list);
      const classGroups = groupStudentsByClass(newcomers, sortMode);

      // فحص وجود قالب مخصص معتمد
      const customTpl = await getCustomTemplate('newcomers_41');
      if (customTpl && customTpl.base64) {
        reportStatus(`🎨 جاري التصدير باستخدام قالبك المخصص (${customTpl.name})...`);
        const groups = {};
        if (classGroups.length > 1) {
          classGroups.forEach(g => { groups[g.shortSheetName(1, 1)] = g.students; });
        } else {
          groups['كشف 41 مستجدين'] = newcomers;
        }
        const arrayBuffer = await fillCustomTemplate(customTpl.base64, groups, 'newcomers_41', ctx);
        const filename = `كشف_41_مستجدين_مخصص_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(arrayBuffer, filename, 'سجلات القيد');
        reportStatus(`✅ تم إنشاء كشف 41 مستجدين بنجاح بقالبك المخصص (${newcomers.length} طالب).`);
        return { ok: true, count: newcomers.length, custom: true, filename };
      }

      const headers = [
        'م', 'كود الطالب', 'اسم التلميذ رباعياً', 'الرقم القومي (14 رقماً)', 'تاريخ الميلاد',
        'السن في 1/10 (يوم)', 'السن في 1/10 (شهر)', 'السن في 1/10 (سنة)', 'النوع', 'الديانة', 'الجنسية',
        'الصف الدراسي', 'الفصل', 'حالة القيد', 'ملاحظات'
      ];

      const buildRows = (studentsArr) => studentsArr.map((st, idx) => {
        const parsed = parseNationalId(st.national_id);
        const age = parsed ? calculateAgeOnOct1(parsed.birthDate, newcomersOct1Year()) : null;
        return [
          idx + 1,
          st.code || '',
          st.name,
          st.national_id || '',
          st.dob || (parsed ? parsed.birthDateFormatted : ''),
          age ? age.days : '',
          age ? age.months : '',
          age ? age.years : '',
          st.gender || (parsed ? parsed.gender : ''),
          st.religion || '',
          st.nationality || 'مصري',
          st.grade,
          st.class_name,
          st.status || 'مستجد',
          st.is_merged ? 'دمج تعليمي' : ''
        ];
      });

      const sortedAll = classGroups.flatMap(g => g.students);
      const sheetSpecs = [{
        name: 'إجمالي 41 مستجدين',
        title: `سجل 41 مستجدين المعتمد لشؤون الطلاب — ${ctx.school}`,
        infoLines: reportInfoLines(ctx, `إجمالي المستجدين المقيدين: ${sortedAll.length} طالباً`),
        headers,
        rows: buildRows(sortedAll),
        recordCount: sortedAll.length,
        countLabel: 'إجمالي المقيدين بالكشف',
        printFit: true,
        orientation: 'landscape',
        repeatRows: '1:4',
        numericCols: [0, 5, 6, 7],
        footerSigners: ['مسئول شؤون الطلاب', 'رئيس قسم شؤون الطلبة', 'يعتمد / مدير المدرسة']
      }];

      if (classGroups.length > 1) {
        for (const group of classGroups) {
          sheetSpecs.push({
            name: group.shortSheetName(1, 1),
            title: `كشف 41 مستجدين — ${group.groupName}`,
            infoLines: reportInfoLines(ctx, `الفصل: ${group.groupName} — عدد المستجدين بالفصل: ${group.students.length} طالباً`),
            headers,
            rows: buildRows(group.students),
            recordCount: group.students.length,
            countLabel: 'إجمالي مستجدي الفصل',
            printFit: true,
            orientation: 'landscape',
            repeatRows: '1:4',
            numericCols: [0, 5, 6, 7],
            footerSigners: ['مسئول شؤون الطلاب', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
          });
        }
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `سجل_41_مستجدين_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'سجلات القيد');
      reportStatus(`✅ تم إنشاء سجل 41 مستجدين المعتمد بنجاح (${newcomers.length} طالب).`);
      return { ok: true, count: newcomers.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (6.1) كشوف المناداة وتوزيع لجان الامتحانات (ورقة مستقلة لكل لجنة 20 طالباً للطباعة المباشرة + كشف إجمالي)
  async function runCallListExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('call_list', 'جاري إنشاء كشوف المناداة ولجان الامتحانات...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');
      const ctx = await loadSchoolContext(list);

      const classGroups = groupStudentsByClass(list, sortMode);
      const sorted = classGroups.flatMap(g => g.students);
      const committeeSize = 20;
      const totalCommittees = Math.ceil(sorted.length / committeeSize) || 1;

      const headers = [
        'م', 'رقم الجلوس', 'اسم التلميذ رباعياً', 'النوع', 'الديانة',
        'الصف الدراسي', 'الفصل الأصلي', 'حالة القيد', 'توقيع الطالب بالحضور', 'ملاحظات'
      ];

      const sheetSpecs = [];

      // ورقة مستقلة لكل لجنة امتحانية ليسهل تعليقها على باب اللجنة مباشرة
      for (let c = 0; c < totalCommittees; c++) {
        if (isAborted()) break;
        const commNum = c + 1;
        const commStudents = sorted.slice(c * committeeSize, (c + 1) * committeeSize);
        const startSeat = 1000 + c * committeeSize + 1;
        const endSeat = 1000 + c * committeeSize + commStudents.length;

        const rows = commStudents.map((st, idx) => [
          idx + 1,
          startSeat + idx,
          st.name,
          st.gender || '',
          st.religion || '',
          st.grade || '',
          st.class_name || '',
          st.status || 'مقيد',
          '',
          st.is_merged ? 'دمج' : ''
        ]);

        sheetSpecs.push({
          name: `لجنة ${commNum}`,
          title: `كشف مناداة لجنة امتحانات رقم (${commNum}) — من جلوس ${startSeat} إلى ${endSeat}`,
          infoLines: reportInfoLines(ctx, `اللجنة: (${commNum}) من ${totalCommittees} — عدد طلاب اللجنة: ${commStudents.length} طالباً`),
          headers,
          rows,
          recordCount: commStudents.length,
          countLabel: 'إجمالي طلاب اللجنة',
          printFit: true,
          orientation: 'portrait',
          repeatRows: '1:4',
          numericCols: [0, 1],
          footerSigners: ['ملاحظ اللجنة (1)', 'ملاحظ اللجنة (2)', 'رئيس الكنترول', 'رئيس اللجنة / مدير المدرسة']
        });
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `كشف_المناداة_ولجان_الامتحانات_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'شؤون الطلاب');
      reportStatus(`✅ تم تصدير كشوف المناداة (${totalCommittees} لجنة لعدد ${sorted.length} طالب) بنجاح.`);
      return { ok: true, count: sorted.length, committees: totalCommittees, filename };
    } finally {
      clearRunning();
    }
  }

  // (6.2) سجل الأيتام والحالات المعفاة من المصروفات (مقسم للفصول بدون اختلاق حالات)
  async function runOrphansExemptionsExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('orphans_exemptions', 'جاري إنشاء سجل الأيتام والإعفاءات...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      // تدقيق ومطابقة بيانات الإعفاءات من سجلات المصروفات إن وُجدت في التخزين المحلي
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const stored = await chrome.storage.local.get('neprasExpensesAnalysisV1');
          const expData = stored?.neprasExpensesAnalysisV1;
          const expRows = Array.isArray(expData?.rows) ? expData.rows : [];
          if (expRows.length) {
            const expByCode = new Map();
            const expByNid = new Map();
            expRows.forEach(er => {
              if (er.code) expByCode.set(String(er.code).trim(), er);
              if (er.nationalId) expByNid.set(String(er.nationalId).trim(), er);
            });
            for (const st of list) {
              const er = expByCode.get(String(st.code).trim()) || expByNid.get(String(st.national_id).trim());
              if (er && er.exemptionClass && er.exemptionClass !== 'none') {
                st.is_exempt = true;
                if (!st.social_status || st.social_status === 'عادي') {
                  st.social_status = er.exemptionType && er.exemptionType !== '—' ? er.exemptionType : (er.exemptionLabel || 'معفى وفق القرار');
                }
                if (/يتيم|يتام/.test(String(er.exemptionType || ''))) st.is_orphan = true;
                if (er.exemptionPercent != null) st.exemption_percent = `${er.exemptionPercent}%`;
                if (!st.exemption_doc && er.exemptionType && er.exemptionType !== '—') st.exemption_doc = er.exemptionType;
              }
            }
          }
        }
      } catch (_) {}

      const actualCases = list.filter(st =>
        st.is_orphan ||
        st.is_exempt ||
        (st.social_status && !/^(عادي|لا يوجد|غير معفى|مسدد|سليم|لا|—|-)$/i.test(st.social_status.trim())) ||
        Boolean(st.exemption_doc)
      );

      if (!actualCases.length) {
        const msg = '⚠️ لم يتم العثور على أي حالات أيتام أو إعفاءات مسجلة بالمدرسة في البيانات الحالية.';
        reportStatus(msg);
        try {
          if (window.neprasDialog && typeof window.neprasDialog.open === 'function') {
            window.neprasDialog.open({
              type: 'warning',
              title: 'كشف الأيتام والإعفاءات',
              message: 'لم يتم العثور على أي حالات أيتام أو إعفاءات مسجلة في بيانات المدرسة الحالية.\n\nتأكد من تنزيل تقرير المصروفات والإعفاءات من قسم المصروفات أو تحديث بيانات الطلاب.',
              okText: 'حسناً'
            });
          }
        } catch (_) {}
        return { ok: true, count: 0, message: msg };
      }

      const ctx = await loadSchoolContext(list);

      const headers = [
        'م', 'كود الطالب', 'اسم الطالب رباعياً', 'الرقم القومي', 'الصف الدراسي', 'الفصل',
        'تصنيف الحالة / الإعفاء', 'اسم ولي الأمر / العائل', 'رقم الهاتف',
        'المستند الرسمي / رقم البحث', 'نسبة الإعفاء', 'ملاحظات الأخصائي'
      ];

      const classGroups = groupStudentsByClass(actualCases, sortMode);

      // الورقة الأولى: كشف شامل لجميع الحالات بالمدرسة
      const masterRows = actualCases.map((st, idx) => [
        idx + 1,
        st.code || '',
        st.name,
        st.national_id || '',
        st.grade || '',
        st.class_name || '',
        st.social_status || (st.is_orphan ? 'يتيم الأب' : 'معفى وفق القرار'),
        st.guardian || '',
        st.phone || '',
        st.exemption_doc || '',
        st.exemption_percent || (st.is_orphan || st.social_status ? 'إعفاء 100%' : 'معفى'),
        ''
      ]);

      const sheetSpecs = [
        {
          name: 'الأيتام والإعفاءات - شامل',
          title: `سجل حصر الطلاب الأيتام والحالات المعفاة من المصروفات (كشف شامل) — ${ctx.school}`,
          infoLines: reportInfoLines(ctx, `إجمالي الحالات المعفاة بالمدرسة: ${actualCases.length} طالباً`),
          headers,
          rows: masterRows,
          recordCount: actualCases.length,
          countLabel: 'إجمالي الحالات المعفاة',
          printFit: true,
          orientation: 'landscape',
          repeatRows: '1:4',
          numericCols: [0],
          footerSigners: ['الأخصائي الاجتماعي', 'مسئول شؤون الطلاب', 'يعتمد / مدير المدرسة']
        }
      ];

      // أوراق الفصول: فقط للفصول التي بها حالات فعلية
      if (classGroups.length > 1 || (classGroups.length === 1 && classGroups[0].students.length < actualCases.length)) {
        classGroups.forEach((group) => {
          if (!group.students || !group.students.length) return;
          sheetSpecs.push({
            name: group.shortSheetName(1, 1),
            title: `سجل حصر الطلاب الأيتام والحالات المعفاة — ${group.groupName}`,
            infoLines: reportInfoLines(ctx, `الفصل: ${group.groupName} — عدد الحالات: ${group.students.length} طالباً`),
            headers,
            rows: group.students.map((st, idx) => [
              idx + 1,
              st.code || '',
              st.name,
              st.national_id || '',
              st.grade || '',
              st.class_name || '',
              st.social_status || (st.is_orphan ? 'يتيم الأب' : 'معفى وفق القرار'),
              st.guardian || '',
              st.phone || '',
              st.exemption_doc || '',
              st.exemption_percent || (st.is_orphan || st.social_status ? 'إعفاء 100%' : 'معفى'),
              ''
            ]),
            recordCount: group.students.length,
            countLabel: 'إجمالي حالات الفصل',
            printFit: true,
            orientation: 'landscape',
            repeatRows: '1:4',
            numericCols: [0],
            footerSigners: ['الأخصائي الاجتماعي', 'مسئول شؤون الطلاب', 'يعتمد / مدير المدرسة']
          });
        });
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `سجل_الأيتام_وحالات_الإعفاء_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'التربية الاجتماعية');
      reportStatus(`✅ تم إنشاء سجل الأيتام والإعفاءات بنجاح (${actualCases.length} حالة مسجلة في ${classGroups.length} فصل).`);
      return { ok: true, count: actualCases.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (6.3) كشف طلاب الدمج والتربية الخاصة (مقسم للفصول بدون اختلاق حالات)
  async function runSpecialNeedsMergeExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('special_needs_merge', 'جاري إنشاء كشف طلاب الدمج والتربية الخاصة...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const mergedStudents = list.filter(s => s.is_merged);

      if (!mergedStudents.length) {
        const msg = '⚠️ لم يتم العثور على أي طلاب مسجلين كدمج تعليمي أو تربية خاصة في هذه المدرسة.';
        reportStatus(msg);
        try {
          if (window.neprasDialog && typeof window.neprasDialog.open === 'function') {
            window.neprasDialog.open({
              type: 'warning',
              title: 'طلاب الدمج والتربية الخاصة',
              message: 'لم يتم العثور على أي طلاب مسجلين كدمج تعليمي أو تربية خاصة في هذه المدرسة.',
              okText: 'حسناً'
            });
          }
        } catch (_) {}
        return { ok: true, count: 0, message: msg };
      }

      const ctx = await loadSchoolContext(list);

      const headers = [
        'م', 'كود الطالب', 'اسم الطالب رباعياً', 'الرقم القومي', 'الصف الدراسي', 'الفصل',
        'نوع الإعاقة والدمج', 'قرار الدمج الوزاري', 'ولي الأمر وهاتف التواصل',
        'التيسيرات الامتحانية المقررة', 'ملاحظات'
      ];

      const classGroups = groupStudentsByClass(mergedStudents, sortMode);

      // الورقة الأولى: كشف شامل لجميع طلاب الدمج والتربية الخاصة بالمدرسة
      const masterRows = mergedStudents.map((st, idx) => [
        idx + 1,
        st.code || '',
        st.name,
        st.national_id || '',
        st.grade || '',
        st.class_name || '',
        st.merge_type || 'دمج تعليمي',
        st.merge_decision || 'قرار وزاري رقم 252 لسنة 2017',
        [st.guardian, st.phone].filter(Boolean).join(' - '),
        'امتحان موضوعي وتوفير بيئة مناسبة',
        ''
      ]);

      const sheetSpecs = [
        {
          name: 'طلاب الدمج - كشف شامل',
          title: `كشف حصر ومتابعة طلاب الدمج والتربية الخاصة (شامل المدرسة) — ${ctx.school}`,
          infoLines: reportInfoLines(ctx, `إجمالي طلاب الدمج بالمدرسة: ${mergedStudents.length} طالباً`),
          headers,
          rows: masterRows,
          recordCount: mergedStudents.length,
          countLabel: 'إجمالي طلاب الدمج',
          printFit: true,
          orientation: 'landscape',
          repeatRows: '1:4',
          numericCols: [0],
          footerSigners: ['مسئول الدمج / الأخصائي النفسي', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
        }
      ];

      // أوراق الفصول: فقط للفصول التي بها طلاب دمج
      if (classGroups.length > 1 || (classGroups.length === 1 && classGroups[0].students.length < mergedStudents.length)) {
        classGroups.forEach((group) => {
          if (!group.students || !group.students.length) return;
          sheetSpecs.push({
            name: group.shortSheetName(1, 1),
            title: `كشف حصر ومتابعة طلاب الدمج والتربية الخاصة — ${group.groupName}`,
            infoLines: reportInfoLines(ctx, `الفصل: ${group.groupName} — عدد طلاب الدمج: ${group.students.length} طالباً`),
            headers,
            rows: group.students.map((st, idx) => [
              idx + 1,
              st.code || '',
              st.name,
              st.national_id || '',
              st.grade || '',
              st.class_name || '',
              st.merge_type || 'دمج تعليمي',
              st.merge_decision || 'قرار وزاري رقم 252 لسنة 2017',
              [st.guardian, st.phone].filter(Boolean).join(' - '),
              'امتحان موضوعي وتوفير بيئة مناسبة',
              ''
            ]),
            recordCount: group.students.length,
            countLabel: 'إجمالي دمج الفصل',
            printFit: true,
            orientation: 'landscape',
            repeatRows: '1:4',
            numericCols: [0],
            footerSigners: ['مسئول الدمج / الأخصائي النفسي', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
          });
        });
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `كشف_طلاب_الدمج_والتربية_الخاصة_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'التربية الخاصة');
      reportStatus(`✅ تم إنشاء كشف طلاب الدمج والتربية الخاصة بنجاح (${mergedStudents.length} طالب دمج في ${classGroups.length} فصل).`);
      return { ok: true, count: mergedStudents.length, classesCount: classGroups.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (7) سجلات القيد الشاملة (سجل إجمالي + أوراق مقسمة للفصول للطباعة المريحة)
  async function runEnrollmentRegistersExport(passedStudents = null, sortMode = 'gender_boys') {
    setRunning('enrollment', 'جاري إنشاء سجلات القيد الشاملة...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      const ctx = await loadSchoolContext(list);
      const classGroups = groupStudentsByClass(list, sortMode);

      // فحص وجود قالب مخصص معتمد
      const customTpl = await getCustomTemplate('enrollment');
      if (customTpl && customTpl.base64) {
        reportStatus(`🎨 جاري التصدير باستخدام قالبك المخصص (${customTpl.name})...`);
        const groups = { 'سجل القيد الشامل': classGroups.flatMap(g => g.students) };
        const arrayBuffer = await fillCustomTemplate(customTpl.base64, groups, 'enrollment', ctx);
        const filename = `سجل_القيد_الشامل_مخصص_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
        await deliverNeprasBinary(arrayBuffer, filename, 'سجلات القيد');
        reportStatus(`✅ تم إنشاء سجل القيد الشامل بنجاح بقالبك المخصص (${list.length} طالب).`);
        return { ok: true, count: list.length, custom: true, filename };
      }

      const headers = [
        'م', 'كود الطالب', 'اسم الطالب', 'الرقم القومي', 'تاريخ الميلاد',
        'السن في 1 أكتوبر', 'النوع', 'الديانة', 'الصف الدراسي', 'الفصل', 'حالة القيد', 'نوع التعليم', 'المحافظة'
      ];

      const buildRows = (studentsArr) => studentsArr.map((st, idx) => {
        const parsed = parseNationalId(st.national_id);
        const age = parsed ? calculateAgeOnOct1(parsed.birthDate) : null;
        return [
          idx + 1,
          st.code || '',
          st.name,
          st.national_id || '',
          st.dob || (parsed ? parsed.birthDateFormatted : ''),
          age ? age.text : '',
          st.gender || (parsed ? parsed.gender : ''),
          st.religion || '',
          st.grade,
          st.class_name,
          st.status || 'مقيد',
          st.study_type || 'رسمي',
          st.gov || (parsed ? parsed.governorate : '')
        ];
      });

      const sortedAll = classGroups.flatMap(g => g.students);
      const sheetSpecs = [{
        name: 'سجل القيد الشامل',
        title: `سجل القيد الشامل لطلاب المدرسة — ${ctx.school}`,
        infoLines: reportInfoLines(ctx, `إجمالي عدد الطلاب المقيدين: ${sortedAll.length} طالباً`),
        headers,
        rows: buildRows(sortedAll),
        recordCount: sortedAll.length,
        countLabel: 'إجمالي المقيدين بالمدرسة',
        printFit: true,
        orientation: 'landscape',
        repeatRows: '1:4',
        numericCols: [0],
        footerSigners: ['مسئول شؤون الطلاب', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
      }];

      if (classGroups.length > 1) {
        for (const group of classGroups) {
          sheetSpecs.push({
            name: group.shortSheetName(1, 1),
            title: `سجل قيد الطلاب — ${group.groupName}`,
            infoLines: reportInfoLines(ctx, `الفصل: ${group.groupName} — عدد المقيدين بالفصل: ${group.students.length} طالباً`),
            headers,
            rows: buildRows(group.students),
            recordCount: group.students.length,
            countLabel: 'إجمالي مقيدي الفصل',
            printFit: true,
            orientation: 'landscape',
            repeatRows: '1:4',
            numericCols: [0],
            footerSigners: ['مسئول شؤون الطلاب', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
          });
        }
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `سجل_القيد_الشامل_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'سجلات القيد');
      reportStatus(`✅ تم إنشاء سجل القيد الشامل بنجاح (${list.length} طالب).`);
      return { ok: true, count: list.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (8) حصر وإدارة طلاب المنازل بشكل منفصل
  async function runManazelExport(passedStudents = null) {
    setRunning('manazel', 'جاري حصر وتصدير كشوف طلاب المنازل...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      const manazelList = list.filter(s => s.is_manazel || s.study_type.includes('منازل') || s.status.includes('منازل'));

      if (!manazelList.length) {
        reportStatus('⚠️ لا يوجد طلاب مقيدين بنظام المنازل في هذه المدرسة.');
        return { ok: true, count: 0, message: 'لا يوجد طلاب منازل' };
      }

      const ctx = await loadSchoolContext(list);
      const headers = [
        'م', 'كود الطالب', 'اسم الطالب رباعياً', 'الرقم القومي', 'تاريخ الميلاد',
        'السن في 1 أكتوبر', 'النوع', 'الديانة', 'الصف الدراسي', 'حالة القيد', 'رقم الهاتف'
      ];

      const rows = manazelList.map((st, idx) => {
        const parsed = parseNationalId(st.national_id);
        const age = parsed ? calculateAgeOnOct1(parsed.birthDate) : null;
        return [
          idx + 1,
          st.code || '',
          st.name,
          st.national_id || '',
          st.dob || (parsed ? parsed.birthDateFormatted : ''),
          age ? age.text : '',
          st.gender || (parsed ? parsed.gender : ''),
          st.religion || '',
          st.grade,
          st.status || 'مقيد منازل',
          st.phone || ''
        ];
      });

      const sheetSpecs = [{
        name: 'كشف طلاب المنازل',
        title: `كشف حصر طلاب المنازل — ${ctx.school}`,
        infoLines: reportInfoLines(ctx, `إجمالي طلاب المنازل: ${manazelList.length} طالباً`),
        headers,
        rows,
        recordCount: manazelList.length,
        countLabel: 'إجمالي طلاب المنازل',
        printFit: true,
        orientation: 'landscape',
        repeatRows: '1:4',
        numericCols: [0],
        footerSigners: ['مسئول شؤون الطلاب', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
      }];

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `كشف_طلاب_المنازل_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'طلاب المنازل');
      reportStatus(`✅ تم تصدير كشف طلاب المنازل بنجاح (${manazelList.length} طالب).`);
      return { ok: true, count: manazelList.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (8-ب) حصر وإدارة طلاب العمال (التعليم الفني) بشكل منفصل
  async function runWorkersExport(passedStudents = null) {
    setRunning('workers', 'جاري حصر وتصدير كشوف طلاب العمال (التعليم الفني)...');
    try {
      const list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      const workersList = list.filter(s => s.is_worker || s.study_type.includes('عمال') || s.study_type.includes('عمل') || s.status.includes('عمال'));

      if (!workersList.length) {
        reportStatus('⚠️ لا يوجد طلاب مقيدين بنظام العمال في هذه المدرسة.');
        return { ok: true, count: 0, message: 'لا يوجد طلاب عمال' };
      }

      const ctx = await loadSchoolContext(list);
      const headers = [
        'م', 'كود الطالب', 'اسم الطالب رباعياً', 'الرقم القومي', 'تاريخ الميلاد',
        'السن في 1 أكتوبر', 'النوع', 'الديانة', 'الصف الدراسي', 'حالة القيد', 'نوع التعليم', 'رقم الهاتف'
      ];

      const rows = workersList.map((st, idx) => {
        const parsed = parseNationalId(st.national_id);
        const age = parsed ? calculateAgeOnOct1(parsed.birthDate) : null;
        return [
          idx + 1,
          st.code || '',
          st.name,
          st.national_id || '',
          st.dob || (parsed ? parsed.birthDateFormatted : ''),
          age ? age.text : '',
          st.gender || (parsed ? parsed.gender : ''),
          st.religion || '',
          st.grade,
          st.status || 'مقيد عمال',
          st.study_type || 'نظام عمال',
          st.phone || ''
        ];
      });

      const sheetSpecs = [{
        name: 'كشف طلاب العمال',
        title: `كشف حصر طلاب العمال المعتمد (التعليم الفني) — ${ctx.school}`,
        infoLines: reportInfoLines(ctx, `إجمالي طلاب العمال: ${workersList.length} طالباً`),
        headers,
        rows,
        recordCount: workersList.length,
        countLabel: 'إجمالي طلاب العمال',
        printFit: true,
        orientation: 'landscape',
        repeatRows: '1:4',
        numericCols: [0],
        footerSigners: ['مسئول شؤون الطلاب', 'وكيل شؤون الطلاب', 'يعتمد / مدير المدرسة']
      }];

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      const filename = `كشف_طلاب_العمال_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'طلاب العمال');
      reportStatus(`✅ تم تصدير كشف طلاب العمال بنجاح (${workersList.length} طالب).`);
      return { ok: true, count: workersList.length, filename };
    } finally {
      clearRunning();
    }
  }

  // -------------------------------------------------------------
  // (8.1) كشف الطلاب المخصص (9 أعمدة: م - الإدارة - المدرسة - المرحلة - إسم الطالب - الكود - الصف - الفصل - الرقم القومى)
  // -------------------------------------------------------------
  function normalizeStageTitle(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const s = raw.trim();
    if (!s) return '';
    // استبعاد أسماء الصفوف إن وُضعت خطأ في حقل المرحلة
    if (/^(الصف|صف|grade)\b/i.test(s)) return '';
    if (/ابتدائي|الإبتدائي|الابتدائ/i.test(s)) return 'الابتدائية';
    if (/إعدادي|اعدادي|الإعدادي|الاعدادي/i.test(s)) return 'الإعدادية';
    if (/ثانوي\s*عام|ثانوية\s*عامة|ثانوي|الثانوي|الثانوية/i.test(s)) return 'الثانوية';
    if (/فني|صناعي|تجاري|زراعي|فندقي/i.test(s)) return 'التعليم الفني';
    if (/رياض|روضة|روضه|kg/i.test(s)) return 'رياض الأطفال';
    return '';
  }

  function resolveStudentStage(st, ctx) {
    // 1. فحص حقل المرحلة المباشر في سجل الطالب بعد استبعاد أسماء الصفوف
    const direct = normalizeStageTitle(st?.stage || st?.stageName || st?.['المرحلة']);
    if (direct) return direct;

    // 2. فحص اسم الصف إن كان يحمل اسم المرحلة صراحة (مثل: الصف الأول الإعدادي)
    const gradeStr = String((st && (st.grade || st.gradeName || st['الصف'])) || '').trim();
    const gradeStage = normalizeStageTitle(gradeStr);
    if (gradeStage) return gradeStage;

    // الصفوف الرابع والخامس والسادس خاصة حصرياً بالمرحلة الابتدائية في مصر
    if (/الرابع|الخامس|السادس/i.test(gradeStr)) return 'الابتدائية';

    // 3. فحص المرحلة المحددة في سياق المدرسة أو نافذة نبراس (PRIMARY / PREP / SEC)
    const rawCtxStage = String((ctx && (ctx.stage || ctx.selectedStage || ctx.stageName)) || '').trim();
    const ctxNorm = normalizeStageTitle(rawCtxStage);
    if (ctxNorm) return ctxNorm;

    const ctxUpper = rawCtxStage.toUpperCase();
    if (ctxUpper === 'PRIMARY' || ctxUpper === '1') return 'الابتدائية';
    if (ctxUpper === 'PREP' || ctxUpper === '2' || ctxUpper === '3') return 'الإعدادية';
    if (ctxUpper === 'GENERAL_SECONDARY' || ctxUpper === '4' || ctxUpper === '5' || ctxUpper === '6') return 'الثانوية';
    if (ctxUpper === 'TECHNICAL_SECONDARY') return 'التعليم الفني';
    if (ctxUpper === 'KG') return 'رياض الأطفال';

    // 4. فحص اسم المدرسة
    const sch = String((ctx && ctx.school) || (st && (st.school || st.schoolName)) || '').trim();
    const schoolStage = normalizeStageTitle(sch);
    if (schoolStage) return schoolStage;

    return 'الابتدائية';
  }

  function resolveStudentClass(st) {
    if (!st) return '';
    const raw = cleanText(st['الفصل'] || st.classRoom || st.class_number || '');
    if (raw && raw !== 'عام') return raw;
    const cn = cleanText(st.class_name || st.className || '');
    if (cn && cn !== 'عام' && cn !== cleanText(st.grade || st['الصف'])) return cn;
    return '';
  }

  async function runCustomEightColumnsExport(passedStudents = null, sortMode = 'gender_boys', options = {}) {
    setRunning('custom_eight_columns', 'جاري إنشاء كشف الطلاب المخصص (9 أعمدة)...');
    try {
      let list = (passedStudents && passedStudents.length) ? passedStudents : await fetchAllSchoolStudents();
      if (!list.length) throw new Error('لم يتم العثور على أي طلاب في المدرسة.');

      if (options && options.selectedGrade && typeof options.selectedGrade === 'string') {
        const targetGrd = options.selectedGrade.trim();
        const filtered = list.filter(st => {
          const g = String(st.grade || st.gradeName || st['الصف'] || '').trim();
          return g === targetGrd || g.includes(targetGrd) || targetGrd.includes(g);
        });
        if (filtered.length) list = filtered;
      }

      const ctx = await loadSchoolContext(list);
      if (!ctx.stage) {
        ctx.stage = options?.selectedStage || await selectedStage();
      }
      if (!ctx.stage && typeof chrome !== 'undefined' && chrome.storage?.local) {
        try {
          const stored = await chrome.storage.local.get(['neprasSelectedStudentStage', 'neprasSchoolStatsV1', 'neprasSchoolProfile']);
          ctx.stage = stored?.neprasSelectedStudentStage || stored?.neprasSchoolStatsV1?.stage || stored?.neprasSchoolProfile?.stage || '';
        } catch (_) {}
      }

      const xlsxLib = await ensureXLSXLib();
      if (!xlsxLib) throw new Error('مكتبة Excel غير متوفرة في الصفحة.');

      const headers = ['م', 'الإدارة', 'المدرسة', 'المرحلة', 'إسم الطالب', 'الكود', 'الصف', 'الفصل', 'الرقم القومى'];

      // ترتيب الطلاب: حسب الصف ثم الفصل ثم البنين ثم البنات أبجدياً
      const classGroups = groupStudentsByClass(list, sortMode);
      const sortedAll = classGroups.flatMap(g => g.students);

      const buildSheetForList = (studentsArr) => {
        const dataRows = studentsArr.map((st, idx) => {
          const administration = cleanText(st.administration || st.edaraName || ctx.administration || '');
          const school = cleanText(st.school || st.schoolName || ctx.school || '');
          const stage = resolveStudentStage(st, ctx);
          const name = cleanText(st.name || st.fullName || st['اسم التلميذ'] || '');
          const code = cleanText(st.code || st.studentCode || st['كود التلميذ'] || '');
          const grade = cleanText(st.grade || st.gradeName || st['الصف'] || '');
          const classVal = resolveStudentClass(st);
          const nationalId = cleanText(st.national_id || st.nationalId || st['الرقم القومي'] || '');

          return [
            idx + 1,
            administration,
            school,
            stage,
            name,
            code,
            grade,
            classVal,
            nationalId
          ];
        });

        const aoa = [headers, ...dataRows];
        const ws = xlsxLib.utils.aoa_to_sheet(aoa);

        ws['!cols'] = [
          { wch: 6 },  // م
          { wch: 22 }, // الإدارة
          { wch: 28 }, // المدرسة
          { wch: 16 }, // المرحلة
          { wch: 34 }, // إسم الطالب
          { wch: 16 }, // الكود
          { wch: 18 }, // الصف
          { wch: 14 }, // الفصل
          { wch: 22 }  // الرقم القومى
        ];
        ws['!rows'] = [{ hpt: 28 }];
        ws['!autofilter'] = { ref: `A1:I${dataRows.length + 1}` };
        ws['!freezeRow'] = 1;

        // تنسيق ترويسة الجدول (Header) باللون الأزرق الملكي والنص الأبيض
        headers.forEach((_, c) => {
          const col = colLetter(c);
          if (ws[col + '1']) {
            ws[col + '1'].s = {
              fill: { fgColor: { rgb: '1E3A8A' } },
              font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          }
        });

        // تنسيق خلايا البيانات (Data rows)
        dataRows.forEach((_, r) => {
          const rowNum = r + 2;
          if (ws['I' + rowNum]) {
            ws['I' + rowNum].t = 's';
            ws['I' + rowNum].z = '@';
            ws['I' + rowNum].s = { alignment: { horizontal: 'center' } };
          }
          if (ws['H' + rowNum]) {
            ws['H' + rowNum].s = { alignment: { horizontal: 'center' } };
          }
          if (ws['G' + rowNum]) {
            ws['G' + rowNum].s = { alignment: { horizontal: 'center' } };
          }
          if (ws['F' + rowNum]) {
            ws['F' + rowNum].t = 's';
            ws['F' + rowNum].z = '@';
            ws['F' + rowNum].s = { alignment: { horizontal: 'center' } };
          }
          if (ws['E' + rowNum]) {
            ws['E' + rowNum].s = { alignment: { horizontal: 'right' } };
          }
        });

        return ws;
      };

      const wb = xlsxLib.utils.book_new();
      if (!wb.Workbook) wb.Workbook = {};
      wb.Workbook.Views = [{ RTL: true }];

      // الورقة الرئيسية: كشف الطلاب الشامل
      const masterWs = buildSheetForList(sortedAll);
      xlsxLib.utils.book_append_sheet(wb, masterWs, 'كشف_الطلاب_الشامل');

      // تجميع حسب الصفوف إذا كان هناك أكثر من صف
      const gradesSet = new Set(sortedAll.map(s => s.grade).filter(Boolean));
      if (gradesSet.size > 1) {
        for (const gName of gradesSet) {
          const gradeStudents = sortedAll.filter(s => s.grade === gName);
          const gWs = buildSheetForList(gradeStudents);
          const safeSheetName = typeof neprasXlsxSafeSheetName === 'function'
            ? neprasXlsxSafeSheetName(gName, new Set(wb.SheetNames))
            : gName.slice(0, 31).replace(/[\\/*?[\]:]/g, '_');
          xlsxLib.utils.book_append_sheet(wb, gWs, safeSheetName);
        }
      }

      if (isAborted()) throw new Error('تم إلغاء العملية.');

      let bytes = null;
      const styledConverter = window.neprasXlsxConvertWorkbookToStyledPackage || (typeof neprasXlsxConvertWorkbookToStyledPackage === 'function' ? neprasXlsxConvertWorkbookToStyledPackage : null);
      if (styledConverter) {
        try {
          bytes = styledConverter(wb);
        } catch (_) {}
      }
      if (!bytes) {
        bytes = xlsxLib.write(wb, { bookType: 'xlsx', type: 'array' });
      }

      const filename = `كشف_الطلاب_المخصص_${ctx.school}_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasBinary(bytes, filename, 'كشوف الطلاب');
      reportStatus(`✅ تم إنشاء وتنزيل كشف الطلاب المخصص بنجاح (${list.length} طالب).`);
      return { ok: true, count: list.length, filename };
    } finally {
      clearRunning();
    }
  }

  // (9) أداة تفريغ وتحميل أي جدول معروض بالصفحة فوراً
  async function downloadAnyTableAsExcel() {
    setRunning('any_table', 'جاري فحص وتفريغ الجدول المعروض...');
    try {
      const tables = Array.from(document.querySelectorAll('table'));
      const visibleTable = tables.find(t => t.offsetWidth > 0 && t.offsetHeight > 0 && t.querySelectorAll('tr').length > 1) || tables[0];

      if (!visibleTable) {
        throw new Error('لم يتم العثور على أي جدول معروض في الصفحة الحالية.');
      }

      const headers = [];
      const ths = visibleTable.querySelectorAll('thead th, thead td, tr:first-child th');
      if (ths.length) {
        ths.forEach(th => headers.push(cleanText(th.innerText)));
      }

      const rows = [];
      const trs = visibleTable.querySelectorAll('tbody tr');
      trs.forEach(tr => {
        const cells = tr.querySelectorAll('td, th');
        if (!cells.length) return;
        const row = Array.from(cells).map(td => {
          const inp = td.querySelector('input[type="number"], input[type="text"], input.form-control, select');
          if (inp) {
            if (inp.tagName === 'SELECT') {
              const opt = inp.options[inp.selectedIndex];
              return cleanText(opt?.text || inp.value);
            }
            if (inp.value !== undefined && inp.value !== '') {
              return cleanText(inp.value);
            }
          }
          return cleanText(td.innerText);
        });
        if (row.some(c => c)) rows.push(row);
      });

      if (!headers.length && rows.length) {
        headers.push(...rows.shift());
      }

      const pageTitle = cleanText(document.title) || 'جدول مفرغ';
      const sheetSpecs = [{
        name: 'الجدول المفرغ',
        title: `تفريغ جدول بيانات — ${pageTitle}`,
        infoLines: [
          `الموقع: ${location.hostname}`,
          `تاريخ التنزيل: ${new Date().toLocaleDateString('ar-EG')}`,
          `إجمالي الصفوف المستخرجة: ${rows.length}`
        ],
        headers: headers.length ? headers : rows[0]?.map((_, i) => `عمود ${i + 1}`) || ['بيان'],
        rows,
        recordCount: rows.length,
        countLabel: 'إجمالي السجلات',
        printFit: true
      }];

      const filename = `تفريغ_جدول_${NeprasEgypt.todayStamp()}.xlsx`;
      await deliverNeprasWorkbook(sheetSpecs, filename, 'تفريغ الجداول');
      reportStatus(`✅ تم تنزيل الجدول بنجاح (${rows.length} صف).`);
      return { ok: true, filename, count: rows.length };
    } finally {
      clearRunning();
    }
  }

  // -------------------------------------------------------------
  // (10) دفاتر الفصول: ملف Excel لكل فصل من القوالب المضمّنة مع الإضافة (templates/classbooks)
  // -------------------------------------------------------------
  const CLASSBOOKS_FOLDER = 'دفاتر الفصول';

  function bytesFromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function makeClassBooksTemplateLoader() {
    const CB = globalThis.NeprasClassBooks;
    const cache = new Map();
    const custom = new Map();
    const storeErrors = new Map();
    const load = (key) => {
      if (!cache.has(key)) {
        cache.set(key, (async () => {
          const spec = CB.BUNDLED_TEMPLATES[key];
          if (!spec) throw new Error('قالب غير معروف: ' + key);
          const r = await chrome.runtime.sendMessage({ action: 'NEPRAS_READ_BUNDLED_TEMPLATE', key, file: spec.file });
          if (!r || !r.ok || !r.base64) throw new Error(`تعذّر فتح «${spec.label}» (${(r && r.message) || 'لا رد من الإضافة'})`);
          if (r.custom) custom.set(key, r.custom);
          if (r.customError) storeErrors.set(key, r.customError);
          return bytesFromBase64(r.base64);
        })().catch((e) => { cache.delete(key); throw e; }));
      }
      return cache.get(key);
    };
    return { load, size: async (key) => (await load(key)).length, custom: (key) => custom.get(key) || null, storeErrors };
  }

  function classBooksYearText(raw) {
    const text = cleanText(raw);
    const m = /(20\d\d)\D+(20\d\d)/.exec(text);
    return m ? `${m[1]} / ${m[2]}` : text;
  }

  function classBooksSchoolName(raw) {
    const name = cleanText(raw).replace(/^مدرسة\s+/, '');
    return name === 'المدرسة' ? '' : name;
  }

  function classBooksJobs(CB, settings) {
    const picked = (settings && settings.jobs) || {};
    return CB.defaultJobs().map((j) => {
      const o = picked[j.id] || {};
      const grades = Array.isArray(o.grades) ? o.grades.map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 6) : j.grades;
      return { ...j, enabled: o.enabled === undefined ? j.enabled : !!o.enabled, grades };
    });
  }

  async function runClassBooksExport(req = {}) {
    const CB = globalThis.NeprasClassBooks;
    if (!CB) throw new Error('وحدة دفاتر الفصول غير محمّلة. حدّث الصفحة وأعد المحاولة.');
    const settings = (req && req.settings) || {};
    setRunning('classbooks', 'جاري تجهيز دفاتر الفصول...');
    try {
      const stageSel = await selectedStage();
      const stage = CB.stageKeyFromSelection(stageSel);
      if (!stage) {
        throw new Error(stageSel
          ? 'دفاتر الفصول متاحة للمراحل الابتدائية والإعدادية والثانوية فقط. اختر مرحلة منها من نافذة نبراس.'
          : 'اختر المرحلة التعليمية من نافذة نبراس أولًا ثم أعد المحاولة.');
      }

      const records = (req.students && req.students.length) ? req.students : await fetchAllSchoolStudents();
      if (isAborted()) throw new Error('تم إلغاء العملية.');
      const { students, issues: readIssues } = CB.normalizeStudents(records, stage);
      if (!students.length) throw new Error('لا يوجد طلاب بصف وفصل معروفين في المرحلة المختارة. تأكد من بيانات الموقع.');
      const issues = [...readIssues, ...CB.validateStudents(students)];
      const sortOption = settings.sortMode || (settings.sortNames ? 'alpha' : false);
      const classes = CB.groupClasses(students, sortOption);

      const ctx = await loadSchoolContext(records);
      const options = {
        yearText: classBooksYearText(settings.yearText) || classBooksYearText(ctx.academicYear) || undefined,
        governorate: ctx.governorate || '',
        administration: ctx.administration || '',
        schoolName: classBooksSchoolName(ctx.school),
        deputyName: cleanText(settings.deputyName),
        directorName: cleanText(settings.directorName),
        weeklyOff1: cleanText(settings.weeklyOff1),
        weeklyOff2: cleanText(settings.weeklyOff2),
        alertDays: Math.max(0, parseInt(settings.alertDays, 10) || 0),
        artMonths: (settings.artMonths || []).map(cleanText),
        artExamMonths: (settings.artExamMonths || []).map(cleanText),
        artTerm: cleanText(settings.artTerm)
      };

      const jobs = classBooksJobs(CB, settings);
      const loader = makeClassBooksTemplateLoader();
      reportStatus('جاري فحص قوالب الدفاتر...');
      const infos = await CB.inspectTemplates(jobs.filter((j) => j.enabled && j.stages.includes(stage)), loader.load);
      for (const [key, info] of Object.entries(infos)) {
        const mine = loader.custom(key);
        if (!mine) continue;
        info.custom = true;
        if (!info.ok) info.message = `قالبك المخصص «${mine.name}» غير صالح (${info.message || 'تعذّر فتحه'})، استعد القالب المضمّن من بطاقة دفاتر الفصول`;
      }
      const problems = CB.preflight(jobs.filter((j) => j.stages.includes(stage)), classes, infos);
      const tasks = CB.makePlan(classes, jobs, infos, { ...options, maxPerJob: settings.trial ? 1 : 0 });
      if (!tasks.length) {
        const why = problems.filter((p) => p.level === 'error').map((p) => p.text).join(' ');
        throw new Error(why || 'لا توجد دفاتر مطابقة للإعدادات: فعّل نوع دفتر واحدًا على الأقل واختر له صفوفًا موجودة في المرحلة.');
      }

      let bytes = 0;
      for (const t of tasks) bytes += await loader.size(t.job.template);
      const perJob = {};
      for (const t of tasks) perJob[t.job.label] = (perJob[t.job.label] || 0) + 1;
      const mb = Math.max(1, Math.round(bytes / 1048576));
      if (window.neprasDialog && typeof window.neprasDialog.confirm === 'function') {
        const lines = Object.entries(perJob).map(([label, n]) => `• ${label}: ${n}`);
        const mine = [...new Set(tasks.map((t) => t.job))].filter((j) => loader.custom(j.template)).map((j) => `• ${j.label}: ${loader.custom(j.template).name}`);
        if (mine.length) lines.push('', 'بقوالبك المخصصة بدل المضمّنة:', ...mine);
        const go = await window.neprasDialog.confirm(
          `سيتم إنشاء ${tasks.length} ملفًا لـ ${new Set(tasks.map((t) => t.key.join('|'))).size} فصلًا (حوالي ${mb} ميغابايت)${settings.trial ? ' — وضع التجربة: أول فصل من كل نوع' : ''}.\n${lines.join('\n')}\nستُحفظ في مجلد التنزيلات داخل Nepras.`,
          { title: 'دفاتر الفصول', okText: 'ابدأ الإنشاء' }
        );
        if (!go) { reportStatus('تم إلغاء إنشاء الدفاتر.'); return { ok: true, cancelled: true, planned: tasks.length }; }
      }

      const results = await CB.runPlan(tasks, options, {
        loadTemplate: loader.load,
        shouldCancel: isAborted,
        onProgress: (i, n, label) => { if (label) reportStatus(`جاري إنشاء الدفاتر ${i + 1}/${n}: ${label}`); },
        deliver: async ({ bytes: data, folder, filename, mime }) => {
          if (isAborted()) throw new Error('تم إلغاء العملية.');
          if (!window.neprasDialog || typeof window.neprasDialog.triggerDownload !== 'function') throw new Error('نظام التنزيل غير متوفر في الصفحة.');
          return window.neprasDialog.triggerDownload(new Blob([data], { type: mime }), filename, {
            folder: folder ? `${CLASSBOOKS_FOLDER} - ${folder}` : CLASSBOOKS_FOLDER,
            registerSuccess: false
          });
        }
      });

      const done = results.filter((r) => r.status === 'ok');
      const failed = results.filter((r) => r.status === 'error');
      const cancelled = results.length < tasks.length;
      const notes = [...new Set([
        ...issues.filter((i) => i.level !== 'info').map((i) => i.text),
        ...problems.map((p) => p.text),
        ...[...loader.storeErrors].map(([key, why]) => `تعذّرت قراءة قالبك المخصص لـ «${CB.BUNDLED_TEMPLATES[key].label}» (${why}) فاستُعمل القالب المضمّن`),
        ...done.flatMap((r) => r.warnings)
      ])];
      const head = cancelled
        ? `⏹ توقف الإنشاء: ${done.length} من ${tasks.length} ملفًا.`
        : failed.length ? `⚠️ تم إنشاء ${done.length} من ${tasks.length} ملفًا وتعذّر ${failed.length}.` : `✅ تم إنشاء ${done.length} ملفًا من دفاتر الفصول.`;
      reportStatus(head);

      if (window.neprasDialog && (failed.length || notes.length || done.length)) {
        const body = [
          head,
          ...(failed.length ? ['', 'تعذّر إنشاء:', ...failed.slice(0, 6).map((r) => `• ${r.task.label}: ${r.message}`), ...(failed.length > 6 ? [`… و${failed.length - 6} أخرى`] : [])] : []),
          ...(notes.length ? ['', 'ملاحظات:', ...notes.slice(0, 6).map((t) => `• ${t}`), ...(notes.length > 6 ? [`… و${notes.length - 6} أخرى`] : [])] : []),
          '', 'افتح الملفات بـ Excel (وليس المعاينة) ليعمل الماكرو، ووافق على «تمكين المحتوى» إن ظهر.'
        ].join('\n');
        const type = failed.length || cancelled ? 'warning' : 'success';
        try { Promise.resolve(window.neprasDialog.open({ type, title: 'دفاتر الفصول', message: body, okText: 'تم' })).catch(() => {}); } catch (_) {}
      }
      return { ok: true, planned: tasks.length, files: done.length, failed: failed.length, cancelled, mb };
    } finally {
      clearRunning();
    }
  }

  // -------------------------------------------------------------
  // 7. التقدم والنتيجة: شريط الحالة المشترك (showFloatingStatus في export.js)
  // -------------------------------------------------------------
  function reportStatus(text) {
    try { console.log('[Nepras Records]', text); } catch (_) {}
    try { if (typeof showFloatingStatus === 'function') showFloatingStatus(text); } catch (_) {}
  }

  function reportFailure(err) {
    const msg = String((err && err.message) || err || 'خطأ غير معروف');
    reportStatus(/إلغاء العملية|إيقاف/.test(msg) ? '⏹ تم إيقاف العملية.' : `❌ ${msg}`);
  }

  // -------------------------------------------------------------
  // 8. مستمع الرسائل الموحد وتنسيق الأوامر مع Popup والخلفية
  // -------------------------------------------------------------
  const MESSAGE_HANDLERS = {
    NEPRAS_RECORDS_ANEMIA: (r) => runAnemiaHealthExport(r.students, r.sortMode),
    NEPRAS_RECORDS_HEALTH_FOLLOWUP: (r) => runHealthFollowupExport(r.students, r.sortMode),
    NEPRAS_RECORDS_EYES: (r) => runEyesHealthExport(r.students, r.sortMode),
    NEPRAS_RECORDS_MONTHLY_ABSENCE: (r) => runMonthlyAbsenceExport(r.students, r.sortMode),
    NEPRAS_RECORDS_SCHOOL_BUDGET: (r) => runSchoolBudgetStatsExport(r.students),
    NEPRAS_RECORDS_BEHAVIOR_5: (r) => runBehaviorRegisterExport(r.students, r.sortMode),
    NEPRAS_RECORDS_CLASS_REGISTERS: (r) => runClassRegistersExport(r.registerType || 'grades', r.students, r.sortMode),
    NEPRAS_RECORDS_TWO_COLUMN_LISTS: (r) => runTwoColumnClassListsExport(r.students, r.sortMode),
    NEPRAS_RECORDS_NEWCOMERS_41: (r) => runNewcomers41Export(r.students, r.sortMode),
    NEPRAS_RECORDS_CALL_LIST: (r) => runCallListExport(r.students, r.sortMode),
    NEPRAS_RECORDS_ORPHANS_EXEMPTIONS: (r) => runOrphansExemptionsExport(r.students, r.sortMode),
    NEPRAS_RECORDS_SPECIAL_NEEDS_MERGE: (r) => runSpecialNeedsMergeExport(r.students, r.sortMode),
    NEPRAS_RECORDS_ENROLLMENT_REGISTERS: (r) => runEnrollmentRegistersExport(r.students, r.sortMode),
    NEPRAS_RECORDS_MANAZEL: (r) => runManazelExport(r.students),
    NEPRAS_RECORDS_WORKERS: (r) => runWorkersExport(r.students),
    NEPRAS_RECORDS_CUSTOM_EIGHT_COLUMNS: (r) => runCustomEightColumnsExport(r.students, r.sortMode, r),
    NEPRAS_RECORDS_CUSTOM_NINE_COLUMNS: (r) => runCustomEightColumnsExport(r.students, r.sortMode, r),
    NEPRAS_RECORDS_CLASSBOOKS: (r) => runClassBooksExport(r),
    NEPRAS_RECORDS_DOWNLOAD_ANY_TABLE: () => downloadAnyTableAsExcel(),
    NEPRAS_RECORDS_DOWNLOAD_TEMPLATE: (r) => downloadBlankTemplate(r.templateKey),
    NEPRAS_RECORDS_RESET_TEMPLATE: (r) => resetCustomTemplate(r.templateKey)
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const action = request?.action || request?.type;

    if (action === 'NEPRAS_RECORDS_STOP' || action === 'STOP_ALL_OPERATIONS') {
      requestStop();
      clearRunning();
      sendResponse({ ok: true, stopped: true });
      return true;
    }

    const handler = Object.prototype.hasOwnProperty.call(MESSAGE_HANDLERS, action) ? MESSAGE_HANDLERS[action] : null;
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(request))
      .then(sendResponse)
      .catch((err) => { reportFailure(err); sendResponse({ ok: false, error: err.message }); });
    return true;
  });

  // كشف الكائن عالمياً للاستخدام البرمجي
  window.NeprasRecords = {
    parseNationalId,
    calculateAgeOnOct1,
    evaluateBMI,
    evaluateAnemia,
    resolveStudentMerge,
    resolveStudentSocialAndExemption,
    studentFromApiRow,
    groupStudentsByClass,
    TEMPLATE_DEFINITIONS,
    getCustomTemplate,
    resetCustomTemplate,
    downloadBlankTemplate,
    fillCustomTemplate,
    fillCustomTemplateOoxml,
    fillCustomTemplateBasic,
    fetchAllSchoolStudents,
    runAnemiaHealthExport,
    runHealthFollowupExport,
    runEyesHealthExport,
    runMonthlyAbsenceExport,
    runSchoolBudgetStatsExport,
    build100MillionSurveySheet,
    buildHealthFollowupSheet,
    buildMonthlyAbsenceSheet,
    buildSchoolBudgetStatsSheet,
    runBehaviorRegisterExport,
    runClassRegistersExport,
    runTwoColumnClassListsExport,
    runNewcomers41Export,
    runCallListExport,
    runOrphansExemptionsExport,
    runSpecialNeedsMergeExport,
    runEnrollmentRegistersExport,
    runManazelExport,
    runWorkersExport,
    runCustomEightColumnsExport,
    runCustomNineColumnsExport: runCustomEightColumnsExport,
    runClassBooksExport,
    downloadAnyTableAsExcel,
    requestStop
  };
})();
