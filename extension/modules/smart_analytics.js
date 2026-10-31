/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة التحليلات الإحصائية المتقدمة ومراجعة وتدقيق البيانات
 * NeprasSmartAnalytics — فحص البيانات، تحليل الأشقاء، والتقارير الإحصائية
 */
'use strict';

(function(global) {
  if (global.NeprasSmartAnalytics) return;

  /**
   * حساب مسافة ليفنشتاين (Levenshtein Distance) لقياس التقارب النصي
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  function levenshteinDistance(a, b) {
    if (!a) return (b || '').length;
    if (!b) return a.length;
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // حذف
          dp[i][j - 1] + 1,      // إضافة
          dp[i - 1][j - 1] + cost // استبدال
        );
      }
    }
    return dp[m][n];
  }

  /**
   * تطبيع النص للمقارنة الذكية (إزالة الهمزات وتوحيد التاء والياء والمسافات)
   * @param {string} str
   * @returns {string}
   */
  function normalizeArabicText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[\u064B-\u065F\u0670]/g, '') // التشكيل
      .replace(/[إأآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/عبد\s+/g, 'عبد')
      .replace(/ابو\s+/g, 'ابو')
      .replace(/الله\s+/g, 'الله')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * استخراج اسم الأب الثلاثي أو الكامل من اسم الطالب
   * @param {string} studentName
   * @returns {string}
   */
  function extractFatherName(studentName) {
    if (!studentName) return '';
    const parts = studentName.trim().split(/\s+/);
    if (parts.length <= 1) return '';
    return parts.slice(1).join(' ');
  }

  /**
   * مراجعة وتدقيق البيانات وكشف التناقضات
   * @param {Array<Object>} students قائمة بيانات الطلاب
   * @returns {Object} نتائج التدقيق والإحصاءات
   */
  function auditDataGuard(students) {
    const issues = [];
    const nationalIdMap = new Map();
    const phoneCountMap = new Map();
    let validNidCount = 0;
    let missingMotherNameCount = 0;
    let missingPhoneCount = 0;
    let missingAddressCount = 0;

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const rowNum = i + 2;
      const code = String(s.code || s.كود || s['كود الطالب'] || s['كود التلميذ'] || '').trim();
      const name = String(s.name || s.اسم || s['اسم الطالب'] || s['اسم التلميذ'] || '').trim();
      const rawNid = String(s.nationalId || s.nid || s['الرقم القومي'] || '').trim();
      const phone = String(s.phone || s.mobile || s['المحمول'] || s['الهاتف'] || '').trim();
      const motherName = String(s.motherName || s['اسم الام'] || s['اسم الأم'] || '').trim();
      const address = String(s.address || s['العنوان'] || '').trim();

      // تدقيق الرقم القومي
      if (rawNid && global.NeprasEgypt) {
        const cleanNid = global.NeprasEgypt.cleanDigits(rawNid);
        const parsed = global.NeprasEgypt.parseNationalId(cleanNid);
        if (parsed && (parsed.isValid || parsed.valid)) {
          validNidCount++;
          // فحص التكرار
          if (nationalIdMap.has(cleanNid)) {
            const first = nationalIdMap.get(cleanNid);
            issues.push({
              row: rowNum,
              code,
              name,
              type: 'تكرار الرقم القومي',
              detail: 'الرقم القومي مكرر مع الطالب: ' + first.name + ' (كود: ' + first.code + ')'
            });
          } else {
            nationalIdMap.set(cleanNid, { code, name, row: rowNum });
          }

          // فحص تناقض النوع إن وُجد
          const gender = String(s.gender || s['النوع'] || '').trim();
          if (gender) {
            const isMale = gender.includes('ذكر') || gender.includes('بنين');
            const isFemale = gender.includes('أنثى') || gender.includes('انثى') || gender.includes('بنات');
            if (isMale && parsed.gender === 'انثى') {
              issues.push({
                row: rowNum,
                code,
                name,
                type: 'تناقض النوع',
                detail: 'النوع المسجل (ذكر) يخالف الرقم القومي المسجل كأنثى'
              });
            } else if (isFemale && parsed.gender === 'ذكر') {
              issues.push({
                row: rowNum,
                code,
                name,
                type: 'تناقض النوع',
                detail: 'النوع المسجل (أنثى) يخالف الرقم القومي المسجل كذكر'
              });
            }
          }
        } else {
          issues.push({
            row: rowNum,
            code,
            name,
            type: 'رقم قومي غير صالح',
            detail: 'الرقم القومي غير مطابق للمواصفات الرسمية'
          });
        }
      }

      // إحصاء وتدقيق أرقام الهواتف
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length >= 7) {
          phoneCountMap.set(cleanPhone, (phoneCountMap.get(cleanPhone) || 0) + 1);
        }
      } else {
        missingPhoneCount++;
      }

      // فحص اسم الأم
      if (!motherName || motherName.length < 5) {
        missingMotherNameCount++;
      }

      // فحص العنوان
      if (!address || address.length < 3) {
        missingAddressCount++;
      }
    }

    // رصد الهواتف المتكررة لأكثر من 4 طلاب (مؤشر على رقم افتراضي أو وهمي)
    for (const [p, count] of phoneCountMap.entries()) {
      if (count > 4) {
        issues.push({
          row: 0,
          code: 'عام',
          name: 'متعدد',
          type: 'هاتف مكرر بكثرة',
          detail: 'رقم الهاتف (' + p + ') مكرر لدى ' + count + ' طلاب (قد يكون هاتف إدارة المدرسة أو رقم وهمي)'
        });
      }
    }

    const total = students.length || 1;
    return {
      totalStudents: students.length,
      validNidCount,
      validNidRate: Number(((validNidCount / total) * 100).toFixed(1)),
      missingMotherNameCount,
      missingPhoneCount,
      missingAddressCount,
      issuesCount: issues.length,
      issues
    };
  }

  /**
   * تحليل واكتشاف الأشقاء والإخوة مع مطابقة ليفنشتاين لأسماء الأمهات
   * @param {Array<Object>} students
   * @returns {Object} قائمة المجموعات الأسرية والإحصائيات
   */
  function analyzeSiblings(students) {
    const families = new Map(); // fatherNormalized -> list of students

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const fullName = String(s.name || s.اسم || s['اسم الطالب'] || s['اسم التلميذ'] || '').trim();
      let fatherName = String(s.fatherName || s['اسم الاب'] || s['اسم الأب'] || '').trim();
      if (!fatherName) {
        fatherName = extractFatherName(fullName);
      }
      if (!fatherName) continue;

      const normFather = normalizeArabicText(fatherName);
      if (normFather.split(/\s+/).length < 2) continue; // تخطي الأسماء الأحادية

      if (!families.has(normFather)) {
        families.set(normFather, []);
      }
      families.get(normFather).push({
        index: i,
        code: String(s.code || s.كود || s['كود الطالب'] || '').trim(),
        name: fullName,
        grade: String(s.grade || s.stage || s['الصف'] || s['الصف الدراسي'] || '').trim(),
        className: String(s.className || s['الفصل'] || '').trim(),
        motherName: String(s.motherName || s['اسم الام'] || s['اسم الأم'] || '').trim(),
        phone: String(s.phone || s.mobile || s['المحمول'] || s['الهاتف'] || '').trim()
      });
    }

    const siblingGroups = [];
    let fullSiblingsCount = 0;
    let fullSiblingsWithSpellingWarnCount = 0;
    let halfSiblingsCount = 0;

    for (const [father, members] of families.entries()) {
      if (members.length < 2) continue; // ليس أسرة بها أكثر من طالب

      // فحص أمهات أفراد الأسرة
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const m1 = members[i];
          const m2 = members[j];
          const mother1 = normalizeArabicText(m1.motherName);
          const mother2 = normalizeArabicText(m2.motherName);

          let relationship = 'إخوة من الأب';
          let hasSpellingNote = false;

          if (mother1 && mother2) {
            if (mother1 === mother2) {
              relationship = 'أشقاء (أب وأم)';
              fullSiblingsCount++;
            } else {
              const dist = levenshteinDistance(mother1, mother2);
              if (dist <= 2) {
                relationship = 'أشقاء (مع ملاحظة إملائية في اسم الأم)';
                hasSpellingNote = true;
                fullSiblingsWithSpellingWarnCount++;
              } else {
                halfSiblingsCount++;
              }
            }
          } else {
            halfSiblingsCount++;
          }

          siblingGroups.push({
            fatherName: father,
            student1: m1,
            student2: m2,
            relationship,
            hasSpellingNote
          });
        }
      }
    }

    return {
      groupsCount: siblingGroups.length,
      fullSiblingsCount,
      fullSiblingsWithSpellingWarnCount,
      halfSiblingsCount,
      groups: siblingGroups
    };
  }

  /**
   * إحصائية الفئات العمرية في 1 أكتوبر
   * @param {Array<Object>} students
   * @returns {Object} توزيع الطلاب حسب فئات السن
   */
  // النوع: النص الصريح أولًا ثم الرقم القومي. يرجع 'ذكر' | 'أنثى' | null (غير مسجّل، بلا افتراض).
  function resolveGender(s) {
    const g = String((s && (s.gender || s['النوع'])) || '').trim();
    if (/أنثى|انثى|بنات|^female$/i.test(g)) return 'أنثى';
    if (/ذكر|بنين|^male$/i.test(g)) return 'ذكر';
    const nid = (s && (s.nationalId || s.nid || s['الرقم القومي'])) || '';
    if (nid && global.NeprasEgypt?.parseNationalId) {
      const parsed = global.NeprasEgypt.parseNationalId(global.NeprasEgypt.cleanDigits ? global.NeprasEgypt.cleanDigits(String(nid)) : nid);
      if (parsed && (parsed.gender === 'ذكر' || parsed.gender === 'أنثى')) return parsed.gender;
    }
    return null;
  }

  function calculateAgeBrackets(students) {
    const brackets = {
      'أقل من 6 سنوات': { boys: 0, girls: 0, total: 0 },
      '6 سنوات': { boys: 0, girls: 0, total: 0 },
      '7 سنوات': { boys: 0, girls: 0, total: 0 },
      '8 سنوات': { boys: 0, girls: 0, total: 0 },
      '9 سنوات': { boys: 0, girls: 0, total: 0 },
      '10 سنوات فأكثر': { boys: 0, girls: 0, total: 0 }
    };

    for (const s of students) {
      let years = null; // null = السن غير معروف (لا يُحسب «أقل من 6»)
      const rawNid = String(s.nationalId || s.nid || s['الرقم القومي'] || '').trim();
      if (rawNid && global.NeprasEgypt) {
        const cleanNid = global.NeprasEgypt.cleanDigits(rawNid);
        const parsed = global.NeprasEgypt.parseNationalId(cleanNid);
        if (parsed && parsed.birthDateFormatted) {
          const age = global.NeprasEgypt.ageOnOct1(parsed.birthDateFormatted);
          if (age && Number.isFinite(age.years) && age.years >= 0 && age.years < 40) years = age.years;
        }
      }
      if (years == null && (s.ageYears || s['السن_سنة'])) {
        const y = parseInt(s.ageYears || s['السن_سنة'], 10);
        if (Number.isFinite(y) && y >= 0 && y < 40) years = y;
      }

      const gender = String(s.gender || s['النوع'] || '').trim();
      const isFemale = gender.includes('أنثى') || gender.includes('انثى') || gender.includes('بنات');

      let targetKey = '10 سنوات فأكثر';
      if (years == null) {
        if (!brackets['سن غير محدد']) brackets['سن غير محدد'] = { boys: 0, girls: 0, total: 0 };
        targetKey = 'سن غير محدد';
      } else if (years < 6) targetKey = 'أقل من 6 سنوات';
      else if (years === 6) targetKey = '6 سنوات';
      else if (years === 7) targetKey = '7 سنوات';
      else if (years === 8) targetKey = '8 سنوات';
      else if (years === 9) targetKey = '9 سنوات';

      brackets[targetKey].total++;
      if (isFemale) brackets[targetKey].girls++;
      else brackets[targetKey].boys++;
    }

    return brackets;
  }

  /**
   * صفوف «بيانات للتحليل»: جدول مسطّح (صف لكل طالب) صالح للجداول المحورية في Excel.
   * لا يحوي الاسم ولا الرقم القومي عمدًا (يكفي كود الطالب للرجوع إلى السجل).
   * القيم غير المسجلة تظهر «غير مسجّل» أو خلية فارغة؛ لا افتراضات (لا «ذكر» ولا «مسلم» بالتخمين).
   */
  function buildAnalysisDataRows(students) {
    const E = global.NeprasEgypt;
    const UNK = 'غير مسجّل';
    const bracketOf = (years) => {
      if (years == null) return 'غير محدد';
      if (years < 6) return 'أقل من 6 سنوات';
      if (years >= 10) return '10 سنوات فأكثر';
      return years + ' سنوات';
    };
    return (students || []).map((s, i) => {
      const grade = String(s.grade || s.stage || s['الصف'] || s['الصف الدراسي'] || '').trim() || UNK;
      const cls = String(s.className || s['الفصل'] || '').trim() || UNK;
      let parsed = null;
      const rawNid = String(s.nationalId || s.nid || s['الرقم القومي'] || '').trim();
      if (rawNid && E) parsed = E.parseNationalId(E.cleanDigits(rawNid));

      let gender = String(s.gender || s['النوع'] || '').trim();
      if (/أنثى|انثى|بنات/.test(gender)) gender = 'أنثى';
      else if (/ذكر|بنين|^male$/i.test(gender)) gender = 'ذكر';
      else gender = (parsed && parsed.gender) || UNK;

      let years = null;
      if (parsed && parsed.birthDateFormatted && E) {
        const age = E.ageOnOct1(parsed.birthDateFormatted);
        if (age && Number.isFinite(age.years) && age.years >= 0 && age.years < 40) years = age.years;
      }
      if (years == null && (s.ageYears || s['السن_سنة'])) {
        const y = parseInt(s.ageYears || s['السن_سنة'], 10);
        if (Number.isFinite(y) && y >= 0 && y < 40) years = y;
      }

      const status = String(s.status || s['حالة القيد'] || '').trim() || UNK;
      const mode = String(s.mode || s.study_type || '').trim();
      const integrated = String(s.integrated || '').trim();
      return [
        i + 1,
        String(s.code || s.studentCode || s['كود الطالب'] || '').trim(),
        grade,
        cls,
        gender,
        E ? E.resolveReligion(s) : UNK,
        status,
        mode,
        integrated,
        String(s.integrationType || '').trim(),
        years == null ? '' : years,
        bracketOf(years),
        parsed ? parsed.governorate : UNK,
        parsed ? parsed.year : ''
      ];
    });
  }

  /**
   * إحصائية كثافة الفصول ومؤشرات السعة
   * @param {Array<Object>} students
   * @returns {Array<Object>} كثافة كل صف وفصل
   */
  function calculateClassDensities(students) {
    const classMap = new Map();

    for (const s of students) {
      const grade = String(s.grade || s.stage || s['الصف'] || s['الصف الدراسي'] || 'غير محدد').trim();
      const cls = String(s.className || s['الفصل'] || 'بدون فصل').trim();
      const key = grade + ' — ' + cls;

      if (!classMap.has(key)) {
        classMap.set(key, { grade, className: cls, boys: 0, girls: 0, unknown: 0, total: 0 });
      }
      const item = classMap.get(key);
      item.total++;
      const gnd = resolveGender(s);
      if (gnd === 'أنثى') item.girls++;
      else if (gnd === 'ذكر') item.boys++;
      else item.unknown++;
    }

    const result = [];
    for (const item of classMap.values()) {
      let status = 'طبيعي';
      if (item.total < 30) status = 'منخفض';
      else if (item.total > 50) status = 'مرتفع جدا';
      result.push({
        ...item,
        status
      });
    }

    result.sort((a, b) => b.total - a.total);
    return result;
  }

  /**
   * إحصائية الديانة (مسلم / مسيحي)
   * معتمدة على الاستنتاج الذكي للهوية المصرية عند خلو البيانات الصريحة
   * @param {Array<Object>} students
   * @returns {Object}
   */
  function calculateReligionStats(students) {
    let muslim = 0;
    let christian = 0;
    let other = 0;
    let unregistered = 0;

    for (const s of (students || [])) {
      const rel = globalThis.NeprasEgypt?.resolveReligion
        ? globalThis.NeprasEgypt.resolveReligion(s)
        : String(s.religion || s['الديانة'] || '').trim();

      if (/مسيح/i.test(rel)) {
        christian++;
      } else if (/مسلم/i.test(rel)) {
        muslim++;
      } else if (/أخرى|اخرى|other/i.test(rel)) {
        other++;
      } else {
        unregistered++;
      }
    }

    return {
      muslim,
      christian,
      other,
      unregistered,
      total: (students || []).length
    };
  }

  /**
   * بناء مصفوفة الإحصاء الاستقراري العام المعتمد لصفوف المدرسة (النموذج الوزاري المعتمد)
   * @param {Array<Object>} students
   * @returns {Object} { rows: Array, totals: Object }
   */
  function buildOfficialSchoolStatsMatrix(students) {
    const gradeOrder = [
      'رياض أطفال 1', 'رياض أطفال 2', 'KG1', 'KG2',
      'الصف الأول الابتدائي', 'الصف الثاني الابتدائي', 'الصف الثالث الابتدائي', 'الصف الرابع الابتدائي', 'الصف الخامس الابتدائي', 'الصف السادس الابتدائي',
      'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي',
      'الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي'
    ];

    const gradeMap = new Map();

    for (const s of students) {
      const rawGrade = String(s.grade || s.stage || s['الصف'] || s['الصف الدراسي'] || 'الصف الدراسي العام').trim();
      const rawClass = String(s.className || s['الفصل'] || '1').trim();
      const gnd = resolveGender(s);
      const isMale = gnd === 'ذكر';
      const isFemale = gnd === 'أنثى';
      const rel = globalThis.NeprasEgypt?.resolveReligion
        ? globalThis.NeprasEgypt.resolveReligion(s)
        : String(s.religion || s['الديانة'] || '').trim();
      const isChristian = /مسيح/i.test(rel);
      const isMuslim = /مسلم/i.test(rel);
      const status = String(s.status || s['حالة القيد'] || s.study_type || '').trim();
      const isDamg = /دمج/i.test(status) || /دمج/i.test(s.damgType || '') || s.isDamg === true;
      const isManazel = /منازل/i.test(status) || s.is_manazel === true || s.isManazel === true;

      if (!gradeMap.has(rawGrade)) {
        gradeMap.set(rawGrade, {
          grade: rawGrade,
          classes: new Set(),
          boys: 0,
          girls: 0,
          total: 0,
          muslimBoys: 0,
          muslimGirls: 0,
          muslimTotal: 0,
          christianBoys: 0,
          christianGirls: 0,
          christianTotal: 0,
          damg: 0,
          manazel: 0,
          unknownGender: 0,
          otherReligion: 0
        });
      }

      const gItem = gradeMap.get(rawGrade);
      gItem.classes.add(rawClass);
      gItem.total++;
      if (isMale) {
        gItem.boys++;
        if (isMuslim) gItem.muslimBoys++;
        else if (isChristian) gItem.christianBoys++;
      } else if (isFemale) {
        gItem.girls++;
        if (isMuslim) gItem.muslimGirls++;
        else if (isChristian) gItem.christianGirls++;
      } else {
        gItem.unknownGender++;   // لا يُنسب لبنين ولا بنات بالافتراض
      }
      if (isMuslim) gItem.muslimTotal++;
      else if (isChristian) gItem.christianTotal++;
      else gItem.otherReligion++;

      if (isDamg) gItem.damg++;
      if (isManazel) gItem.manazel++;
    }

    // ترتيب الصفوف ترتيباً تربوياً منطقياً
    const sortedGrades = Array.from(gradeMap.values()).sort((a, b) => {
      let idxA = gradeOrder.findIndex((o) => a.grade.includes(o) || o.includes(a.grade));
      let idxB = gradeOrder.findIndex((o) => b.grade.includes(o) || o.includes(b.grade));
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });

    const totals = {
      classesCount: 0,
      boys: 0,
      girls: 0,
      total: 0,
      muslimBoys: 0,
      muslimGirls: 0,
      muslimTotal: 0,
      christianBoys: 0,
      christianGirls: 0,
      christianTotal: 0,
      damg: 0,
      manazel: 0,
      unknownGender: 0,
      otherReligion: 0,
      avgDensity: '0'
    };

    const matrixRows = sortedGrades.map((g, idx) => {
      const clsCount = g.classes.size || 1;
      const avg = (g.total / clsCount).toFixed(1);

      totals.classesCount += clsCount;
      totals.boys += g.boys;
      totals.girls += g.girls;
      totals.total += g.total;
      totals.muslimBoys += g.muslimBoys;
      totals.muslimGirls += g.muslimGirls;
      totals.muslimTotal += g.muslimTotal;
      totals.christianBoys += g.christianBoys;
      totals.christianGirls += g.christianGirls;
      totals.christianTotal += g.christianTotal;
      totals.damg += g.damg;
      totals.manazel += g.manazel;
      totals.unknownGender += g.unknownGender;
      totals.otherReligion += g.otherReligion;

      return [
        idx + 1,
        g.grade,
        clsCount,
        g.boys,
        g.girls,
        g.total,
        g.muslimBoys,
        g.muslimGirls,
        g.muslimTotal,
        g.christianBoys,
        g.christianGirls,
        g.christianTotal,
        g.damg,
        g.manazel,
        avg
      ];
    });

    totals.avgDensity = (totals.total / Math.max(1, totals.classesCount)).toFixed(1);

    return {
      grades: sortedGrades,
      matrixRows,
      totals
    };
  }

  /**
   * بناء بطاقة المؤشرات الإحصائية العامة للمدرسة (Executive KPI Summary)
   * @param {Array<Object>} students
   * @param {Object} statsMatrix
   * @param {Object} guardReport
   * @param {Object} siblingsReport
   * @returns {Array<Array<any>>}
   */
  function buildExecutiveKpis(students, statsMatrix, guardReport, siblingsReport) {
    const total = students.length || 1;
    const t = statsMatrix.totals;
    const g = guardReport || { validNidRate: 100, missingMotherNameCount: 0, missingPhoneCount: 0 };
    const sib = siblingsReport || { groupsCount: 0, fullSiblingsCount: 0 };

    const boysPct = ((t.boys / total) * 100).toFixed(1) + ' %';
    const girlsPct = ((t.girls / total) * 100).toFixed(1) + ' %';
    const muslimPct = ((t.muslimTotal / total) * 100).toFixed(1) + ' %';
    const christPct = ((t.christianTotal / total) * 100).toFixed(1) + ' %';
    const damgPct = ((t.damg / total) * 100).toFixed(1) + ' %';
    const manazelPct = ((t.manazel / total) * 100).toFixed(1) + ' %';

    const rows = [
      [1, 'إجمالي عدد الطلاب المقيدين بالمدرسة', total, '100 %', 'القوة الإجمالية للمدرسة'],
      [2, 'إجمالي الطلاب البنين (ذكور)', t.boys, boysPct, 'نسبة البنين من إجمالي المقيدين'],
      [3, 'إجمالي الطالبات البنات (إناث)', t.girls, girlsPct, 'نسبة البنات من إجمالي المقيدين'],
      [4, 'إجمالي الفصول الدراسية المعتمدة', t.classesCount, '—', 'عدد الفصول النشطة بجميع المراحل'],
      [5, 'متوسط الكثافة العامة للمدرسة', t.avgDensity + ' طالب/فصل', '—', Number(t.avgDensity) > 50 ? 'كثافة مرتفعة' : 'كثافة مناسبة ومتزنة'],
      [6, 'إجمالي الطلاب المسلمين', t.muslimTotal, muslimPct, 'التوزيع الديني للطلاب'],
      [7, 'إجمالي الطلاب المسيحيين', t.christianTotal, christPct, 'التوزيع الديني للطلاب'],
      [8, 'إجمالي طلاب الدمج والتربية الخاصة', t.damg, damgPct, 'مشمولون برعاية التربية الخاصة والتأمين'],
      [9, 'إجمالي طلاب نظام المنازل', t.manazel, manazelPct, 'طلاب الامتحانات الخارجية والمنازل'],
      [10, 'عدد روابط الأسر والإخوة بالمدرسة', sib.groupsCount, '—', `منهم ${sib.fullSiblingsCount} أشقاء من نفس الأب والأم`],
      [11, 'معدل دقة وصحة الأرقام القومية', g.validNidCount || total, (g.validNidRate || 100) + ' %', 'مؤشر جودة وتدقيق البيانات'],
      [12, 'الطلاب المسجل لهم رقم محمول', total - (g.missingPhoneCount || 0), (((total - (g.missingPhoneCount || 0)) / total) * 100).toFixed(1) + ' %', 'جاهزية التواصل مع أولياء الأمور'],
      [13, 'الطلاب المسجل لهم اسم الأم', total - (g.missingMotherNameCount || 0), (((total - (g.missingMotherNameCount || 0)) / total) * 100).toFixed(1) + ' %', 'اكتمال بيانات السجل المدني']
    ];
    // مؤشرات اكتمال تظهر فقط عند وجود نقص (لا تُخفى الفجوة داخل الإجماليات)
    if (t.unknownGender > 0) {
      rows.push([rows.length + 1, 'طلاب بلا نوع مسجّل', t.unknownGender, ((t.unknownGender / total) * 100).toFixed(1) + ' %', 'غير محتسبين ضمن البنين أو البنات: راجع بياناتهم']);
    }
    if (t.otherReligion > 0) {
      rows.push([rows.length + 1, 'طلاب بديانة أخرى أو غير مسجّلة', t.otherReligion, ((t.otherReligion / total) * 100).toFixed(1) + ' %', 'غير محتسبين ضمن المسلمين أو المسيحيين']);
    }
    return rows;
  }

  /**
   * بناء مواصفات أوراق العمل المتكاملة لكتاب التحليلات الشاملة لإنشائه بمحرك نبراس OpenXML المعتمد
   * @param {Array<Object>} students
   * @param {Object} schoolContext
   * @returns {Array<Object>} sheetSpecs
   */
  function buildComprehensiveAnalyticsSheetSpecs(students, schoolContext) {
    const ctx = schoolContext || {};
    const school = ctx.school || ctx.schoolName || 'المدرسة';
    const gov = ctx.governorate || '....................';
    const edara = ctx.administration || ctx.edara || '....................';
    const year = ctx.academicYear || (global.NeprasEgypt ? global.NeprasEgypt.academicYearLabel() : '2026 / 2027 م');

    const commonInfoLines = [
      `محافظة: ${gov}`,
      `إدارة: ${edara}`,
      `مدرسة: ${school}`,
      `للعام الدراسي: ${year} — توثيق: نبراس برو 2026`
    ];

    const matrixData = buildOfficialSchoolStatsMatrix(students);
    const guardReport = auditDataGuard(students);
    const siblingsReport = analyzeSiblings(students);
    const densities = calculateClassDensities(students);
    const ageBrackets = calculateAgeBrackets(students);
    const kpiRows = buildExecutiveKpis(students, matrixData, guardReport, siblingsReport);

    // 1. ورقة الإحصاء الاستقراري العام للمدرسة
    const matrixHeaders = [
      'م', 'الصف الدراسي', 'عدد الفصول',
      'بنين مقيد', 'بنات مقيد', 'جملة المقيد',
      'بنين مسلم', 'بنات مسلم', 'جملة مسلم',
      'بنين مسيحي', 'بنات مسيحي', 'جملة مسيحي',
      'طلاب الدمج', 'طلاب المنازل', 'متوسط كثافة الصف'
    ];
    const finalMatrixRows = [...matrixData.matrixRows];
    finalMatrixRows.push([
      '∑',
      'الإجمالي العام للمدرسة',
      matrixData.totals.classesCount,
      matrixData.totals.boys,
      matrixData.totals.girls,
      matrixData.totals.total,
      matrixData.totals.muslimBoys,
      matrixData.totals.muslimGirls,
      matrixData.totals.muslimTotal,
      matrixData.totals.christianBoys,
      matrixData.totals.christianGirls,
      matrixData.totals.christianTotal,
      matrixData.totals.damg,
      matrixData.totals.manazel,
      matrixData.totals.avgDensity
    ]);

    // أعمدة اكتمال تُضاف فقط عند وجود نقص في النوع أو الديانة، فيبقى النموذج الرسمي كما هو للبيانات المكتملة
    if (matrixData.totals.unknownGender > 0 || matrixData.totals.otherReligion > 0) {
      matrixHeaders.push('نوع غير مسجّل', 'ديانة أخرى/غير مسجّلة');
      matrixData.grades.forEach((g, i) => { finalMatrixRows[i].push(g.unknownGender, g.otherReligion); });
      finalMatrixRows[finalMatrixRows.length - 1].push(matrixData.totals.unknownGender, matrixData.totals.otherReligion);
    }

    const sheet1 = {
      name: 'الإحصاء_العام_للمدرسة',
      title: `الإحصاء الاستقراري العام لطلاب المدرسة (توزيع النوع والديانات والكثافات) — ${school}`,
      infoLines: commonInfoLines,
      headers: matrixHeaders,
      rows: finalMatrixRows,
      recordCount: students.length,
      countLabel: 'إجمالي المقيدين بالمدرسة',
      rightAlignCols: [1],
      printFit: true
    };

    // 2. ورقة لوحة المؤشرات الإحصائية العامة
    const kpiHeaders = ['م', 'المؤشر الإحصائي ومحور القياس', 'العدد / القيمة المسجلة', 'النسبة المئوية %', 'البيان والتقييم الإداري المعتمد'];
    const sheet2 = {
      name: 'لوحة_المؤشرات_العامة',
      title: `بطاقة المؤشرات الإحصائية العامة ولوحة القيادة التنفيذية — ${school}`,
      infoLines: commonInfoLines,
      headers: kpiHeaders,
      rows: kpiRows,
      recordCount: kpiRows.length,
      countLabel: 'عدد المؤشرات المقاسة',
      rightAlignCols: [1, 4],
      printFit: true
    };

    // 3. ورقة كثافة فصول المدرسة التفصيلية
    const densityHeaders = ['م', 'الصف الدراسي', 'الفصل', 'بنين', 'بنات', 'إجمالي الفصل', 'نسبة البنين %', 'نسبة البنات %', 'تصنيف الكثافة', 'مستوى التوازن'];
    const hasUnknownGender = densities.some((d) => d.unknown > 0);
    if (hasUnknownGender) densityHeaders.push('نوع غير مسجّل');
    const densityRows = densities.map((d, i) => {
      const bPct = d.total ? ((d.boys / d.total) * 100).toFixed(1) + ' %' : '0 %';
      const gPct = d.total ? ((d.girls / d.total) * 100).toFixed(1) + ' %' : '0 %';
      let balance = 'متوازن';
      if (Math.abs(d.boys - d.girls) > 15) balance = 'تفاوت عددي ملحوظ';
      const row = [i + 1, d.grade, d.className, d.boys, d.girls, d.total, bPct, gPct, d.status, balance];
      if (hasUnknownGender) row.push(d.unknown);
      return row;
    });
    const sheet3 = {
      name: 'كثافة_فصول_المدرسة',
      title: `تقرير كثافات فصول المدرسة ومؤشرات السعة الاستيعابية والتوازن العددي — ${school}`,
      infoLines: commonInfoLines,
      headers: densityHeaders,
      rows: densityRows,
      recordCount: densities.length,
      countLabel: 'إجمالي الفصول المعتمدة',
      rightAlignCols: [1, 2],
      printFit: true
    };

    // 4. ورقة الفئات العمرية والسن في 1 أكتوبر
    const ageHeaders = ['م', 'الفئة العمرية (السن في 1 أكتوبر)', 'بنين', 'بنات', 'الإجمالي العام', 'النسبة المئوية من المدرسة %', 'التصنيف والتقييم'];
    const ageRows = Object.entries(ageBrackets).map(([bracketName, bCounts], i) => {
      const bPct = ((bCounts.total / (students.length || 1)) * 100).toFixed(1) + ' %';
      let note = 'ضمن السن المعتاد';
      if (bracketName.includes('غير محدد')) note = 'السن غير مسجّل: راجع الرقم القومي أو تاريخ الميلاد';
      else if (bracketName.includes('أقل من 6')) note = 'صغار سن (مرحلة أولى أو KG)';
      else if (bracketName.includes('10')) note = 'فئات السن المتقدمة';
      return [i + 1, bracketName, bCounts.boys, bCounts.girls, bCounts.total, bPct, note];
    });
    const sheet4 = {
      name: 'الفئات_العمرية_1أكتوبر',
      title: `إحصائية الفئات العمرية والسن في أول أكتوبر لطلاب المدرسة — ${school}`,
      infoLines: commonInfoLines,
      headers: ageHeaders,
      rows: ageRows,
      recordCount: ageRows.length,
      countLabel: 'عدد الفئات العمرية',
      rightAlignCols: [1],
      printFit: true
    };

    // 5. ورقة تدقيق وسلامة البيانات (Data Guard)
    const guardHeaders = ['م', 'كود الطالب', 'اسم الطالب', 'نوع الملاحظة المكتشفة', 'تفاصيل المشكلة والتشخيص', 'الإجراء الإداري المقترح'];
    const guardRows = guardReport.issues.map((iss, i) => {
      let action = 'مراجعة شهادة الميلاد أو استمارة القيد';
      if (iss.type.includes('مكرر')) action = 'حذف السجل المكرر أو تصحيح الرقم';
      else if (iss.type.includes('تناقض')) action = 'تعديل النوع في استمارة الطالب بالموقع';
      else if (iss.type.includes('هاتف')) action = 'تحديث رقم هاتف ولي الأمر الحقيقي';
      return [i + 1, iss.code || '', iss.name || '', iss.type || '', iss.detail || '', action];
    });
    if (!guardRows.length) {
      guardRows.push([1, '—', 'جميع الطلاب', 'بيانات سليمة 100%', 'لم يتم اكتشاف أي تناقضات أو أخطاء برمجية في بيانات الطلاب', 'اعتماد السجلات']);
    }
    const sheet5 = {
      name: 'تدقيق_وسلامة_البيانات',
      title: `تقرير تدقيق وسلامة البيانات المدرسية واكتشاف التناقضات (نبراس داتا جارد) — ${school}`,
      infoLines: commonInfoLines,
      headers: guardHeaders,
      rows: guardRows,
      recordCount: guardReport.issuesCount,
      countLabel: 'إجمالي الملاحظات المرصودة',
      rightAlignCols: [2, 3, 4, 5],
      printFit: true
    };

    // 6. ورقة حصر الأشقاء والإخوة بالمدرسة
    const sibHeaders = ['م', 'اسم الأب المشترك', 'اسم الطالب الأول', 'الصف / الفصل (1)', 'اسم الطالب الثاني', 'الصف / الفصل (2)', 'صلة القرابة', 'ملاحظات المطابقة'];
    const sibRows = siblingsReport.groups.map((g, i) => [
      i + 1,
      g.fatherName,
      g.student1.name,
      `${g.student1.grade} / ${g.student1.className}`,
      g.student2.name,
      `${g.student2.grade} / ${g.student2.className}`,
      g.relationship,
      g.hasSpellingNote ? 'يوجد تباين طفيف في حروف اسم الأم' : 'مطابقة تامة'
    ]);
    if (!sibRows.length) {
      sibRows.push([1, '—', 'لا توجد أسر متعددة', '—', '—', '—', '—', 'لم يتم رصد طلاب أشقاء']);
    }
    const sheet6 = {
      name: 'حصر_الأشقاء_والأسر',
      title: `سجل حصر الإخوة والأشقاء والتقارب الأسري لطلاب المدرسة — ${school}`,
      infoLines: commonInfoLines,
      headers: sibHeaders,
      rows: sibRows,
      recordCount: siblingsReport.groupsCount,
      countLabel: 'إجمالي العلاقات الأسرية',
      rightAlignCols: [1, 2, 4],
      printFit: true
    };

    // 7. بيانات خام مسطّحة للتحليل (Insert ← PivotTable في Excel)
    const dataRows = buildAnalysisDataRows(students);
    const sheet7 = {
      name: 'بيانات_للتحليل',
      title: `بيانات الطلاب المسطّحة للتحليل والجداول المحورية — ${school}`,
      infoLines: [...commonInfoLines, 'للتحليل: حدّد أي خلية في الجدول ← إدراج ← PivotTable. لا تحوي الورقة أسماء أو أرقامًا قومية.'],
      headers: ['م', 'كود الطالب', 'الصف الدراسي', 'الفصل', 'النوع', 'الديانة', 'حالة القيد', 'نمط الدراسة', 'الدمج', 'نوع الدمج', 'السن في 1 أكتوبر', 'الفئة العمرية', 'محافظة الميلاد', 'سنة الميلاد'],
      rows: dataRows,
      recordCount: dataRows.length,
      countLabel: 'إجمالي الطلاب بالورقة',
      rightAlignCols: [2, 3],
      numericCols: [0, 10, 13],   // م، السن، سنة الميلاد: أرقام حقيقية
      printFit: false
    };

    return [sheet1, sheet2, sheet3, sheet4, sheet5, sheet6, sheet7];
  }

  // تصدير الكائن العام للوحدة
  global.NeprasSmartAnalytics = Object.freeze({
    levenshteinDistance,
    normalizeArabicText,
    extractFatherName,
    auditDataGuard,
    analyzeSiblings,
    resolveGender,
    calculateAgeBrackets,
    calculateClassDensities,
    calculateReligionStats,
    buildOfficialSchoolStatsMatrix,
    buildExecutiveKpis,
    buildAnalysisDataRows,
    buildComprehensiveAnalyticsSheetSpecs
  });

})(typeof window !== 'undefined' ? window : globalThis);
