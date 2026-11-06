"use strict";

/**
 * ==============================================================================
 * 🎴 وحدة التحكم في استوديو بطاقات وكارنيهات الطلاب (Nepras Cards Controller)
 * ------------------------------------------------------------------------------
 * • تدير فتح وتجهيز استوديو بطاقات الطلاب واستوديو بطاقات التطوير المهني.
 * • تضمن مزامنة شعار المدرسة المعتمد وإعدادات الطباعة.
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeprasCardsController = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  function launchCardsStudio(options = {}) {
    try {
      const url = chrome.runtime.getURL("student-cards.html");
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, "_blank");
      }
      return true;
    } catch (err) {
      if (globalThis.NeprasLogger) NeprasLogger.error("CARDS_CONTROLLER", "launchCardsStudio", err);
      return false;
    }
  }

  function launchTrainingCardsStudio() {
    try {
      const url = chrome.runtime.getURL("training-cards.html");
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, "_blank");
      }
      return true;
    } catch (err) {
      if (globalThis.NeprasLogger) NeprasLogger.error("CARDS_CONTROLLER", "launchTrainingCardsStudio", err);
      return false;
    }
  }

  return {
    init(ctx = {}) {
      const btnOpenCards = document.getElementById("btn-open-cards-studio");
      if (btnOpenCards) {
        btnOpenCards.addEventListener("click", () => {
          const ok = launchCardsStudio();
          if (!ok && ctx.showNotice) {
            ctx.showNotice("تعذر فتح استوديو البطاقات في نافذة مستقلة.", "error", "بطاقات الطلاب");
          }
        });
      }

      const btnOpenTraining = document.getElementById("btn-open-training-cards");
      if (btnOpenTraining) {
        btnOpenTraining.addEventListener("click", () => {
          const ok = launchTrainingCardsStudio();
          if (!ok && ctx.showNotice) {
            ctx.showNotice("تعذر فتح كروت التدريب في نافذة مستقلة.", "error", "كروت التدريب");
          }
        });
      }
    },
    launchCardsStudio,
    launchTrainingCardsStudio
  };
});
