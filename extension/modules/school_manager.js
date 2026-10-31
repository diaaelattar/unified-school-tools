/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة إدارة وعزل المدارس والمراحل المستقلة (Multi-School Profile Manager)
 * NeprasSchoolManager — عزل وتخزين بيانات كل مدرسة/مرحلة برقم كودها بشكل مستقل تماماً
 */
'use strict';

(function(global) {
  if (global.NeprasSchoolManager) return;

  const REGISTRY_STORAGE_KEY = 'nepras_schools_registry_v1';
  const ACTIVE_CODE_STORAGE_KEY = 'nepras_active_school_code_v1';

  function cleanCode(code) {
    if (!code) return '';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const str = String(code)
      .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
      .trim();
    return str.replace(/\D/g, '');
  }

  function getStorage(keys) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get(keys, (res) => resolve(res || {}));
        } else {
          const out = {};
          const kArr = Array.isArray(keys) ? keys : [keys];
          kArr.forEach((k) => {
            try {
              const raw = localStorage.getItem(k);
              if (raw) out[k] = JSON.parse(raw);
            } catch (_) {}
          });
          resolve(out);
        }
      } catch (_) {
        resolve({});
      }
    });
  }

  function setStorage(data) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set(data, () => resolve(true));
        } else {
          for (const [k, v] of Object.entries(data || {})) {
            try {
              localStorage.setItem(k, JSON.stringify(v));
            } catch (_) {}
          }
          resolve(true);
        }
      } catch (_) {
        resolve(false);
      }
    });
  }

  function deduplicateSchoolsByOfficialCode(list) {
    if (!Array.isArray(list) || list.length <= 1) return list;
    const byName = new Map();
    for (const s of list) {
      if (!s || !s.name || /^مدرسة \d+$/.test(s.name.trim())) continue;
      const key = s.name.trim();
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, s);
      } else {
        // كود المدرسة الرسمي يتكون عادة من 7 أو 8 أرقام (مثل 21024219)، بينما الرقم المسلسل 5 أو 6 أرقام (مثل 972133)
        const sIsOfficial = s.code && s.code.length >= 7;
        const prevIsOfficial = prev.code && prev.code.length >= 7;
        if (sIsOfficial && !prevIsOfficial) {
          byName.set(key, { ...prev, ...s, code: s.code });
        } else if (!sIsOfficial && prevIsOfficial) {
          byName.set(key, { ...s, ...prev, code: prev.code });
        }
      }
    }
    const result = [];
    const seenCodes = new Set();
    for (const s of list) {
      if (!s || !s.code) continue;
      const key = (s.name || '').trim();
      const canonical = (key && byName.has(key)) ? byName.get(key) : s;
      if (!seenCodes.has(canonical.code)) {
        seenCodes.add(canonical.code);
        result.push(canonical);
      }
    }
    return result;
  }

  /**
   * جلب قائمة كافة المدارس المحفوظة
   * @returns {Promise<Array<{code: string, name: string, stage: string, directorate: string, administration: string, lastActive: number}>>}
   */
  async function getSchoolsList() {
    const data = await getStorage(REGISTRY_STORAGE_KEY);
    const rawList = Array.isArray(data?.[REGISTRY_STORAGE_KEY]) ? data[REGISTRY_STORAGE_KEY] : [];
    const list = deduplicateSchoolsByOfficialCode(rawList);
    if (list.length !== rawList.length) {
      await setStorage({ [REGISTRY_STORAGE_KEY]: list });
    }
    return list;
  }

  /**
   * جلب كود المدرسة النشطة حالياً
   */
  async function getActiveCode() {
    const data = await getStorage(ACTIVE_CODE_STORAGE_KEY);
    return cleanCode(data?.[ACTIVE_CODE_STORAGE_KEY]) || '';
  }

  /**
   * تعيين كود المدرسة النشطة ومزامنة الذاكرة المحلية مع ملفها الخاص
   */
  async function setActiveCode(code) {
    const clean = cleanCode(code);
    await setStorage({ [ACTIVE_CODE_STORAGE_KEY]: clean });

    if (clean) {
      // مزامنة المؤشرات العالمية فوراً مع ملف المدرسة المحدد لمنع أي تعارض
      const statsKey = scopedKey(clean, 'stats');
      const studentsKey = scopedKey(clean, 'students');
      const metaKey = scopedKey(clean, 'meta');
      const absenceKey = scopedKey(clean, 'absence');
      const data = await getStorage([statsKey, studentsKey, metaKey, absenceKey]);

      const schools = await getSchoolsList();
      const profile = schools.find((s) => s.code === clean);

      const toSync = {
        neprasSchoolStatsV1: data?.[statsKey] || null,
        neprasCachedStudentsList: Array.isArray(data?.[studentsKey]) ? data[studentsKey] : [],
        neprasCachedAbsenceList: Array.isArray(data?.[absenceKey]) ? data[absenceKey] : [],
        nepras_report_header_meta: data?.[metaKey] || {
          schoolName: profile?.name || `مدرسة ${clean}`,
          directorate: profile?.directorate || '',
          administration: profile?.administration || '',
          affairs: profile?.affairs || '',
          principal: profile?.principal || '',
          stage: profile?.stage || '',
          schoolKey: clean,
          schoolCode: clean
        }
      };
      await setStorage(toSync);
    } else {
      await setStorage({
        neprasSchoolStatsV1: null,
        neprasCachedStudentsList: [],
        neprasCachedAbsenceList: []
      });
    }

    try {
      window.dispatchEvent(new CustomEvent('nepras:school-changed', { detail: { schoolCode: clean } }));
    } catch (_) {}
    return clean;
  }

  /**
   * تسجيل أو تحديث مدرسة في الفهرس العام
   */
  async function registerOrUpdateSchool(info) {
    if (!info) return null;
    let code = cleanCode(info.code || info.schoolCode || info.schoolcode || info.schoolKey);
    if (!code) return null;

    const list = await getSchoolsList();
    const name = String(info.name || info.schoolName || info.school || `مدرسة ${code}`).trim();
    const stage = String(info.stage || info.schoolStage || info.schoolstage || '').toUpperCase();
    const directorate = String(info.directorate || info.dir || '').trim();
    const administration = String(info.administration || info.admin || '').trim();
    const affairs = String(info.affairs || '').trim();
    const principal = String(info.principal || '').trim();

    // منع إنشاء سجل بالرقم المسلسل (6 أرقام) إذا كانت المدرسة مسجلة بالفعل بكودها الرسمي (7-8 أرقام)
    if (name && !/^مدرسة \d+$/.test(name) && code.length < 7) {
      const officialMatch = list.find((s) => s.name === name && s.code && s.code.length >= 7);
      if (officialMatch) {
        code = officialMatch.code;
      }
    }

    const existingIdx = list.findIndex((s) => s.code === code);
    const profile = {
      code,
      name: name || (existingIdx >= 0 ? list[existingIdx].name : `مدرسة ${code}`),
      stage: stage || (existingIdx >= 0 ? list[existingIdx].stage : ''),
      directorate: directorate || (existingIdx >= 0 ? list[existingIdx].directorate : ''),
      administration: administration || (existingIdx >= 0 ? list[existingIdx].administration : ''),
      affairs: affairs || (existingIdx >= 0 ? list[existingIdx].affairs : ''),
      principal: principal || (existingIdx >= 0 ? list[existingIdx].principal : ''),
      lastActive: Date.now()
    };

    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...profile };
    } else {
      list.push(profile);
    }

    const finalCleanList = deduplicateSchoolsByOfficialCode(list);

    await setStorage({
      [REGISTRY_STORAGE_KEY]: finalCleanList,
      [ACTIVE_CODE_STORAGE_KEY]: code
    });

    return profile;
  }

  /**
   * مفتاح التخزين المخصص للمدرسة
   */
  function scopedKey(code, suffix) {
    const c = cleanCode(code);
    return c ? `nepras_school_${c}_${suffix}` : `nepras_${suffix}`;
  }

  /**
   * حفظ بيانات ترويسة المدرسة الرسمية لكل كود بشكل معزول
   */
  async function saveSchoolMeta(code, meta) {
    const c = cleanCode(code) || (await getActiveCode());
    if (!c) {
      await setStorage({ nepras_report_header_meta: meta });
      return;
    }
    const key = scopedKey(c, 'meta');
    const active = await getActiveCode();
    const toStore = { [key]: meta };
    if (!active || active === c) {
      toStore.nepras_report_header_meta = meta;
    }
    await setStorage(toStore);
    await registerOrUpdateSchool({
      code: c,
      name: meta.schoolName || meta.school,
      directorate: meta.directorate || meta.dir,
      administration: meta.administration || meta.admin,
      affairs: meta.affairs,
      principal: meta.principal,
      stage: meta.stage
    });
  }

  /**
   * قراءة بيانات ترويسة المدرسة لكود معين
   */
  async function loadSchoolMeta(code) {
    const c = cleanCode(code) || (await getActiveCode());
    if (!c) {
      const data = await getStorage('nepras_report_header_meta');
      return data?.nepras_report_header_meta || null;
    }
    const key = scopedKey(c, 'meta');
    const data = await getStorage([key, 'nepras_report_header_meta']);
    if (data?.[key]) return data[key];

    // إذا لم توجد ترويسة مخصصة بعد، تحقق أولاً من أن الترويسة العامة تخص نفس المدرسة
    const globalMeta = data?.nepras_report_header_meta;
    if (globalMeta && cleanCode(globalMeta.schoolCode || globalMeta.schoolKey || globalMeta.code) === c) {
      return globalMeta;
    }

    // وإلا قم ببناء ترويسة نظيفة من بيانات المدرسة المسجلة في الفهرس
    const schools = await getSchoolsList();
    const profile = schools.find((s) => s.code === c);
    if (profile) {
      return {
        schoolName: profile.name,
        directorate: profile.directorate,
        administration: profile.administration,
        affairs: profile.affairs,
        principal: profile.principal,
        stage: profile.stage,
        schoolKey: c,
        schoolCode: c
      };
    }
    return null;
  }

  /**
   * حفظ إحصاء وطلاب المدرسة بشكل معزول
   */
  async function saveSchoolStats(code, statsResult, studentsList) {
    const c = cleanCode(code) || (await getActiveCode());
    if (!c) return;

    const statsKey = scopedKey(c, 'stats');
    const studentsKey = scopedKey(c, 'students');
    const active = await getActiveCode();

    const toStore = {
      [statsKey]: statsResult,
      [studentsKey]: studentsList
    };

    // نحدّث المؤشرات العالمية فقط إذا كانت هذه هي المدرسة المعروضة حالياً
    // لمنع أي سحب في الخلفية من مسح بيانات المدرسة المفتوحة للمستخدم
    if (!active || active === c) {
      toStore.neprasSchoolStatsV1 = statsResult;
      toStore.neprasCachedStudentsList = studentsList;
    }

    await setStorage(toStore);

    await registerOrUpdateSchool({
      code: c,
      name: statsResult?.schoolName,
      stage: statsResult?.stage,
      directorate: statsResult?.directorate,
      administration: statsResult?.administration
    });
  }

  /**
   * قراءة إحصاء وطلاب المدرسة لكود معين مع العزل الصارم
   */
  async function loadSchoolStats(code) {
    const c = cleanCode(code) || (await getActiveCode());
    if (!c) {
      const def = await getStorage(['neprasSchoolStatsV1', 'neprasCachedStudentsList']);
      return {
        stats: def?.neprasSchoolStatsV1 || null,
        students: def?.neprasCachedStudentsList || []
      };
    }

    const statsKey = scopedKey(c, 'stats');
    const studentsKey = scopedKey(c, 'students');
    const data = await getStorage([statsKey, studentsKey, 'neprasSchoolStatsV1', 'neprasCachedStudentsList']);

    const fallbackStats = data?.neprasSchoolStatsV1;
    const fallbackMatches = fallbackStats && (cleanCode(fallbackStats.schoolCode || fallbackStats.schoolKey || fallbackStats.code) === c);

    return {
      stats: data?.[statsKey] || (fallbackMatches ? fallbackStats : null),
      students: data?.[studentsKey] || (fallbackMatches && Array.isArray(data?.neprasCachedStudentsList) ? data.neprasCachedStudentsList : [])
    };
  }

  /**
   * تصدير حزمة بيانات المدرسة بالكامل لملف محلي (.nepras / .json)
   * @param {string} [code] كود المدرسة المراد تصديرها (افتراضياً: المدرسة النشطة)
   * @returns {Promise<Object>} كائن الحزمة الجاهز للحفظ في ملف
   */
  async function exportSchoolPackage(code) {
    const c = cleanCode(code) || (await getActiveCode());
    if (!c) {
      throw new Error("لا توجد مدرسة محددة للتصدير. يرجى اختيار مدرسة أولاً أو فتح صفحتها.");
    }
    const meta = await loadSchoolMeta(c);
    const { stats, students } = await loadSchoolStats(c);
    const absenceKey = scopedKey(c, 'absence');
    const storageData = await getStorage([absenceKey, 'neprasCachedAbsenceList']);
    const absence = storageData?.[absenceKey] || storageData?.neprasCachedAbsenceList || [];

    const schools = await getSchoolsList();
    const profile = schools.find((s) => s.code === c) || {};

    return {
      format: "nepras-school-package",
      schemaVersion: 1,
      version: "1.3.2",
      exportDate: new Date().toISOString(),
      schoolCode: c,
      schoolName: meta?.schoolName || profile.name || stats?.schoolName || `مدرسة ${c}`,
      stage: meta?.stage || profile.stage || stats?.stage || "",
      directorate: meta?.directorate || profile.directorate || stats?.directorate || "",
      administration: meta?.administration || profile.administration || stats?.administration || "",
      meta: meta || {},
      stats: stats || null,
      students: Array.isArray(students) ? students : [],
      absence: Array.isArray(absence) ? absence : []
    };
  }

  /**
   * استيراد حزمة بيانات المدرسة من ملف محلي وحفظها وتفعيلها كمدرسة نشطة فوراً
   * @param {Object} pkg كائن الحزمة المستورد من ملف JSON
   * @returns {Promise<{ ok: boolean, schoolCode: string, schoolName: string, studentsCount: number, message: string }>}
   */
  async function importSchoolPackage(pkg) {
    if (!pkg || typeof pkg !== 'object' || (pkg.format !== 'nepras-school-package' && !pkg.schoolCode && !pkg.students)) {
      throw new Error("ملف المدرسة غير صالح أو تالف. يرجى اختيار ملف مصدّر من تطبيق نبراس بصيغة .nepras أو .json.");
    }

    const c = cleanCode(pkg.schoolCode || pkg.meta?.schoolCode || pkg.meta?.schoolKey);
    if (!c) {
      throw new Error("ملف المدرسة لا يحتوي على كود مدرسي صالح.");
    }

    const schoolName = pkg.schoolName || pkg.meta?.schoolName || pkg.stats?.schoolName || `مدرسة ${c}`;
    const stage = pkg.stage || pkg.meta?.stage || pkg.stats?.stage || '';
    const directorate = pkg.directorate || pkg.meta?.directorate || pkg.stats?.directorate || '';
    const administration = pkg.administration || pkg.meta?.administration || pkg.stats?.administration || '';
    const students = Array.isArray(pkg.students) ? pkg.students : [];
    const stats = pkg.stats || null;
    const meta = pkg.meta || {
      schoolName,
      stage,
      directorate,
      administration,
      schoolCode: c,
      schoolKey: c
    };
    const absence = Array.isArray(pkg.absence) ? pkg.absence : [];

    const statsKey = scopedKey(c, 'stats');
    const studentsKey = scopedKey(c, 'students');
    const metaKey = scopedKey(c, 'meta');
    const absenceKey = scopedKey(c, 'absence');

    const toStore = {
      [statsKey]: stats,
      [studentsKey]: students,
      [metaKey]: meta,
      [absenceKey]: absence
    };

    await setStorage(toStore);

    await registerOrUpdateSchool({
      code: c,
      name: schoolName,
      stage,
      directorate,
      administration
    });

    await setActiveCode(c);

    if (absence.length) {
      await setStorage({ neprasCachedAbsenceList: absence });
    }

    return {
      ok: true,
      schoolCode: c,
      schoolName,
      studentsCount: students.length,
      message: `تم استيراد مدرسة "${schoolName}" بنجاح (${students.length} طالب/تلميذ) وتم تفعيلها كمدرسة نشطة!`
    };
  }

  /**
   * حذف مدرسة بالكامل من السجلات
   */
  async function removeSchool(code) {
    const c = cleanCode(code);
    if (!c) return false;
    const list = await getSchoolsList();
    const filtered = list.filter((s) => s.code !== c);
    await setStorage({ [REGISTRY_STORAGE_KEY]: filtered });
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.remove([scopedKey(c, 'meta'), scopedKey(c, 'stats'), scopedKey(c, 'students'), scopedKey(c, 'absence')]);
      }
    } catch (_) {}
    return true;
  }

  global.NeprasSchoolManager = Object.freeze({
    cleanCode,
    getSchoolsList,
    getActiveCode,
    setActiveCode,
    registerOrUpdateSchool,
    saveSchoolMeta,
    loadSchoolMeta,
    saveSchoolStats,
    loadSchoolStats,
    exportSchoolPackage,
    importSchoolPackage,
    removeSchool,
    scopedKey
  });

})(typeof window !== 'undefined' ? window : globalThis);
