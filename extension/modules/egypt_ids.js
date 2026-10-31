/**
 * Nepras — مصدر واحد لبيانات الهوية المصرية: الأرقام، المحافظات، الرقم القومي، والسن في 1 أكتوبر.
 *
 * كانت هذه الدوال منسوخة في وحدة السجلات والكشوف والنافذة المنبثقة وexport.js (وبنسخ مختلفة السلوك)؛
 * صارت هنا فقط. يُحقن قبل كل الوحدات التي تستعمله، وتحمّله popup.html قبل popup.js.
 *
 * استثناء مقصود: background.js فيه نسخة من فحص الرقم القومي داخل دالة تُحقن في الصفحة (executeScript func)،
 * ولا تستطيع استدعاء غيرها، فتبقى هناك مع تعليق يشير إلى هذا الملف.
 */
(function () {
  'use strict';
  if (globalThis.NeprasEgypt) return;

  // رمز المحافظة (الخانتان 8 و9 من الرقم القومي) → الاسم
  const GOVERNORATES = Object.freeze({
    '01': 'القاهرة', '02': 'الإسكندرية', '03': 'بورسعيد', '04': 'السويس',
    '11': 'دمياط', '12': 'الدقهلية', '13': 'الشرقية', '14': 'القليوبية',
    '15': 'كفر الشيخ', '16': 'الغربية', '17': 'المنوفية', '18': 'البحيرة',
    '19': 'الإسماعيلية', '21': 'الجيزة', '22': 'بني سويف', '23': 'الفيوم',
    '24': 'المنيا', '25': 'أسيوط', '26': 'سوهاج', '27': 'قنا',
    '28': 'أسوان', '29': 'الأقصر', '31': 'البحر الأحمر', '32': 'الوادي الجديد',
    '33': 'مطروح', '34': 'شمال سيناء', '35': 'جنوب سيناء', '88': 'خارج الجمهورية'
  });

  // الأرقام الهندية (٠-٩) والفارسية (۰-۹) → لاتينية. ما عداها يبقى كما هو.
  function toLatinDigits(value) {
    return String(value ?? '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  }

  // أرقام لاتينية فقط (يحذف كل ما ليس رقمًا بعد التحويل). null/undefined ← ''.
  function cleanDigits(value) {
    if (value == null) return '';
    return toLatinDigits(value).replace(/\D/g, '').trim();
  }

  // تحليل الرقم القومي. يعيد null إن لم يكن صالحًا: 14 رقمًا، يبدأ بـ 2 أو 3، وتاريخ ميلاد حقيقي (لا 31 فبراير).
  function parseNationalId(idStr) {
    const cleanId = cleanDigits(idStr);
    if (!/^[23]\d{13}$/.test(cleanId)) return null;

    const centuryCode = parseInt(cleanId[0], 10);
    const yearPrefix = centuryCode === 2 ? '19' : '20';
    const year = parseInt(yearPrefix + cleanId.substring(1, 3), 10);
    const month = parseInt(cleanId.substring(3, 5), 10);
    const day = parseInt(cleanId.substring(5, 7), 10);

    const now = new Date();
    const currentYear = now.getFullYear();
    if (year > currentYear) return null;

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const birthDate = new Date(year, month - 1, day);
    if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) {
      return null;
    }
    if (birthDate.getTime() > now.getTime()) return null;

    const govCode = cleanId.substring(7, 9);
    if (!GOVERNORATES[govCode]) return null;
    const governorate = GOVERNORATES[govCode];
    const genderDigit = parseInt(cleanId[12], 10);
    const gender = genderDigit % 2 !== 0 ? 'ذكر' : 'أنثى';

    return {
      isValid: true,
      nationalId: cleanId,
      year,
      month,
      day,
      birthDate,
      birthDateStr: `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
      birthDateFormatted: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      governorate,
      gender
    };
  }

  function isValidNationalId(value) {
    return parseNationalId(value) !== null;
  }

  // السن في 1 أكتوبر من سنة targetYear (الافتراضي: السنة الميلادية الحالية).
  // birthDateInput: كائن Date أو نص yyyy-mm-dd أو dd/mm/yyyy أو yyyy/mm/dd. يعيد null إن تعذّر.
  function ageOnOct1(birthDateInput, targetYear = new Date().getFullYear()) {
    if (!birthDateInput) return null;
    let bDate = birthDateInput;
    if (typeof birthDateInput === 'string') {
      const parts = birthDateInput.trim().split(/[-/]/);
      if (parts.length === 3) {
        let y, m, d;
        if (parts[0].length === 4 || parseInt(parts[0], 10) > 1900) {
          // yyyy-mm-dd or yyyy/mm/dd
          y = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10);
          d = parseInt(parts[2], 10);
        } else if (parts[2].length === 4 || parseInt(parts[2], 10) > 1900) {
          // dd/mm/yyyy or dd-mm-yyyy (الصيغة المصرية الشائعة)
          d = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10);
          y = parseInt(parts[2], 10);
        } else {
          y = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10);
          d = parseInt(parts[2], 10);
        }
        bDate = new Date(y, m - 1, d);
        if (bDate.getFullYear() !== y || bDate.getMonth() !== m - 1 || bDate.getDate() !== d) {
          return null;
        }
      } else {
        bDate = new Date(birthDateInput);
      }
    }
    if (!(bDate instanceof Date) || isNaN(bDate.getTime())) return null;

    const targetDate = new Date(targetYear, 9, 1); // 1 أكتوبر
    let years = targetDate.getFullYear() - bDate.getFullYear();
    let months = targetDate.getMonth() - bDate.getMonth();
    let days = targetDate.getDate() - bDate.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    return { years, months, days, text: `${years} سنة و ${months} شهر و ${days} يوم` };
  }

  // ── سنة 1 أكتوبر: قاعدتان فقط، مسمّاتان صراحةً (قرار 1.2.83؛ كانت ثلاث قواعد متضاربة).
  //
  // 1) السجلات العادية (أنيميا، سلوك، منازل، سجلات القيد، فاحص الرقم القومي): العام الدراسي يبدأ في أغسطس،
  //    وسنة 1 أكتوبر هي سنة بداية العام. فمن أغسطس 2026 إلى يوليو 2027 المقصود 1 أكتوبر 2026.
  function academicYearStart(now = new Date()) {
    return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  }

  // «2026 / 2027» لترويسات الكشوف. المصدر الوحيد لبداية العام (أغسطس).
  function academicYearLabel(now = new Date()) {
    const start = academicYearStart(now);
    return `${start} / ${start + 1}`;
  }

  // 2) كشف 41 مستجدين: يُعدّ غالبًا قبل بداية العام (يناير–يوليو) فالمقصود 1 أكتوبر القادم من السنة الميلادية الحالية،
  //    وبعد بدايته يبقى 1 أكتوبر هذا العام. أي: السنة الميلادية الحالية دائمًا.
  function newcomersOct1Year(now = new Date()) {
    return now.getFullYear();
  }

  // تاريخ اليوم بالتوقيت المحلي yyyy-mm-dd لأسماء الملفات.
  // لا نستعمل toISOString() لأنه يعطي تاريخ UTC: في مصر (UTC+2/+3) يخرج الملف بتاريخ الأمس بين 00:00 و03:00.
  function todayStamp(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // استرجاع وتحديد ديانة الطالب اعتماداً حصرياً على البيانات الرسمية المسجلة (دون أي تخمين من الأسماء)
  function resolveReligionFromName(_name) {
    // إحصاء صارم ومعتمد: لا يتم التخمين من الأسماء إطلاقاً
    return 'غير مسجّل';
  }

  function resolveReligion(row) {
    if (!row) return 'غير مسجّل';
    if (typeof row === 'string') {
      const s = row.trim();
      if (/مسيح|christian/i.test(s)) return 'مسيحي';
      if (/مسلم|islam|muslim/i.test(s)) return 'مسلم';
      if (/أخرى|اخرى|other/i.test(s)) return 'أخرى';
      return 'غير مسجّل';
    }

    // 1. فحص الحقول النصية الصريحة في الكائن مع مراعاة المسافات والأشكال المختلفة
    let direct = '';
    for (const k of Object.keys(row)) {
      if (/^(الديان[ةه]|ديان[ةه]|religion|rel)$/i.test(k.trim())) {
        direct = String(row[k] || '').trim();
        if (direct) break;
      }
    }

    if (!direct) {
      direct = String(
        row.religion ||
        row.Religion ||
        row.religionName ||
        row.__neprasApiRaw?.religionName ||
        row.__neprasApiRaw?.religion ||
        ''
      ).trim();
    }

    if (direct) {
      if (/مسيح|christian/i.test(direct)) return 'مسيحي';
      if (/مسلم|islam|muslim/i.test(direct)) return 'مسلم';
      if (/أخرى|اخرى|other/i.test(direct)) return 'أخرى';
    }

    // 2. فحص معرف الديانة الرقمي في نظام الوزارة (1 = مسلم، 2 = مسيحي، 3 وأخرى = أخرى)
    const relId = row.religionId ?? row['religionId'] ?? row.__neprasApiRaw?.religionId;
    if (relId !== undefined && relId !== null && relId !== '') {
      const num = Number(relId);
      if (num === 1) return 'مسلم';
      if (num === 2) return 'مسيحي';
      if (Number.isFinite(num)) return 'أخرى';
    }

    // إحصاء صارم: عند خلو السجل من حقل الديانة لا يتم التخمين ويُسجل كغير مسجل بالبيانات
    return 'غير مسجّل';
  }

  function normalizeArabic(text, options = {}) {
    let s = String(text ?? '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه');
    if (options && options.toLatin) {
      s = toLatinDigits(s);
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  function isMale(studentOrValue) {
    if (!studentOrValue) return false;
    if (typeof studentOrValue === 'string' || typeof studentOrValue === 'number') {
      const s = String(studentOrValue).trim();
      const parsed = parseNationalId(s);
      if (parsed) return parsed.gender === 'ذكر';
      return /ذكر|بنين|ولد|^m$|^male$/i.test(s);
    }
    if (typeof studentOrValue === 'object') {
      const direct = String(
        studentOrValue.gender ??
        studentOrValue['النوع'] ??
        studentOrValue['الجنس'] ??
        studentOrValue.sex ??
        ''
      ).trim();
      if (direct) {
        if (/ذكر|بنين|ولد|^m$|^male$/i.test(direct)) return true;
        if (/أنث|انث|بنات|بنت|^f$|^female$/i.test(direct)) return false;
      }
      const nid =
        studentOrValue.national_id ??
        studentOrValue.nationalId ??
        studentOrValue['الرقم القومي'] ??
        studentOrValue['رقم قومي'] ??
        '';
      const parsed = parseNationalId(nid);
      if (parsed) return parsed.gender === 'ذكر';
    }
    return false;
  }

  globalThis.NeprasEgypt = Object.freeze({ GOVERNORATES, toLatinDigits, cleanDigits, parseNationalId, isValidNationalId, ageOnOct1, academicYearStart, academicYearLabel, newcomersOct1Year, todayStamp, resolveReligion, resolveReligionFromName, normalizeArabic, isMale });
})();
