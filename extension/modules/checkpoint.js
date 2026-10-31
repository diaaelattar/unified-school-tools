/**
 * نبراس - نقاط الحفظ للعمليات الطويلة (NeprasCheckpoint)
 *
 * الهدف: لو توقفت عملية طويلة (انتهت الجلسة، أُغلق التبويب، خطأ شبكة)، يستأنف
 * المستخدم من آخر دفعة نجحت بدل البدء من الصفر.
 *
 * الخصوصية: لا نخزّن أسماء ولا أكواد ولا أرقامًا قومية. نخزّن فقط:
 *   - بصمة (hash) للمدخلات، لنتعرف أن المستخدم أعاد نفس الملف بنفس الإعدادات،
 *   - عدّادات التقدم (عدد الدفعات المنجزة، أعداد المحفوظ).
 * والبيانات تنتهي صلاحيتها تلقائيًا (7 أيام افتراضيًا).
 *
 * كل شيء داخل IIFE (عالم معزول مشترك؛ انظر PHASE_NOTES.md، هوتفيكس NEPRAS_ZIP_CRC_TABLE).
 * إن لم يتوفر chrome.storage تصبح كل الدوال بلا أثر ولا ترمي أخطاء.
 */
(() => {
  if (window.NeprasCheckpoint) return;

  const PREFIX = "neprasCheckpoint:";
  const VERSION = 1;
  const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function area() {
    try {
      return (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;
    } catch (_) {
      return null;
    }
  }

  function keyOf(name) {
    return PREFIX + String(name || "default");
  }

  // ترتيب ثابت للمفاتيح حتى لا تتغير البصمة بتغير ترتيب الإدخال.
  function canonical(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (value instanceof Set) return canonical([...value].sort());
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }

  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  /** بصمة ثابتة للمدخلات: SHA-256 إن توفر، وإلا FNV-1a مزدوج. */
  async function fingerprint(value) {
    const text = canonical(value);
    try {
      if (globalThis.crypto?.subtle && typeof TextEncoder === "function") {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (_) { /* نكمل بالاحتياطي */ }
    return fnv1a(text) + fnv1a(text.split("").reverse().join(""));
  }

  function getAsync(key) {
    return new Promise((resolve) => {
      const a = area();
      if (!a) { resolve(undefined); return; }
      try {
        a.get(key, (res) => {
          if (chrome.runtime?.lastError) { resolve(undefined); return; }
          resolve(res ? res[key] : undefined);
        });
      } catch (_) { resolve(undefined); }
    });
  }

  function setAsync(key, value) {
    return new Promise((resolve) => {
      const a = area();
      if (!a) { resolve(false); return; }
      try {
        a.set({ [key]: value }, () => resolve(!chrome.runtime?.lastError));
      } catch (_) { resolve(false); }
    });
  }

  function removeAsync(key) {
    return new Promise((resolve) => {
      const a = area();
      if (!a) { resolve(false); return; }
      try {
        a.remove(key, () => resolve(!chrome.runtime?.lastError));
      } catch (_) { resolve(false); }
    });
  }

  /**
   * يُرجع بيانات نقطة الحفظ أو null إن لم توجد/انتهت/اختلفت بصمتها.
   * لو انتهت صلاحيتها تُحذف تلقائيًا.
   */
  async function load(name, expectedFingerprint) {
    const key = keyOf(name);
    const record = await getAsync(key);
    if (!record || record.version !== VERSION) return null;
    if (record.expiresAt && Date.now() > record.expiresAt) {
      await removeAsync(key);
      return null;
    }
    if (expectedFingerprint && record.fingerprint !== expectedFingerprint) return null;
    return record.data ?? null;
  }

  async function save(name, fingerprintValue, data, { ttlMs = DEFAULT_TTL_MS } = {}) {
    return setAsync(keyOf(name), {
      version: VERSION,
      fingerprint: fingerprintValue,
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      data
    });
  }

  function clear(name) {
    return removeAsync(keyOf(name));
  }

  window.NeprasCheckpoint = Object.freeze({ fingerprint, load, save, clear, canonical });
})();
