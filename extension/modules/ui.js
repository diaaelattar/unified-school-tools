// ==========================================
// 📦 MODULE: modules/ui.js (v1.0)
// واجهة مشتركة وآمنة.
// لا تنشئ شريط النقل بنفسها.
// تنظف أي شرائط نقل قديمة من النسخ السابقة عند ظهور الصفحة.
// ==========================================

function neprasIsTransferPageSafe() {
  const path = String(location.pathname || "");
  return /(?:\/student\/transfer-request|\/student\/transfer|\/transfer-request|\/employee-transfer)/i.test(path) ||
    !!document.querySelector("app-transfer-request");
}

function cleanupOldNeprasTransferToolbars() {
  // خارج صفحة النقل: امسح أي نسخة قديمة/مكررة مهما كان مصدرها.
  if (neprasIsTransferPageSafe()) return;

  const selectors = [
    "#neprasInPageBarTransfer",
    "#neprasQuickPanel",
    ".nepras-transfer-btn",
    ".nepras-transfer-fixed-btn",
    ".nepras-transfer-toolbar",
    "[data-nepras-transfer-toolbar]"
  ];

  document.querySelectorAll(selectors.join(",")).forEach(el => el.remove());

  // حماية إضافية ضد نسخ قديمة لم تستخدم ID/class ثابت:
  document.querySelectorAll("div,section,nav").forEach(el => {
    const txt = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (
      txt.includes("أدوات نبراس (طلبات النقل)") ||
      ((txt.includes("سحب بيانات جميع الصفوف") || txt.includes("تنزيل بيانات جميع الصفوف")) && txt.includes("طلبات النقل")) // نص اللوحات القديمة والجديدة
    ) {
      // لا نلمس حاويات الوزارة الأصلية إلا إذا كانت واضحة كلوحة نبراس.
      const hasNeprasTransferButtons =
        el.querySelector(".nepras-transfer-btn, .nepras-transfer-fixed-btn") ||
        txt.includes("أدوات نبراس (طلبات النقل)");
      if (hasNeprasTransferButtons) el.remove();
    }
  });
}

function initUI() {
  cleanupOldNeprasTransferToolbars();

  // كرر التنظيف بعد اكتمال Angular وأثناء تغيّر المسار داخل SPA.
  setTimeout(cleanupOldNeprasTransferToolbars, 500);
  setTimeout(cleanupOldNeprasTransferToolbars, 1500);
  setTimeout(cleanupOldNeprasTransferToolbars, 3000);

  setInterval(cleanupOldNeprasTransferToolbars, 2000);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  initUI();
} else {
  document.addEventListener("DOMContentLoaded", initUI, { once: true });
}

// أثناء تنقل Angular بدون Reload.
window.addEventListener("popstate", cleanupOldNeprasTransferToolbars);
window.addEventListener("hashchange", cleanupOldNeprasTransferToolbars);


