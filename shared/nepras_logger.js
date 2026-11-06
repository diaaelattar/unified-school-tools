"use strict";

/**
 * ==============================================================================
 * 📋 مسجل التشخيص الموحد لمنظومة نبراس (Nepras Unified Diagnostics Logger)
 * ------------------------------------------------------------------------------
 * • يحل محل ابتلاع الاستثناءات الصامت (Silent Exception Swallowing).
 * • يسجل الأحداث والتحذيرات والأخطاء محلياً بدون إرسال أي بيانات شخصية للخارج.
 * • يدعم تصدير وتحميل سجل التشخيص (diagnostics.log) لحل المشاكل الميدانية فوراً.
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeprasLogger = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MAX_ENTRIES = 350;
  const buffer = [];
  let saveTimer = null;

  function sanitize(val) {
    if (!val) return "";
    if (val instanceof Error) {
      return {
        name: val.name,
        message: val.message,
        stack: val.stack ? val.stack.split("\n").slice(0, 5).join("\n") : ""
      };
    }
    if (typeof val === "object") {
      try {
        const copy = Array.isArray(val) ? [...val] : { ...val };
        if (copy.password) copy.password = "***";
        if (copy.token) copy.token = "***";
        if (copy.Authorization) copy.Authorization = "***";
        return copy;
      } catch (_) {
        return String(val);
      }
    }
    return String(val);
  }

  function scheduleStoragePersist() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        const slice = buffer.slice(-100);
        chrome.storage.local.set({ __nepras_diagnostics_recent__: slice }, () => {});
      } catch (_) {}
    }, 1500);
  }

  // استعادة الأحداث السابقة من التخزين المحلي إن وجدت
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["__nepras_diagnostics_recent__"], (res) => {
        if (res && Array.isArray(res.__nepras_diagnostics_recent__)) {
          const past = res.__nepras_diagnostics_recent__;
          for (let i = 0; i < past.length; i++) {
            if (buffer.length < MAX_ENTRIES) buffer.unshift(past[i]);
          }
        }
      });
    }
  } catch (_) {}

  function addEntry(level, category, message, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      category: String(category || "SYSTEM"),
      message: String(message || ""),
      details: sanitize(details)
    };

    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) {
      buffer.shift();
    }

    scheduleStoragePersist();

    // كتابة للأجهزة التي تمتلك nepDesktop IPC
    try {
      if (typeof window !== "undefined" && window.nepDesktop && typeof window.nepDesktop.writeLog === "function") {
        window.nepDesktop.writeLog(entry).catch(() => {});
      }
    } catch (_) {}

    return entry;
  }

  return {
    info(category, message, details) {
      return addEntry("INFO", category, message, details);
    },
    warn(category, message, details) {
      const e = addEntry("WARN", category, message, details);
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[Nepras WARN][${category}] ${message}`, details || "");
      }
      return e;
    },
    error(category, message, err) {
      const e = addEntry("ERROR", category, message, err);
      if (typeof console !== "undefined" && console.error) {
        console.error(`[Nepras ERROR][${category}] ${message}`, err || "");
      }
      return e;
    },
    getEntries() {
      return buffer.slice();
    },
    clear() {
      buffer.length = 0;
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove("__nepras_diagnostics_recent__", () => {});
        }
      } catch (_) {}
    },
    exportAsText() {
      const header = `# سجل تشخيص منظومة نبراس لإدارة الحكومة الإلكترونية\n# تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}\n# عدد الأحداث: ${buffer.length}\n--------------------------------------------------------------------------------\n`;
      const body = buffer
        .map((e) => `[${e.timestamp}] [${e.level}] [${e.category}] ${e.message} ${e.details ? JSON.stringify(e.details) : ""}`)
        .join("\n");
      return header + (body || "[INFO] لا توجد أحداث مسجلة بعد.");
    },
    downloadDiagnosticsFile() {
      const text = this.exportAsText();
      const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `nepras-diagnostics-${dateStr}.log`;
      try {
        if (typeof document !== "undefined") {
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 200);
          return true;
        }
      } catch (err) {
        if (typeof console !== "undefined") console.error("Failed to download diagnostics file:", err);
      }
      return false;
    }
  };
});
