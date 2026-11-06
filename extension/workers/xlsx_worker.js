"use strict";

/**
 * ==============================================================================
 * ⚡ عامل الويب المستقل لمعالجة وتصدير ملفات Excel (Nepras XLSX Web Worker)
 * ------------------------------------------------------------------------------
 * • يعمل في مسار خلفي مستقل عن واجهة المستخدم (Background Thread).
 * • يمنع تماماً تجمد الماوس والشاشة (UI Freeze) أثناء بناء المصنفات الإحصائية الكبيرة.
 * ==============================================================================
 */

try {
  importScripts("../xlsx.full.min.js");
} catch (err) {
  // في بعض البيئات يتم توفير مكتبة XLSX مسبقاً
}

self.onmessage = function (e) {
  const { id, action, sheets, options } = e.data || {};

  if (action === "PING") {
    self.postMessage({ id, ok: true, message: "PONG" });
    return;
  }

  if (action === "BUILD_WORKBOOK") {
    try {
      if (typeof XLSX === "undefined") {
        throw new Error("مكتبة SheetJS (XLSX) غير متاحة داخل Web Worker.");
      }

      const wb = XLSX.utils.book_new();

      if (Array.isArray(sheets)) {
        for (const sheetData of sheets) {
          const { name, rows, headers, rtl } = sheetData;
          let ws;

          if (headers && Array.isArray(headers)) {
            ws = XLSX.utils.aoa_to_sheet([headers, ...(rows || [])]);
          } else if (Array.isArray(rows)) {
            ws = XLSX.utils.json_to_sheet(rows);
          } else {
            ws = XLSX.utils.aoa_to_sheet([[]]);
          }

          // تطبيق التوجيه من اليمين لليسار (RTL) للغة العربية
          if (rtl !== false) {
            ws["!views"] = [{ RTL: true }];
          }

          XLSX.utils.book_append_sheet(wb, ws, String(name || "Sheet").slice(0, 31));
        }
      }

      // توليد البايتات بصيغة Uint8Array
      const out = XLSX.write(wb, {
        bookType: (options && options.bookType) || "xlsx",
        type: "array",
        compression: true
      });

      self.postMessage({ id, ok: true, buffer: out }, [out]);
    } catch (err) {
      self.postMessage({ id, ok: false, error: err.message || String(err) });
    }
  }
};
