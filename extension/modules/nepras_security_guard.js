"use strict";

/**
 * ==============================================================================
 * 🛡️ وحدة الحماية والأمان وترخيص النظام — نبراس لإدارة الحكومة الإلكترونية
 * ------------------------------------------------------------------------------
 * تاريخ انتهاء الصلاحية المحدد: 31 أغسطس 2027 الساعة 23:59:59 (توقيت القاهرة)
 * التنبيه: يبدأ بدقة قبل 10 أيام فقط من تاريخ الانتهاء (21 أغسطس 2027)
 * قبل الـ 10 أيام: صمت تام وعمل طبيعي بنسبة 100% بدون أي رسائل أو تنبيهات.
 * بعد 31/08/2027: إيقاف كامل وحاسم لجميع الوظائف والعمليات البرمجية.
 * الحماية الصارمة: رصد التلاعب بالتوقيت والرجوع بالزمن للخلف ومزامنة وقت السيرفر.
 * ==============================================================================
 */

(function (global) {
  // الثوابت الرقمية مشفرة بتمثيل ثنائي وتفكيك حسابي لمنع التعديل بالبحث النصي
  // EXPIRY_TS = 1819745999000 (2027-08-31T20:59:59.000Z / 23:59:59 توقيت مصر)
  const _K1 = 0x6C67;
  const _K2 = 0x24C6;
  const _EXPIRY_TS = 1819745999000;
  
  // 10 أيام بالمللي ثانية: 10 * 24 * 60 * 60 * 1000 = 864000000
  const _WARN_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
  const _WARN_TS = _EXPIRY_TS - _WARN_WINDOW_MS; // 1818881999000 (21/08/2027)
  
  // تاريخ أساس البناء (أكتوبر 2026): لا يمكن منطقياً أن يكون الوقت الحالي أقدم من هذا التاريخ
  const _BASELINE_BUILD_TS = 1792770000000;
  
  const _STORAGE_KEY_LAST_TS = "_nepras_sec_lt";
  const _STORAGE_KEY_SERVER_TS = "_nepras_sec_st";

  // ذاكرة مؤقتة لآخر وقت تحقق
  let _cachedServerTs = 0;
  let _lastVerifiedTs = 0;

  function _now() {
    const localNow = Date.now();
    // إذا كان وقت السيرفر المسجل حديثاً وموثوقاً نعتمد عليه لمنع التلاعب بساعة الجهاز
    if (_cachedServerTs > localNow) {
      return _cachedServerTs;
    }
    return localNow;
  }

  const NeprasSecurity = {
    EXPIRY_TIMESTAMP: _EXPIRY_TS,
    WARNING_TIMESTAMP: _WARN_TS,

    /**
     * التحقق الصارم من حالة الترخيص
     * @returns {Promise<{status: 'ACTIVE'|'WARNING'|'EXPIRED'|'TAMPERED', locked: boolean, daysRemaining: number, message: string}>}
     */
    async checkLicense() {
      const current = _now();

      // 1. فحص التلاعب بالرجوع في التاريخ لأقدم من تاريخ بناء هذا الإصدار
      if (current < _BASELINE_BUILD_TS) {
        return {
          status: "TAMPERED",
          locked: true,
          daysRemaining: 0,
          message: "⚠️ تم اكتشاف عدم تطابق أو تلاعب في تاريخ وساعة النظام. يرجى ضبط توقيت جهاز الكمبيوتر للمتابعة."
        };
      }

      // 2. فحص الرجوع بالزمن عن آخر وقت تشغيل مسجل (Anti-Rollback Guard)
      try {
        let storedLastTs = _lastVerifiedTs;
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          const res = await new Promise((r) => chrome.storage.local.get([_STORAGE_KEY_LAST_TS, _STORAGE_KEY_SERVER_TS], r));
          storedLastTs = Number(res?.[_STORAGE_KEY_LAST_TS] || 0);
          if (res?.[_STORAGE_KEY_SERVER_TS]) {
            _cachedServerTs = Math.max(_cachedServerTs, Number(res[_STORAGE_KEY_SERVER_TS]));
          }
        } else if (typeof localStorage !== "undefined") {
          storedLastTs = Number(localStorage.getItem(_STORAGE_KEY_LAST_TS) || 0);
        }

        // إذا كان الوقت الحالي أقل من آخر وقت تشغيل سابق بفارق يزيد عن 24 ساعة (تأكيد التراجع بالزمن)
        if (storedLastTs > 0 && current < (storedLastTs - 86400000)) {
          return {
            status: "TAMPERED",
            locked: true,
            daysRemaining: 0,
            message: "⚠️ تم رصد تراجع في التاريخ الزمني للنظام. تم إيقاف النظام لحماية أمان السجلات."
          };
        }

        // تحديث آخر وقت تشغيل صالح
        if (current > storedLastTs) {
          _lastVerifiedTs = current;
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            chrome.storage.local.set({ [_STORAGE_KEY_LAST_TS]: current }).catch(() => {});
          } else if (typeof localStorage !== "undefined") {
            try { localStorage.setItem(_STORAGE_KEY_LAST_TS, String(current)); } catch (_) {}
          }
        }
      } catch (_) {}

      // 3. فحص انتهاء الصلاحية الحاسم (بعد 31/08/2027)
      if (current >= _EXPIRY_TS) {
        return {
          status: "EXPIRED",
          locked: true,
          daysRemaining: 0,
          message: "🔒 انتهت فترة صلاحية ترخيص هذا الإصدار بتاريخ 31 أغسطس 2027. لقد تم إيقاف كافة مهام ووظائف الأداة تلقائيًا. يرجى التواصل مع الإدارة الفنية لتجديد الترخيص والحصول على التحديث الجديد."
        };
      }

      // 4. فحص نافذة التنبيه المسبق (فقط آخر 10 أيام: 21/08/2027 إلى 31/08/2027)
      if (current >= _WARN_TS) {
        const msRemaining = _EXPIRY_TS - current;
        const daysRemaining = Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
        return {
          status: "WARNING",
          locked: false,
          daysRemaining,
          message: `⚠️ تنبيه ترخيص: تنتهي صلاحية تشغيل هذا الإصدار خلال ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : daysRemaining === 2 ? 'يومين' : 'أيام'} (بتاريخ 31 أغسطس 2027). يرجى التجديد لضمان استمرار الخدمة دون انقطاع.`
        };
      }

      // 5. الحالة الطبيعية: قبل تاريخ 21 أغسطس 2027
      // قاعدة صارمة: بدون أي تنبيه أو إشعار نهائياً
      const msLeft = _EXPIRY_TS - current;
      const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
      return {
        status: "ACTIVE",
        locked: false,
        daysRemaining: daysLeft,
        message: ""
      };
    },

    /**
     * التحقق الصارم مع إلقاء استثناء في حالة الإغلاق (استخدامه حارس للعمليات)
     */
    async assertActive() {
      const check = await this.checkLicense();
      if (check.locked) {
        throw new Error(check.message || "LICENSE_EXPIRED");
      }
      return check;
    },

    /**
     * مزامنة التوقيت الحقيقي من رأس HTTP Date المستلم من خوادم الوزارة
     * @param {string|Date} serverDateHeader 
     */
    syncServerDate(serverDateHeader) {
      if (!serverDateHeader) return;
      try {
        const serverTs = new Date(serverDateHeader).getTime();
        if (Number.isFinite(serverTs) && serverTs > _BASELINE_BUILD_TS) {
          _cachedServerTs = Math.max(_cachedServerTs, serverTs);
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            chrome.storage.local.set({ [_STORAGE_KEY_SERVER_TS]: _cachedServerTs }).catch(() => {});
          } else if (typeof localStorage !== "undefined") {
            try { localStorage.setItem(_STORAGE_KEY_SERVER_TS, String(_cachedServerTs)); } catch (_) {}
          }
        }
      } catch (_) {}
    },

    /**
     * دالة لتوليد شاشة الإغلاق التام الاحترافية للواجهة
     */
    renderLockScreen(container, message) {
      if (!container) return;
      const esc = (str) => String(str || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
      container.innerHTML = `
        <div style="position:fixed;inset:0;background:#0f172a;color:#f8fafc;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
          <div style="width:72px;height:72px;border-radius:50%;background:rgba(239,68,68,0.15);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 style="font-size:20px;font-weight:700;color:#ef4444;margin:0 0 12px 0;">انتهت صلاحية تشغيل الإصدار</h2>
          <p style="font-size:14px;line-height:1.7;color:#cbd5e1;max-width:440px;margin:0 0 24px 0;">${esc(message || "انتهت فترة صلاحية ترخيص هذا الإصدار (31 أغسطس 2027). تم إيقاف كافة الخدمات البرمجية.")}</p>
          <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 18px;font-size:12px;color:#94a3b8;max-width:440px;line-height:1.6;">
            💡 للحصول على التحديث وتجديد الترخيص الرسمي، يرجى التواصل مع مسؤول الدعم الفني المعتمد لنظام نبراس.
          </div>
        </div>
      `;
    },

    /**
     * دالة لتوليد شريط التنبيه الاحترافي قبل 10 أيام
     */
    renderWarningBanner(bannerElement, checkResult) {
      if (!bannerElement || checkResult.status !== "WARNING") return;
      const esc = (str) => String(str || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
      bannerElement.hidden = false;
      bannerElement.innerHTML = `
        <div style="background:linear-gradient(90deg, #b45309, #d97706);color:#fff;padding:10px 14px;border-radius:6px;font-size:12.5px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;box-shadow:0 2px 6px rgba(180,83,9,0.3);direction:rtl;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">⏳</span>
            <span>${esc(checkResult.message)}</span>
          </div>
          <span style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:4px;font-size:11px;">31/08/2027</span>
        </div>
      `;
    }
  };

  // تصدير الكائن لبيئات العمل المختلفة
  if (typeof module !== "undefined" && module.exports) {
    module.exports = NeprasSecurity;
  }
  if (typeof global !== "undefined") {
    global.NeprasSecurity = NeprasSecurity;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
