"use strict";
/**
 * ==============================================================================
 * ⚖️ وحدة التحكم في إنذارات الغياب (Nepras Absence Controller - T15)
 * ------------------------------------------------------------------------------
 * • تتولى تجهيز شارات مستويات الإنذار وبناء شريط الطباعة الرسمي لإنذارات الغياب.
 * ==============================================================================
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeprasAbsenceController = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  function getAbsenceBadgeInfo(days, mode) {
    const d = parseInt(days, 10) || 0;
    const isDisc = mode === "DISCONTINUOUS" || /منفصل/i.test(String(mode || ""));
    const l1 = isDisc ? 7 : 5;
    const l2 = isDisc ? 14 : 10;
    const l3 = isDisc ? 21 : 12;
    const lf = isDisc ? 30 : 15;

    if (d >= lf) {
      return { text: `🔴 إنذار بالفصل (${lf}+)`, bg: "#fee2e2", color: "#991b1b", rowBg: "background:rgba(254,226,226,0.2);" };
    }
    if (d >= l3) {
      return { text: `🟠 إنذار ثالث (${l3}-${lf - 1})`, bg: "#ffedd5", color: "#9a3412", rowBg: "background:rgba(255,237,213,0.2);" };
    }
    if (d >= l2) {
      return { text: `🟠 إنذار ثانٍ (${l2}-${l3 - 1})`, bg: "#ffedd5", color: "#9a3412", rowBg: "background:rgba(255,237,213,0.15);" };
    }
    if (d >= l1) {
      return { text: `🟡 إنذار أول (${l1}-${l2 - 1})`, bg: "#fef3c7", color: "#92400e", rowBg: "background:rgba(254,243,199,0.15);" };
    }
    if (d > 0) {
      return { text: `دون حد الإنذار (${d} أيام)`, bg: "#f1f5f9", color: "#475569", rowBg: "" };
    }
    return { text: "منتظم (0 غياب)", bg: "#f0fdf4", color: "#166534", rowBg: "" };
  }

  function wrapPrintToolbar(html, titleText) {
    const safeTitle = String(titleText || "معاينة وطباعة").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
    const toolbarAndScript = `
<style>
  @media print { .nepras-print-toolbar { display: none !important; } }
  .nepras-print-toolbar {
    position: sticky; top: 0; z-index: 99999;
    background: #0f172a; color: #fff; padding: 10px 18px;
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2); margin-bottom: 12px;
  }
  .nepras-print-toolbar button {
    background: #2563eb; color: #fff; border: 0; border-radius: 6px;
    padding: 7px 16px; font-weight: 700; font-size: 13px; cursor: pointer;
  }
  .nepras-print-toolbar button:hover { background: #1d4ed8; }
</style>
<div class="nepras-print-toolbar">
  <div style="font-weight:700;font-size:14px;">${safeTitle}</div>
  <button type="button" onclick="window.print()">🖨️ طباعة الآن</button>
</div>
<script>
  window.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() { window.print(); }, 350);
  });
</script>`;
    return String(html || "").includes("<body")
      ? String(html).replace(/<body[^>]*>/i, (m) => m + toolbarAndScript)
      : (toolbarAndScript + String(html || ""));
  }

  return Object.freeze({ getAbsenceBadgeInfo, wrapPrintToolbar });
});
