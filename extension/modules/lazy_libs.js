"use strict";
/**
 * NeprasLazyLibs — تحميل كسول للمكتبات الثقيلة (T14)
 * يضمن تحميل xlsx / pdf-lib / pdfjs عند الطلب فقط دون حجب رسم الواجهة الأولي.
 */
(function (global) {
  if (global.NeprasLazyLibs) return;

  const LIB_MAP = {
    xlsx: { src: "xlsx.full.min.js", check: () => typeof global.XLSX !== "undefined" },
    "pdf-lib": { src: "pdf-lib.min.js", check: () => typeof global.PDFLib !== "undefined" },
    pdfjs: { src: "pdf.min.js", check: () => typeof global.pdfjsLib !== "undefined" }
  };

  const pending = new Map();

  function ensure(name) {
    const spec = LIB_MAP[name];
    if (!spec) return Promise.reject(new Error(`Unknown library: ${name}`));
    if (spec.check()) return Promise.resolve(true);
    if (pending.has(name)) return pending.get(name);

    const p = new Promise((resolve, reject) => {
      if (typeof document === "undefined") {
        reject(new Error(`Document unavailable to load ${name}`));
        return;
      }
      const existing = document.querySelector(`script[src$="${spec.src}"]`);
      if (existing) {
        if (spec.check()) { resolve(true); return; }
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${spec.src}`)), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = spec.src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`Failed to load ${spec.src}`));
      document.head.appendChild(s);
    }).finally(() => pending.delete(name));

    pending.set(name, p);
    return p;
  }

  global.NeprasLazyLibs = Object.freeze({ ensure });
})(typeof window !== "undefined" ? window : globalThis);
