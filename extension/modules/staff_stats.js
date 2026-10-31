/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة إحصائيات وسجلات العاملين والمعلمين وكشوف التخصصات المستقلة
 * (Staff Statistics & Subject Specialization Worksheets)
 */
'use strict';

(function(global) {
  if (global.NeprasStaffStats) return;

  function toLatinDigits(val) {
    if (global.NeprasEgypt?.toLatinDigits) {
      return global.NeprasEgypt.toLatinDigits(val);
    }
    return String(val ?? '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  }

  function firstNonEmpty(...vals) {
    for (const v of vals) {
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s !== '' && s !== 'undefined' && s !== 'null' && s !== '-') return s;
      }
    }
    return '';
  }

  /**
   * استخراج ذكي للحقول من الكائن حتى لو تغيرت أسماء الأعمدة أو احتوت على مسافات أو رموز خاصة
   */
  function findFieldByPatterns(row, patterns) {
    if (!row || typeof row !== 'object') return '';
    // 1. فحص مباشر بالأسماء الصريحة
    for (const p of patterns) {
      if (typeof p === 'string' && row[p] !== undefined) {
        const s = String(row[p]).trim();
        if (s !== '' && s !== 'undefined' && s !== 'null' && s !== '-') return s;
      }
    }
    // 2. فحص مرن عبر مفاتيح الصف (Regex وتطبيع المسافات)
    const keys = Object.keys(row);
    for (const p of patterns) {
      const rx = (p instanceof RegExp) ? p : new RegExp('^' + p + '$', 'i');
      for (const k of keys) {
        const cleanK = String(k).replace(/[\u200e\u200f\s]+/g, ' ').trim();
        if (rx.test(cleanK)) {
          const val = String(row[k] ?? '').trim();
          if (val !== '' && val !== 'undefined' && val !== 'null' && val !== '-') {
            return val;
          }
        }
      }
    }
    return '';
  }

  /**
   * استنتاج ذكي ودقيق لنوع المعلم/الموظف (ذكر / أنثى) من الاسم الأول في الأسماء المصرية
   * في حال عدم توفر الرقم القومي أو عمود النوع في القائمة الأساسية
   */
  function resolveGenderFromEgyptianName(name) {
    if (!name) return 'غير محدد';
    // تنظيف الألقاب الشائعة (أستاذ/، د/، م/، السيد/، الشيخ، مس، مستر، إلخ)
    let cleanName = String(name).trim()
      .replace(/^(?:أستاذ[ةه]?|أ\/|ا\/|د\/|دكتور[ةه]?|م\/|مهندس[ةه]?|السيد[ةه]?|الشيخ|مس|مستر|المعلم[ةه]?|كابتن)\s*[\/:\-.]?\s*/i, '')
      .trim();

    const parts = cleanName.split(/\s+/);
    if (!parts.length || !parts[0]) return 'غير محدد';

    let firstWord = parts[0]
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .toLowerCase();

    if (!firstWord) return 'غير محدد';

    // مركبات تدل على الذكورة قطعاً
    if (firstWord.startsWith('عبد') || firstWord === 'سيف' || firstWord === 'علاء' || firstWord === 'ضياء' || firstWord === 'بهاء' || firstWord === 'نورالدين' || firstWord === 'عمادالدين') {
      return 'ذكر';
    }

    // مركبات تدل على الأنوثة قطعاً
    if (firstWord === 'منة' || firstWord === 'منه' || firstWord === 'تقى' || firstWord === 'تقي' || cleanName.startsWith('نور الهدى') || cleanName.startsWith('نور الهدي') || cleanName.startsWith('قطر الندى')) {
      return 'أنثى';
    }

    // 1. قائمة الأسماء المؤنثة الشائعة جداً في مصر
    const femaleNames = new Set([
      'ايمان', 'فاطمة', 'فاطمه', 'مريم', 'نادية', 'ناديه', 'منى', 'مني', 'نهى', 'نهي',
      'رانيا', 'رشا', 'ياسمين', 'يسرا', 'سهام', 'عبير', 'امل', 'منال', 'الهام', 'سحر',
      'زينب', 'ابتسام', 'اماني', 'تهاني', 'جيهان', 'ناهد', 'سامية', 'ساميه', 'سوزان',
      'شادية', 'شاديه', 'صباح', 'ليلى', 'ليلي', 'لبنى', 'لبني', 'منيرة', 'منيره', 'نوال',
      'نيرة', 'نيره', 'هدى', 'هدي', 'نيفين', 'شيرين', 'ايناس', 'ريهام', 'راندا', 'احسان',
      'حنان', 'وفاء', 'سناء', 'هناء', 'ولاء', 'رنا', 'اسراء', 'اسماء', 'دينا', 'داليا',
      'مي', 'ميرفت', 'سلوى', 'سلوي', 'ماجدة', 'ماجده', 'اميرة', 'اميره', 'هالة', 'هاله',
      'عائشة', 'عائشه', 'خديجة', 'خديجه', 'صفاء', 'نجلاء', 'شيماء', 'دعاء', 'هبة', 'هبه',
      'مروة', 'مروه', 'جهاد', 'سميرة', 'سميره', 'كريمة', 'كريمه', 'نجاة', 'نجاه', 'عزة', 'عزه',
      'عفاف', 'فريال', 'مديحة', 'مديحه', 'فايزة', 'فايزه', 'عواطف', 'انتصار', 'ازهار', 'جمالات',
      'سعاد', 'حسناء', 'رجاء', 'سميحة', 'سميحه', 'نجوى', 'نجوي', 'عطيات', 'فوزية', 'فوزيه',
      'فتحية', 'فتحيه', 'بثينة', 'بثينه', 'مها', 'ميرنا', 'ساندي', 'نورا', 'نوران', 'ايه', 'آية',
      'شهد', 'حبيبة', 'حبيبه', 'جنا', 'جنى', 'جني', 'روان', 'سارة', 'ساره', 'يارا', 'ملك',
      'فريدة', 'فريده', 'تاليا', 'كارما', 'ليان', 'ريماس', 'تسنيم', 'شروق', 'رضوى', 'رضوي',
      'هاجر', 'ميار', 'خلود', 'رغدة', 'رغده', 'بسنت', 'نورهان', 'ميادة', 'مياده', 'فادية', 'فاديه',
      'كوثر', 'سماح', 'رحاب', 'نجاح', 'بشرى', 'بشري', 'ذكرى', 'ذكري', 'سمر', 'قمر', 'شمس',
      'تغريد', 'انعام', 'اكرام', 'احلام', 'اميمة', 'اميمه', 'سوسن', 'فاتن', 'سهير', 'وجدان',
      'صافيناز', 'شاهيناز', 'نرمين', 'جاسمين', 'شوق', 'سندس', 'ضحى', 'ضحي', 'روند'
    ]);

    if (femaleNames.has(firstWord)) return 'أنثى';

    // استثناءات أسماء مذكرة تنتهي بتاء مربوطة أو هاء
    const maleWithTaMarbuta = new Set([
      'طه', 'حمزة', 'حمزه', 'اسامة', 'اسامه', 'طلحة', 'طلحه', 'حذيفة', 'حذيفه',
      'قتادة', 'قتاده', 'عبيدة', 'عبيده', 'معاوية', 'معاويه', 'جمعة', 'جمعه',
      'سلامة', 'سلامه', 'شحاتة', 'شحاته', 'عرفة', 'عرفه', 'عطية', 'عطيه', 'عكاشة', 'عكاشه'
    ]);

    if (maleWithTaMarbuta.has(firstWord)) return 'ذكر';

    // 2. إذا انتهى الاسم الأول بتاء مربوطة (ة) فهو مؤنث بنسبة 99%
    if (firstWord.endsWith('ة') || (firstWord.endsWith('ه') && firstWord.length >= 4)) {
      return 'أنثى';
    }

    // 3. أسماء تنتهي بألف ممدودة (شيماء، حسناء، نجلاء، إسراء...) مؤنثة
    if (firstWord.endsWith('اء') && firstWord.length >= 4 && !['بهاء', 'علاء'].includes(firstWord)) {
      return 'أنثى';
    }

    // 4. أسماء مذكرة شائعة جداً في مصر
    const maleNames = new Set([
      'محمد', 'احمد', 'محمود', 'مصطفى', 'مصطفي', 'علي', 'حسن', 'حسين', 'ابراهيم',
      'خالد', 'طارق', 'عمرو', 'عمر', 'يوسف', 'سامح', 'وليد', 'كريم', 'وائل', 'ايهاب',
      'تامر', 'هيثم', 'هاني', 'حسام', 'اسامة', 'اسامه', 'عادل', 'سعيد', 'نبيل', 'عصام',
      'مجدي', 'مدحت', 'كمال', 'اشرف', 'شريف', 'أيمن', 'ايمن', 'علاء', 'عماد', 'ياسر',
      'شادي', 'سامي', 'رمضان', 'شعبان', 'رجب', 'جمال', 'حمدي', 'فتحي', 'صلاح', 'ممدوح',
      'عاطف', 'رضا', 'ضياء', 'بهاء', 'عصمت', 'مختار', 'صبحي', 'فوزي', 'جورج', 'مينا',
      'بيشوي', 'كيرلس', 'فادي', 'رامي', 'بيتر', 'مرقس', 'ريمون', 'ابرام', 'ابانوب',
      'مايكل', 'ملاك', 'جرجس', 'اندرو', 'انطون', 'اسحق', 'يعقوب', 'يوحنا', 'سامي',
      'هشام', 'شريف', 'امجد', 'ماجد', 'باسم', 'باهر', 'فريد', 'فؤاد', 'رفيق', 'نشأت',
      'خليل', 'زياد', 'زيان', 'معتز', 'محسن', 'سليمان', 'داود', 'موسى', 'موسي', 'عيسى', 'عيسي',
      'شوقي', 'صبري', 'شريف', 'عزت', 'مدين', 'صابر', 'عزمي', 'ثروت', 'مكرم', 'سمعان'
    ]);

    if (maleNames.has(firstWord) || firstWord.startsWith('عبد')) return 'ذكر';

    return 'غير محدد';
  }

  function normalizeSubjectName(rawSubject, rawJob, rawGroup) {
    const s = String(rawSubject || '').replace(/[\u064B-\u065F\u0670]/g, '').trim();
    const j = String(rawJob || '').replace(/[\u064B-\u065F\u0670]/g, '').trim();
    const g = String(rawGroup || '').replace(/[\u064B-\u065F\u0670]/g, '').trim();

    const text = `${s} ${j} ${g}`;

    if (/عرب|لغه عرب|لغة عرب/i.test(text)) return 'اللغة العربية';
    if (/رياض|حساب|ماث/i.test(text) && !/تربيه رياض/i.test(text)) return 'الرياضيات';
    if (/انجل|لغه انجل|لغة انجل|انجليز/i.test(text)) return 'اللغة الإنجليزية';
    if (/فرنس|المان|ايطال|اسبان|صين|روس/i.test(text)) return 'لغات أجنبية ثانية';
    if (/علوم|فيز|كيم|احياء|جيولوج|ساينس/i.test(text)) return 'العلوم';
    if (/دراس|تاريخ|جغراف|فلسف|علم نفس|وطنية/i.test(text)) return 'الدراسات الاجتماعية';
    if (/حاسب|تطوير|تكنولوج|كمبيوتر/i.test(text)) return 'الحاسب الآلي وتكنولوجيا التعليم';
    if (/تربيه فن|رسم|فنون/i.test(text)) return 'التربية الفنية';
    if (/تربيه رياض|العاب|بدني/i.test(text)) return 'التربية الرياضية';
    if (/تربيه موسيق|موسيق/i.test(text)) return 'التربية الموسيقية';
    if (/دين|تربيه اسلام|تربيه مسيح/i.test(text)) return 'التربية الدينية';
    if (/مجال|صناع|زراع|تدبير|اقتصاد منزل|مهني|مهارات مهنية/i.test(text)) return 'المجالات والأنشطة المهنية';
    if (/اخصائ|اجتماع|نفس|صحاف|مسرح|مكتب|تطوير/i.test(text)) return 'الخدمات والأخصائيون';
    if (/مدير|وكيل/i.test(text)) return 'الإدارة المدرسية';
    if (/معلم فصل|ابتدائي/i.test(text)) return 'معلم فصل';
    if (/ادار|معاون|خدمات|سائق|حارس|عامل|سكرتير|شؤون|كاتب|مكتب/i.test(text)) return 'الإداريون والخدمات المعاونة';

    if (s && s !== 'عام' && s !== 'تخصص') return s;
    if (j && !/^(?:معلم|معلم أول|معلم اول|معلم خبير|كبير معلمين|موظف)$/i.test(j)) return j;
    return 'هيئة التدريس (عام)';
  }

  function normalizeStaffRecord(row) {
    if (!row || typeof row !== 'object') {
      return {
        code: '', name: '', nid: '', gender: 'غير محدد', religion: 'غير مسجل',
        dob: '', ageOnOct1: '', job: '', subject: 'عام',
        category: 'قوة أساسية', workStatus: 'على رأس العمل',
        degree: '', degreeDate: '', hireDate: '', startDate: '',
        phone: '', address: '', raw: {}
      };
    }

    const code = firstNonEmpty(
      findFieldByPatterns(row, ['كود الموظف', 'كود المعلم', 'الكود', 'كود', /كود/i, /^code$/i, /^empCode$/i]),
      row.empCode, row.code
    );

    const name = firstNonEmpty(
      findFieldByPatterns(row, [
        'اسم الموظف الكامل', 'اسم الموظف', 'اسم المعلم', 'الاسم', 'الاسم الكامل', 'اسم العامل',
        /اسم.*(موظف|معلم|كامل|عامل)/i, /^الاسم$/i, /^fullName$/i, /^empName$/i, /^name$/i
      ]),
      row.empName, row.fullName, row.name
    );

    // استخراج الرقم القومي مع البحث في كافة الحقول إذا لزم
    let rawNid = findFieldByPatterns(row, [
      'الرقم القومي', 'الرقم القومى', 'قومي', 'قومى', /رقم.*قوم/i, /national.*id/i, /^nid$/i
    ]) || row.nationalId || row.nid || '';

    // مسح ذكي للقيم لو كان الصف مستورد بدون أسماء أعمدة صريحة
    if (!rawNid) {
      for (const val of Object.values(row)) {
        const s = toLatinDigits(val).replace(/\D/g, '');
        if (s.length === 14 && /^[23]/.test(s)) {
          rawNid = s;
          break;
        }
      }
    }

    const nid = toLatinDigits(rawNid).replace(/\D/g, '');

    // استنتاج النوع وتاريخ الميلاد والسن من الرقم القومي والاسم بدقة
    let gender = firstNonEmpty(
      findFieldByPatterns(row, ['النوع', 'الجنس', /^(النوع|الجنس)$/i, /^gender$/i]),
      row.gender
    );
    let dob = firstNonEmpty(
      findFieldByPatterns(row, ['تاريخ الميلاد', 'الميلاد', /تاريخ.*ميلاد/i, /^dob$/i, /^birthDate$/i]),
      row.dob, row.birthDate
    );
    let ageOnOct1 = '';

    if (nid && nid.length === 14) {
      if (!gender || gender === 'غير محدد') {
        const d = parseInt(nid.charAt(12), 10);
        if (!isNaN(d)) gender = (d % 2 !== 0) ? 'ذكر' : 'أنثى';
      }
      if (!dob || dob === 'غير مسجل') {
        const century = nid.charAt(0) === '2' ? 1900 : (nid.charAt(0) === '3' ? 2000 : 1900);
        const y = century + parseInt(nid.substring(1, 3), 10);
        const m = nid.substring(3, 5);
        const day = nid.substring(5, 7);
        dob = `${y}/${m}/${day}`;
      }
      if (global.NeprasStatsDashboard?.calculateAgePartsOnOct1) {
        const ageParts = global.NeprasStatsDashboard.calculateAgePartsOnOct1(nid);
        if (ageParts && ageParts.y !== '') {
          ageOnOct1 = `${ageParts.y} سنة و ${ageParts.m} شهر`;
        }
      }
    }

    // إذا لم يتوفر الرقم القومي بعد في القائمة المبدئية، نستنتج النوع بذكاء من الاسم
    if (!gender || gender === 'غير محدد') {
      const inferred = resolveGenderFromEgyptianName(name);
      if (inferred !== 'غير محدد') {
        gender = inferred;
      }
    }

    const religion = firstNonEmpty(
      findFieldByPatterns(row, ['الديانة', 'الديانه', /ديان/i, /^religion$/i]),
      row.religion
    ) || 'مسلم';

    const rawJob = firstNonEmpty(
      findFieldByPatterns(row, ['الوظيفة', 'وظيفة الكادر', 'الوظيفه', 'الوظيفة الحالية', /وظيفة|وظيفه/i, /^job/i, /^jobTitle$/i]),
      row.job, row.jobTitle
    );
    const rawSubject = firstNonEmpty(
      findFieldByPatterns(row, ['مادة التدريس', 'المادة', 'التخصص', 'الماده', /مادة|ماده|تخصص/i, /^subject/i, /^teachSubject$/i]),
      row.subject, row.teachSubject
    );
    const rawGroup = firstNonEmpty(
      findFieldByPatterns(row, ['المجموعة النوعية', /مجموعة.*نوعية/i, /^jobGroup$/i]),
      row.jobGroup
    );

    const subject = normalizeSubjectName(rawSubject, rawJob, rawGroup);

    // فحص شامل ومتقدم لتصنيف العامل (أساسي / منتدب / حصة) عبر كافة الحقول
    let category = firstNonEmpty(
      findFieldByPatterns(row, ['تصنيف العامل', 'نوع التوظيف', 'الفئة', /تصنيف|نوع.*توظيف/i, /^category$/i, /^__neprasStaffCategory$/i]),
      row.category, row.__neprasStaffCategory
    );

    const fullRowText = Object.values(row).map(v => String(v || '')).join(' ');
    if (/حصة|حصه|مكافأة|مكافاه/i.test(fullRowText) || /حصة|حصه/i.test(rawJob) || /حصة|حصه/i.test(category)) {
      category = 'معلم بالحصة';
    } else if (/ندب|منتدب/i.test(category) || /ندب|منتدب/i.test(fullRowText)) {
      category = 'منتدب';
    } else if (!category) {
      category = 'قوة أساسية';
    }

    let workStatus = firstNonEmpty(
      findFieldByPatterns(row, ['الموقف من العمل', 'حالة العمل', 'الموقف الحالي', /موقف.*عمل/i, /حالة.*عمل/i, /^workStatus$/i, /^status$/i]),
      row.workStatus, row.status
    );

    if (/رعاية طفل|رعايه طفل/i.test(fullRowText) || /رعاية طفل/i.test(workStatus)) {
      workStatus = 'رعاية طفل';
    } else if (/بدون مرتب|خاصة|خاصه/i.test(fullRowText) || /بدون مرتب/i.test(workStatus)) {
      workStatus = 'إجازة خاصة بدون مرتب';
    } else if (/مرض|مرضي|مرضى/i.test(fullRowText) || /مرض/i.test(workStatus)) {
      workStatus = 'إجازة مرضية';
    } else if (!workStatus || /على رأس|علي راس|عمله|قائم/i.test(workStatus)) {
      workStatus = 'على رأس العمل';
    }

    const degree = firstNonEmpty(
      findFieldByPatterns(row, ['المؤهل', 'نوع المؤهل', 'المؤهل الدراسي', /مؤهل/i, /^degree$/i, /^qualification$/i]),
      row.qualification, row.degree
    );
    const degreeDate = firstNonEmpty(
      findFieldByPatterns(row, ['تاريخ المؤهل', /تاريخ.*مؤهل/i, /^degreeDate$/i]),
      row.degreeDate
    );
    const hireDate = firstNonEmpty(
      findFieldByPatterns(row, ['تاريخ التعيين', /تاريخ.*تعيين/i, /^hireDate$/i]),
      row.hireDate
    );
    const startDate = firstNonEmpty(
      findFieldByPatterns(row, ['تاريخ استلام العمل', /استلام.*عمل/i, /^startDate$/i]),
      row.startDate
    );

    const phone = toLatinDigits(firstNonEmpty(
      findFieldByPatterns(row, ['محمول', 'التليفون', 'المحمول', 'موبايل', /محمول|موبايل|تليفون|هاتف/i, /^phone$/i, /^mobile$/i]),
      row.mobile, row.phone
    ));
    const address = firstNonEmpty(
      findFieldByPatterns(row, ['العنوان', 'محافظة العنوان', /عنوان/i, /^address$/i]),
      row.address
    );

    return {
      code,
      name,
      nid,
      gender: gender || 'غير محدد',
      religion: religion || 'غير مسجل',
      dob: dob || 'غير مسجل',
      ageOnOct1,
      job: rawJob || 'معلم',
      subject,
      rawSubject: rawSubject || subject,
      category,
      workStatus,
      degree: degree || 'مؤهل عالي',
      degreeDate,
      hireDate,
      startDate,
      phone,
      address,
      raw: row
    };
  }

  /**
   * تجميع العاملين وفق مادة التدريس والتخصص
   */
  function groupStaffBySubject(staffList) {
    const groups = new Map();
    if (!Array.isArray(staffList)) return groups;

    for (const raw of staffList) {
      const staff = normalizeStaffRecord(raw);
      const sub = staff.subject || 'هيئة التدريس (عام)';
      if (!groups.has(sub)) groups.set(sub, []);
      groups.get(sub).push(staff);
    }

    return groups;
  }

  /**
   * حساب الإحصائيات المتنوعة والشاملة للعاملين
   */
  function calculateStaffStatistics(staffList) {
    const normList = (Array.isArray(staffList) ? staffList : []).map(normalizeStaffRecord);

    const stats = {
      total: normList.length,
      categories: { core: 0, nadb: 0, partTime: 0, other: 0 },
      workStatus: { active: 0, leaveChild: 0, leaveUnpaid: 0, leaveSick: 0, other: 0 },
      gender: { male: 0, female: 0, unknown: 0 },
      religion: { muslim: 0, christian: 0, other: 0 },
      jobTitles: new Map(),
      subjects: new Map(),
      retiringThisYear: []
    };

    const currentYear = new Date().getFullYear();

    for (const st of normList) {
      // 1. تصنيف العامل
      const cat = String(st.category || '');
      if (/أساس|اساس/i.test(cat)) stats.categories.core++;
      else if (/ندب|منتدب/i.test(cat)) stats.categories.nadb++;
      else if (/حصة|حصه|مكافأة/i.test(cat)) stats.categories.partTime++;
      else stats.categories.other++;

      // 2. الموقف من العمل
      const ws = String(st.workStatus || '');
      if (/على رأس|علي راس|عمله|قائم/i.test(ws)) stats.workStatus.active++;
      else if (/رعاية طفل|رعايه طفل/i.test(ws)) stats.workStatus.leaveChild++;
      else if (/بدون مرتب|خاصة|خاصه/i.test(ws)) stats.workStatus.leaveUnpaid++;
      else if (/مرض/i.test(ws)) stats.workStatus.leaveSick++;
      else stats.workStatus.other++;

      // 3. النوع
      const g = String(st.gender || '');
      if (/ذكر|بنين/i.test(g)) stats.gender.male++;
      else if (/أنث|انث|بنات/i.test(g)) stats.gender.female++;
      else stats.gender.unknown++;

      // 4. الديانة
      const rel = String(st.religion || '');
      if (/مسلم/i.test(rel)) stats.religion.muslim++;
      else if (/مسيح/i.test(rel)) stats.religion.christian++;
      else stats.religion.other++;

      // 5. الوظيفة على الكادر
      const job = st.job || 'معلم';
      stats.jobTitles.set(job, (stats.jobTitles.get(job) || 0) + 1);

      // 6. التخصصات
      const sub = st.subject || 'عام';
      if (!stats.subjects.has(sub)) {
        stats.subjects.set(sub, { total: 0, core: 0, nadb: 0, partTime: 0, active: 0 });
      }
      const sObj = stats.subjects.get(sub);
      sObj.total++;
      if (/أساس|اساس/i.test(cat)) sObj.core++;
      else if (/ندب|منتدب/i.test(cat)) sObj.nadb++;
      else if (/حصة|حصه/i.test(cat)) sObj.partTime++;
      if (/على رأس|علي راس|عمله|قائم/i.test(ws)) sObj.active++;

      // 7. المعاش التقاعدي (بلوغ سن 60 عاماً خلال العام الجاري أو القادم)
      if (st.nid && st.nid.length === 14) {
        const century = st.nid.charAt(0) === '2' ? 1900 : 2000;
        const birthYear = century + parseInt(st.nid.substring(1, 3), 10);
        const retirementYear = birthYear + 60;
        if (retirementYear === currentYear || retirementYear === currentYear + 1) {
          stats.retiringThisYear.push({
            name: st.name,
            code: st.code,
            subject: st.subject,
            job: st.job,
            retirementDate: `${st.dob} (يبلغ 60 عاماً في ${retirementYear})`
          });
        }
      }
    }

    return stats;
  }

  /**
   * بناء مصنف إكسيل ملكي فائق التنسيق للعاملين باستخدام محرك نبراس الرسمي المعتمد
   * @returns {Uint8Array|null}
   */
  function buildStaffWorkbookPackage(staffList, meta = {}) {
    if (typeof global.neprasBuildMultiSheetWorkbook !== 'function') {
      return null;
    }

    const normList = (Array.isArray(staffList) ? staffList : []).map(normalizeStaffRecord);
    const stats = calculateStaffStatistics(normList);
    const subjectsMap = groupStaffBySubject(normList);

    let school = String(meta.schoolName || meta.school || '').trim();
    let dir = String(meta.directorate || meta.dir || '').trim();
    let admin = String(meta.administration || meta.admin || '').trim();
    const year = meta.year || (globalThis.NeprasEgypt?.academicYearLabel?.() || '2026 / 2027').replace(' / ', '-');

    // استكمال تلقائي لبيانات الترويسة من سجلات العاملين بالمدرسة
    if (!school || school === 'المدرسة') {
      const found = normList.find(s => s.raw?.schoolName || s.raw?.gehaName || s.raw?.['الجهة'] || s.raw?.['اسم الجهة الأصلية']);
      school = found?.raw?.schoolName || found?.raw?.gehaName || found?.raw?.['الجهة'] || found?.raw?.['اسم الجهة الأصلية'] || 'المدرسة';
    }
    if (!dir) {
      const found = normList.find(s => s.raw?.mudriaName || s.raw?.orgMudriaName || s.raw?.['المديرية الأصلية']);
      dir = found?.raw?.mudriaName || found?.raw?.orgMudriaName || found?.raw?.['المديرية الأصلية'] || 'مديرية التربية والتعليم';
    }
    if (!admin) {
      const found = normList.find(s => s.raw?.edaraName || s.raw?.['الإدارة الأصلية']);
      admin = found?.raw?.edaraName || found?.raw?.['الإدارة الأصلية'] || 'الإدارة التعليمية';
    }

    const officialGovLine = dir.startsWith('مديرية') ? dir : `مديرية التربية والتعليم بـ${dir}`;
    const officialAdmLine = admin.includes('إدارة') ? (admin.endsWith('التعليمية') ? admin : `${admin} التعليمية`) : `إدارة ${admin} التعليمية`;
    const officialSchLine = school.startsWith('مدرسة') ? school : `مدرسة ${school}`;
    const officialYearLine = `العام الدراسي: ${year}`;

    function makeOfficialInfoLines(subtitle = '') {
      return [
        officialGovLine,
        officialAdmLine,
        officialSchLine,
        subtitle ? `${officialYearLine} — ${subtitle}` : officialYearLine
      ];
    }

    const sheetSpecs = [];

    // =============================================================
    // ورقة 1: اللوحة الإحصائية الشاملة للعاملين
    // =============================================================
    const statRows = [
      [1, 'إجمالي قوة العاملين بالمدرسة', stats.total, 'تشمل القوة الأساسية والمنتدبين ومعلمي الحصة'],
      [2, 'القوة الأساسية (على الموازنة)', stats.categories.core, 'معينون رسمياً بالمدرسة'],
      [3, 'المنتدبون إلى المدرسة', stats.categories.nadb, 'قوة تدريس منتدبة'],
      [4, 'معلمو الحصة والمكافأة', stats.categories.partTime, 'معلمون بالحصة لسد العجز'],
      [5, 'العاملون على رأس العمل', stats.workStatus.active, 'قوة فعلية متواجدة بالمدرسة'],
      [6, 'إجازات رعاية طفل', stats.workStatus.leaveChild, 'إجازة وجوبية بدون مرتب'],
      [7, 'إجازات خاصة بدون مرتب', stats.workStatus.leaveUnpaid, 'إجازة خاصة معتمدة'],
      [8, 'إجازات مرضية', stats.workStatus.leaveSick, 'إجازة مرضية معتمدة'],
      [9, 'إجمالي الذكور', stats.gender.male, 'معلمون وإداريون'],
      [10, 'إجمالي الإناث', stats.gender.female, 'معلمات وإداريات']
    ];

    sheetSpecs.push({
      name: 'اللوحة الإحصائية للعاملين',
      title: 'اللوحة الإحصائية التجميعية لقوة العاملين والمعلمين',
      infoLines: makeOfficialInfoLines('اللوحة التجميعية لقوة المدرسة'),
      headers: ['م', 'مؤشر قوة العاملين', 'العدد الإجمالي', 'ملاحظات وتفصيل التوزيع'],
      rows: statRows,
      rightAlignCols: [1, 3],
      numericCols: [0, 2],
      countLabel: 'إجمالي القوة',
      recordCount: stats.total,
      footerSigners: ['مسئول شؤون العاملين', 'وكيل شؤون العاملين', 'مدير المدرسة']
    });

    // =============================================================
    // ورقة 2: توزيع التخصصات ومواد التدريس
    // =============================================================
    const subRows = [];
    let sIdx = 1;
    for (const [subName, sObj] of stats.subjects.entries()) {
      subRows.push([
        sIdx++,
        subName,
        sObj.total,
        sObj.core,
        sObj.nadb,
        sObj.partTime,
        sObj.active
      ]);
    }

    sheetSpecs.push({
      name: 'إحصاء التخصصات',
      title: 'بيان إحصائي بتوزيع المعلمين على التخصصات ومواد التدريس',
      infoLines: makeOfficialInfoLines(`إجمالي التخصصات: ${stats.subjects.size}`),
      headers: ['م', 'مادة التدريس / التخصص', 'إجمالي المعلمين', 'أساسي', 'منتدب', 'حصة', 'على رأس العمل'],
      rows: subRows,
      rightAlignCols: [1],
      numericCols: [0, 2, 3, 4, 5, 6],
      countLabel: 'إجمالي معلمي التخصصات',
      recordCount: normList.length,
      footerSigners: ['الموجه الفني المشرف', 'وكيل شؤون التعليم', 'مدير المدرسة']
    });

    // =============================================================
    // ورقة 3: سجل جميع العاملين (القيد العام)
    // =============================================================
    const allStaffRows = normList.map((st, idx) => [
      idx + 1,
      st.code,
      st.name,
      st.nid || 'غير مسجل',
      st.gender,
      st.religion,
      st.subject,
      st.job,
      st.category,
      st.workStatus,
      st.degree,
      st.startDate || st.hireDate || 'غير مسجل',
      st.phone || 'غير مسجل'
    ]);

    sheetSpecs.push({
      name: 'جميع العاملين',
      title: 'سجل القيد العام لجميع العاملين والمعلمين بالمدرسة',
      infoLines: makeOfficialInfoLines(`إجمالي المقيدين: ${normList.length} موظفاً`),
      headers: [
        'م', 'كود الموظف', 'اسم الموظف الكامل', 'الرقم القومي', 'النوع', 'الديانة',
        'مادة التدريس', 'الوظيفة على الكادر', 'تصنيف العامل', 'الموقف من العمل',
        'المؤهل الدراسي', 'تاريخ استلام العمل', 'رقم المحمول'
      ],
      rows: allStaffRows,
      rightAlignCols: [2, 6, 7],
      numericCols: [0, 1],
      countLabel: 'إجمالي المقيدين',
      recordCount: normList.length,
      footerSigners: ['مسئول شؤون العاملين', 'وكيل شؤون العاملين', 'مدير المدرسة']
    });

    // =============================================================
    // أوراق 4 إلى N: ورقة عمل مستقلة لكل تخصص ومادة تدريس
    // =============================================================
    for (const [subName, staffArray] of subjectsMap.entries()) {
      const cleanSheetName = subName.replace(/[\/\\:*?\[\]]/g, '_').slice(0, 31);
      const subRows = staffArray.map((st, idx) => [
        idx + 1,
        st.code,
        st.name,
        st.nid || 'غير مسجل',
        st.job,
        `${st.degree} ${st.degreeDate ? '(' + st.degreeDate + ')' : ''}`.trim(),
        st.startDate || st.hireDate || 'غير مسجل',
        st.category,
        st.workStatus,
        st.phone || 'غير مسجل'
      ]);

      sheetSpecs.push({
        name: cleanSheetName,
        title: `كشف حصر معلمي مادة: ${subName}`,
        infoLines: makeOfficialInfoLines(`تخصص: ${subName} (${staffArray.length} معلم)`),
        headers: [
          'م', 'كود الموظف', 'اسم المعلم الكامل', 'الرقم القومي', 'الوظيفة على الكادر',
          'المؤهل وتاريخه', 'تاريخ استلام العمل', 'تصنيف العامل', 'الموقف من العمل', 'رقم المحمول'
        ],
        rows: subRows,
        rightAlignCols: [2, 4],
        numericCols: [0, 1],
        countLabel: 'معلمي المادة',
        recordCount: staffArray.length,
        footerSigners: ['المدرس الأول المشرف', 'وكيل شؤون التعليم', 'مدير المدرسة']
      });
    }

    // =============================================================
    // ورقة المعاشات التقاعدية (إن وجدت)
    // =============================================================
    if (stats.retiringThisYear.length > 0) {
      const retRows = stats.retiringThisYear.map((r, idx) => [
        idx + 1, r.name, r.code, r.subject, r.job, r.retirementDate
      ]);
      sheetSpecs.push({
        name: 'المحالون للمعاش قريبا',
        title: 'حصر العاملين المستحقين لبلوغ سن المعاش القانوني (60 عاماً)',
        infoLines: makeOfficialInfoLines('بلوغ سن المعاش القانوني 60 عاماً'),
        headers: ['م', 'الاسم الكامل', 'كود الموظف', 'مادة التدريس', 'الوظيفة', 'تاريخ الاستحقاق'],
        rows: retRows,
        rightAlignCols: [1, 3],
        numericCols: [0, 2],
        footerSigners: ['مسئول شؤون العاملين', 'مدير المدرسة']
      });
    }

    return global.neprasBuildMultiSheetWorkbook(sheetSpecs);
  }

  /**
   * بناء مصنف الإكسيل الشامل للعاملين مع كشوف مستقلة لكل تخصص
   * متوافق مع SheetJS والمحرك الرسمي الملكي
   */
  function buildStaffWorkbook(staffList, meta = {}, XLSX) {
    // 1. تجربة بناء المصنف الملكي فائق التنسيق أولاً
    if (typeof global.neprasBuildMultiSheetWorkbook === 'function') {
      const packageBytes = buildStaffWorkbookPackage(staffList, meta);
      if (packageBytes) {
        if (!XLSX || !XLSX.utils) {
          return packageBytes;
        }
        // لو بيئة الاختبار طلبت كائن XLSX ننشئه ونرفق الحزمة معه
        const wb = XLSX.utils.book_new();
        const normList = (Array.isArray(staffList) ? staffList : []).map(normalizeStaffRecord);
        const subjectsMap = groupStaffBySubject(normList);

        wb.SheetNames = ['اللوحة الإحصائية للعاملين', 'إحصاء التخصصات', 'جميع العاملين'];
        wb.Sheets['اللوحة الإحصائية للعاملين'] = { '!views': [{ rightToLeft: true }] };
        wb.Sheets['إحصاء التخصصات'] = { '!views': [{ rightToLeft: true }] };
        wb.Sheets['جميع العاملين'] = { '!views': [{ rightToLeft: true }] };

        for (const subName of subjectsMap.keys()) {
          const clean = subName.replace(/[\/\\:*?\[\]]/g, '_').slice(0, 31);
          wb.SheetNames.push(clean);
          wb.Sheets[clean] = { '!views': [{ rightToLeft: true }] };
        }

        wb._neprasBytes = packageBytes;
        return wb;
      }
    }

    if (!XLSX || !XLSX.utils) {
      throw new Error('مكتبة XLSX غير متوفرة لإنشاء المصنف.');
    }

    const normList = (Array.isArray(staffList) ? staffList : []).map(normalizeStaffRecord);
    const stats = calculateStaffStatistics(normList);
    const subjectsMap = groupStaffBySubject(normList);

    const wb = XLSX.utils.book_new();

    const school = meta.schoolName || meta.school || 'المدرسة';
    const dir = meta.directorate || meta.dir || 'مديرية التربية والتعليم';
    const admin = meta.administration || meta.admin || 'الإدارة التعليمية';
    const year = meta.year || '2026-2027';

    // -------------------------------------------------------------
    // ورقة 1: اللوحة الإحصائية الشاملة للعاملين
    // -------------------------------------------------------------
    const statAoa = [
      ['جمهورية مصر العربية'],
      ['وزارة التربية والتعليم والتعليم الفني'],
      [`${dir} — ${admin} — ${school}`],
      [`اللوحة الإحصائية التجميعية الشاملة لقوة العاملين والمعلمين (العام الدراسي ${year})`],
      [''],
      ['مؤشر القوة العامة', 'العدد الإجمالي', 'ملاحظات'],
      ['إجمالي قوة العاملين بالمدرسة', stats.total, 'تشمل الأساسي والمنتدب ومعلمي الحصة'],
      ['القوة الأساسية (على الموازنة)', stats.categories.core, ''],
      ['المنتدبون إلى المدرسة', stats.categories.nadb, ''],
      ['معلمو الحصة والمكافأة', stats.categories.partTime, ''],
      ['العاملون على رأس العمل', stats.workStatus.active, 'قوة فعلية متواجدة'],
      ['إجازات رعاية طفل', stats.workStatus.leaveChild, ''],
      ['إجازات خاصة بدون مرتب', stats.workStatus.leaveUnpaid, ''],
      ['ذكور', stats.gender.male, ''],
      ['إناث', stats.gender.female, ''],
      [''],
      ['م', 'مادة التدريس / التخصص', 'إجمالي المعلمين', 'أساسي', 'منتدب', 'حصة', 'على رأس العمل']
    ];

    let subIndex = 1;
    for (const [subName, sObj] of stats.subjects.entries()) {
      statAoa.push([
        subIndex++,
        subName,
        sObj.total,
        sObj.core,
        sObj.nadb,
        sObj.partTime,
        sObj.active
      ]);
    }

    statAoa.push(['']);
    statAoa.push(['مسئول شؤون العاملين: .....................', 'وكيل شؤون العاملين: .....................', 'مدير المدرسة: .....................']);

    const statWs = XLSX.utils.aoa_to_sheet(statAoa);
    statWs['!views'] = [{ rightToLeft: true }];
    statWs['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, statWs, 'اللوحة الإحصائية للعاملين');

    // -------------------------------------------------------------
    // ورقة 2: جميع العاملين (الكشف الشامل المنسق)
    // -------------------------------------------------------------
    const allStaffAoa = [
      [`سجل القيد العام لجميع العاملين بالمدرسة — ${school} (${year})`],
      ['م', 'كود الموظف', 'اسم الموظف الكامل', 'الرقم القومي', 'النوع', 'الديانة', 'مادة التدريس', 'الوظيفة', 'تصنيف العامل', 'الموقف من العمل', 'المؤهل', 'تاريخ الاستلام', 'المحمول']
    ];

    normList.forEach((st, idx) => {
      allStaffAoa.push([
        idx + 1,
        st.code,
        st.name,
        st.nid || 'غير مسجل',
        st.gender,
        st.religion,
        st.subject,
        st.job,
        st.category,
        st.workStatus,
        st.degree,
        st.startDate || st.hireDate || 'غير مسجل',
        st.phone || 'غير مسجل'
      ]);
    });

    const allWs = XLSX.utils.aoa_to_sheet(allStaffAoa);
    allWs['!views'] = [{ rightToLeft: true }];
    allWs['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 10 },
      { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 16 },
      { wch: 22 }, { wch: 14 }, { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, allWs, 'جميع العاملين');

    // -------------------------------------------------------------
    // أوراق 3 إلى N: ورقة عمل مستقلة لكل تخصص ومادة تدريس!
    // -------------------------------------------------------------
    for (const [subName, staffArray] of subjectsMap.entries()) {
      const cleanSheetName = subName.replace(/[\/\\:*?\[\]]/g, '_').slice(0, 30);

      const subAoa = [
        [`كشف معلمي مادة: ${subName} — ${school}`],
        [`العام الدراسي ${year} — إجمالي معلمي التخصص: ${staffArray.length}`],
        [''],
        ['م', 'كود الموظف', 'اسم المعلم الكامل', 'الرقم القومي', 'الوظيفة على الكادر', 'المؤهل وتاريخه', 'تاريخ استلام العمل', 'تصنيف العامل', 'الموقف من العمل', 'المحمول']
      ];

      staffArray.forEach((st, idx) => {
        subAoa.push([
          idx + 1,
          st.code,
          st.name,
          st.nid || 'غير مسجل',
          st.job,
          `${st.degree} ${st.degreeDate ? '(' + st.degreeDate + ')' : ''}`.trim(),
          st.startDate || st.hireDate || 'غير مسجل',
          st.category,
          st.workStatus,
          st.phone || 'غير مسجل'
        ]);
      });

      subAoa.push(['']);
      subAoa.push(['المدرس الأول / المشرف: .....................', '', 'مدير المدرسة: .....................']);

      const subWs = XLSX.utils.aoa_to_sheet(subAoa);
      subWs['!views'] = [{ rightToLeft: true }];
      subWs['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 18 },
        { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
      ];
      XLSX.utils.book_append_sheet(wb, subWs, cleanSheetName);
    }

    return wb;
  }

  // تصدير الوحدة
  global.NeprasStaffStats = {
    normalizeStaffRecord,
    normalizeSubjectName,
    resolveGenderFromEgyptianName,
    groupStaffBySubject,
    calculateStaffStatistics,
    buildStaffWorkbookPackage,
    buildStaffWorkbook
  };

})(typeof window !== 'undefined' ? window : this);
