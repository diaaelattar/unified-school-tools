/**
 * Nepras — تحميل المكتبات الثقيلة عند الطلب.
 *
 * xlsx.full.min.js (~860KB) و pdf-lib.min.js (~510KB) لم تعد تُحقن مع كل صفحة.
 * أي وحدة تحتاج إحداهما تستدعي `await neprasEnsureLib('xlsx' | 'pdflib')` قبل استعمالها؛
 * يطلب المحمّل من الخلفية حقن الملف في نفس العالم المعزول (ISOLATED) ثم يعيد الكائن العام.
 * الاستدعاء آمن للتكرار: إن كانت المكتبة محمّلة يعود فورًا، والطلبات المتزامنة تشترك في وعد واحد.
 *
 * القائمة المسموحة تُفرض في الخلفية أيضًا (NEPRAS_ENSURE_LIB)، فلا يمكن لهذا الملف طلب أي ملف آخر.
 */
(function () {
  'use strict';
  if (typeof globalThis.neprasEnsureLib === 'function') return;

  const GLOBAL_OF = { xlsx: 'XLSX', pdflib: 'PDFLib' };
  const pending = new Map();

  function neprasEnsureLib(name) {
    const globalName = GLOBAL_OF[name];
    if (!globalName) return Promise.reject(new Error('UNKNOWN_LIB:' + name));
    if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
    if (pending.has(name)) return pending.get(name);

    const job = (async () => {
      let res;
      try {
        res = await chrome.runtime.sendMessage({ action: 'NEPRAS_ENSURE_LIB', lib: name });
      } catch (error) {
        throw new Error('LIB_LOAD_FAILED:' + name + ':' + (error?.message || error));
      }
      if (!res || res.ok !== true) throw new Error('LIB_LOAD_FAILED:' + name + ':' + (res?.message || 'NO_RESPONSE'));
      if (!globalThis[globalName]) throw new Error('LIB_NOT_DEFINED:' + name);
      return globalThis[globalName];
    })();
    pending.set(name, job);
    const clear = () => pending.delete(name);
    job.then(clear, clear);
    return job;
  }

  globalThis.neprasEnsureLib = neprasEnsureLib;
})();
