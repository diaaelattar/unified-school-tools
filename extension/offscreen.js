// v1.2.77 — مستند offscreen: يحوّل ملفًا كبيرًا (base64) إلى رابط blob: ليبدأ تنزيله chrome.downloads
// من الخلفية. السبب: رابط data: في chrome.downloads محدود بنحو 2MB في كروم فتفشل ملفات مثل ZIP
// عشرات الصحف، والـservice worker لا يملك URL.createObjectURL. لا يفعل هذا الملف شيئًا آخر.
(() => {
  "use strict";
  const TARGET = "nepras-offscreen";
  // نحرّر الرابط تلقائيًا بعد فترة كافية لاكتمال التنزيل حتى لو ماتت الخلفية قبل أن تطلب ذلك.
  const REVOKE_AFTER_MS = 5 * 60 * 1000;
  const live = new Map();

  function base64ToBytes(base64) {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function revoke(url) {
    const timer = live.get(url);
    if (timer === undefined) return false;
    clearTimeout(timer);
    live.delete(url);
    try { URL.revokeObjectURL(url); } catch (_) {}
    return true;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // رسائل الإضافة الأخرى تصل هنا أيضًا: نتجاهل كل ما ليس موجّهًا لنا.
    if (!msg || msg.target !== TARGET) return false;
    try {
      if (msg.type === "MAKE_BLOB_URL") {
        const bytes = base64ToBytes(String(msg.base64 || ""));
        if (!bytes.length) { sendResponse({ ok: false, message: "EMPTY_DATA" }); return false; }
        const blob = new Blob([bytes], { type: String(msg.mimeType || "application/octet-stream") });
        const url = URL.createObjectURL(blob);
        live.set(url, setTimeout(() => revoke(url), REVOKE_AFTER_MS));
        sendResponse({ ok: true, url, size: bytes.length });
        return false;
      }
      if (msg.type === "REVOKE_BLOB_URL") {
        sendResponse({ ok: true, revoked: revoke(String(msg.url || "")) });
        return false;
      }
    } catch (error) {
      sendResponse({ ok: false, message: error?.message || String(error) });
      return false;
    }
    return false;
  });
})();