(function neprasApplyUniversalButtonStyle(){
  const id = "nepras-universal-button-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    @font-face{
      font-family:"Nepras Sultan Black";
      src:local("SF Sultan Black"),local("SF Sultan"),local("Sultan Black");
      font-style:normal;font-weight:900;font-display:swap;
      unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF;
    }
    @font-face{
      font-family:"Nepras Sultan Medium";
      src:local("Sultan Medium"),local("Sultan_medium/ghayaty2020 medium"),local("Sultan_medium/ghayaty2020"),local("Sultan_medium"),local("Sultan medium");
      font-style:normal;font-weight:500;font-display:swap;
      unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF;
    }
    #neprasInPageBarMain, #neprasInPageBarDeep, #neprasInPageBarTransfer,
    [id^="nepras"], [id^="nepras"] *,
    #attendance-helper-toolbar, #attendance-helper-toolbar * {
      font-family:"Nepras Sultan Medium","Segoe UI",Tahoma,Arial,sans-serif !important;
    }
    #neprasInPageBarMain button, #neprasInPageBarDeep button, #neprasInPageBarTransfer button,
    [id^="nepras"] button, [id^="nepras"] b, [id^="nepras"] strong, [id^="nepras"] label,
    #attendance-helper-toolbar button, #attendance-helper-toolbar b, #attendance-helper-toolbar strong, #attendance-helper-toolbar label {
      font-family:"Nepras Sultan Medium","Segoe UI",Tahoma,Arial,sans-serif !important;
      font-weight: 900 !important;
    }
    #neprasInPageBarMain, #neprasInPageBarDeep, #neprasInPageBarTransfer,
    [id^="nepras"], #attendance-helper-toolbar {
      font-synthesis:weight !important;
    }
    #neprasInPageBarMain label, #neprasInPageBarDeep label, #neprasInPageBarTransfer label,
    [id^="nepras"] label, #attendance-helper-toolbar label {
      font-family:"Nepras Sultan Medium","Segoe UI",Tahoma,Arial,sans-serif !important;
      font-weight:500 !important;
      font-size:14px !important;
    }
    #neprasInPageBarMain button, #neprasInPageBarDeep button, #neprasInPageBarTransfer button,
    [id^="nepras"] button, #attendance-helper-toolbar button {
      font-size:14px !important;
      line-height:1.4 !important;
    }
    #neprasInPageBarMain button, #neprasInPageBarDeep button, #neprasInPageBarTransfer button {
      border-width: 2px !important;
      border-radius: 9px !important;
      min-height: 38px !important;
      box-shadow: 0 2px 7px rgba(15,23,42,.12) !important;
      transition: transform .12s ease, filter .12s ease !important;
    }
    #neprasInPageBarMain button:hover, #neprasInPageBarDeep button:hover, #neprasInPageBarTransfer button:hover {
      transform: translateY(-1px);
      filter: brightness(.96);
    }
  `;
  document.documentElement.appendChild(style);
})();

function neprasAggressiveStudentToolbarGuard() {
  // الحارس القديم كان يحذف حاويات كبيرة من صفحة الطلاب إذا احتوت نصوصًا
  // إقليمية متشابهة، وكان يمكن أن يحذف شريط نبراس نفسه بالخطأ.
  // نكتفي هنا بإزالة أزرار قديمة محددة، مع استثناء أشرطة نبراس الحالية.
  const isStudentList = /\/student\/list(?:\/|$)/i.test(String(location.pathname || "")) || !!document.querySelector("app-list-of-students");
  if (!isStudentList) return;

  const countryTokens = [
    "سحب القاهرة", "سحب الاسكندرية", "سحب الإسكندرية", "سحب بورسعيد", "سحب السويس",
    "سحب دمياط", "سحب الدقهلية", "سحب الشرقية", "سحب القليوبية", "سحب كفر الشيخ",
    "سحب الغربية", "سحب المنوفية", "سحب البحيرة", "سحب الاسماعيلية", "سحب الإسماعيلية",
    "سحب الجيزة", "سحب بنى سويف", "سحب بني سويف", "سحب الفيوم", "سحب المنيا",
    "سحب اسيوط", "سحب أسيوط", "سحب سوهاج", "سحب قنا", "سحب أسوان", "سحب البحر الاحمر",
    "سحب البحر الأحمر", "سحب الوادي الجديد", "سحب مطروح", "سحب شمال سيناء", "سحب جنوب سيناء",
    "سحب الاقصر", "سحب الأقصر"
  ];

  const sweep = () => {
    const nodes = Array.from(document.querySelectorAll("body button, body a"));
    for (const el of nodes) {
      if (el.closest("#neprasInPageBarMain, #neprasInPageBarDeep, #neprasInPageBarTransfer")) continue;
      const txt = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt) continue;
      if (countryTokens.includes(txt)) {
        el.remove();
      }
    }
  };

  sweep();
  const old = window.__neprasAggressiveStudentToolbarGuard;
  if (old && typeof old.disconnect === "function") old.disconnect();
  const observer = new MutationObserver(sweep);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.__neprasAggressiveStudentToolbarGuard = observer;
}

neprasAggressiveStudentToolbarGuard();
