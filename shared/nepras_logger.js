"use strict";

/**
 * ==============================================================================
 * 📋 مسجل التشخيص الموحد لمنظومة نبراس (Nepras Unified Diagnostics Logger)
 * ------------------------------------------------------------------------------
 * • يحل محل ابتلاع الاستثناءات الصامت (Silent Exception Swallowing).
 * • يلتقط تلقائياً الأخطاء غير المعالجة (window.onerror / unhandledrejection).
 * • يسجل الأحداث والتحذيرات والأخطاء محلياً مع تطهير التوكنات والبيانات السرية.
 * • يدعم تصدير وتحميل سجل التشخيص (diagnostics.log) على المتصفح والديسكتوب والموبايل.
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.NeprasLogger = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const MAX_ENTRIES = 400;
  const buffer = [];
  let saveTimer = null;
  let internalLogging = false;

  const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
  const SENSITIVE_KEY_RE = /^(password|pass|pwd|token|accesstoken|refreshtoken|authorization|apikey|api_key|secret|cookie|set-cookie)$/i;

  function redactString(str) {
    return String(str || "").replace(JWT_RE, "[REDACTED_JWT]");
  }

  function sanitize(val, depth) {
    const d = depth || 0;
    if (val == null || val === "") return "";
    if (d > 4) return "[MaxDepth]";
    if (val instanceof Error) {
      return {
        name: val.name || "Error",
        message: redactString(val.message || ""),
        stack: val.stack ? redactString(val.stack.split("\n").slice(0, 6).join("\n")) : ""
      };
    }
    if (typeof val === "string") {
      return redactString(val);
    }
    if (typeof val === "number" || typeof val === "boolean") {
      return val;
    }
    if (typeof val === "object") {
      try {
        if (Array.isArray(val)) {
          return val.slice(0, 30).map((item) => sanitize(item, d + 1));
        }
        const copy = {};
        for (const k of Object.keys(val)) {
          if (SENSITIVE_KEY_RE.test(k)) {
            copy[k] = "***";
          } else {
            copy[k] = sanitize(val[k], d + 1);
          }
        }
        return copy;
      } catch (_) {
        return redactString(String(val));
      }
    }
    return redactString(String(val));
  }

  function getDesktopBridge() {
    try {
      if (typeof window !== "undefined") {
        if (window.nepDesktop) return window.nepDesktop;
        if (window.parent && window.parent !== window && window.parent.nepDesktop) {
          return window.parent.nepDesktop;
        }
      }
    } catch (_) {}
    return null;
  }

  function getHostBackend() {
    try {
      if (typeof window !== "undefined") {
        if (window.NeprasBackend) return window.NeprasBackend;
        if (window.parent && window.parent !== window && window.parent.NeprasBackend) {
          return window.parent.NeprasBackend;
        }
      }
    } catch (_) {}
    return null;
  }

  function scheduleStoragePersist() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        const slice = buffer.slice(-120);
        chrome.storage.local.set({ __nepras_diagnostics_recent__: slice }, () => {});
      } catch (_) {}
    }, 1200);
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
      level: String(level || "INFO").toUpperCase(),
      category: String(category || "SYSTEM"),
      message: redactString(String(message || "")),
      details: sanitize(details, 0)
    };

    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) {
      buffer.shift();
    }

    scheduleStoragePersist();

    // كتابة للأجهزة التي تمتلك nepDesktop IPC (سواء في النافذة الرئيسية أو داخل iframe)
    try {
      const desk = getDesktopBridge();
      if (desk && typeof desk.writeLog === "function") {
        desk.writeLog(entry).catch(() => {});
      }
    } catch (_) {}

    return entry;
  }

  // ربط تلقائي لالتقاط الأخطاء غير المعالجة والرفض غير المعالج للوعود (Promises)
  try {
    const g = root || (typeof globalThis !== "undefined" ? globalThis : null);
    if (g && !g.__neprasGlobalErrorHooked && typeof g.addEventListener === "function") {
      g.__neprasGlobalErrorHooked = true;

      g.addEventListener("error", (evt) => {
        try {
          const msg = (evt && evt.message) || "Uncaught runtime error";
          const loc = evt && evt.filename ? `${evt.filename}:${evt.lineno || 0}:${evt.colno || 0}` : "";
          addEntry("ERROR", "UNCAUGHT_ERROR", msg, {
            location: loc,
            error: evt && evt.error ? sanitize(evt.error, 0) : undefined
          });
        } catch (_) {}
      });

      g.addEventListener("unhandledrejection", (evt) => {
        try {
          const reason = evt ? evt.reason : "Unknown rejection";
          const msg = (reason && reason.message) ? reason.message : String(reason || "Unhandled Promise Rejection");
          addEntry("ERROR", "UNHANDLED_REJECTION", msg, sanitize(reason, 0));
        } catch (_) {}
      });
    }

    // ربط تحذيرات [Nepras Handled] وأخطاء console.error تلقائياً بالسجل التشخيصي
    if (typeof console !== "undefined" && !console.__neprasLoggerHooked) {
      console.__neprasLoggerHooked = true;
      const origWarn = typeof console.warn === "function" ? console.warn.bind(console) : null;
      const origError = typeof console.error === "function" ? console.error.bind(console) : null;

      if (origWarn) {
        console.warn = function (...args) {
          try {
            if (!internalLogging && args.length > 0 && typeof args[0] === "string" && args[0].includes("[Nepras")) {
              addEntry("WARN", "HANDLED", args[0], args.length > 1 ? args.slice(1) : "");
            }
          } catch (_) {}
          return origWarn.apply(console, args);
        };
      }

      if (origError) {
        console.error = function (...args) {
          try {
            if (!internalLogging && args.length > 0) {
              const first = typeof args[0] === "string" ? args[0] : (args[0] && args[0].message) || "Console Error";
              addEntry("ERROR", "CONSOLE", first, args.length > 1 ? args.slice(1) : args[0]);
            }
          } catch (_) {}
          return origError.apply(console, args);
        };
      }
    }
  } catch (_) {}

  return {
    info(category, message, details) {
      return addEntry("INFO", category, message, details);
    },
    warn(category, message, details) {
      const e = addEntry("WARN", category, message, details);
      if (typeof console !== "undefined" && console.warn) {
        internalLogging = true;
        try {
          console.warn(`[Nepras WARN][${category}] ${message}`, details || "");
        } finally {
          internalLogging = false;
        }
      }
      return e;
    },
    error(category, message, err) {
      const e = addEntry("ERROR", category, message, err);
      if (typeof console !== "undefined" && console.error) {
        internalLogging = true;
        try {
          console.error(`[Nepras ERROR][${category}] ${message}`, err || "");
        } finally {
          internalLogging = false;
        }
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
    exportAsText(extraLogText) {
      const header = `# سجل تشخيص منظومة نبراس لإدارة الحكومة الإلكترونية\n# تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}\n# عدد الأحداث في الذاكرة: ${buffer.length}\n--------------------------------------------------------------------------------\n`;
      const body = buffer
        .map((e) => `[${e.timestamp}] [${e.level}] [${e.category}] ${e.message} ${e.details ? JSON.stringify(e.details) : ""}`)
        .join("\n");
      let full = header + (body || "[INFO] لا توجد أحداث مسجلة في الجلسة الحالية.");
      if (extraLogText && typeof extraLogText === "string" && extraLogText.trim()) {
        full += "\n\n# --- السجل الدائم المحفوظ على الجهاز (diagnostics.log) ---\n" + extraLogText.trim();
      }
      return full;
    },
    downloadDiagnosticsFile() {
      const text = this.exportAsText();
      const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `nepras-diagnostics-${dateStr}.log`;
      try {
        const hostBackend = getHostBackend();
        const desk = getDesktopBridge();

        // إذا كنا في تطبيق الموبايل أو سطح المكتب ويتوفر حفظ أصلي عبر الباك إند
        if (hostBackend && typeof hostBackend.saveFile === "function") {
          (async () => {
            try {
              let extra = "";
              if (desk && typeof desk.getDiagnosticsLog === "function") {
                extra = await desk.getDiagnosticsLog().catch(() => "");
              }
              const finalTxt = this.exportAsText(extra);
              const bytes = new TextEncoder().encode(finalTxt);
              let bin = "";
              for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              const base64 = btoa(bin);
              await hostBackend.saveFile({
                filename,
                base64,
                mime: "text/plain;charset=utf-8"
              });
            } catch (_) {}
          })();
          if (hostBackend.platform === "android") {
            return true;
          }
        }

        if (typeof document !== "undefined") {
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            try { document.body.removeChild(a); } catch (_) {}
            URL.revokeObjectURL(url);
          }, 250);
          return true;
        }
      } catch (err) {
        if (typeof console !== "undefined") console.error("Failed to download diagnostics file:", err);
      }
      return false;
    }
  };
});
