/**
 * Nepras — مخزن قوالب دفاتر الفصول التي رفعها المستخدم بدل المضمّنة (IndexedDB).
 *
 * لماذا IndexedDB لا chrome.storage.local: القالب بين 1.4 و5.7 ميغابايت (وقد يكبر إن أضاف المستخدم صورًا)، وchrome.storage.local
 * محدود بنحو 10 ميغابايت لكل شيء ويحفظ النص فقط (base64 يزيد الحجم الثلث). IndexedDB يحفظ البايتات كما هي بلا حصة صغيرة.
 *
 * الأصل: هذا المخزن في أصل الإضافة (chrome-extension://...)، فتصله صفحة النافذة والخلفية فقط، لا سكربتات المحتوى في موقع الوزارة
 * (أصلها الموقع). فالنافذة تكتب، والخلفية تقرأ وتسلّم المحتوى لسكربت الموقع عند الإنشاء (NEPRAS_READ_BUNDLED_TEMPLATE).
 *
 * المفتاح هو مفتاح القالب المضمّن (primary / prep / sec / sec_project / art / behavior). الاستعادة = حذف المفتاح.
 * بايتات في مخزن 'bytes' وبياناتها (الاسم والتاريخ والحجم) في مخزن 'meta' فتُعرض القائمة دون قراءة الملفات الكبيرة.
 */
(function () {
  'use strict';
  if (globalThis.NeprasCbTemplateStore) return;

  const DB_NAME = 'neprasClassBooks';
  const DB_VERSION = 1;
  const S_BYTES = 'bytes';
  const S_META = 'meta';
  const KEY_RE = /^[a-z0-9_]{1,32}$/;

  let dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('التخزين المحلي غير متاح في هذا المتصفح')); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of [S_BYTES, S_META]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); dbPromise = null; };   // لا نعطّل ترقية مستقبلية
          db.onclose = () => { dbPromise = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error || new Error('تعذّر فتح مخزن القوالب'));
        req.onblocked = () => reject(new Error('مخزن القوالب مشغول بنافذة أخرى. أغلقها وأعد المحاولة'));
      }).catch((e) => { dbPromise = null; throw e; });
    }
    return dbPromise;
  }

  /** يشغّل work(tx) داخل معاملة واحدة ويحلّ عند اكتمالها (لا عند نجاح الطلب الأخير) فلا نقرأ شيئًا لم يُثبَّت بعد. */
  async function run(stores, mode, work) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(stores, mode); } catch (e) { dbPromise = null; reject(e); return; }
      const out = {};
      tx.oncomplete = () => resolve(out);
      tx.onabort = () => reject(tx.error && tx.error.name === 'QuotaExceededError'
        ? new Error('مساحة تخزين المتصفح لا تكفي لهذا القالب')
        : (tx.error || new Error('تعذّر حفظ القالب')));
      tx.onerror = () => { /* يتبعها abort فيُرفض هناك */ };
      try { work(tx, out); } catch (e) { try { tx.abort(); } catch (_) {} reject(e); }
    });
  }

  function checkKey(key) {
    if (!KEY_RE.test(String(key))) throw new Error('مفتاح قالب غير صالح');
    return String(key);
  }

  /** {name, savedAt, size} أو null — بلا قراءة البايتات. */
  async function meta(key) {
    checkKey(key);
    const out = await run([S_META], 'readonly', (tx, o) => { tx.objectStore(S_META).get(key).onsuccess = (e) => { o.meta = e.target.result; }; });
    return out.meta || null;
  }

  /** {مفتاح: {name, savedAt, size}} لكل القوالب المخصصة. */
  async function list() {
    const out = await run([S_META], 'readonly', (tx, o) => {
      o.all = {};
      tx.objectStore(S_META).openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (c) { o.all[String(c.key)] = c.value; c.continue(); }
      };
    });
    return out.all;
  }

  /** {name, savedAt, size, bytes: Uint8Array} أو null. */
  async function get(key) {
    checkKey(key);
    const out = await run([S_BYTES, S_META], 'readonly', (tx, o) => {
      tx.objectStore(S_META).get(key).onsuccess = (e) => { o.meta = e.target.result; };
      tx.objectStore(S_BYTES).get(key).onsuccess = (e) => { o.buf = e.target.result; };
    });
    if (!out.meta || !out.buf || typeof out.buf.byteLength !== 'number') return null;
    return { ...out.meta, bytes: new Uint8Array(out.buf) };
  }

  /** يحفظ (أو يستبدل) قالب المفتاح. يعيد {name, savedAt, size}. */
  async function put(key, name, bytes) {
    checkKey(key);
    if (!bytes || !bytes.length) throw new Error('الملف فارغ');
    const info = { name: String(name || '').slice(0, 120), savedAt: Date.now(), size: bytes.length };
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);   // نسخة بحدود العرض فقط
    await run([S_BYTES, S_META], 'readwrite', (tx) => {
      tx.objectStore(S_BYTES).put(copy, key);
      tx.objectStore(S_META).put(info, key);
    });
    return info;
  }

  async function remove(key) {
    checkKey(key);
    await run([S_BYTES, S_META], 'readwrite', (tx) => {
      tx.objectStore(S_BYTES).delete(key);
      tx.objectStore(S_META).delete(key);
    });
  }

  globalThis.NeprasCbTemplateStore = Object.freeze({ meta, list, get, put, remove, KEY_RE });
})();
