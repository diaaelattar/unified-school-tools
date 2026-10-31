/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة قاعدة البيانات المحلية الشاملة والأرشفة الشهرية (NeprasLocalDB)
 * Cache-First Architecture & Monthly Historical Snapshots
 * -----------------------------------------------------------------------------
 * • حفظ شامل لكافة بيانات المدرسة (الطلاب، الإحصاء، الفصول، الغياب، الترويسة).
 * • توثيق شهري تاريخي (لقطة لكل شهر ميلادي YYYY-MM) للرجوع والمقارنة.
 * • فحص صلاحية البيانات الشهرية والتنبيه الذكي عند بداية كل شهر جديد.
 * • محرك رصد الفروقات (Delta Diff) لاكتشاف الطلاب الجدد والمحولين بدقة.
 */
'use strict';

(function(global) {
  if (global.NeprasLocalDB) return;

  const DB_PREFIX = 'nepras_db_';
  const MONTHLY_PREFIX = 'nepras_snap_';

  function getMonthKey(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  const ARABIC_MONTH_NAMES = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  function getMonthLabel(monthKey) {
    if (!monthKey || typeof monthKey !== 'string') return '';
    const parts = monthKey.split('-');
    if (parts.length < 2) return monthKey;
    const year = parts[0];
    const monthNum = parseInt(parts[1], 10);
    const mName = ARABIC_MONTH_NAMES[monthNum - 1] || `شهر ${monthNum}`;
    return `${mName} ${year}`;
  }

  function cleanCode(code) {
    return String(code || '').replace(/\D/g, '').trim();
  }

  // تخزين مساعد موحد
  function getStore(keys) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get(keys, (res) => resolve(res || {}));
        } else if (typeof localStorage !== 'undefined') {
          const out = {};
          const kArr = Array.isArray(keys) ? keys : [keys];
          kArr.forEach((k) => {
            try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (_) { out[k] = null; }
          });
          resolve(out);
        } else {
          resolve({});
        }
      } catch (_) {
        resolve({});
      }
    });
  }

  function setStore(data) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set(data, () => resolve(true));
        } else if (typeof localStorage !== 'undefined') {
          Object.keys(data).forEach((k) => {
            try { localStorage.setItem(k, JSON.stringify(data[k])); } catch (_) {}
          });
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (_) {
        resolve(false);
      }
    });
  }

  /**
   * حفظ لقطة شهرية شاملة للمدرسة
   * @param {string} schoolCode كود المدرسة الرسمي
   * @param {Object} payload البيانات الشاملة
   * @param {string} [customMonthKey] شهر محدد (افتراضي: الشهر الحالي YYYY-MM)
   */
  async function saveMonthlySnapshot(schoolCode, payload, customMonthKey = '') {
    const c = cleanCode(schoolCode);
    if (!c) throw new Error('كود المدرسة غير صالح للحفظ في قاعدة البيانات المحلية.');

    const now = new Date();
    const monthKey = customMonthKey || getMonthKey(now);
    const monthLabel = getMonthLabel(monthKey);

    const snapshotKey = `${MONTHLY_PREFIX}${c}_${monthKey}`;
    const latestKey = `${DB_PREFIX}latest_${c}`;
    const indexKey = `${DB_PREFIX}months_${c}`;

    // إعداد السجل الشامل
    const snapshot = {
      schoolCode: c,
      monthKey,
      monthLabel,
      savedAt: now.toISOString(),
      savedAtLabel: now.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }),
      meta: payload.meta || {},
      stats: payload.stats || null,
      students: Array.isArray(payload.students) ? payload.students : [],
      absence: Array.isArray(payload.absence) ? payload.absence : [],
      summary: {
        totalStudents: payload.students?.length || payload.stats?.totalStudents || payload.stats?.total || 0,
        boysCount: payload.stats?.boys || payload.stats?.boysCount || 0,
        girlsCount: payload.stats?.girls || payload.stats?.girlsCount || 0,
        classesCount: payload.stats?.classesCount || payload.stats?.totalClasses || 0,
        academicYear: payload.meta?.academicYear || payload.meta?.year || (global.NeprasEgypt?.academicYearLabel?.() || '2026 / 2027 م')
      }
    };

    // جلب فهرس الشهور الحالية وإضافة هذا الشهر إن لم يكن موجوداً
    const existingData = await getStore(indexKey);
    const monthsList = Array.isArray(existingData?.[indexKey]) ? existingData[indexKey] : [];
    const existingIdx = monthsList.findIndex((m) => m.monthKey === monthKey);

    const monthMeta = {
      monthKey,
      monthLabel,
      savedAt: snapshot.savedAt,
      savedAtLabel: snapshot.savedAtLabel,
      totalStudents: snapshot.summary.totalStudents,
      classesCount: snapshot.summary.classesCount
    };

    if (existingIdx >= 0) {
      monthsList[existingIdx] = monthMeta;
    } else {
      monthsList.unshift(monthMeta); // الأحدث في البداية
    }

    const toStore = {
      [snapshotKey]: snapshot,
      [latestKey]: snapshot,
      [indexKey]: monthsList
    };

    await setStore(toStore);
    return snapshot;
  }

  /**
   * جلب أحدث لقطة بيانات للمدرسة
   * @param {string} schoolCode
   * @returns {Promise<Object|null>}
   */
  async function getLatestSnapshot(schoolCode) {
    const c = cleanCode(schoolCode);
    if (!c) return null;
    const latestKey = `${DB_PREFIX}latest_${c}`;
    const data = await getStore(latestKey);
    return data?.[latestKey] || null;
  }

  /**
   * جلب لقطة شهر معين للمدرسة
   * @param {string} schoolCode
   * @param {string} monthKey صيغة YYYY-MM (مثلاً: 2026-10)
   * @returns {Promise<Object|null>}
   */
  async function getSnapshotByMonth(schoolCode, monthKey) {
    const c = cleanCode(schoolCode);
    if (!c || !monthKey) return null;
    const snapshotKey = `${MONTHLY_PREFIX}${c}_${monthKey}`;
    const data = await getStore(snapshotKey);
    return data?.[snapshotKey] || null;
  }

  /**
   * جلب قائمة الشهور المتوفرة للمدرسة في قاعدة البيانات
   * @param {string} schoolCode
   * @returns {Promise<Array<{monthKey: string, monthLabel: string, savedAtLabel: string, totalStudents: number}>>}
   */
  async function listAvailableMonths(schoolCode) {
    const c = cleanCode(schoolCode);
    if (!c) return [];
    const indexKey = `${DB_PREFIX}months_${c}`;
    const data = await getStore(indexKey);
    return Array.isArray(data?.[indexKey]) ? data[indexKey] : [];
  }

  /**
   * فحص صلاحية البيانات للشهر الحالي
   * @param {string} schoolCode
   * @returns {Promise<{isUpToDate: boolean, currentMonthKey: string, currentMonthLabel: string, lastSnapshot: Object|null, statusBadge: {color: string, label: string}}>}
   */
  async function getMonthlyValidityStatus(schoolCode) {
    const c = cleanCode(schoolCode);
    const now = new Date();
    const currentMonthKey = getMonthKey(now);
    const currentMonthLabel = getMonthLabel(currentMonthKey);

    if (!c) {
      return {
        isUpToDate: false,
        currentMonthKey,
        currentMonthLabel,
        lastSnapshot: null,
        statusBadge: {
          color: '#94a3b8',
          text: 'لا توجد مدرسة نشطة محددة'
        }
      };
    }

    const latest = await getLatestSnapshot(c);
    if (!latest) {
      return {
        isUpToDate: false,
        currentMonthKey,
        currentMonthLabel,
        lastSnapshot: null,
        statusBadge: {
          color: '#f59e0b',
          text: `⚠️ لا توجد بيانات محلية لشهر ${currentMonthLabel} بعد — اضغط "تحديث من الوزارة"`
        }
      };
    }

    const isCurrentMonth = latest.monthKey === currentMonthKey;
    if (isCurrentMonth) {
      return {
        isUpToDate: true,
        currentMonthKey,
        currentMonthLabel,
        lastSnapshot: latest,
        statusBadge: {
          color: '#10b981',
          text: `🟢 بيانات ${latest.monthLabel} محفوظة محلياً بالكامل (آخر سحب: ${latest.savedAtLabel})`
        }
      };
    } else {
      return {
        isUpToDate: false,
        currentMonthKey,
        currentMonthLabel,
        lastSnapshot: latest,
        statusBadge: {
          color: '#3b82f6',
          text: `📅 تتوفر بيانات سابقة (${latest.monthLabel}) — اضغط "تحديث من الوزارة" لاعتماد إحصاء ${currentMonthLabel}`
        }
      };
    }
  }

  /**
   * حساب الفروقات (Delta Diff) بين كشف طلاب جديد والمسجل في قاعدة البيانات
   * @param {Array} currentStudents الطلاب المسجلون محلياً
   * @param {Array} newStudents الطلاب المسحوبون حديثاً
   * @returns {{hasChanges: boolean, added: Array, modified: Array, removed: Array, summaryText: string}}
   */
  function computeDelta(currentStudents = [], newStudents = []) {
    const curMap = new Map();
    (currentStudents || []).forEach((s) => {
      const code = String(s.code || s.id || s['كود الطالب'] || s['كود التلميذ'] || '').trim();
      const nid = String(s.nationalId || s.nid || s['الرقم القومي'] || '').trim();
      const key = code || nid;
      if (key) curMap.set(key, s);
    });

    const added = [];
    const modified = [];
    const newKeys = new Set();

    (newStudents || []).forEach((s) => {
      const code = String(s.code || s.id || s['كود الطالب'] || s['كود التلميذ'] || '').trim();
      const nid = String(s.nationalId || s.nid || s['الرقم القومي'] || '').trim();
      const key = code || nid;
      if (!key) return;
      newKeys.add(key);

      const oldRec = curMap.get(key);
      if (!oldRec) {
        added.push(s);
      } else {
        const oldClass = String(oldRec.className || oldRec.class || oldRec['الفصل'] || '').trim();
        const newClass = String(s.className || s.class || s['الفصل'] || '').trim();
        const oldGrade = String(oldRec.grade || oldRec['الصف'] || '').trim();
        const newGrade = String(s.grade || s['الصف'] || '').trim();

        if (oldClass !== newClass || oldGrade !== newGrade) {
          modified.push({
            student: s,
            changes: {
              oldClass, newClass, oldGrade, newGrade
            }
          });
        }
      }
    });

    const removed = [];
    curMap.forEach((oldRec, key) => {
      if (!newKeys.has(key)) {
        removed.push(oldRec);
      }
    });

    const hasChanges = added.length > 0 || modified.length > 0 || removed.length > 0;
    const parts = [];
    if (added.length) parts.push(`إضافة (${added.length}) طالب جديد`);
    if (modified.length) parts.push(`تعديل بيانات/فصل (${modified.length}) طالب`);
    if (removed.length) parts.push(`نقل/استبعاد (${removed.length}) طالب`);

    const summaryText = hasChanges
      ? `تم رصد فروقات جديدة: ${parts.join('، ')}.`
      : 'لا توجد أي تغييرات في السجلات (البيانات متطابقة بنسبة 100% مع موقع الوزارة).';

    return {
      hasChanges,
      added,
      modified,
      removed,
      summaryText
    };
  }

  global.NeprasLocalDB = Object.freeze({
    getMonthKey,
    getMonthLabel,
    saveMonthlySnapshot,
    getLatestSnapshot,
    getSnapshotByMonth,
    listAvailableMonths,
    getMonthlyValidityStatus,
    computeDelta
  });

})(typeof window !== 'undefined' ? window : globalThis);
