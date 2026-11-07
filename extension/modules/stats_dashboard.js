/**
 * نبراس — أدوات المدرسة الموحّدة
 * مركز الإحصائيات والتقارير الشاملة المتقدمة
 * وحدة إدارة وتحليل وتقارير بيانات الطلاب بالكامل
 */
'use strict';

(function(global) {
  if (global.NeprasStatsDashboard) return;

  // -------------------------------------------------------------
  // 1. الدوال المساعدة المشتركة لحسابات الأعمار والأرقام القومية
  // -------------------------------------------------------------

  function toLatinDigits(val) {
    if (global.NeprasEgypt?.toLatinDigits) {
      return global.NeprasEgypt.toLatinDigits(val);
    }
    return String(val ?? '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  }

  function calculateAgePartsOnOct1(nid, targetYearStr) {
    const rawNid = toLatinDigits(nid).trim();
    if (!rawNid || rawNid.length !== 14) return { y: '', m: '', d: '', fullDob: '' };

    const centuryDigit = parseInt(rawNid.charAt(0), 10);
    const yr = parseInt(rawNid.substring(1, 3), 10);
    const mo = parseInt(rawNid.substring(3, 5), 10);
    const dy = parseInt(rawNid.substring(5, 7), 10);

    const fullYear = (centuryDigit === 2 ? 1900 : centuryDigit === 3 ? 2000 : 1900) + yr;
    const birthDate = new Date(fullYear, mo - 1, dy);

    let targetYear = new Date().getFullYear();
    if (targetYearStr) {
      const matches = String(targetYearStr).match(/\d{4}/g);
      if (matches && matches.length > 0) {
        targetYear = Math.min(...matches.map(Number));
      }
    } else if (new Date().getMonth() < 7) {
      targetYear -= 1;
    }

    const targetDate = new Date(targetYear, 9, 1); // 1 أكتوبر
    let ageY = targetDate.getFullYear() - birthDate.getFullYear();
    let ageM = targetDate.getMonth() - birthDate.getMonth();
    let ageD = targetDate.getDate() - birthDate.getDate();

    if (ageD < 0) {
      ageM--;
      const prevMonthDays = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0).getDate();
      ageD += prevMonthDays;
    }
    if (ageM < 0) {
      ageY--;
      ageM += 12;
    }

    return {
      y: ageY,
      m: ageM,
      d: ageD,
      fullDob: `${fullYear}/${String(mo).padStart(2, '0')}/${String(dy).padStart(2, '0')}`
    };
  }

  function decodeNID(nid) {
    const rawNid = toLatinDigits(nid).trim();
    if (!rawNid || rawNid.length !== 14 || !/^\d{14}$/.test(rawNid)) return null;

    const centuryStr = rawNid.charAt(0);
    const century = centuryStr === '2' ? 1900 : centuryStr === '3' ? 2000 : 0;
    if (century === 0) return null;

    const yr = century + parseInt(rawNid.substring(1, 3), 10);
    const mo = rawNid.substring(3, 5);
    const dy = rawNid.substring(5, 7);
    const govCode = rawNid.substring(7, 9);
    const genderDigit = parseInt(rawNid.charAt(12), 10);

    const govMap = {
      '01': 'القاهرة', '02': 'الإسكندرية', '03': 'بورسعيد', '04': 'السويس',
      '11': 'دمياط', '12': 'الدقهلية', '13': 'الشرقية', '14': 'القليوبية',
      '15': 'كفر الشيخ', '16': 'الغربية', '17': 'المنوفية', '18': 'البحيرة',
      '19': 'الإسماعيلية', '21': 'الجيزة', '22': 'بني سويف', '23': 'الفيوم',
      '24': 'المنيا', '25': 'أسيوط', '26': 'سوهاج', '27': 'قنا',
      '28': 'أسوان', '29': 'الأقصر', '31': 'البحر الأحمر', '32': 'الوادي الجديد',
      '33': 'مطروح', '34': 'شمال سيناء', '35': 'جنوب سيناء', '88': 'خارج الجمهورية'
    };

    return {
      birthDate: `${yr}-${mo}-${dy}`,
      governorate: govMap[govCode] || 'غير محدد',
      gender: genderDigit % 2 !== 0 ? 'بنين' : 'بنات'
    };
  }

  function normalizeName(name) {
    if (!name) return '';
    return String(name)
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/ة/g, 'ه')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/عبد\s+/g, 'عبد')
      .replace(/ابو\s+/g, 'ابو')
      .replace(/\s+الدين/g, 'الدين')
      .replace(/\s+الله/g, 'الله');
  }

  function getLevenshteinDistance(a, b) {
    if (!a) return (b || '').length;
    if (!b) return a.length;
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[m][n];
  }

  function checkMotherMatch(name1, name2) {
    if (!name1 || !name2) return { match: false, isTypo: false };
    const parts1 = name1.split(' ');
    const parts2 = name2.split(' ');
    const minLen = Math.min(parts1.length, parts2.length);
    if (minLen < 2) return { match: false, isTypo: false };

    const compareLen = Math.min(minLen, 3);
    let totalDiffs = 0;
    let exactMatches = 0;

    for (let i = 0; i < compareLen; i++) {
      if (parts1[i] === parts2[i]) {
        exactMatches++;
      } else {
        totalDiffs += getLevenshteinDistance(parts1[i], parts2[i]);
      }
    }

    if (exactMatches === compareLen) return { match: true, isTypo: false };
    if (totalDiffs <= 2) return { match: true, isTypo: true };
    return { match: false, isTypo: false };
  }

  function getGradeOrderRank(gradeStr) {
    const s = String(gradeStr || '')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .trim();
    if (!s || s === 'غير محدد') return 999;

    let stageOffset = 10;
    if (/رياض|مستوي|kg/i.test(s)) stageOffset = 0;
    else if (/ابتدائ/i.test(s)) stageOffset = 10;
    else if (/اعداد/i.test(s)) stageOffset = 20;
    else if (/ثانو|فني|صناع|تجار|زراع/i.test(s)) stageOffset = 30;

    if (/الاول|اول|\b1\b|kg\s*1/i.test(s)) return stageOffset + 1;
    if (/الثاني|ثاني|\b2\b|kg\s*2/i.test(s)) return stageOffset + 2;
    if (/الثالث|ثالث|\b3\b/i.test(s)) return stageOffset + 3;
    if (/الرابع|رابع|\b4\b/i.test(s)) return stageOffset + 4;
    if (/الخامس|خامس|\b5\b/i.test(s)) return stageOffset + 5;
    if (/السادس|سادس|\b6\b/i.test(s)) return stageOffset + 6;

    const num = parseInt(s, 10);
    if (!isNaN(num)) return stageOffset + num;
    return 99;
  }

  const sortGrades = (a, b) => {
    const diff = getGradeOrderRank(a) - getGradeOrderRank(b);
    if (diff !== 0) return diff;
    return String(a || '').localeCompare(String(b || ''), 'ar');
  };

  function firstNonEmpty(...vals) {
    for (const v of vals) {
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s !== '' && s !== 'undefined' && s !== 'null') return s;
      }
    }
    return '';
  }

  function normalizeClassName(val) {
    const raw = String(val ?? '').trim();
    if (!raw) return '';
    const norm = toLatinDigits(raw)
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
    const invalid = new Set(['0', '-1', '-', '—', '--', 'اختر', 'غير محدد', 'بدون فصل', 'بدون', 'لا يوجد', 'لايوجد']);
    if (invalid.has(norm)) return '';
    if (norm.includes('اختر') || norm.includes('بدون فصل') || norm.includes('لا يوجد')) return '';
    return raw;
  }

  /**
   * توحيد سجل الطالب من أي مصدر (إحصاء المدرسة السريع، السحب العادي، التنزيل الشامل، أو ملف Excel خارجي)
   */
  function normalizeStudentRecord(row) {
    if (!row || typeof row !== 'object') {
      return {
        code: '', name: '', fatherName: '', nid: '', grade: 'غير محدد', cls: '',
        gender: '', religion: '', status: '', mode: '',
        isIntegrated: false, integrationType: '', mother: '', phone: '',
        address: '', birthGov: '', lang1: '', lang2: '', section: '', specialization: '',
        exemptionType: '', exemptionClass: '', paid: false, financeStatus: '',
        raw: {}
      };
    }

    const raw = (row.__neprasApiRaw && typeof row.__neprasApiRaw === 'object') ? row.__neprasApiRaw : {};

    // خريطة تحويل معرفات الوزارة الرقمية الرسمية (بوابة التلميذ student.emis.gov.eg)
    const STUDY_TYPE_MAP = { 1: 'نظامي', 2: 'منازل', 3: 'خدمات', '1': 'نظامي', '2': 'منازل', '3': 'خدمات' };
    const REGISTRATION_STATUS_MAP = {
      1: 'ناجح ومنقول', 2: 'راسب وباق للاعادة', 8: 'استبعاد للوفاه',
      9: 'تحويل مسار', 10: 'سحب ملف', 12: 'فصل لتعدى نسبة الغياب',
      '1': 'ناجح ومنقول', '2': 'راسب وباق للاعادة', '8': 'استبعاد للوفاه',
      '9': 'تحويل مسار', '10': 'سحب ملف', '12': 'فصل لتعدى نسبة الغياب'
    };
    const DIVISION_MAP = {
      2: 'أدبي', 3: 'علمي',
      203: 'مسار الطب وعلوم الحياة',
      204: 'مسار الهندسة وعلوم الحاسب',
      205: 'مسار الأعمال',
      206: 'مسار الآداب والفنون',
      '2': 'أدبي', '3': 'علمي',
      '203': 'مسار الطب وعلوم الحياة',
      '204': 'مسار الهندسة وعلوم الحاسب',
      '205': 'مسار الأعمال',
      '206': 'مسار الآداب والفنون'
    };
    const SPECIALIZATION_MAP = {
      676: 'مسار الطب وعلوم الحياة',
      '676': 'مسار الطب وعلوم الحياة'
    };
    const DISABILITY_MAP = {
      0: 'لا يوجد', 1: 'إعاقة بصرية', 2: 'إعاقة سمعية', 3: 'إعاقة ذهنية',
      4: 'شلل دماغي', 5: 'توحد', 6: 'متلازمة داون', 7: 'إعاقة حركية', 8: 'بطء التعلم',
      '0': 'لا يوجد', '1': 'إعاقة بصرية', '2': 'إعاقة سمعية', '3': 'إعاقة ذهنية',
      '4': 'شلل دماغي', '5': 'توحد', '6': 'متلازمة داون', '7': 'إعاقة حركية', '8': 'بطء التعلم'
    };
    const LANGUAGE_MAP = {
      1: 'لغة إنجليزية', 2: 'لغة فرنسية', 3: 'لغة ألمانية', 4: 'لغة إيطالية',
      5: 'لغة إسبانية', 6: 'لغة صينية', 7: 'معفى', 8: 'لغة روسية', 9: 'لغة يابانية',
      '1': 'لغة إنجليزية', '2': 'لغة فرنسية', '3': 'لغة ألمانية', '4': 'لغة إيطالية',
      '5': 'لغة إسبانية', '6': 'لغة صينية', '7': 'معفى', '8': 'لغة روسية', '9': 'لغة يابانية'
    };
    const LEVEL_MAP = {
      1: 'الصف الأول الثانوي', 2: 'الصف الثاني الثانوي', 3: 'الصف الثالث الثانوي',
      '1': 'الصف الأول الثانوي', '2': 'الصف الثاني الثانوي', '3': 'الصف الثالث الثانوي'
    };

    let code = firstNonEmpty(
      row['كود التلميذ'], row['كود الطالب'], row['الكود'], row['كود'],
      row.code, row.studentCode, row.stdStudentId, raw.studentCode, raw.stdStudentId
    );

    let name = firstNonEmpty(
      row['الاسم بالكامل'], row['اسم التلميذ'], row['اسم الطالب'], row['الاسم'], row['اسم'],
      row.name, row.fullName, row.studentName, raw.studentName
    );

    let fatherName = firstNonEmpty(
      row['اسم الوالد'], row['اسم الأب'], row['اسم الاب'],
      row.fatherFullName, row.fatherName
    );

    let rawNid = firstNonEmpty(
      row['الرقم القومي'], row['الرقم القومى'], row['رقم قومي'], row['قومي'],
      row.nationalId, row.national_id, row.nid, raw.nationalId
    );

    const rawLevelId = row.levelId ?? raw.levelId ?? '';
    let grade = firstNonEmpty(
      row['الصف'], row['الصف الدراسي'],
      row.grade, row.gradeName, row.stage, row.__neprasGrade, raw.className,
      LEVEL_MAP[rawLevelId]
    ) || 'غير محدد';

    let rawCls = firstNonEmpty(
      row['الفصل'], row['الفصل الدراسي'], row['اسم الفصل'], row['رقم الفصل'],
      row.className, row.classRoom, row.class_number, row.classNumber, row.class_name, row.class,
      row.classId, raw.classNumber, raw.classId
    );

    const rawStudyTypeId = row.studyTypeId ?? raw.studyTypeId ?? '';
    let mode = firstNonEmpty(
      row['نوع التعليم'], row['نوعية التعليم'], row['نظام التعليم'], row['نوعيه التعليم'],
      row.mode, row.eduSystem, row.studyType, row.study_type, row.__neprasStatsMode,
      raw.studyTypeName, STUDY_TYPE_MAP[rawStudyTypeId]
    );

    // توحيد نظام التعليم
    if (/خدمات/i.test(mode)) mode = 'خدمات';
    else if (/منازل|منزل/i.test(mode)) mode = 'منازل';
    else if (/نظام/i.test(mode)) mode = 'نظامي';

    const isHome = /منازل|منزل|منزلي/.test(mode);
    const cls = isHome ? '' : normalizeClassName(rawCls);

    const rawRegId = row.registrationId ?? raw.registrationId ?? '';
    let status = firstNonEmpty(
      row['حالة القيد'], row['حاله القيد'], row['حالة قيد الطالب'], row['الموقف من القيد'], row['الحالة'],
      row.status, row.enrollStatus, row.__neprasStatsStatus, raw.status,
      REGISTRATION_STATUS_MAP[rawRegId]
    );

    let mother = firstNonEmpty(
      row['اسم الأم'], row['اسم الام'], row['اسم الأم بالكامل'], row['اسم الام بالكامل'], row['الأم'], row['الام'],
      row.motherFullName, row.motherName, row.mother, raw.motherName
    );

    let phone = firstNonEmpty(
      row['رقم المحمول'], row['المحمول'], row['رقم التليفون'], row['التليفون'], row['الهاتف'], row['رقم الهاتف'], row['رقم الموبايل 2'],
      row.mobile, row.phone, row.mobileNumber, row.phoneNumber, row.mobile2,
      raw.mobileNumber, raw.phoneNumber
    );

    let address = firstNonEmpty(
      row['العنوان'], row['محل الإقامة'], row['محل الاقامة'],
      row.address, raw.address
    );

    let birthGov = firstNonEmpty(
      row['محافظة الميلاد'], row['محافظه الميلاد'],
      row.birthGov, row.governorate
    );

    const rawLang1Id = row.languageId1 ?? raw.languageId1 ?? '';
    let lang1 = firstNonEmpty(
      row['اللغة الأجنبية الأولى'], row['اللغة الاجنبية الاولى'], row['اللغة الاجنبية الأولى'], row['اللغة الأولى'],
      row.lang1, row.firstLanguage, raw.firstLanguageName, raw.lang1Name,
      LANGUAGE_MAP[rawLang1Id]
    );

    const rawLang2Id = row.languageId2 ?? raw.languageId2 ?? '';
    let lang2 = firstNonEmpty(
      row['اللغة الأجنبية الثانية'], row['اللغة الاجنبية الثانية'], row['اللغة الثانية'],
      row.lang2, row.secondLanguage, raw.secondLanguageName, raw.lang2Name,
      LANGUAGE_MAP[rawLang2Id]
    );

    // توحيد مسمى اللغة الثانية ومنع أي كلمات إنجليزية مثل not allowed واستبدالها بالصياغة الرسمية "معفى"
    if (lang2) {
      const l2Trim = String(lang2).trim();
      if (/^(not\s*allowed|not_allowed|notallowed|none|n\/?a|معف[ىي]|غير\s*مسموح|لا\s*يوجد)$/i.test(l2Trim)) {
        lang2 = 'معفى';
      }
    }

    const rawDivId = row.divisionId ?? raw.divisionId ?? '';
    let section = firstNonEmpty(
      row['الشعبة'], row['الشعبة الدراسية'], row['الشعبه'],
      row.section, raw.generalName, DIVISION_MAP[rawDivId]
    );
    // إزالة كلمة بكالوريا إذا كانت موجودة لتوحيد اسم المسار
    if (section) {
      section = section.replace(/^بكالوريا\s*/i, '').trim();
    }

    const rawSpecId = row.specializationId ?? raw.specializationId ?? '';
    let specialization = firstNonEmpty(
      row['التخصص'], row['التخصص الدراسي'],
      row.specialization, raw.specialName, SPECIALIZATION_MAP[rawSpecId]
    );

    // fallback مرن لأي مفتاح مخصص في ملفات الإكسيل المستوردة
    for (const key of Object.keys(row)) {
      const ck = key.trim();
      const val = String(row[key] ?? '').trim();
      if (!val) continue;
      if (!rawNid && (ck.includes('قومي') || ck.includes('قومى'))) rawNid = val;
      else if (!phone && (ck.includes('محمول') || ck.includes('تليفون') || ck.includes('هاتف') || ck.includes('موبايل'))) phone = val;
      else if (!address && ck.includes('عنوان')) address = val;
      else if (!mother && (ck.includes('اسم الأم') || ck.includes('اسم الام') || ck === 'الأم' || ck === 'الام')) mother = val;
      else if (!name && (ck.includes('اسم الطالب') || ck.includes('اسم التلميذ') || ck === 'الاسم')) name = val;
      else if (!code && ck.includes('كود')) code = val;
    }

    const digitsNid = toLatinDigits(rawNid).replace(/\D/g, '');
    const nid = digitsNid.length === 14 ? digitsNid : toLatinDigits(rawNid).trim();

    // تحديد النوع (بنين / بنات) مع استنتاج آلي من الرقم القومي عند غياب العمود
    const rawGender = firstNonEmpty(
      row['النوع'], row['الجنس'], row['نوع الطالب'], row['نوع التلميذ'],
      row.gender, row.__neprasStatsGender, raw.sexName,
      Number(raw.sexId) === 1 ? 'بنين' : Number(raw.sexId) === 2 ? 'بنات' : ''
    );
    let gender = '';
    if (/ذكر|بنين|ولد|^male$/i.test(rawGender)) {
      gender = 'بنين';
    } else if (/نث|بنات|بنت|فتيات|^female$/i.test(rawGender)) {
      gender = 'بنات';
    } else if (nid.length === 14) {
      const decoded = decodeNID(nid);
      if (decoded?.gender) gender = decoded.gender;
    }

    // تحديد الديانة الرسمية المسجلة فقط (إحصاء صارم بدون أي تخمين)
    let rawReligion = '';
    for (const k of Object.keys(row)) {
      if (/^(الديان[ةه]|ديان[ةه]|religion|rel)$/i.test(k.trim())) {
        rawReligion = String(row[k] || '').trim();
        if (rawReligion) break;
      }
    }
    if (!rawReligion) {
      rawReligion = firstNonEmpty(
        row.religion, row.religionName, row.Religion,
        raw.religionName, raw.religion,
        Number(raw.religionId) === 1 ? 'مسلم' : Number(raw.religionId) === 2 ? 'مسيحي' : ''
      );
    }
    if (!rawReligion && global.NeprasEgypt?.resolveReligion) {
      rawReligion = global.NeprasEgypt.resolveReligion(row);
    }

    let religion = '';
    if (/مسيح|christian|قبط/i.test(rawReligion)) {
      religion = 'مسيحي';
    } else if (/مسلم|اسلام|إسلام|muslim/i.test(rawReligion)) {
      religion = 'مسلم';
    } else if (/أخرى|اخرى|other/i.test(rawReligion)) {
      religion = 'أخرى';
    } else if (rawReligion && rawReligion !== 'غير مسجّل') {
      religion = rawReligion;
    } else {
      religion = 'غير مسجّل';
    }

    // تحديد الموقف من الدمج ونوع الإعاقة
    const rawDisabilityId = row.disabilityId ?? raw.disabilityId ?? '';
    const disabilityNameFromId = (rawDisabilityId && Number(rawDisabilityId) > 0) ? (DISABILITY_MAP[rawDisabilityId] || '') : '';

    const rawDamg = firstNonEmpty(
      disabilityNameFromId,
      row['نوع الدمج'], row['الموقف من الدمج'], row['الدمج'], row['حالة الدمج'], row['حاله الدمج'],
      row.integrationType, row.damg, raw.obstacleName
    );
    const rawIntegratedFlag = String(row.integrated ?? row.__neprasStatsIntegrated ?? '').trim();
    const isNonDamgText = (v) => {
      if (!v) return true;
      const n = String(v)
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim();
      return ['لا', 'لا يوجد', 'لايوجد', '-', '—', '--', 'غير مدمج', 'ليس مدمج', 'عادي', 'عادي', '0', 'بدون', 'false', 'غير محدد'].includes(n);
    };
    const hasObstacleId = (raw.obstacleId !== undefined && raw.obstacleId !== null && Number(raw.obstacleId) > 0) ||
                          (rawDisabilityId !== '' && Number(rawDisabilityId) > 0);
    const isIntegrated =
      rawIntegratedFlag === 'نعم' ||
      row.integrated === true ||
      hasObstacleId ||
      (!isNonDamgText(rawDamg) && rawDamg !== 'لا');
    const integrationType = isIntegrated
      ? ((!isNonDamgText(rawDamg) && rawDamg !== 'نعم') ? rawDamg : 'دمج تربوي')
      : '';

    const exemptionType = firstNonEmpty(
      row.exemptionType, row.exemptionLabel, row['نوع الإعفاء'], row['تصنيف الإعفاء'],
      row.social_status, row['الحالة الاجتماعية'], raw.exemptionType, raw.exemptionName
    );
    const exemptionClass = firstNonEmpty(row.exemptionClass, raw.exemptionClass);
    const paid = Boolean(row.paid ?? raw.paid ?? false);
    const financeStatus = firstNonEmpty(row.financeStatus, raw.financeStatus);

    return {
      code,
      name,
      fatherName,
      nid,
      grade,
      cls,
      gender,
      religion,
      status,
      mode,
      isHome,
      isIntegrated,
      integrationType,
      mother,
      phone,
      address,
      birthGov,
      lang1,
      lang2,
      section,
      specialization,
      exemptionType,
      exemptionClass,
      paid,
      financeStatus,
      raw
    };
  }

  function readWorkbookFromExcel(file) {
    return new Promise((resolve, reject) => {
      const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
      if (!xlsxLib) {
        reject(new Error('مكتبة الإكسيل غير محملة.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = xlsxLib.read(data, { type: 'array' });
          let allRows = [];
          workbook.SheetNames.forEach(sheetName => {
            const rows = xlsxLib.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
            allRows = allRows.concat(rows);
          });
          resolve({ json: allRows, workbook });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('تعذر قراءة ملف الإكسيل المحدد'));
      reader.readAsArrayBuffer(file);
    });
  }

  // -------------------------------------------------------------
  // 2. محركات تنسيق وترويسات أوراق العمل (Headers, Footers, Styles)
  // -------------------------------------------------------------

  const sTitle = {
    font: { name: 'Cairo', sz: 16, bold: true, color: { rgb: '1E3A8A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    border: { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } }
  };

  const sMetaBox = {
    font: { name: 'Cairo', sz: 11, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  };

  const sHead = {
    font: { name: 'Cairo', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: '1E40AF' } },
    border: { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } }
  };

  const sData = {
    font: { name: 'Cairo', sz: 10, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  };

  const sTotal = {
    font: { name: 'Cairo', sz: 12, bold: true, color: { rgb: '991B1B' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'FEF3C7' } },
    border: { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } }
  };

  const sEmpty = {};

  const createSheetHeader = (title, numCols, year, school, dir, admin) => {
    const aoa = [];
    const merges = [];
    const rowHeights = [];
    let r = 0;

    const titleRow = Array(numCols).fill({ v: '', s: sEmpty });
    titleRow[0] = { v: title, t: 's', s: sTitle };
    aoa.push(titleRow);
    merges.push({ s: { r: r, c: 0 }, e: { r: r, c: numCols - 1 } });
    rowHeights.push({ hpt: 36 });
    r++;

    aoa.push(Array(numCols).fill({ v: '', s: sEmpty }));
    rowHeights.push({ hpt: 8 });
    r++;

    const r2 = Array(numCols).fill({ v: '', s: sEmpty });
    r2[0] = { v: `المديرية: ${dir}`, t: 's', s: sMetaBox };
    r2[1] = { v: '', s: sMetaBox };
    r2[numCols - 2] = { v: admin, t: 's', s: sMetaBox };
    r2[numCols - 1] = { v: '', s: sMetaBox };
    aoa.push(r2);
    merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 1 } });
    merges.push({ s: { r: r, c: numCols - 2 }, e: { r: r, c: numCols - 1 } });
    rowHeights.push({ hpt: 24 });
    r++;

    const r3 = Array(numCols).fill({ v: '', s: sEmpty });
    r3[0] = { v: school, t: 's', s: sMetaBox };
    r3[1] = { v: '', s: sMetaBox };
    r3[numCols - 2] = { v: `العام الدراسي: ${year}`, t: 's', s: sMetaBox };
    r3[numCols - 1] = { v: '', s: sMetaBox };
    aoa.push(r3);
    merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 1 } });
    merges.push({ s: { r: r, c: numCols - 2 }, e: { r: r, c: numCols - 1 } });
    rowHeights.push({ hpt: 24 });
    r++;

    aoa.push(Array(numCols).fill({ v: '', s: sEmpty }));
    rowHeights.push({ hpt: 12 });
    r++;

    return { aoa, merges, rowHeights, startRow: r };
  };

  const appendSheetFooter = (aoa, merges, rowHeights, r, numCols, affairs, principal) => {
    const sSignHead = { font: { name: 'Cairo', sz: 11, bold: true, color: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const sSignName = { font: { name: 'Cairo', sz: 12, bold: true, color: { rgb: '0F172A' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const sBrandBadge = { font: { name: 'Cairo', sz: 9, bold: true, color: { rgb: '64748B' } }, alignment: { horizontal: 'center', vertical: 'center' } };

    aoa.push(Array(numCols).fill({ v: '', s: sEmpty }));
    rowHeights.push({ hpt: 18 });
    r++;

    const f1 = Array(numCols).fill({ v: '', s: sEmpty });
    f1[0] = { v: 'مسئول شئون الطلاب', t: 's', s: sSignHead };
    f1[1] = { v: '', s: sSignHead };
    f1[numCols - 2] = { v: 'مدير المدرسة', t: 's', s: sSignHead };
    f1[numCols - 1] = { v: '', s: sSignHead };
    aoa.push(f1);
    merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 1 } });
    merges.push({ s: { r: r, c: numCols - 2 }, e: { r: r, c: numCols - 1 } });
    rowHeights.push({ hpt: 22 });
    r++;

    const f2 = Array(numCols).fill({ v: '', s: sEmpty });
    f2[0] = { v: affairs || '.........................', t: 's', s: sSignName };
    f2[1] = { v: '', s: sSignName };
    f2[numCols - 2] = { v: principal || '.........................', t: 's', s: sSignName };
    f2[numCols - 1] = { v: '', s: sSignName };
    aoa.push(f2);
    merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 1 } });
    merges.push({ s: { r: r, c: numCols - 2 }, e: { r: r, c: numCols - 1 } });
    rowHeights.push({ hpt: 24 });
    r++;

    // سطر التوثيق الرسمي
    const f3 = Array(numCols).fill({ v: '', s: sEmpty });
    f3[0] = { v: 'نبراس — التقارير المدرسية والإحصائية المعتمدة', t: 's', s: sBrandBadge };
    aoa.push(f3);
    merges.push({ s: { r: r, c: 0 }, e: { r: r, c: numCols - 1 } });
    rowHeights.push({ hpt: 18 });
    r++;

    return { aoa, merges, rowHeights, endRow: r };
  };

  // -------------------------------------------------------------
  // 3. محركات التقارير الـ 15 المتخصصة
  // -------------------------------------------------------------

  function buildGenderStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const stats = {};
    let mTotal = 0, fTotal = 0, uTotal = 0, totalClasses = 0;

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const grade = stRec.grade || 'غير محدد';
      const cls = stRec.cls;
      const gender = stRec.gender;
      if (!stats[grade]) stats[grade] = { grade, m: 0, f: 0, u: 0, classesSet: new Set() };
      if (cls) stats[grade].classesSet.add(cls);

      if (gender === 'بنين') {
        stats[grade].m++; mTotal++;
      } else if (gender === 'بنات') {
        stats[grade].f++; fTotal++;
      } else {
        stats[grade].u++; uTotal++;
      }
    });

    const numCols = uTotal > 0 ? 7 : 6;
    let sheet = createSheetHeader(`إحصائية الفصول والنوع — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);

    const headers = [{ v: 'م', s: sHead }, { v: 'الصف', s: sHead }, { v: 'عدد الفصول', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }];
    if (uTotal > 0) headers.push({ v: 'غير محدد', s: sHead });
    headers.push({ v: 'الجملة', s: sHead });
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    let i = 1;
    Object.keys(stats).sort(sortGrades).forEach(grade => {
      const st = stats[grade];
      const classCount = st.classesSet.size;
      totalClasses += classCount;
      const rowData = [{ v: i++, t: 'n', s: sData }, { v: st.grade, s: sData }, { v: classCount, t: 'n', s: sData }, { v: st.m, t: 'n', s: sData }, { v: st.f, t: 'n', s: sData }];
      if (uTotal > 0) rowData.push({ v: st.u, t: 'n', s: sData });
      rowData.push({ v: (st.m + st.f + st.u), t: 'n', s: sData });
      sheet.aoa.push(rowData);
      sheet.rowHeights.push({ hpt: 24 });
      sheet.startRow++;
    });

    const tRow = [{ v: 'الجملة العامة', s: sTotal }, { v: '', s: sTotal }, { v: totalClasses, t: 'n', s: sTotal }, { v: mTotal, t: 'n', s: sTotal }, { v: fTotal, t: 'n', s: sTotal }];
    if (uTotal > 0) tRow.push({ v: uTotal, t: 'n', s: sTotal });
    tRow.push({ v: (mTotal + fTotal + uTotal), t: 'n', s: sTotal });
    sheet.aoa.push(tRow);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 1 } });
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    const cols = [{ wch: 6 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    if (uTotal > 0) cols.push({ wch: 12 });
    cols.push({ wch: 15 });
    ws['!cols'] = cols;
    return ws;
  }

  function isFirstGradeOfStage(gradeName) {
    const s = String(gradeName || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
    return /الاول|اول|kg\s*1|\b1\b/i.test(s);
  }

  function classifyEnrollmentStatus(statusStr, gradeName) {
    const s = String(statusStr || '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .trim();
    if (!s || s === 'غير محدد') {
      return 'other';
    }
    if (s.includes('مستجد')) return 'new';
    if (s.includes('باقي') || s.includes('باق') || s.includes('راسب') || s.includes('اعاد')) return 'repeat';
    if (s.includes('ناجح') || s.includes('منقول')) return 'promoted';
    if (s.includes('مقيد')) {
      return isFirstGradeOfStage(gradeName) ? 'new' : 'promoted';
    }
    return 'other';
  }

  function buildEnrollmentStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const stats = {};
    const totals = { n_b: 0, n_g: 0, p_b: 0, p_g: 0, r_b: 0, r_g: 0, o_b: 0, o_g: 0, classes: 0 };

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const grade = stRec.grade || 'غير محدد';
      const cls = stRec.cls;
      const statusCat = classifyEnrollmentStatus(stRec.status, grade);
      const isGirl = stRec.gender === 'بنات';
      const isBoy = !isGirl;

      if (!stats[grade]) stats[grade] = { grade, n_b: 0, n_g: 0, p_b: 0, p_g: 0, r_b: 0, r_g: 0, o_b: 0, o_g: 0, classesSet: new Set() };
      if (cls) stats[grade].classesSet.add(cls);

      if (statusCat === 'new') {
        if (isBoy) { stats[grade].n_b++; totals.n_b++; } else { stats[grade].n_g++; totals.n_g++; }
      } else if (statusCat === 'promoted') {
        if (isBoy) { stats[grade].p_b++; totals.p_b++; } else { stats[grade].p_g++; totals.p_g++; }
      } else if (statusCat === 'repeat') {
        if (isBoy) { stats[grade].r_b++; totals.r_b++; } else { stats[grade].r_g++; totals.r_g++; }
      } else {
        if (isBoy) { stats[grade].o_b++; totals.o_b++; } else { stats[grade].o_g++; totals.o_g++; }
      }
    });

    const hasOther = (totals.o_b + totals.o_g) > 0;
    const numCols = hasOther ? 18 : 15;
    let sheet = createSheetHeader(`إحصائية حالات القيد والنوع — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);

    const h1 = [{ v: 'م', s: sHead }, { v: 'الصف', s: sHead }, { v: 'عدد الفصول', s: sHead }, { v: 'مستجد', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'ناجح ومنقول', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'باقي للإعادة', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }];
    const h2 = [{ v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }];
    if (hasOther) {
      h1.push({ v: 'حالات أخرى', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead });
      h2.push({ v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead });
    }
    h1.push({ v: 'الإجمالي العام', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead });
    h2.push({ v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead });

    sheet.aoa.push(h1, h2);
    const rIdx = sheet.startRow;
    sheet.merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx + 1, c: 0 } }, { s: { r: rIdx, c: 1 }, e: { r: rIdx + 1, c: 1 } }, { s: { r: rIdx, c: 2 }, e: { r: rIdx + 1, c: 2 } });
    for (let c = 3; c < numCols; c += 3) sheet.merges.push({ s: { r: rIdx, c: c }, e: { r: rIdx, c: c + 2 } });
    sheet.rowHeights.push({ hpt: 24 }, { hpt: 24 });
    sheet.startRow += 2;

    let i = 1;
    let tb = 0, tg = 0;
    Object.keys(stats).sort(sortGrades).forEach(grade => {
      const st = stats[grade];
      const classCount = st.classesSet.size;
      totals.classes += classCount;
      const c_n = st.n_b + st.n_g;
      const c_p = st.p_b + st.p_g;
      const c_r = st.r_b + st.r_g;
      const c_o = st.o_b + st.o_g;
      const gb = st.n_b + st.p_b + st.r_b + st.o_b;
      const gg = st.n_g + st.p_g + st.r_g + st.o_g;
      const gTot = gb + gg;
      tb += gb; tg += gg;

      const rowData = [
        { v: i++, t: 'n', s: sData }, { v: st.grade, s: sData }, { v: classCount, t: 'n', s: sData },
        { v: st.n_b, t: 'n', s: sData }, { v: st.n_g, t: 'n', s: sData }, { v: c_n, t: 'n', s: sData },
        { v: st.p_b, t: 'n', s: sData }, { v: st.p_g, t: 'n', s: sData }, { v: c_p, t: 'n', s: sData },
        { v: st.r_b, t: 'n', s: sData }, { v: st.r_g, t: 'n', s: sData }, { v: c_r, t: 'n', s: sData }
      ];
      if (hasOther) rowData.push({ v: st.o_b, t: 'n', s: sData }, { v: st.o_g, t: 'n', s: sData }, { v: c_o, t: 'n', s: sData });
      rowData.push({ v: gb, t: 'n', s: sData }, { v: gg, t: 'n', s: sData }, { v: gTot, t: 'n', s: sData });
      sheet.aoa.push(rowData);
      sheet.rowHeights.push({ hpt: 24 });
      sheet.startRow++;
    });

    const tTot = tb + tg;
    const tRow = [
      { v: 'الجملة العامة', s: sTotal }, { v: '', s: sTotal }, { v: totals.classes, t: 'n', s: sTotal },
      { v: totals.n_b, t: 'n', s: sTotal }, { v: totals.n_g, t: 'n', s: sTotal }, { v: (totals.n_b + totals.n_g), t: 'n', s: sTotal },
      { v: totals.p_b, t: 'n', s: sTotal }, { v: totals.p_g, t: 'n', s: sTotal }, { v: (totals.p_b + totals.p_g), t: 'n', s: sTotal },
      { v: totals.r_b, t: 'n', s: sTotal }, { v: totals.r_g, t: 'n', s: sTotal }, { v: (totals.r_b + totals.r_g), t: 'n', s: sTotal }
    ];
    if (hasOther) tRow.push({ v: totals.o_b, t: 'n', s: sTotal }, { v: totals.o_g, t: 'n', s: sTotal }, { v: (totals.o_b + totals.o_g), t: 'n', s: sTotal });
    tRow.push({ v: tb, t: 'n', s: sTotal }, { v: tg, t: 'n', s: sTotal }, { v: tTot, t: 'n', s: sTotal });

    sheet.aoa.push(tRow);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 1 } });
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    const cols = [{ wch: 6 }, { wch: 25 }, { wch: 12 }];
    for (let j = 0; j < (hasOther ? 5 : 4); j++) cols.push({ wch: 8 }, { wch: 8 }, { wch: 10 });
    ws['!cols'] = cols;
    return ws;
  }

  function buildReligionStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const stats = {};
    const totals = { m_b: 0, m_g: 0, c_b: 0, c_g: 0, u_b: 0, u_g: 0, classes: 0 };

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const grade = stRec.grade || 'غير محدد';
      const cls = stRec.cls;
      const isGirl = stRec.gender === 'بنات';
      const isBoy = !isGirl;
      const religion = stRec.religion;

      if (!stats[grade]) stats[grade] = { grade, m_b: 0, m_g: 0, c_b: 0, c_g: 0, u_b: 0, u_g: 0, classesSet: new Set() };
      if (cls) stats[grade].classesSet.add(cls);

      const isMuslim = religion === 'مسلم' || /مسلم|islam|إسلام/i.test(religion);
      const isChristian = religion === 'مسيحي' || /مسيح|christian|قبط/i.test(religion);

      if (isMuslim) {
        if (isBoy) { stats[grade].m_b++; totals.m_b++; } else { stats[grade].m_g++; totals.m_g++; }
      } else if (isChristian) {
        if (isBoy) { stats[grade].c_b++; totals.c_b++; } else { stats[grade].c_g++; totals.c_g++; }
      } else {
        // حقل الديانة غير مسجل في بيانات الوزارة الرسمية (بدون أي تخمين)
        if (isBoy) { stats[grade].u_b++; totals.u_b++; } else { stats[grade].u_g++; totals.u_g++; }
      }
    });

    const hasOther = (totals.u_b + totals.u_g) > 0;
    const numCols = hasOther ? 12 : 9;
    let sheet = createSheetHeader(`إحصائية الديانة والنوع — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);

    const h1 = [{ v: 'م', s: sHead }, { v: 'الصف', s: sHead }, { v: 'عدد الفصول', s: sHead }, { v: 'مسلم', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'مسيحي', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }];
    const h2 = [{ v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }];
    if (hasOther) {
      h1.push({ v: 'غير مسجّل بالبيانات', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead });
      h2.push({ v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead });
    }
    h1.push({ v: 'الإجمالي العام', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead });
    h2.push({ v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead });

    sheet.aoa.push(h1, h2);
    const rIdx = sheet.startRow;
    sheet.merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx + 1, c: 0 } }, { s: { r: rIdx, c: 1 }, e: { r: rIdx + 1, c: 1 } }, { s: { r: rIdx, c: 2 }, e: { r: rIdx + 1, c: 2 } });
    for (let c = 3; c < numCols; c += 3) sheet.merges.push({ s: { r: rIdx, c: c }, e: { r: rIdx, c: c + 2 } });
    sheet.rowHeights.push({ hpt: 24 }, { hpt: 24 });
    sheet.startRow += 2;

    let i = 1;
    let tb = 0, tg = 0;
    Object.keys(stats).sort(sortGrades).forEach(grade => {
      const st = stats[grade];
      const classCount = st.classesSet.size;
      totals.classes += classCount;
      const c_m = st.m_b + st.m_g;
      const c_c = st.c_b + st.c_g;
      const c_u = st.u_b + st.u_g;
      const gb = st.m_b + st.c_b + st.u_b;
      const gg = st.m_g + st.c_g + st.u_g;
      const gTot = gb + gg;
      tb += gb; tg += gg;

      const rowData = [{ v: i++, t: 'n', s: sData }, { v: st.grade, s: sData }, { v: classCount, t: 'n', s: sData }, { v: st.m_b, t: 'n', s: sData }, { v: st.m_g, t: 'n', s: sData }, { v: c_m, t: 'n', s: sData }, { v: st.c_b, t: 'n', s: sData }, { v: st.c_g, t: 'n', s: sData }, { v: c_c, t: 'n', s: sData }];
      if (hasOther) rowData.push({ v: st.u_b, t: 'n', s: sData }, { v: st.u_g, t: 'n', s: sData }, { v: c_u, t: 'n', s: sData });
      rowData.push({ v: gb, t: 'n', s: sData }, { v: gg, t: 'n', s: sData }, { v: gTot, t: 'n', s: sData });
      sheet.aoa.push(rowData);
      sheet.rowHeights.push({ hpt: 24 });
      sheet.startRow++;
    });

    const tTot = tb + tg;
    const tRow = [{ v: 'الجملة العامة', s: sTotal }, { v: '', s: sTotal }, { v: totals.classes, t: 'n', s: sTotal }, { v: totals.m_b, t: 'n', s: sTotal }, { v: totals.m_g, t: 'n', s: sTotal }, { v: (totals.m_b + totals.m_g), t: 'n', s: sTotal }, { v: totals.c_b, t: 'n', s: sTotal }, { v: totals.c_g, t: 'n', s: sTotal }, { v: (totals.c_b + totals.c_g), t: 'n', s: sTotal }];
    if (hasOther) tRow.push({ v: totals.u_b, t: 'n', s: sTotal }, { v: totals.u_g, t: 'n', s: sTotal }, { v: (totals.u_b + totals.u_g), t: 'n', s: sTotal });
    tRow.push({ v: tb, t: 'n', s: sTotal }, { v: tg, t: 'n', s: sTotal }, { v: tTot, t: 'n', s: sTotal });

    sheet.aoa.push(tRow);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 1 } });
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    const cols = [{ wch: 6 }, { wch: 25 }, { wch: 12 }];
    for (let j = 0; j < (hasOther ? 4 : 3); j++) cols.push({ wch: 8 }, { wch: 8 }, { wch: 10 });
    ws['!cols'] = cols;
    return ws;
  }

  function buildAgeStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const stats = {};
    const totals = {
      b_u6: 0, g_u6: 0, u6: 0,
      b_a6: 0, g_a6: 0, a6: 0,
      b_a7: 0, g_a7: 0, a7: 0,
      b_a8: 0, g_a8: 0, a8: 0,
      b_a9: 0, g_a9: 0, a9: 0,
      b_a10p: 0, g_a10p: 0, a10p: 0,
      emptyNid: 0, classes: 0
    };

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const grade = stRec.grade || 'غير محدد';
      const cls = stRec.cls;
      const isGirl = stRec.gender === 'بنات';
      const isBoy = !isGirl;

      if (!stats[grade]) stats[grade] = { grade, b_u6: 0, g_u6: 0, b_a6: 0, g_a6: 0, b_a7: 0, g_a7: 0, b_a8: 0, g_a8: 0, b_a9: 0, g_a9: 0, b_a10p: 0, g_a10p: 0, empty: 0, classesSet: new Set() };
      if (cls) stats[grade].classesSet.add(cls);

      const nid = stRec.nid;
      if (nid.length === 14) {
        const ageParts = calculateAgePartsOnOct1(nid, meta.year);
        const y = ageParts.y;
        if (y < 6) {
          if (isBoy) { stats[grade].b_u6++; totals.b_u6++; } else { stats[grade].g_u6++; totals.g_u6++; }
          totals.u6++;
        } else if (y === 6) {
          if (isBoy) { stats[grade].b_a6++; totals.b_a6++; } else { stats[grade].g_a6++; totals.g_a6++; }
          totals.a6++;
        } else if (y === 7) {
          if (isBoy) { stats[grade].b_a7++; totals.b_a7++; } else { stats[grade].g_a7++; totals.g_a7++; }
          totals.a7++;
        } else if (y === 8) {
          if (isBoy) { stats[grade].b_a8++; totals.b_a8++; } else { stats[grade].g_a8++; totals.g_a8++; }
          totals.a8++;
        } else if (y === 9) {
          if (isBoy) { stats[grade].b_a9++; totals.b_a9++; } else { stats[grade].g_a9++; totals.g_a9++; }
          totals.a9++;
        } else {
          if (isBoy) { stats[grade].b_a10p++; totals.b_a10p++; } else { stats[grade].g_a10p++; totals.g_a10p++; }
          totals.a10p++;
        }
      } else {
        stats[grade].empty++; totals.emptyNid++;
      }
    });

    const numCols = 24;
    let sheet = createSheetHeader(`إحصائية الفئات العمرية في 1 أكتوبر — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);

    const h1 = [{ v: 'م', s: sHead }, { v: 'الصف', s: sHead }, { v: 'عدد الفصول', s: sHead }, { v: 'أقل من 6 سنوات', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '6 سنوات', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '7 سنوات', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '8 سنوات', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '9 سنوات', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '10 سنوات فأكثر', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'الإجمالي العام', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }];
    const h2 = [{ v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead }];
    sheet.aoa.push(h1, h2);
    const rIdx = sheet.startRow;
    sheet.merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx + 1, c: 0 } }, { s: { r: rIdx, c: 1 }, e: { r: rIdx + 1, c: 1 } }, { s: { r: rIdx, c: 2 }, e: { r: rIdx + 1, c: 2 } });
    for (let c = 3; c < numCols; c += 3) sheet.merges.push({ s: { r: rIdx, c: c }, e: { r: rIdx, c: c + 2 } });
    sheet.rowHeights.push({ hpt: 24 }, { hpt: 24 });
    sheet.startRow += 2;

    let i = 1;
    let tb = 0, tg = 0;
    Object.keys(stats).sort(sortGrades).forEach(grade => {
      const st = stats[grade];
      const classCount = st.classesSet.size;
      totals.classes += classCount;
      const c_u6 = st.b_u6 + st.g_u6;
      const c_a6 = st.b_a6 + st.g_a6;
      const c_a7 = st.b_a7 + st.g_a7;
      const c_a8 = st.b_a8 + st.g_a8;
      const c_a9 = st.b_a9 + st.g_a9;
      const c_a10p = st.b_a10p + st.g_a10p;
      const gb = st.b_u6 + st.b_a6 + st.b_a7 + st.b_a8 + st.b_a9 + st.b_a10p;
      const gg = st.g_u6 + st.g_a6 + st.g_a7 + st.g_a8 + st.g_a9 + st.g_a10p;
      const gTot = gb + gg;
      tb += gb; tg += gg;

      const rowData = [
        { v: i++, t: 'n', s: sData }, { v: st.grade, s: sData }, { v: classCount, t: 'n', s: sData },
        { v: st.b_u6, t: 'n', s: sData }, { v: st.g_u6, t: 'n', s: sData }, { v: c_u6, t: 'n', s: sData },
        { v: st.b_a6, t: 'n', s: sData }, { v: st.g_a6, t: 'n', s: sData }, { v: c_a6, t: 'n', s: sData },
        { v: st.b_a7, t: 'n', s: sData }, { v: st.g_a7, t: 'n', s: sData }, { v: c_a7, t: 'n', s: sData },
        { v: st.b_a8, t: 'n', s: sData }, { v: st.g_a8, t: 'n', s: sData }, { v: c_a8, t: 'n', s: sData },
        { v: st.b_a9, t: 'n', s: sData }, { v: st.g_a9, t: 'n', s: sData }, { v: c_a9, t: 'n', s: sData },
        { v: st.b_a10p, t: 'n', s: sData }, { v: st.g_a10p, t: 'n', s: sData }, { v: c_a10p, t: 'n', s: sData },
        { v: gb, t: 'n', s: sData }, { v: gg, t: 'n', s: sData }, { v: gTot, t: 'n', s: sData }
      ];
      sheet.aoa.push(rowData);
      sheet.rowHeights.push({ hpt: 24 });
      sheet.startRow++;
    });

    const tTot = totals.u6 + totals.a6 + totals.a7 + totals.a8 + totals.a9 + totals.a10p;
    const tRow = [
      { v: 'الجملة العامة', s: sTotal }, { v: '', s: sTotal }, { v: totals.classes, t: 'n', s: sTotal },
      { v: totals.b_u6, t: 'n', s: sTotal }, { v: totals.g_u6, t: 'n', s: sTotal }, { v: totals.u6, t: 'n', s: sTotal },
      { v: totals.b_a6, t: 'n', s: sTotal }, { v: totals.g_a6, t: 'n', s: sTotal }, { v: totals.a6, t: 'n', s: sTotal },
      { v: totals.b_a7, t: 'n', s: sTotal }, { v: totals.g_a7, t: 'n', s: sTotal }, { v: totals.a7, t: 'n', s: sTotal },
      { v: totals.b_a8, t: 'n', s: sTotal }, { v: totals.g_a8, t: 'n', s: sTotal }, { v: totals.a8, t: 'n', s: sTotal },
      { v: totals.b_a9, t: 'n', s: sTotal }, { v: totals.g_a9, t: 'n', s: sTotal }, { v: totals.a9, t: 'n', s: sTotal },
      { v: totals.b_a10p, t: 'n', s: sTotal }, { v: totals.g_a10p, t: 'n', s: sTotal }, { v: totals.a10p, t: 'n', s: sTotal },
      { v: tb, t: 'n', s: sTotal }, { v: tg, t: 'n', s: sTotal }, { v: tTot, t: 'n', s: sTotal }
    ];
    sheet.aoa.push(tRow);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 1 } });
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    const cols = [{ wch: 6 }, { wch: 25 }, { wch: 12 }];
    for (let j = 0; j < 6; j++) cols.push({ wch: 6 }, { wch: 6 }, { wch: 8 });
    cols.push({ wch: 8 }, { wch: 8 }, { wch: 10 });
    ws['!cols'] = cols;
    return ws;
  }

  function buildIntegrationStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const integratedStudents = (Array.isArray(data) ? data : [])
      .map(normalizeStudentRecord)
      .filter(st => st.isIntegrated);

    const numCols = 7;
    let sheet = createSheetHeader(`كشف حصر طلاب الدمج التربوي (ذوي الهمم) — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'اسم الطالب', s: sHead }, { v: 'النوع', s: sHead }, { v: 'الرقم القومي', s: sHead }, { v: 'الصف', s: sHead }, { v: 'الفصل', s: sHead }, { v: 'نوع الإعاقة / الدمج', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    if (integratedStudents.length === 0) {
      sheet.aoa.push([{ v: 'لا يوجد طلاب مسجلون كحالات دمج في هذه البيانات.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      integratedStudents.sort((a, b) => {
        const gradeDiff = sortGrades(a.grade, b.grade);
        if (gradeDiff !== 0) return gradeDiff;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
      });

      integratedStudents.forEach((st, idx) => {
        const cleanGender = st.gender || 'غير محدد';
        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: st.name || '', s: sData },
          { v: cleanGender, s: sData },
          { v: st.nid || '', t: 's', s: sData },
          { v: st.grade || '', s: sData },
          { v: st.cls || '', s: sData },
          { v: st.integrationType || 'دمج تربوي', s: sData }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 35 }, { wch: 10 }, { wch: 22 }, { wch: 15 }, { wch: 10 }, { wch: 30 }];
    return ws;
  }

  function buildQualityStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const defectiveStudents = [];
    const normalizedRows = (Array.isArray(data) ? data : []).map(normalizeStudentRecord);

    // نتحقق مما إذا كان مصدر البيانات يحتوي أصلاً على أعمدة التفصيل الشامل (الهاتف، العنوان، اسم الأم)
    const hasAnyPhoneCol = normalizedRows.some(r => r.phone && toLatinDigits(r.phone).replace(/\D/g, '').length >= 7);
    const hasAnyAddressCol = normalizedRows.some(r => r.address && r.address.length >= 3 && r.address !== 'لا يوجد');
    const hasAnyMotherCol = normalizedRows.some(r => r.mother && r.mother.length >= 3 && r.mother !== 'لا يوجد');

    normalizedRows.forEach(stRec => {
      const issues = [];
      const cleanNid = stRec.nid;
      if (!cleanNid || cleanNid.length !== 14 || !/^\d{14}$/.test(cleanNid)) {
        issues.push('الرقم القومي غير صالح');
      }

      if (!stRec.code) {
        issues.push('كود الطالب غير مسجل');
      }

      const nameWords = String(stRec.name || '').trim().split(/\s+/).filter(Boolean);
      if (nameWords.length < 3) {
        issues.push('اسم الطالب غير مكتمل');
      }

      if (!stRec.isHome && !stRec.cls) {
        issues.push('الفصل غير مسجل');
      }

      if (hasAnyPhoneCol) {
        const cleanMobile = toLatinDigits(stRec.phone).replace(/\D/g, '');
        if (!cleanMobile || cleanMobile.length < 10 || stRec.phone.includes('*')) {
          issues.push('لا يوجد رقم محمول صالح');
        }
      }

      if (hasAnyAddressCol) {
        if (!stRec.address || stRec.address.length < 3 || stRec.address === 'لا يوجد' || stRec.address.includes('*')) {
          issues.push('العنوان غير مسجل');
        }
      }

      if (hasAnyMotherCol) {
        if (!stRec.mother || stRec.mother.length < 3 || stRec.mother === 'لا يوجد' || stRec.mother.includes('*')) {
          issues.push('اسم الأم غير مسجل');
        }
      }

      if (issues.length > 0) {
        defectiveStudents.push({
          name: stRec.name || 'طالب غير محدد',
          code: stRec.code || '',
          grade: stRec.grade || '',
          class: stRec.cls || '',
          issues: issues.join(' ، ')
        });
      }
    });

    const numCols = 6;
    let sheet = createSheetHeader(`تقرير جودة البيانات والنواقص للتدقيق — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'كود الطالب', s: sHead }, { v: 'اسم الطالب', s: sHead }, { v: 'الصف', s: sHead }, { v: 'الفصل', s: sHead }, { v: 'البيانات الناقصة للتحقق', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    if (defectiveStudents.length === 0) {
      sheet.aoa.push([{ v: 'ممتاز! جميع بيانات الطلاب في هذا السجل مكتملة وسليمة 100%.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      defectiveStudents.sort((a, b) => {
        const gDiff = sortGrades(a.grade, b.grade);
        if (gDiff !== 0) return gDiff;
        return a.name.localeCompare(b.name, 'ar');
      });

      defectiveStudents.forEach((st, idx) => {
        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: st.code, t: 's', s: sData },
          { v: st.name, s: sData },
          { v: st.grade, s: sData },
          { v: st.class, s: sData },
          { v: st.issues, s: { ...sData, font: { color: { rgb: 'B91C1C' }, bold: true, name: 'Cairo' } } }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 10 }, { wch: 45 }];
    return ws;
  }

  function buildDensityStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const classDensity = {};

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const grade = stRec.grade;
      const cls = stRec.cls;
      if (grade && grade !== 'غير محدد' && cls) {
        const key = `${grade} - ${cls}`;
        if (!classDensity[key]) classDensity[key] = { grade, cls, count: 0 };
        classDensity[key].count++;
      }
    });

    const numCols = 5;
    let sheet = createSheetHeader(`إحصائية كثافة الفصول والأعداد — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'الصف', s: sHead }, { v: 'الفصل', s: sHead }, { v: 'عدد الطلاب (الكثافة)', s: sHead }, { v: 'مؤشر الكثافة', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    const densityArr = Object.values(classDensity);
    if (densityArr.length === 0) {
      sheet.aoa.push([{ v: 'لا توجد بيانات فصول صحيحة.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      densityArr.sort((a, b) => {
        const gDiff = sortGrades(a.grade, b.grade);
        if (gDiff !== 0) return gDiff;
        return a.cls.localeCompare(b.cls, 'ar', { numeric: true });
      });

      densityArr.forEach((c, idx) => {
        let status = 'منخفض';
        if (c.count > 50) status = 'مرتفع جداً';
        else if (c.count >= 36) status = 'طبيعي';

        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: c.grade, s: sData },
          { v: c.cls, s: sData },
          { v: c.count, t: 'n', s: sData },
          { v: status, s: sData }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];
    return ws;
  }

  function buildSiblingsStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const familiesByName = {};

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const name = stRec.name;
      if (name) {
        const origParts = name.replace(/\s+/g, ' ').trim().split(' ');
        const cleanName = normalizeName(name);
        const parts = cleanName.split(' ').filter(Boolean);
        if (parts.length >= 4) {
          // نأخذ اسم الأب والجد واللقب (3 مقاطع على الأقل) لضمان دقة صلة الأخوة الفعلية
          const familyKey = parts.slice(1, 4).join(' ');
          const displayFamily = origParts.slice(1, 4).join(' ') || familyKey;
          if (!familiesByName[familyKey]) {
            familiesByName[familyKey] = { displayFamily, members: [] };
          }
          familiesByName[familyKey].members.push(stRec);
        }
      }
    });

    const siblingGroups = [];
    Object.keys(familiesByName).forEach(famKey => {
      const entry = familiesByName[famKey];
      if (entry.members.length > 1) {
        entry.members.sort((a, b) => sortGrades(a.grade || '', b.grade || ''));
        siblingGroups.push({ family: entry.displayFamily, members: entry.members });
      }
    });

    const numCols = 7;
    let sheet = createSheetHeader(`تقرير حصر الإخوة والأشقاء بالمدرسة — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'اسم الأب والعائلة', s: sHead }, { v: 'اسم الطالب', s: sHead }, { v: 'الصف', s: sHead }, { v: 'نوع القرابة', s: sHead }, { v: 'اسم الأم', s: sHead }, { v: 'الهاتف للاسترشاد', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    if (siblingGroups.length === 0) {
      sheet.aoa.push([{ v: 'لا يوجد أشقاء واضحون في هذه البيانات.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      let idx = 1;
      siblingGroups.forEach(groupObj => {
        const familyBg = { fill: { fgColor: { rgb: 'F8FAFC' } } };
        const rawBaseMother = String(groupObj.members[0].mother || '');
        const normBaseMother = normalizeName(rawBaseMother);

        groupObj.members.forEach(st => {
          const rawCurMother = String(st.mother || '');
          const normCurMother = normalizeName(rawCurMother);
          let relation = 'أشقاء';

          if (normBaseMother && normCurMother) {
            const match = checkMotherMatch(normBaseMother, normCurMother);
            relation = match.match ? (match.isTypo ? 'أشقاء (أب وأم تباين إملائي)' : 'أشقاء (أب وأم)') : 'إخوة (من الأب)';
          }

          const rowData = [
            { v: idx, t: 'n', s: { ...sData, ...familyBg } },
            { v: groupObj.family, s: { ...sData, ...familyBg, font: { bold: true, name: 'Cairo' } } },
            { v: st.name || '', s: { ...sData, ...familyBg } },
            { v: st.grade ? (st.cls ? `${st.grade} (${st.cls})` : st.grade) : '', s: { ...sData, ...familyBg } },
            { v: relation, s: { ...sData, ...familyBg, font: { color: { rgb: relation.includes('من الأب') ? 'D97706' : '1E40AF' }, bold: true, name: 'Cairo' } } },
            { v: rawCurMother || 'غير مسجل', s: { ...sData, ...familyBg } },
            { v: toLatinDigits(st.phone || ''), t: 's', s: { ...sData, ...familyBg } }
          ];
          sheet.aoa.push(rowData);
          sheet.rowHeights.push({ hpt: 24 });
          sheet.startRow++;
        });

        idx++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 16 }];
    return ws;
  }

  function buildDemographicsStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const govs = {};
    let totalNids = 0;

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const nid = stRec.nid;
      if (nid.length === 14) {
        const parts = decodeNID(nid);
        const govName = (parts && parts.governorate && parts.governorate !== 'غير محدد')
          ? parts.governorate
          : (stRec.birthGov || 'غير محدد');
        if (!govs[govName]) govs[govName] = 0;
        govs[govName]++;
        totalNids++;
      } else if (stRec.birthGov) {
        const govName = stRec.birthGov;
        if (!govs[govName]) govs[govName] = 0;
        govs[govName]++;
        totalNids++;
      }
    });

    const numCols = 4;
    let sheet = createSheetHeader(`إحصائية التوزيع الجغرافي (محافظة الميلاد) — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'محافظة الميلاد', s: sHead }, { v: 'عدد الطلاب', s: sHead }, { v: 'النسبة المئوية', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    if (Object.keys(govs).length === 0) {
      sheet.aoa.push([{ v: 'لا توجد أرقام قومية صالحة لحساب التوزيع الجغرافي.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      const arr = Object.keys(govs).map(k => ({ gov: k, count: govs[k] }));
      arr.sort((a, b) => b.count - a.count);

      arr.forEach((item, idx) => {
        const percentage = ((item.count / totalNids) * 100).toFixed(1) + '%';
        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: item.gov, s: sData },
          { v: item.count, t: 'n', s: sData },
          { v: percentage, s: sData }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });

      sheet.aoa.push([{ v: 'الإجمالي', t: 's', s: sTotal }, { v: '', s: sTotal }, { v: totalNids, t: 'n', s: sTotal }, { v: '100%', s: sTotal }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 1 } });
      sheet.rowHeights.push({ hpt: 28 });
      sheet.startRow++;
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 18 }, { wch: 18 }];
    return ws;
  }

  /**
   * إحصائية الثانوي العام المفصلة المعتمدة للإدارات التعليمية:
   * توزيع مسارات وشعب الثانوي ونظام التعليم (نظامي - منازل - خدمات) والنوع (بنين - بنات - جملة)
   * مع حصر دقيق لحالات القيد والدمج واللغات.
   */
  function buildSecondaryTracksStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const list = Array.isArray(data) ? data : [];

    const isSecRecord = (st, rawRow) => {
      const g = String(st.grade || '').toLowerCase();
      if (/ثانو|ثانوي/.test(g)) return true;
      if (st.section || st.specialization) return true;
      const rawDiv = rawRow?.divisionId ?? rawRow?.__neprasApiRaw?.divisionId;
      if (rawDiv && Number(rawDiv) > 0) return true;
      const rawLvl = rawRow?.levelId ?? rawRow?.__neprasApiRaw?.levelId;
      if (rawLvl && [1, 2, 3, '1', '2', '3'].includes(rawLvl)) return true;
      if (/الصف الأول|الصف الاول|الصف الثاني|الصف الثانى|الصف الثالث/.test(st.grade)) return true;
      return false;
    };

    let secStudents = [];
    list.forEach(rawRow => {
      const st = normalizeStudentRecord(rawRow);
      if (isSecRecord(st, rawRow)) {
        secStudents.push({ st, rawRow });
      }
    });

    if (secStudents.length === 0 && list.length > 0) {
      secStudents = list.map(rawRow => ({ st: normalizeStudentRecord(rawRow), rawRow }));
    }

    const normalizeSecGrade = (g) => {
      const s = String(g || '').trim();
      if (/اول|الاول|\b1\b/.test(s)) return 'الصف الأول الثانوي';
      if (/ثاني|الثاني|الثانى|\b2\b/.test(s)) return 'الصف الثاني الثانوي';
      if (/ثالث|الثالث|\b3\b/.test(s)) return 'الصف الثالث الثانوي';
      return s || 'الصف الأول الثانوي';
    };

    const matrix = {};
    const statusCounts = {};
    const disabilityCounts = {};

    let totalStudentsCount = 0;

    secStudents.forEach(({ st, rawRow }) => {
      const grade = normalizeSecGrade(st.grade);
      let track = st.section || st.specialization || '';
      if (!track) {
        if (grade === 'الصف الأول الثانوي') track = 'عام / مشترك';
        else track = 'عام';
      }

      const isMale = (st.gender === 'بنين');
      let modeKey = 'regular';
      if (st.mode === 'منازل' || st.isHome) modeKey = 'home';
      else if (st.mode === 'خدمات') modeKey = 'services';
      else modeKey = 'regular';

      if (!matrix[grade]) matrix[grade] = {};
      if (!matrix[grade][track]) {
        matrix[grade][track] = {
          regular: { male: 0, female: 0, total: 0 },
          home: { male: 0, female: 0, total: 0 },
          services: { male: 0, female: 0, total: 0 },
          total: { male: 0, female: 0, total: 0 }
        };
      }

      const cell = matrix[grade][track];
      if (isMale) {
        cell[modeKey].male++;
        cell.total.male++;
      } else {
        cell[modeKey].female++;
        cell.total.female++;
      }
      cell[modeKey].total++;
      cell.total.total++;
      totalStudentsCount++;

      const stStatus = st.status || 'غير محدد';
      if (!statusCounts[grade]) statusCounts[grade] = {};
      if (!statusCounts[grade][stStatus]) statusCounts[grade][stStatus] = { male: 0, female: 0, total: 0 };
      if (isMale) statusCounts[grade][stStatus].male++;
      else statusCounts[grade][stStatus].female++;
      statusCounts[grade][stStatus].total++;

      if (st.isIntegrated) {
        const disType = st.integrationType || 'دمج تربوي';
        if (!disabilityCounts[grade]) disabilityCounts[grade] = {};
        if (!disabilityCounts[grade][disType]) disabilityCounts[grade][disType] = { male: 0, female: 0, total: 0 };
        if (isMale) disabilityCounts[grade][disType].male++;
        else disabilityCounts[grade][disType].female++;
        disabilityCounts[grade][disType].total++;
      }
    });

    const numCols = 16;
    let sheet = createSheetHeader(
      `إحصائية الثانوي العام المفصلة (مسارات وشعب ونظام التعليم والنوع) — ${meta.school} (${meta.year})`,
      numCols, meta.year, meta.school, meta.dir, meta.admin
    );

    const rStartHeader = sheet.startRow;
    const h1 = [
      { v: 'م', s: sHead },
      { v: 'الصف الدراسي', s: sHead },
      { v: 'الشعبة والمسار', s: sHead },
      { v: 'نظام التعليم (نظامي)', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead },
      { v: 'نظام التعليم (منازل)', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead },
      { v: 'نظام التعليم (خدمات)', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead },
      { v: 'الإجمالي العام الشامل', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead },
      { v: 'النسبة %', s: sHead }
    ];
    sheet.aoa.push(h1);
    sheet.rowHeights.push({ hpt: 26 });
    sheet.merges.push({ s: { r: rStartHeader, c: 0 }, e: { r: rStartHeader + 1, c: 0 } });
    sheet.merges.push({ s: { r: rStartHeader, c: 1 }, e: { r: rStartHeader + 1, c: 1 } });
    sheet.merges.push({ s: { r: rStartHeader, c: 2 }, e: { r: rStartHeader + 1, c: 2 } });
    sheet.merges.push({ s: { r: rStartHeader, c: 3 }, e: { r: rStartHeader, c: 5 } });
    sheet.merges.push({ s: { r: rStartHeader, c: 6 }, e: { r: rStartHeader, c: 8 } });
    sheet.merges.push({ s: { r: rStartHeader, c: 9 }, e: { r: rStartHeader, c: 11 } });
    sheet.merges.push({ s: { r: rStartHeader, c: 12 }, e: { r: rStartHeader, c: 14 } });
    sheet.merges.push({ s: { r: rStartHeader, c: 15 }, e: { r: rStartHeader + 1, c: 15 } });

    const h2 = [
      { v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead },
      { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead },
      { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead },
      { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead },
      { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'جملة', s: sHead },
      { v: '', s: sHead }
    ];
    sheet.aoa.push(h2);
    sheet.rowHeights.push({ hpt: 24 });
    sheet.startRow += 2;

    const sSubTotal = {
      font: { name: 'Cairo', sz: 11, bold: true, color: { rgb: '854D0E' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'FEF9C3' } },
      border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    const sSecHeader = {
      font: { name: 'Cairo', sz: 12, bold: true, color: { rgb: '1E3A8A' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      fill: { fgColor: { rgb: 'DBEAFE' } },
      border: { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } }
    };

    let rowIndex = 1;
    const sortedGrades = Object.keys(matrix).sort(sortGrades);

    let grandTotals = {
      regular: { male: 0, female: 0, total: 0 },
      home: { male: 0, female: 0, total: 0 },
      services: { male: 0, female: 0, total: 0 },
      total: { male: 0, female: 0, total: 0 }
    };

    sortedGrades.forEach(grade => {
      const tracks = matrix[grade];
      let gradeSubTotals = {
        regular: { male: 0, female: 0, total: 0 },
        home: { male: 0, female: 0, total: 0 },
        services: { male: 0, female: 0, total: 0 },
        total: { male: 0, female: 0, total: 0 }
      };

      Object.keys(tracks).forEach(trackName => {
        const c = tracks[trackName];
        ['regular', 'home', 'services', 'total'].forEach(k => {
          gradeSubTotals[k].male += c[k].male;
          gradeSubTotals[k].female += c[k].female;
          gradeSubTotals[k].total += c[k].total;
          grandTotals[k].male += c[k].male;
          grandTotals[k].female += c[k].female;
          grandTotals[k].total += c[k].total;
        });

        const pct = totalStudentsCount > 0 ? ((c.total.total / totalStudentsCount) * 100).toFixed(1) + '%' : '0%';
        sheet.aoa.push([
          { v: rowIndex++, t: 'n', s: sData },
          { v: grade, s: sData },
          { v: trackName, s: sData },
          { v: c.regular.male, t: 'n', s: sData },
          { v: c.regular.female, t: 'n', s: sData },
          { v: c.regular.total, t: 'n', s: sData },
          { v: c.home.male, t: 'n', s: sData },
          { v: c.home.female, t: 'n', s: sData },
          { v: c.home.total, t: 'n', s: sData },
          { v: c.services.male, t: 'n', s: sData },
          { v: c.services.female, t: 'n', s: sData },
          { v: c.services.total, t: 'n', s: sData },
          { v: c.total.male, t: 'n', s: sData },
          { v: c.total.female, t: 'n', s: sData },
          { v: c.total.total, t: 'n', s: sData },
          { v: pct, s: sData }
        ]);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });

      const subPct = totalStudentsCount > 0 ? ((gradeSubTotals.total.total / totalStudentsCount) * 100).toFixed(1) + '%' : '0%';
      const subRow = [
        { v: '', s: sSubTotal },
        { v: `إجمالي ${grade}`, s: sSubTotal },
        { v: '—', s: sSubTotal },
        { v: gradeSubTotals.regular.male, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.regular.female, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.regular.total, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.home.male, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.home.female, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.home.total, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.services.male, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.services.female, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.services.total, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.total.male, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.total.female, t: 'n', s: sSubTotal },
        { v: gradeSubTotals.total.total, t: 'n', s: sSubTotal },
        { v: subPct, s: sSubTotal }
      ];
      sheet.aoa.push(subRow);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 2 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    });

    const gRow = [
      { v: 'الإجمالي العام لجميع صفوف ومسارات الثانوي', s: sTotal },
      { v: '', s: sTotal },
      { v: '', s: sTotal },
      { v: grandTotals.regular.male, t: 'n', s: sTotal },
      { v: grandTotals.regular.female, t: 'n', s: sTotal },
      { v: grandTotals.regular.total, t: 'n', s: sTotal },
      { v: grandTotals.home.male, t: 'n', s: sTotal },
      { v: grandTotals.home.female, t: 'n', s: sTotal },
      { v: grandTotals.home.total, t: 'n', s: sTotal },
      { v: grandTotals.services.male, t: 'n', s: sTotal },
      { v: grandTotals.services.female, t: 'n', s: sTotal },
      { v: grandTotals.services.total, t: 'n', s: sTotal },
      { v: grandTotals.total.male, t: 'n', s: sTotal },
      { v: grandTotals.total.female, t: 'n', s: sTotal },
      { v: grandTotals.total.total, t: 'n', s: sTotal },
      { v: '100%', s: sTotal }
    ];
    sheet.aoa.push(gRow);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 2 } });
    sheet.rowHeights.push({ hpt: 30 });
    sheet.startRow++;

    // فاصل جمالي
    sheet.aoa.push(Array(numCols).fill({ v: '', s: sEmpty }));
    sheet.rowHeights.push({ hpt: 16 });
    sheet.startRow++;

    // جدول حالات القيد بالثانوي
    const sec2Header = Array(numCols).fill({ v: '', s: sSecHeader });
    sec2Header[0] = { v: 'ثانياً: إحصائية الموقف وحالات القيد لطلاب الثانوي العام (ناجح ومنقول - باق للإعادة - تحويل مسار - فصل لتعدي الغياب - سحب ملف)', s: sSecHeader };
    sheet.aoa.push(sec2Header);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    const statusHeaders = [
      { v: 'م', s: sHead }, { v: 'الصف الدراسي', s: sHead }, { v: 'حالة القيد', s: sHead },
      { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'الجملة', s: sHead }
    ];
    const sHRow = Array(numCols).fill({ v: '', s: sEmpty });
    for (let i = 0; i < statusHeaders.length; i++) sHRow[i] = statusHeaders[i];
    sheet.aoa.push(sHRow);
    sheet.rowHeights.push({ hpt: 24 });
    sheet.startRow++;

    let sIdx = 1;
    let grandStatusTotal = { male: 0, female: 0, total: 0 };
    sortedGrades.forEach(grade => {
      const stObj = statusCounts[grade] || {};
      Object.keys(stObj).forEach(stName => {
        const sc = stObj[stName];
        grandStatusTotal.male += sc.male;
        grandStatusTotal.female += sc.female;
        grandStatusTotal.total += sc.total;
        const rData = Array(numCols).fill({ v: '', s: sEmpty });
        rData[0] = { v: sIdx++, t: 'n', s: sData };
        rData[1] = { v: grade, s: sData };
        rData[2] = { v: stName, s: sData };
        rData[3] = { v: sc.male, t: 'n', s: sData };
        rData[4] = { v: sc.female, t: 'n', s: sData };
        rData[5] = { v: sc.total, t: 'n', s: sData };
        sheet.aoa.push(rData);
        sheet.rowHeights.push({ hpt: 22 });
        sheet.startRow++;
      });
    });

    const statusTotRow = Array(numCols).fill({ v: '', s: sEmpty });
    statusTotRow[0] = { v: 'إجمالي حالات القيد', s: sSubTotal };
    statusTotRow[1] = { v: '', s: sSubTotal };
    statusTotRow[2] = { v: '', s: sSubTotal };
    statusTotRow[3] = { v: grandStatusTotal.male, t: 'n', s: sSubTotal };
    statusTotRow[4] = { v: grandStatusTotal.female, t: 'n', s: sSubTotal };
    statusTotRow[5] = { v: grandStatusTotal.total, t: 'n', s: sSubTotal };
    sheet.aoa.push(statusTotRow);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 2 } });
    sheet.rowHeights.push({ hpt: 24 });
    sheet.startRow++;

    // فاصل جمالي
    sheet.aoa.push(Array(numCols).fill({ v: '', s: sEmpty }));
    sheet.rowHeights.push({ hpt: 16 });
    sheet.startRow++;

    // جدول طلاب الدمج والتربية الخاصة
    const sec3Header = Array(numCols).fill({ v: '', s: sSecHeader });
    sec3Header[0] = { v: 'ثالثاً: حصر طلاب الدمج والتربية الخاصة بالثانوي العام حسب نوع الإعاقة', s: sSecHeader };
    sheet.aoa.push(sec3Header);
    sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    const disHeaders = [
      { v: 'م', s: sHead }, { v: 'الصف الدراسي', s: sHead }, { v: 'نوع الإعاقة / الدمج', s: sHead },
      { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'الجملة', s: sHead }
    ];
    const dHRow = Array(numCols).fill({ v: '', s: sEmpty });
    for (let i = 0; i < disHeaders.length; i++) dHRow[i] = disHeaders[i];
    sheet.aoa.push(dHRow);
    sheet.rowHeights.push({ hpt: 24 });
    sheet.startRow++;

    let dIdx = 1;
    let hasDisabilityData = false;
    let grandDisTotal = { male: 0, female: 0, total: 0 };
    sortedGrades.forEach(grade => {
      const dObj = disabilityCounts[grade] || {};
      Object.keys(dObj).forEach(dName => {
        hasDisabilityData = true;
        const dc = dObj[dName];
        grandDisTotal.male += dc.male;
        grandDisTotal.female += dc.female;
        grandDisTotal.total += dc.total;
        const rData = Array(numCols).fill({ v: '', s: sEmpty });
        rData[0] = { v: dIdx++, t: 'n', s: sData };
        rData[1] = { v: grade, s: sData };
        rData[2] = { v: dName, s: sData };
        rData[3] = { v: dc.male, t: 'n', s: sData };
        rData[4] = { v: dc.female, t: 'n', s: sData };
        rData[5] = { v: dc.total, t: 'n', s: sData };
        sheet.aoa.push(rData);
        sheet.rowHeights.push({ hpt: 22 });
        sheet.startRow++;
      });
    });

    if (!hasDisabilityData) {
      const emptyDis = Array(numCols).fill({ v: '', s: sEmpty });
      emptyDis[0] = { v: 'لا يوجد طلاب دمج مسجلين بصفوف الثانوي العام بالمدرسة.', s: sData };
      sheet.aoa.push(emptyDis);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 5 } });
      sheet.rowHeights.push({ hpt: 24 });
      sheet.startRow++;
    } else {
      const disTotRow = Array(numCols).fill({ v: '', s: sEmpty });
      disTotRow[0] = { v: 'إجمالي طلاب الدمج', s: sSubTotal };
      disTotRow[1] = { v: '', s: sSubTotal };
      disTotRow[2] = { v: '', s: sSubTotal };
      disTotRow[3] = { v: grandDisTotal.male, t: 'n', s: sSubTotal };
      disTotRow[4] = { v: grandDisTotal.female, t: 'n', s: sSubTotal };
      disTotRow[5] = { v: grandDisTotal.total, t: 'n', s: sSubTotal };
      sheet.aoa.push(disTotRow);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: 2 } });
      sheet.rowHeights.push({ hpt: 24 });
      sheet.startRow++;
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [
      { wch: 6 },  // م
      { wch: 22 }, // الصف الدراسي
      { wch: 28 }, // الشعبة والمسار
      { wch: 9 },  // نظامي بنين
      { wch: 9 },  // نظامي بنات
      { wch: 10 }, // نظامي جملة
      { wch: 9 },  // منازل بنين
      { wch: 9 },  // منازل بنات
      { wch: 10 }, // منازل جملة
      { wch: 9 },  // خدمات بنين
      { wch: 9 },  // خدمات بنات
      { wch: 10 }, // خدمات جملة
      { wch: 10 }, // إجمالي بنين
      { wch: 10 }, // إجمالي بنات
      { wch: 12 }, // إجمالي جملة
      { wch: 10 }  // النسبة %
    ];
    return ws;
  }

  function buildLanguagesStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const stats = {};

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const grade = stRec.grade || 'غير محدد';
      const lang1 = stRec.lang1;
      const lang2 = stRec.lang2;
      const section = stRec.section;
      const specialization = stRec.specialization;
      const mode = stRec.mode;

      if (!lang1 && !lang2 && !section && !specialization && !mode) return;
      if (!stats[grade]) stats[grade] = { mode: {}, lang1: {}, lang2: {}, section: {}, specialization: {} };

      if (mode) stats[grade].mode[mode] = (stats[grade].mode[mode] || 0) + 1;
      if (lang1) stats[grade].lang1[lang1] = (stats[grade].lang1[lang1] || 0) + 1;
      if (lang2) stats[grade].lang2[lang2] = (stats[grade].lang2[lang2] || 0) + 1;
      if (section) stats[grade].section[section] = (stats[grade].section[section] || 0) + 1;
      if (specialization && specialization !== section) {
        stats[grade].specialization[specialization] = (stats[grade].specialization[specialization] || 0) + 1;
      }
    });

    const numCols = 5;
    let sheet = createSheetHeader(`إحصائية اللغات والشعبونوعية التعليم — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'الصف', s: sHead }, { v: 'التصنيف', s: sHead }, { v: 'البيان', s: sHead }, { v: 'عدد الطلاب', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    if (Object.keys(stats).length === 0) {
      sheet.aoa.push([{ v: 'لم يتم العثور على بيانات لغات أو شعب في هذا الملف.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      let idx = 1;
      Object.keys(stats).sort(sortGrades).forEach(grade => {
        const st = stats[grade];
        const appendCat = (catName, catObj) => {
          Object.keys(catObj).forEach(val => {
            sheet.aoa.push([
              { v: idx++, t: 'n', s: sData },
              { v: grade, s: sData },
              { v: catName, s: sData },
              { v: val, s: sData },
              { v: catObj[val], t: 'n', s: sData }
            ]);
            sheet.rowHeights.push({ hpt: 24 });
            sheet.startRow++;
          });
        };
        if (Object.keys(st.mode).length > 0) appendCat('نوعية التعليم', st.mode);
        if (Object.keys(st.lang1).length > 0) appendCat('اللغة الأولى', st.lang1);
        if (Object.keys(st.lang2).length > 0) appendCat('اللغة الثانية', st.lang2);
        if (Object.keys(st.section).length > 0) appendCat('الشعبة', st.section);
        if (Object.keys(st.specialization).length > 0) appendCat('التخصص', st.specialization);
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 15 }];
    return ws;
  }

  function buildAnomaliesStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const anomalies = [];
    const list = Array.isArray(data) ? data : [];
    const info = meta || {};

    // 1. تحديد المرحلة الدراسية للمدرسة بدقة عالية
    let schoolStage = 'PRIMARY';
    const stageHint = String(info.stage || info.stageKey || info.school || '').toLowerCase();

    if (/sec|ثانو|فني|صناع|تجار|زراع/i.test(stageHint)) {
      schoolStage = 'SECONDARY';
    } else if (/prep|إعداد|اعداد/i.test(stageHint)) {
      schoolStage = 'PREP';
    } else if (/kg|رياض/i.test(stageHint)) {
      schoolStage = 'KG';
    } else if (/prim|ابتدائ/i.test(stageHint)) {
      schoolStage = 'PRIMARY';
    } else {
      // استنتاج إحصائي تلقائي من وسيط أعمار الطلاب في المدرسة
      const sampleAges = [];
      for (const r of list) {
        const nid = String(r.nationalId || r['الرقم القومي'] || r.nid || '').trim();
        if (nid.length === 14) {
          const ap = calculateAgePartsOnOct1(nid, info.year);
          if (ap.y >= 3 && ap.y <= 25) sampleAges.push(ap.y);
          if (sampleAges.length >= 60) break;
        }
      }
      if (sampleAges.length > 0) {
        sampleAges.sort((a, b) => a - b);
        const medianAge = sampleAges[Math.floor(sampleAges.length / 2)];
        if (medianAge >= 14) schoolStage = 'SECONDARY';
        else if (medianAge >= 11) schoolStage = 'PREP';
        else if (medianAge <= 5) schoolStage = 'KG';
        else schoolStage = 'PRIMARY';
      }
    }

    list.forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const nid = stRec.nid;
      const grade = stRec.grade;

      if (nid.length === 14 && grade && grade !== 'غير محدد') {
        const ageParts = calculateAgePartsOnOct1(nid, info.year);
        const y = ageParts.y;
        const m = ageParts.m;
        let status = '';

        // تحديد الصف والمرحلة الخاصة به
        let gradeStage = schoolStage;
        if (/رياض|مستوي|kg/i.test(grade)) gradeStage = 'KG';
        else if (/اعداد/i.test(grade)) gradeStage = 'PREP';
        else if (/ثانو|فني|صناع|تجار|زراع/i.test(grade)) gradeStage = 'SECONDARY';
        else if (/ابتدائ/i.test(grade)) gradeStage = 'PRIMARY';

        let gradeNum = 1;
        if (grade.includes('الأول') || grade.includes('الاول') || /kg\s*1/i.test(grade)) gradeNum = 1;
        else if (grade.includes('الثاني') || grade.includes('الثانى') || /kg\s*2/i.test(grade)) gradeNum = 2;
        else if (grade.includes('الثالث')) gradeNum = 3;
        else if (grade.includes('الرابع')) gradeNum = 4;
        else if (grade.includes('الخامس')) gradeNum = 5;
        else if (grade.includes('السادس')) gradeNum = 6;
        else if (/\b1\b/.test(grade)) gradeNum = 1;
        else if (/\b2\b/.test(grade)) gradeNum = 2;
        else if (/\b3\b/.test(grade)) gradeNum = 3;
        else if (/\b4\b/.test(grade)) gradeNum = 4;
        else if (/\b5\b/.test(grade)) gradeNum = 5;
        else if (/\b6\b/.test(grade)) gradeNum = 6;

        let minLegalYears = 6;
        let maxLegalYears = 9;

        if (gradeStage === 'KG') {
          if (gradeNum === 1) {
            minLegalYears = 4; maxLegalYears = 5;
          } else {
            minLegalYears = 5; maxLegalYears = 6;
          }
        } else if (gradeStage === 'PRIMARY') {
          // أولى ابتدائي 6 إلى 9 سنوات (يُسمح حتى 5.5 بتأشيرة محافظ)
          minLegalYears = 5 + gradeNum;
          maxLegalYears = 8 + gradeNum;
        } else if (gradeStage === 'PREP') {
          // أولى إعدادي: 11-15 سنة، ثانية: 12-16، ثالثة: 13-17
          minLegalYears = 10 + gradeNum;
          maxLegalYears = 14 + gradeNum;
        } else if (gradeStage === 'SECONDARY') {
          // أولى ثانوي: 14-18 سنة، ثانية: 15-19، ثالثة: 16-20
          minLegalYears = 13 + gradeNum;
          maxLegalYears = 17 + gradeNum;
        }

        const ageDec = y + (m / 12);
        if (ageDec < minLegalYears) {
          status = `أصغر من السن القانوني للصف (الحد الأدنى ${minLegalYears} سنوات)`;
        } else if (ageDec >= maxLegalYears + 1) {
          status = `أكبر من السن القانوني للصف (الحد الأقصى ${maxLegalYears} سنوات)`;
        }

        if (status) {
          anomalies.push({
            name: stRec.name || 'غير محدد',
            grade: grade,
            class: stRec.cls || '',
            nid: nid,
            y: ageParts.y,
            m: ageParts.m,
            d: ageParts.d,
            status: status
          });
        }
      }
    });

    const numCols = 9;
    let sheet = createSheetHeader(`تقرير مراجعة الحالات العمرية غير الاعتيادية — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);

    const h1 = [{ v: 'م', s: sHead }, { v: 'اسم الطالب', s: sHead }, { v: 'الرقم القومي', s: sHead }, { v: 'الصف', s: sHead }, { v: 'الفصل', s: sHead }, { v: 'السن في 1 أكتوبر', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'ملاحظات', s: sHead }];
    const h2 = [{ v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'يوم', s: sHead }, { v: 'شهر', s: sHead }, { v: 'سنة', s: sHead }, { v: '', s: sHead }];
    sheet.aoa.push(h1, h2);
    const rIdx = sheet.startRow;
    sheet.merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx + 1, c: 0 } }, { s: { r: rIdx, c: 1 }, e: { r: rIdx + 1, c: 1 } }, { s: { r: rIdx, c: 2 }, e: { r: rIdx + 1, c: 2 } }, { s: { r: rIdx, c: 3 }, e: { r: rIdx + 1, c: 3 } }, { s: { r: rIdx, c: 4 }, e: { r: rIdx + 1, c: 4 } }, { s: { r: rIdx, c: 8 }, e: { r: rIdx + 1, c: 8 } });
    sheet.merges.push({ s: { r: rIdx, c: 5 }, e: { r: rIdx, c: 7 } });
    sheet.rowHeights.push({ hpt: 24 }, { hpt: 24 });
    sheet.startRow += 2;

    if (anomalies.length === 0) {
      sheet.aoa.push([{ v: 'لا توجد حالات شاذة عمرياً في هذه البيانات.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      anomalies.sort((a, b) => {
        const gDiff = sortGrades(a.grade, b.grade);
        if (gDiff !== 0) return gDiff;
        return a.name.localeCompare(b.name, 'ar');
      });

      anomalies.forEach((st, idx) => {
        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: st.name, s: sData },
          { v: st.nid, t: 's', s: sData },
          { v: st.grade, s: sData },
          { v: st.class, s: sData },
          { v: st.d, t: 'n', s: sData },
          { v: st.m, t: 'n', s: sData },
          { v: st.y, t: 'n', s: sData },
          { v: st.status, s: { ...sData, font: { color: { rgb: st.status.includes('أكبر') ? 'B91C1C' : '0284C7' }, bold: true, name: 'Cairo' } } }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 22 }];
    return ws;
  }

  function buildDataGuardStatsSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const violations = [];
    const nidMap = new Map();
    const phoneCounts = new Map();
    const phoneOwners = new Map();

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const nid = stRec.nid;
      const phone = toLatinDigits(stRec.phone || '').replace(/\D/g, '');
      const explicitGender = firstNonEmpty(
        rawRow?.['النوع'], rawRow?.['الجنس'], rawRow?.gender, rawRow?.__neprasStatsGender
      );
      const name = stRec.name || 'غير محدد';
      const grade = stRec.grade || '';
      const cls = stRec.cls || '';

      if (nid.length === 14) {
        if (nidMap.has(nid)) {
          violations.push({ name, grade, cls, data: nid, type: 'رقم قومي مكرر', issue: `مكرر مع الطالب: ${nidMap.get(nid)}` });
        } else {
          nidMap.set(nid, name);
        }

        const genderDigit = parseInt(nid.charAt(12), 10);
        const isNidMale = genderDigit % 2 !== 0;
        const isRecordedMale = explicitGender.includes('ذكر') || explicitGender.includes('بنين');
        const isRecordedFemale = explicitGender.includes('نث') || explicitGender.includes('بنات');

        if (explicitGender && ((isNidMale && isRecordedFemale) || (!isNidMale && isRecordedMale))) {
          violations.push({ name, grade, cls, data: nid, type: 'تعارض النوع', issue: `الرقم القومي لـ (${isNidMale ? 'بنين' : 'بنات'}) ومسجل (${explicitGender})` });
        }
      }

      if (phone.length >= 10 && !/^010{8}$/.test(phone) && !/^011{8}$/.test(phone)) {
        phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
        if (!phoneOwners.has(phone)) phoneOwners.set(phone, []);
        phoneOwners.get(phone).push({ name, grade, cls });
      }
    });

    phoneCounts.forEach((count, phone) => {
      const owners = phoneOwners.get(phone);
      if (count > 4) {
        violations.push({ name: owners[0].name + ` (+${count - 1} آخرين)`, grade: 'متعدد', cls: '-', data: phone, type: 'هاتف مكرر بكثرة', issue: `الرقم مسجل لـ ${count} طلاب بالمدرسة` });
      } else if (count > 1 && count <= 4) {
        const lastName1 = owners[0].name.split(' ').pop();
        const lastName2 = owners[1].name.split(' ').pop();
        if (lastName1 !== lastName2) {
          violations.push({ name: owners[0].name, grade: owners[0].grade, cls: owners[0].cls, data: phone, type: 'هاتف مشترك لغير أشقاء', issue: `مكرر مع: ${owners[1].name} (${owners[1].grade})` });
        }
      }
    });

    const numCols = 6;
    let sheet = createSheetHeader(`تقرير تدقيق وسلامة البيانات (المخالفات المنطقية والتكرار) — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'اسم الطالب', s: sHead }, { v: 'الصف والفصل', s: sHead }, { v: 'البيان', s: sHead }, { v: 'نوع المخالفة', s: sHead }, { v: 'وصف المشكلة', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    if (violations.length === 0) {
      sheet.aoa.push([{ v: 'ممتاز! بيانات المدرسة نظيفة تماماً ولا يوجد بها تكرار أو تعارض منطقي.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      violations.sort((a, b) => a.type.localeCompare(b.type, 'ar')).forEach((v, idx) => {
        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: v.name, s: sData },
          { v: v.cls ? `${v.grade} - ${v.cls}` : v.grade, s: sData },
          { v: v.data, t: 's', s: sData },
          { v: v.type, s: { ...sData, font: { color: { rgb: 'B91C1C' }, bold: true, name: 'Cairo' } } },
          { v: v.issue, s: sData }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 40 }];
    return ws;
  }

  function buildBirthMonthsStatsSheet(gradeData, gradeName, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const studentsList = [];

    (Array.isArray(gradeData) ? gradeData : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const nid = stRec.nid;
      if (nid.length === 14) {
        const ageParts = calculateAgePartsOnOct1(nid, meta.year);
        const totalDays = (ageParts.y * 365) + (ageParts.m * 30) + ageParts.d;
        studentsList.push({
          name: stRec.name || 'غير محدد',
          grade: stRec.grade || gradeName || '',
          dob: ageParts.fullDob,
          y: ageParts.y,
          m: ageParts.m,
          d: ageParts.d,
          totalDays: totalDays
        });
      }
    });

    studentsList.sort((a, b) => b.totalDays - a.totalDays);

    const numCols = 8;
    let sheet = createSheetHeader(`ترتيب الأولوية وتنسيق القبول (مواليد الشهور) — ${gradeName} — ${meta.school}`, numCols, meta.year, meta.school, meta.dir, meta.admin);

    const h1 = [{ v: 'م', s: sHead }, { v: 'اسم الطالب', s: sHead }, { v: 'الصف', s: sHead }, { v: 'تاريخ الميلاد', s: sHead }, { v: 'العمر الدقيق في 1 أكتوبر', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'ترتيب الأولوية', s: sHead }];
    const h2 = [{ v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'يوم', s: sHead }, { v: 'شهر', s: sHead }, { v: 'سنة', s: sHead }, { v: '', s: sHead }];
    sheet.aoa.push(h1, h2);
    const rIdx = sheet.startRow;
    sheet.merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx + 1, c: 0 } }, { s: { r: rIdx, c: 1 }, e: { r: rIdx + 1, c: 1 } }, { s: { r: rIdx, c: 2 }, e: { r: rIdx + 1, c: 2 } }, { s: { r: rIdx, c: 3 }, e: { r: rIdx + 1, c: 3 } }, { s: { r: rIdx, c: 7 }, e: { r: rIdx + 1, c: 7 } });
    sheet.merges.push({ s: { r: rIdx, c: 4 }, e: { r: rIdx, c: 6 } });
    sheet.rowHeights.push({ hpt: 24 }, { hpt: 24 });
    sheet.startRow += 2;

    if (studentsList.length === 0) {
      sheet.aoa.push([{ v: 'لا توجد أرقام قومية صالحة لحساب الترتيب.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      studentsList.forEach((st, idx) => {
        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: st.name, s: sData },
          { v: st.grade || gradeName, s: sData },
          { v: st.dob, t: 's', s: sData },
          { v: st.d, t: 'n', s: sData },
          { v: st.m, t: 'n', s: sData },
          { v: st.y, t: 'n', s: sData },
          { v: `رقم (${idx + 1})`, s: { ...sData, font: { color: { rgb: '1E40AF' }, bold: true, name: 'Cairo' } } }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 16 }];
    return ws;
  }

  function buildMotherNamesAnalysisSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const suspicious = [];
    const normalizedRows = (Array.isArray(data) ? data : []).map(normalizeStudentRecord);
    const hasAnyMotherData = normalizedRows.some(r => r.mother && r.mother.length > 0);

    normalizedRows.forEach(stRec => {
      const name = stRec.name;
      const mother = stRec.mother;
      const grade = stRec.grade || '';
      const cls = stRec.cls || '';

      if (!mother) return;
      const cleanMother = mother.replace(/\s+/g, ' ').trim();
      let issue = '';

      if (cleanMother.length < 8) issue = 'اسم مختصر جداً (قد يكون الاسم الأول فقط)';
      else if (cleanMother.includes('لا يوجد') || cleanMother.includes('-') || cleanMother.includes('*') || cleanMother.includes('متوف')) issue = 'اسم غير قانوني أو ملاحظة وفاة';
      else if (/\d/.test(cleanMother)) issue = 'الاسم يحتوي على أرقام';
      else if (name && cleanMother) {
        const nameParts = name.replace(/\s+/g, ' ').trim().split(' ');
        const motherParts = cleanMother.split(' ');
        if (nameParts.length > 1 && motherParts.length > 1) {
          if (nameParts[0] === motherParts[0] && nameParts[nameParts.length - 1] === motherParts[motherParts.length - 1]) {
            issue = 'تشابه لافت (قد يكون اسم الأب أو الطالب مكان الأم)';
          }
        }
      }

      if (issue) suspicious.push({ name, grade, class: cls, mother: cleanMother, issue });
    });

    const numCols = 6;
    let sheet = createSheetHeader(`تقرير تدقيق وتحليل أسماء الأمهات — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);
    const headers = [{ v: 'م', s: sHead }, { v: 'اسم الطالب', s: sHead }, { v: 'الصف والفصل', s: sHead }, { v: 'اسم الأم المسجل', s: sHead }, { v: 'الملاحظة الناتجة عن التدقيق', s: sHead }, { v: 'الإجراء الموصى به', s: sHead }];
    sheet.aoa.push(headers);
    sheet.rowHeights.push({ hpt: 28 });
    sheet.startRow++;

    if (!hasAnyMotherData) {
      sheet.aoa.push([{ v: 'بيانات أسماء الأمهات غير متوفرة في السحب السريع — يرجى إجراء التنزيل الشامل (24 حقل) أو استيراد ملف يحتوي على عمود اسم الأم.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else if (suspicious.length === 0) {
      sheet.aoa.push([{ v: 'جميع أسماء الأمهات مسجلة ومكتملة بشكل سليم.', t: 's', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }, { v: '', s: sData }]);
      sheet.merges.push({ s: { r: sheet.startRow, c: 0 }, e: { r: sheet.startRow, c: numCols - 1 } });
      sheet.rowHeights.push({ hpt: 26 });
      sheet.startRow++;
    } else {
      suspicious.forEach((st, idx) => {
        const rowData = [
          { v: idx + 1, t: 'n', s: sData },
          { v: st.name, s: sData },
          { v: st.class ? `${st.grade} - ${st.class}` : st.grade, s: sData },
          { v: st.mother, s: { ...sData, font: { color: { rgb: '0284C7' }, bold: true, name: 'Cairo' } } },
          { v: st.issue, s: { ...sData, font: { color: { rgb: 'B91C1C' }, bold: true, name: 'Cairo' } } },
          { v: 'مراجعة ملف التلميذ الورقي', s: sData }
        ];
        sheet.aoa.push(rowData);
        sheet.rowHeights.push({ hpt: 24 });
        sheet.startRow++;
      });
    }

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 25 }];
    return ws;
  }

  function buildPrincipalDashboardSheet(data, meta) {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    const stats = {};
    const totals = { students: 0, boys: 0, girls: 0, muslim: 0, christian: 0, new: 0, pass: 0, repeat: 0, classes: 0 };

    (Array.isArray(data) ? data : []).forEach(rawRow => {
      const stRec = normalizeStudentRecord(rawRow);
      const grade = stRec.grade || 'غير محدد';
      const isGirl = stRec.gender === 'بنات';
      const isBoy = stRec.gender === 'بنين';
      const religion = stRec.religion || '';
      const statusCat = classifyEnrollmentStatus(stRec.status, grade);
      const cls = stRec.cls;

      if (!stats[grade]) stats[grade] = { classes: new Set(), total: 0, b: 0, g: 0, mus: 0, chr: 0, new: 0, pass: 0, rep: 0 };
      if (cls) stats[grade].classes.add(cls);
      stats[grade].total++;
      totals.students++;

      if (isBoy) {
        stats[grade].b++; totals.boys++;
      } else if (isGirl) {
        stats[grade].g++; totals.girls++;
      }

      if (religion === 'مسلم' || religion.includes('مسلم') || religion === 'Muslim') {
        stats[grade].mus++; totals.muslim++;
      } else if (religion === 'مسيحي' || religion.includes('مسيح') || religion === 'Christian') {
        stats[grade].chr++; totals.christian++;
      }

      if (statusCat === 'new') {
        stats[grade].new++; totals.new++;
      } else if (statusCat === 'repeat') {
        stats[grade].rep++; totals.repeat++;
      } else if (statusCat === 'promoted') {
        stats[grade].pass++; totals.pass++;
      }
    });

    const numCols = 10;
    let sheet = createSheetHeader(`اللوحة الإحصائية التجميعية الشاملة لمدير المدرسة — ${meta.school} (${meta.year})`, numCols, meta.year, meta.school, meta.dir, meta.admin);

    const h1 = [{ v: 'البيان / الصف', s: sHead }, { v: 'عدد الفصول', s: sHead }, { v: 'إجمالي الطلاب', s: sHead }, { v: 'النوع', s: sHead }, { v: '', s: sHead }, { v: 'الديانة', s: sHead }, { v: '', s: sHead }, { v: 'حالة القيد الأساسية', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }];
    const h2 = [{ v: '', s: sHead }, { v: '', s: sHead }, { v: '', s: sHead }, { v: 'بنين', s: sHead }, { v: 'بنات', s: sHead }, { v: 'مسلم', s: sHead }, { v: 'مسيحي', s: sHead }, { v: 'مستجد', s: sHead }, { v: 'ناجح/منقول', s: sHead }, { v: 'باقي للإعادة', s: sHead }];
    sheet.aoa.push(h1, h2);
    const rIdx = sheet.startRow;
    sheet.merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx + 1, c: 0 } }, { s: { r: rIdx, c: 1 }, e: { r: rIdx + 1, c: 1 } }, { s: { r: rIdx, c: 2 }, e: { r: rIdx + 1, c: 2 } }, { s: { r: rIdx, c: 3 }, e: { r: rIdx, c: 4 } }, { s: { r: rIdx, c: 5 }, e: { r: rIdx, c: 6 } }, { s: { r: rIdx, c: 7 }, e: { r: rIdx, c: 9 } });
    sheet.rowHeights.push({ hpt: 24 }, { hpt: 24 });
    sheet.startRow += 2;

    Object.keys(stats).sort(sortGrades).forEach(grade => {
      const st = stats[grade];
      totals.classes += st.classes.size;
      const rowData = [
        { v: grade, s: { ...sData, font: { bold: true, name: 'Cairo' } } },
        { v: st.classes.size, t: 'n', s: sData },
        { v: st.total, t: 'n', s: { ...sData, fill: { fgColor: { rgb: 'E2E8F0' } }, font: { bold: true, name: 'Cairo' } } },
        { v: st.b, t: 'n', s: sData },
        { v: st.g, t: 'n', s: sData },
        { v: st.mus, t: 'n', s: sData },
        { v: st.chr, t: 'n', s: sData },
        { v: st.new, t: 'n', s: sData },
        { v: st.pass, t: 'n', s: sData },
        { v: st.rep, t: 'n', s: sData }
      ];
      sheet.aoa.push(rowData);
      sheet.rowHeights.push({ hpt: 24 });
      sheet.startRow++;
    });

    const tRow = [
      { v: 'الإجمالي العام للمدرسة', s: sTotal },
      { v: totals.classes, t: 'n', s: sTotal },
      { v: totals.students, t: 'n', s: { ...sTotal, font: { sz: 14, bold: true, color: { rgb: '991B1B' }, name: 'Cairo' } } },
      { v: totals.boys, t: 'n', s: sTotal },
      { v: totals.girls, t: 'n', s: sTotal },
      { v: totals.muslim, t: 'n', s: sTotal },
      { v: totals.christian, t: 'n', s: sTotal },
      { v: totals.new, t: 'n', s: sTotal },
      { v: totals.pass, t: 'n', s: sTotal },
      { v: totals.repeat, t: 'n', s: sTotal }
    ];
    sheet.aoa.push(tRow);
    sheet.rowHeights.push({ hpt: 32 });
    sheet.startRow++;

    sheet = appendSheetFooter(sheet.aoa, sheet.merges, sheet.rowHeights, sheet.startRow, numCols, meta.affairs, meta.principal);
    const ws = xlsxLib.utils.aoa_to_sheet(sheet.aoa);
    ws['!merges'] = sheet.merges;
    ws['!rows'] = sheet.rowHeights;
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
    return ws;
  }

  // -------------------------------------------------------------
  // 4. دالة التصدير والتنزيل الآمن الموحّد
  // -------------------------------------------------------------

  async function exportSingleSheetWorkbook(ws, sheetName, fileName, folder = 'شئون_الطلاب/إحصائيات') {
    const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    if (!xlsxLib) {
      alert('مكتبة الإكسيل غير محملة.');
      return;
    }
    const wb = xlsxLib.utils.book_new();
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{ RTL: true }];
    xlsxLib.utils.book_append_sheet(wb, ws, sheetName);

    let wbout = null;
    const styledConverter = global.neprasXlsxConvertWorkbookToStyledPackage || (typeof neprasXlsxConvertWorkbookToStyledPackage === 'function' ? neprasXlsxConvertWorkbookToStyledPackage : null);
    if (styledConverter) {
      try {
        wbout = styledConverter(wb);
      } catch (err) {
        console.warn('[Nepras Stats] تعذر تطبيق التنسيق الملكي للأوفيس، جاري استخدام التصدير القياسي:', err);
      }
    }
    if (!wbout) {
      wbout = xlsxLib.write(wb, { bookType: 'xlsx', type: 'array' });
    }
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    if (typeof global.saveFileToSubfolder === 'function') {
      global.saveFileToSubfolder(blob, folder, fileName);
    } else if (global.neprasDialog?.triggerDownload) {
      await global.neprasDialog.triggerDownload(blob, fileName, {
        title: 'تم إنشاء الإحصائية بنجاح',
        message: `تم حفظ الملف: ${fileName}`,
        folder
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }
  }

  // -------------------------------------------------------------
  // 5. بناء المصنف الشامل (Master Workbook)
  // -------------------------------------------------------------

  function buildMasterWorkbook(data, meta, xlsxLib) {
    xlsxLib = xlsxLib || global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    if (!xlsxLib) throw new Error('مكتبة الإكسيل غير محملة.');

    const rows = Array.isArray(data) ? data : [];
    const wb = xlsxLib.utils.book_new();
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{ RTL: true }];

    xlsxLib.utils.book_append_sheet(wb, buildPrincipalDashboardSheet(rows, meta), 'اللوحة الإحصائية');
    xlsxLib.utils.book_append_sheet(wb, buildGenderStatsSheet(rows, meta), 'الفصول والنوع');
    xlsxLib.utils.book_append_sheet(wb, buildEnrollmentStatsSheet(rows, meta), 'حالات القيد');
    xlsxLib.utils.book_append_sheet(wb, buildReligionStatsSheet(rows, meta), 'الديانة');
    xlsxLib.utils.book_append_sheet(wb, buildDensityStatsSheet(rows, meta), 'كثافة الفصول');
    xlsxLib.utils.book_append_sheet(wb, buildIntegrationStatsSheet(rows, meta), 'كشف الدمج');

    const hasNid = rows.some(r => normalizeStudentRecord(r).nid.length === 14);
    if (hasNid) {
      xlsxLib.utils.book_append_sheet(wb, buildAgeStatsSheet(rows, meta), 'الفئات العمرية');
      xlsxLib.utils.book_append_sheet(wb, buildAnomaliesStatsSheet(rows, meta), 'مطابقة السن');
      xlsxLib.utils.book_append_sheet(wb, buildDemographicsStatsSheet(rows, meta), 'التوزيع الجغرافي');
      xlsxLib.utils.book_append_sheet(wb, buildBirthMonthsStatsSheet(rows, 'جميع الصفوف', meta), 'مواليد الشهور');
    }

    xlsxLib.utils.book_append_sheet(wb, buildSiblingsStatsSheet(rows, meta), 'الأشقاء والإخوة');
    xlsxLib.utils.book_append_sheet(wb, buildDataGuardStatsSheet(rows, meta), 'تدقيق البيانات');
    xlsxLib.utils.book_append_sheet(wb, buildQualityStatsSheet(rows, meta), 'جودة البيانات');
    xlsxLib.utils.book_append_sheet(wb, buildMotherNamesAnalysisSheet(rows, meta), 'أسماء الأمهات');
    xlsxLib.utils.book_append_sheet(wb, buildLanguagesStatsSheet(rows, meta), 'اللغات والشعب');
    xlsxLib.utils.book_append_sheet(wb, buildSecondaryTracksStatsSheet(rows, meta), 'الثانوي - مسارات وشعب');

    return wb;
  }

  // -------------------------------------------------------------
  // 6. نافذة العرض المتطابقة تماماً مع هوية وتصميم نبراس المعتمد
  // -------------------------------------------------------------

  function showStatsDashboardModal(initialData = null) {
    if (typeof document === 'undefined') return;
    if (document.getElementById('emis-stats-dashboard-modal')) {
      const existing = document.getElementById('emis-stats-dashboard-modal');
      existing.style.display = 'block';
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'emis-stats-dashboard-modal';
    modal.style.cssText = [
      'position: fixed',
      'top: 30px',
      'left: 50%',
      'transform: translateX(-50%)',
      'width: 720px',
      'max-width: 95vw',
      'background: #ffffff',
      'z-index: 2147483647',
      'border-radius: 12px',
      'box-shadow: 0 20px 45px rgba(15, 23, 42, 0.22)',
      'border: 1px solid #cbd5e1',
      "font-family: 'Cairo', system-ui, -apple-system, sans-serif",
      'direction: rtl',
      'color: #0f172a',
      'user-select: none',
      'overflow: hidden'
    ].join(';') + ';';

    let savedOpts = {};
    try { savedOpts = JSON.parse(localStorage.getItem('emis_print_opts') || '{}'); } catch (_) {}
    const savedYear = localStorage.getItem('emis_print_year') || (globalThis.NeprasEgypt?.academicYearLabel?.() || '2026 / 2027').replace(' / ', '-');
    const savedDir = savedOpts.directorate || localStorage.getItem('emis_print_dir') || '';
    const savedAdmin = savedOpts.administration || localStorage.getItem('emis_print_admin') || '';
    const savedSchool = savedOpts.schoolName || localStorage.getItem('emis_print_school') || 'المدرسة';
    const savedAffairs = localStorage.getItem('emis_print_affairs') || '';
    const savedPrincipal = localStorage.getItem('emis_print_principal') || '';

    modal.innerHTML = `
      <style>
        .nepras-stats-btn {
          background: #f8fafc;
          color: #1e293b;
          border: 1px solid #cbd5e1;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
          font-family: 'Cairo', sans-serif;
          transition: all 0.15s ease-in-out;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .nepras-stats-btn:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
          transform: translateY(-1px);
        }
        .nepras-stats-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }
        .nepras-stats-master {
          background: #0f766e !important;
          color: #ffffff !important;
          border: 1px solid #0f766e !important;
          font-size: 12px !important;
          padding: 10px !important;
          box-shadow: 0 2px 6px rgba(15, 118, 110, 0.3) !important;
        }
        .nepras-stats-master:hover:not(:disabled) {
          background: #115e59 !important;
        }
      </style>

      <div id="stats-dash-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #0d9488; padding: 10px 16px; background: linear-gradient(135deg, #0f766e, #115e59); color: #fff; cursor: move;">
        <h3 style="margin: 0; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
          <span>المركز الإحصائي والتقارير المدرسية الشاملة — نبراس</span>
        </h3>
        <button type="button" id="stats-dash-close-btn" style="background: transparent; color: #ffffff; border: none; font-size: 20px; cursor: pointer; padding: 0 6px; line-height: 1;">&times;</button>
      </div>

      <div style="padding: 14px 16px; max-height: 80vh; overflow-y: auto; background: #ffffff;">
        
        <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div id="stats-file-status" style="font-size: 11px; color: #0f766e; font-weight: 700;">
            ● جاري فحص بيانات المدرسة المتاحة...
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="stats-memory-btn" class="nepras-stats-btn" style="padding: 4px 10px; font-size: 11px;">تحديث من الذاكرة</button>
            <label class="nepras-stats-btn" style="padding: 4px 10px; font-size: 11px; cursor: pointer; margin: 0;">
              ملف إكسيل
              <input type="file" id="stats-file-input" accept=".xlsx, .xls" style="display: none;">
            </label>
          </div>
        </div>

        <details style="background: #f8fafc; padding: 8px 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
          <summary style="font-size: 11px; font-weight: 700; color: #0f766e; cursor: pointer; user-select: none;">
            بيانات الترويسة المدرسية الرسمية (تُحفظ تلقائياً وتُطبّق على جميع الكشوف)
          </summary>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
            <div><label style="font-size: 10px; color: #64748b;">العام الدراسي:</label><input type="text" id="s-print-year" value="${escapeHtml(savedYear)}" style="width: 100%; padding: 4px 8px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; font-family: 'Cairo'; box-sizing: border-box;"></div>
            <div><label style="font-size: 10px; color: #64748b;">المدرسة:</label><input type="text" id="s-print-school" value="${escapeHtml(savedSchool)}" style="width: 100%; padding: 4px 8px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; font-family: 'Cairo'; box-sizing: border-box;"></div>
            <div><label style="font-size: 10px; color: #64748b;">المديرية:</label><input type="text" id="s-print-dir" value="${escapeHtml(savedDir)}" style="width: 100%; padding: 4px 8px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; font-family: 'Cairo'; box-sizing: border-box;"></div>
            <div><label style="font-size: 10px; color: #64748b;">الإدارة:</label><input type="text" id="s-print-admin" value="${escapeHtml(savedAdmin)}" style="width: 100%; padding: 4px 8px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; font-family: 'Cairo'; box-sizing: border-box;"></div>
            <div><label style="font-size: 10px; color: #64748b;">شئون الطلاب:</label><input type="text" id="s-print-affairs" placeholder="مثال: أ/ محمد" value="${escapeHtml(savedAffairs)}" style="width: 100%; padding: 4px 8px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; font-family: 'Cairo'; box-sizing: border-box;"></div>
            <div><label style="font-size: 10px; color: #64748b;">مدير المدرسة:</label><input type="text" id="s-print-principal" placeholder="مثال: أ/ أحمد" value="${escapeHtml(savedPrincipal)}" style="width: 100%; padding: 4px 8px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; font-family: 'Cairo'; box-sizing: border-box;"></div>
          </div>
        </details>

        <div style="margin-bottom: 12px;">
          <button type="button" id="btn-stats-master" class="nepras-stats-btn nepras-stats-master" style="width: 100%; justify-content: center;" disabled>
            تصدير المصنف الإحصائي الشامل (15 تقريراً معتمداً في ملف Excel واحد)
          </button>
        </div>

        <div style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px;">تقارير الإحصاء السكاني والتنظيمي:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px;">
          <button type="button" id="btn-stats-gender" class="nepras-stats-btn" disabled>إحصائية النوع</button>
          <button type="button" id="btn-stats-enrollment" class="nepras-stats-btn" disabled>إحصائية حالات القيد</button>
          <button type="button" id="btn-stats-age" class="nepras-stats-btn" disabled>إحصائية الفئات العمرية</button>
          <button type="button" id="btn-stats-religion" class="nepras-stats-btn" disabled>إحصائية الديانة</button>
          <button type="button" id="btn-stats-integration" class="nepras-stats-btn" disabled>حصر وكشوف الدمج</button>
          <button type="button" id="btn-stats-density" class="nepras-stats-btn" disabled>كثافة الفصول والأعداد</button>
        </div>

        <div style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px;">تقارير التدقيق والمطابقة وتنسيق القبول:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
          <button type="button" id="btn-stats-dataguard" class="nepras-stats-btn" disabled>مراجعة وتدقيق البيانات</button>
          <button type="button" id="btn-stats-birthmonths" class="nepras-stats-btn" disabled>ترتيب القبول (مواليد الشهور)</button>
          <button type="button" id="btn-stats-siblings" class="nepras-stats-btn" disabled>إحصائية الأشقاء</button>
          <button type="button" id="btn-stats-mothernames" class="nepras-stats-btn" disabled>تحليل أسماء الأمهات</button>
          <button type="button" id="btn-stats-demographics" class="nepras-stats-btn" disabled>التوزيع الجغرافي للمحافظات</button>
          <button type="button" id="btn-stats-languages" class="nepras-stats-btn" disabled>إحصائية اللغات والشعب</button>
          <button type="button" id="btn-stats-secondary" class="nepras-stats-btn" style="background:#f0fdf4;border-color:#86efac;color:#166534;" disabled>📊 إحصائية الثانوي (مسارات وشعب)</button>
          <button type="button" id="btn-stats-anomalies" class="nepras-stats-btn" disabled>مطابقة السن القانوني</button>
          <button type="button" id="btn-stats-quality" class="nepras-stats-btn" disabled>جودة واكتمال البيانات</button>
        </div>
        <button type="button" id="btn-stats-dashsheet" class="nepras-stats-btn" style="width: 100%; justify-content: center; margin-top: 4px;" disabled>
          اللوحة الإحصائية التجميعية الشاملة لمدير المدرسة
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const dragHeader = document.getElementById('stats-dash-header');
    let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    dragHeader.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = modal.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      modal.style.transform = 'none';
      modal.style.left = `${initialLeft}px`;
      modal.style.top = `${initialTop}px`;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      modal.style.left = `${initialLeft + dx}px`;
      modal.style.top = `${Math.max(10, initialTop + dy)}px`;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    const saveLiveInputs = () => {
      const opts = {
        directorate: document.getElementById('s-print-dir').value.trim(),
        administration: document.getElementById('s-print-admin').value.trim(),
        schoolName: document.getElementById('s-print-school').value.trim()
      };
      localStorage.setItem('emis_print_opts', JSON.stringify(opts));
      localStorage.setItem('emis_print_year', document.getElementById('s-print-year').value.trim());
      localStorage.setItem('emis_print_dir', opts.directorate);
      localStorage.setItem('emis_print_admin', opts.administration);
      localStorage.setItem('emis_print_school', opts.schoolName);
      localStorage.setItem('emis_print_affairs', document.getElementById('s-print-affairs').value.trim());
      localStorage.setItem('emis_print_principal', document.getElementById('s-print-principal').value.trim());

      try {
        if (chrome?.storage?.local) {
          const metaObj = {
            year: document.getElementById('s-print-year').value.trim(),
            directorate: opts.directorate,
            administration: opts.administration,
            schoolName: opts.schoolName,
            affairs: document.getElementById('s-print-affairs').value.trim(),
            principal: document.getElementById('s-print-principal').value.trim()
          };
          chrome.storage.local.set({
            nepras_report_header_meta: metaObj
          });
          if (globalThis.NeprasSchoolManager?.saveSchoolMeta) {
            globalThis.NeprasSchoolManager.saveSchoolMeta(null, metaObj);
          }
        }
      } catch (_) {}
    };

    ['s-print-dir', 's-print-admin', 's-print-school', 's-print-year', 's-print-affairs', 's-print-principal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', saveLiveInputs);
        el.addEventListener('change', saveLiveInputs);
      }
    });

    document.getElementById('stats-dash-close-btn').onclick = () => {
      saveLiveInputs();
      modal.remove();
    };

    let globalStatsData = [];
    const buttonsToEnable = [
      'btn-stats-master', 'btn-stats-gender', 'btn-stats-enrollment', 'btn-stats-age',
      'btn-stats-religion', 'btn-stats-integration', 'btn-stats-quality', 'btn-stats-density',
      'btn-stats-siblings', 'btn-stats-demographics', 'btn-stats-languages', 'btn-stats-secondary',
      'btn-stats-anomalies', 'btn-stats-dataguard', 'btn-stats-birthmonths', 'btn-stats-mothernames',
      'btn-stats-dashsheet'
    ];

    const applyDataLoaded = (data, sourceTitle) => {
      globalStatsData = data;
      const statusDiv = document.getElementById('stats-file-status');
      statusDiv.innerHTML = `✅ متصل: جاهز لإعداد التقارير (${escapeHtml(sourceTitle)}) — العدد: <b>${/* html-safe */ Number(data.length || 0)}</b> طالب.`;
      statusDiv.style.color = '#0f766e';
      buttonsToEnable.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = false;
      });
    };

    document.getElementById('stats-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const statusDiv = document.getElementById('stats-file-status');
      if (!file) return;

      statusDiv.textContent = '⏳ جاري قراءة بيانات الملف، يرجى الانتظار...';
      statusDiv.style.color = '#0284c7';
      buttonsToEnable.forEach(id => { const b = document.getElementById(id); if (b) b.disabled = true; });

      try {
        const { json } = await readWorkbookFromExcel(file);
        if (!json || json.length === 0) throw new Error('الملف فارغ أو لا يحتوي على صفوف صالحة.');
        applyDataLoaded(json, file.name);
      } catch (err) {
        statusDiv.textContent = `❌ حدث خطأ أثناء قراءة الملف: ${err.message || 'يرجى التأكد من صلاحية الملف.'}`;
        statusDiv.style.color = '#ef4444';
        globalStatsData = [];
      }
    });

    const checkMemoryData = async () => {
      let cached = window.neprasCachedStudentsList || window._currentDeepScrapedData || null;
      if (!cached || !cached.length) {
        try {
          const stored = await chrome.storage.local.get(['neprasCachedStudentsList', 'neprasSchoolStatsV1']);
          cached =
            stored.neprasCachedStudentsList ||
            stored.neprasSchoolStatsV1?.detailRows ||
            stored.neprasSchoolStatsV1?.rows ||
            stored.neprasSchoolStatsV1?.students ||
            null;
        } catch (_) {}
      }

      if (cached && cached.length) {
        applyDataLoaded(cached, 'بيانات المدرسة المحفوظة');
      } else {
        const statusDiv = document.getElementById('stats-file-status');
        if (statusDiv) {
          statusDiv.textContent = 'لا توجد بيانات محفوظة حالياً. يرجى التحديث من صفحة الطلاب أو رفع ملف.';
          statusDiv.style.color = '#d97706';
        }
      }
    };

    document.getElementById('stats-memory-btn').addEventListener('click', checkMemoryData);

    const getMeta = () => {
      saveLiveInputs();
      return {
        year: document.getElementById('s-print-year').value.trim() || (globalThis.NeprasEgypt?.academicYearLabel?.() || '2026 / 2027').replace(' / ', '-'),
        school: document.getElementById('s-print-school').value.trim() || 'المدرسة',
        dir: document.getElementById('s-print-dir').value.trim(),
        admin: document.getElementById('s-print-admin').value.trim(),
        affairs: document.getElementById('s-print-affairs').value.trim(),
        principal: document.getElementById('s-print-principal').value.trim(),
        safeName: (document.getElementById('s-print-school').value.trim() || 'المدرسة').replace(/[\\/:*?"<>|]/g, '_')
      };
    };

    document.getElementById('btn-stats-gender').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildGenderStatsSheet(globalStatsData, meta), 'الفصول والنوع', `احصائية_الفصول_والنوع_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-enrollment').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildEnrollmentStatsSheet(globalStatsData, meta), 'حالات القيد', `احصائية_حالات_القيد_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-religion').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildReligionStatsSheet(globalStatsData, meta), 'الديانة', `احصائية_الديانة_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-age').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildAgeStatsSheet(globalStatsData, meta), 'الفئات العمرية', `احصائية_الفئات_العمرية_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-integration').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildIntegrationStatsSheet(globalStatsData, meta), 'كشف الدمج', `كشف_الدمج_والتربية_الخاصة_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-quality').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildQualityStatsSheet(globalStatsData, meta), 'جودة البيانات', `تقرير_جودة_البيانات_والنواقص_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-density').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildDensityStatsSheet(globalStatsData, meta), 'كثافة الفصول', `كثافة_الفصول_والاعداد_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-siblings').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildSiblingsStatsSheet(globalStatsData, meta), 'الأشقاء والإخوة', `احصائية_الاشقاء_والاخوة_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-demographics').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildDemographicsStatsSheet(globalStatsData, meta), 'التوزيع الجغرافي', `التوزيع_الجغرافي_للمحافظات_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-languages').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildLanguagesStatsSheet(globalStatsData, meta), 'اللغات والشعب', `احصائية_اللغات_والشعب_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-secondary').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildSecondaryTracksStatsSheet(globalStatsData, meta), 'الثانوي - مسارات وشعب', `احصائية_الثانوي_العام_مسارات_وشعب_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-anomalies').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildAnomaliesStatsSheet(globalStatsData, meta), 'مطابقة السن', `مطابقة_السن_القانوني_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-dataguard').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildDataGuardStatsSheet(globalStatsData, meta), 'تدقيق البيانات', `تقرير_تدقيق_وسلامة_البيانات_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-birthmonths').onclick = () => {
      const meta = getMeta();
      const grades = [...new Set(globalStatsData.map(r => normalizeStudentRecord(r).grade).filter(g => g && g !== 'غير محدد'))].sort(sortGrades);
      if (grades.length === 0) {
        exportSingleSheetWorkbook(buildBirthMonthsStatsSheet(globalStatsData, 'جميع الصفوف', meta), 'مواليد الشهور', `ترتيب_القبول_مواليد_الشهور_${meta.safeName}.xlsx`);
      } else {
        const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
        if (!xlsxLib) return;
        const wb = xlsxLib.utils.book_new();
        if (!wb.Workbook) wb.Workbook = {};
        if (!wb.Workbook.Views) wb.Workbook.Views = [{ RTL: true }];
        grades.forEach(g => {
          const gData = globalStatsData.filter(r => normalizeStudentRecord(r).grade === g);
          const safeSheet = String(g).replace(/[\\/:*?"<>|]/g, '').substring(0, 31);
          xlsxLib.utils.book_append_sheet(wb, buildBirthMonthsStatsSheet(gData, g, meta), safeSheet);
        });
        let wbout = null;
        const styledConverter = global.neprasXlsxConvertWorkbookToStyledPackage || (typeof neprasXlsxConvertWorkbookToStyledPackage === 'function' ? neprasXlsxConvertWorkbookToStyledPackage : null);
        if (styledConverter) {
          try {
            wbout = styledConverter(wb);
          } catch (err) {
            console.warn('[Nepras Stats] تعذر تطبيق التنسيق الملكي للأوفيس:', err);
          }
        }
        if (!wbout) {
          wbout = xlsxLib.write(wb, { bookType: 'xlsx', type: 'array' });
        }
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const fName = `ترتيب_القبول_مواليد_الشهور_لكل_الصفوف_${meta.safeName}.xlsx`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
    };

    document.getElementById('btn-stats-mothernames').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildMotherNamesAnalysisSheet(globalStatsData, meta), 'أسماء الأمهات', `تحليل_اسماء_الامهات_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-dashsheet').onclick = () => {
      const meta = getMeta();
      exportSingleSheetWorkbook(buildPrincipalDashboardSheet(globalStatsData, meta), 'اللوحة الإحصائية', `اللوحة_الاحصائية_لمدير_المدرسة_${meta.safeName}.xlsx`);
    };

    document.getElementById('btn-stats-master').onclick = () => {
      const xlsxLib = global.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
      if (!xlsxLib) { alert('مكتبة الإكسيل غير محملة.'); return; }
      const meta = getMeta();
      const btn = document.getElementById('btn-stats-master');
      btn.textContent = '⏳ جاري تجميع وتنسيق المصنف الشامل...';

      setTimeout(async () => {
        try {
          const wb = buildMasterWorkbook(globalStatsData, meta, xlsxLib);
          let wbout = null;
          const styledConverter = global.neprasXlsxConvertWorkbookToStyledPackage || (typeof neprasXlsxConvertWorkbookToStyledPackage === 'function' ? neprasXlsxConvertWorkbookToStyledPackage : null);
          if (styledConverter) {
            try {
              wbout = styledConverter(wb);
            } catch (err) {
              console.warn('[Nepras Stats Master] تعذر تطبيق التنسيق الملكي للأوفيس:', err);
            }
          }
          if (!wbout) {
            wbout = xlsxLib.write(wb, { bookType: 'xlsx', type: 'array' });
          }
          const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const masterFileName = `الاحصائية_الشاملة_${meta.safeName}.xlsx`;

          if (global.neprasDialog?.triggerDownload) {
            await global.neprasDialog.triggerDownload(blob, masterFileName, {
              title: 'تم إنشاء الإحصائية الشاملة بنجاح',
              message: 'يحتوي الملف على جميع التقارير والإحصائيات في أوراق عمل منفصلة ومنسقة بالكامل.',
              folder: 'شئون_الطلاب/إحصائيات'
            });
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = masterFileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 15000);
          }
        } catch (err) {
          console.error(err);
          alert('حدث خطأ أثناء تجميع ملف الإحصائية الشاملة: ' + (err.message || ''));
        } finally {
          btn.textContent = 'تصدير المصنف الإحصائي الشامل (15 تقريراً معتمداً في ملف Excel واحد)';
        }
      }, 100);
    };

    if (Array.isArray(initialData) && initialData.length > 0) {
      applyDataLoaded(initialData, 'بيانات الطلاب الحالية');
    } else {
      checkMemoryData();
    }
  }

  // تصدير الكائن والربط على النطاق العام
  global.NeprasStatsDashboard = Object.freeze({
    showModal: showStatsDashboardModal,
    normalizeStudentRecord,
    sortGrades,
    calculateAgePartsOnOct1,
    decodeNID,
    readWorkbookFromExcel,
    exportSingleSheetWorkbook,
    buildMasterWorkbook,
    buildGenderStatsSheet,
    buildEnrollmentStatsSheet,
    buildReligionStatsSheet,
    buildAgeStatsSheet,
    buildIntegrationStatsSheet,
    buildQualityStatsSheet,
    buildDensityStatsSheet,
    buildSiblingsStatsSheet,
    buildDemographicsStatsSheet,
    buildLanguagesStatsSheet,
    buildAnomaliesStatsSheet,
    buildDataGuardStatsSheet,
    buildBirthMonthsStatsSheet,
    buildMotherNamesAnalysisSheet,
    buildPrincipalDashboardSheet,
    buildSecondaryTracksStatsSheet
  });

  global.neprasShowStatsDashboardModal = showStatsDashboardModal;
  global.showStatsDashboardModal = showStatsDashboardModal;

})(typeof window !== 'undefined' ? window : globalThis);
