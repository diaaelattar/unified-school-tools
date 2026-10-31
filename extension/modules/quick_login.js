// ==========================================
// 🔐 NEPRAS QUICK LOGIN & CREDENTIAL VAULT: modules/quick_login.js
// ==========================================
// إدارة وحفظ بيانات دخول موقع الوزارة محلياً وبأمان، وتعبئتها تلقائياً
// ==========================================

(() => {
  "use strict";

  const STORAGE_KEY = "neprasMinistryAuthCredentials";
  const SETTINGS_KEY = "neprasMinistryAuthSettings";
  const CIPHER_KEY = [0x4E, 0x65, 0x70, 0x72, 0x61, 0x73, 0x56, 0x61, 0x75, 0x6C, 0x74, 0x32, 0x30, 0x32, 0x37]; // NeprasVault2027

  function encodeSecret(str) {
    if (!str) return "";
    try {
      const utf8Bytes = new TextEncoder().encode(String(str));
      const xorBytes = new Uint8Array(utf8Bytes.length);
      for (let i = 0; i < utf8Bytes.length; i++) {
        xorBytes[i] = utf8Bytes[i] ^ CIPHER_KEY[i % CIPHER_KEY.length];
      }
      let binary = "";
      for (let i = 0; i < xorBytes.length; i++) binary += String.fromCharCode(xorBytes[i]);
      return "v2:" + btoa(binary);
    } catch (_) {
      return String(str);
    }
  }

  function decodeSecret(str) {
    if (!str) return "";
    try {
      const s = String(str);
      if (s.startsWith("v2:")) {
        const binary = atob(s.slice(3));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i) ^ CIPHER_KEY[i % CIPHER_KEY.length];
        }
        return new TextDecoder().decode(bytes);
      }
      // توافق عكسي مع البيانات القديمة المخزنة بـ Base64
      return decodeURIComponent(escape(atob(s)));
    } catch (_) {
      return String(str);
    }
  }

  async function getStorageItem(key) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.get([key], (res) => resolve(res?.[key] || null));
        } else if (typeof localStorage !== "undefined") {
          const val = localStorage.getItem(key);
          resolve(val ? JSON.parse(val) : null);
        } else {
          resolve(null);
        }
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function setStorageItem(key, val) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.set({ [key]: val }, () => resolve(true));
        } else if (typeof localStorage !== "undefined") {
          localStorage.setItem(key, JSON.stringify(val));
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function removeStorageItem(key) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.remove([key], () => resolve(true));
        } else if (typeof localStorage !== "undefined") {
          localStorage.removeItem(key);
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (_) {
        resolve(false);
      }
    });
  }

  const NeprasQuickLogin = {
    STORAGE_KEY,
    SETTINGS_KEY,

    /**
     * إعدادات الخزنة الافتراضية
     */
    async getSettings() {
      const s = await getStorageItem(SETTINGS_KEY);
      return {
        autoFill: s?.autoFill !== false,      // تفعيل التعبئة التلقائية عند فتح الصفحة (افتراضي: نعم)
        autoLogin: s?.autoLogin !== false,    // الضغط التلقائي على تسجيل الدخول فور التعبئة (افتراضي: نعم)
        autoCapture: s?.autoCapture !== false // حفظ الحساب تلقائياً عند الضغط على تسجيل الدخول (افتراضي: نعم)
      };
    },

    async saveSettings(settings) {
      const cur = await this.getSettings();
      const next = Object.assign({}, cur, settings || {});
      await setStorageItem(SETTINGS_KEY, next);
      return next;
    },

    /**
     * حفظ بيانات الدخول مشفرة محلياً فقط على جهاز المستخدم، مع دعم تعدد الحسابات
     */
    async saveCredentials(username, password, opts = {}) {
      const u = String(username || "").trim();
      const p = String(password || "");
      if (!u || !p) {
        throw new Error("يرجى إدخال اسم المستخدم / البريد وكلمة المرور.");
      }

      const raw = (await getStorageItem(STORAGE_KEY)) || {};
      let accounts = Array.isArray(raw.accounts) ? raw.accounts : [];

      const encodedU = encodeSecret(u);
      const encodedP = encodeSecret(p);
      const now = new Date().toISOString();

      // تحديث أو إضافة الحساب في قائمة الحسابات
      const existingIdx = accounts.findIndex(acc => decodeSecret(acc.u).toLowerCase() === u.toLowerCase());
      const accountItem = {
        u: encodedU,
        p: encodedP,
        label: opts.label || (existingIdx >= 0 ? accounts[existingIdx].label : "") || u,
        updatedAt: now
      };

      if (existingIdx >= 0) {
        accounts[existingIdx] = accountItem;
      } else {
        accounts.unshift(accountItem);
      }
      if (accounts.length > 10) accounts = accounts.slice(0, 10);

      const payload = {
        u: encodedU,
        p: encodedP,
        accounts,
        updatedAt: now
      };

      await setStorageItem(STORAGE_KEY, payload);
      return { ok: true, username: u, updatedAt: now };
    },

    /**
     * استرجاع بيانات الدخول المحفوظة وفك تشفيرها (حساب محدد أو الحساب الافتراضي النشط)
     */
    async getCredentials(targetUsername = null) {
      const raw = await getStorageItem(STORAGE_KEY);
      if (!raw) return null;

      if (targetUsername && Array.isArray(raw.accounts)) {
        const found = raw.accounts.find(a => decodeSecret(a.u).toLowerCase() === String(targetUsername).trim().toLowerCase());
        if (found) {
          return {
            username: decodeSecret(found.u),
            password: decodeSecret(found.p),
            label: found.label || decodeSecret(found.u),
            updatedAt: found.updatedAt || ""
          };
        }
      }

      if (!raw.u || !raw.p) return null;
      return {
        username: decodeSecret(raw.u),
        password: decodeSecret(raw.p),
        updatedAt: raw.updatedAt || ""
      };
    },

    /**
     * استرجاع كل الحسابات المحفوظة
     */
    async getAllAccounts() {
      const raw = await getStorageItem(STORAGE_KEY);
      if (!raw) return [];
      if (Array.isArray(raw.accounts) && raw.accounts.length > 0) {
        return raw.accounts.map(a => ({
          username: decodeSecret(a.u),
          password: decodeSecret(a.p),
          label: a.label || decodeSecret(a.u),
          updatedAt: a.updatedAt || ""
        }));
      }
      if (raw.u && raw.p) {
        return [{
          username: decodeSecret(raw.u),
          password: decodeSecret(raw.p),
          label: decodeSecret(raw.u),
          updatedAt: raw.updatedAt || ""
        }];
      }
      return [];
    },

    /**
     * مسح بيانات الدخول نهائياً من الذاكرة المحلية
     */
    async clearCredentials() {
      await removeStorageItem(STORAGE_KEY);
      return { ok: true };
    },

    /**
     * التحقق مما إذا كانت الصفحة الحالية صفحة تسجيل دخول لمواقع الوزارة أو مصادقة مايكروسوفت
     */
    isLoginPage(url, doc = (typeof document !== "undefined" ? document : null)) {
      const u = String(url || "");
      const isEmisDomain = /emis\.gov\.eg/i.test(u);
      const isMsDomain = /login\.microsoftonline\.com|login\.live\.com/i.test(u);
      const isLoginPath = /\/login|\/Account\/Login|#\/login/i.test(u);

      if ((isEmisDomain || isMsDomain) && isLoginPath) return true;
      if (isMsDomain) return true;

      if (doc && (isEmisDomain || isMsDomain)) {
        const hasPass = !!doc.querySelector('input[type="password"], input[name="passwd"]');
        const hasLoginForm = !!doc.querySelector('form, [role="form"], .login-box, .login-container, #lightbox, .lightbox-cover');
        if (hasPass && hasLoginForm) return true;
      }
      return false;
    },

    /**
     * العثور على حقول إدخال اسم المستخدم وكلمة السر وزر الدخول في صفحة الوزارة ومايكروسوفت
     */
    findLoginElements(doc = (typeof document !== "undefined" ? document : null)) {
      if (!doc) return { usernameInput: null, passwordInput: null, submitButton: null };

      // 1. حقل كلمة السر (بما فيها حقل مايكروسوفت name="passwd" و id="i0118")
      const passInputs = Array.from(doc.querySelectorAll('input[type="password"], input[name="passwd"], input[id="i0118"], input[formcontrolname*="pass" i], input[name*="pass" i], input[id*="pass" i]'));
      const passwordInput = passInputs.find(el => el.offsetParent !== null) || passInputs[0] || null;

      // 2. حقل اسم المستخدم / البريد / الكود
      const userSelectors = [
        'input[type="email"]',
        'input[name="loginfmt"]',
        'input[id="i0116"]',
        'input[formcontrolname="userName"]',
        'input[formcontrolname="username"]',
        'input[formcontrolname="email"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'input[id*="user" i]',
        'input[id*="email" i]',
        'input[placeholder*="المسلسل"]',
        'input[placeholder*="المستخدم"]',
        'input[placeholder*="البريد"]',
        'input[placeholder*="كود"]'
      ];
      let usernameInput = null;
      for (const sel of userSelectors) {
        const found = Array.from(doc.querySelectorAll(sel)).find(el => el.offsetParent !== null);
        if (found) {
          usernameInput = found;
          break;
        }
      }

      // إذا لم يعثر بالمحددات الصريحة، ابحث عن أول حقل نصي ظاهر قبل حقل كلمة المرور
      if (!usernameInput && passwordInput) {
        const allInputs = Array.from(doc.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])'));
        usernameInput = allInputs.find(el => el.offsetParent !== null) || null;
      }

      // 3. زر الدخول (بما فيها زر مايكروسوفت #idSIButton9)
      const allButtons = Array.from(doc.querySelectorAll('button, input[type="submit"], #idSIButton9, a.btn, [role="button"]'));
      let submitButton = allButtons.find(b => {
        const txt = (b.innerText || b.value || b.textContent || "").trim();
        return /تسجيل\s*الدخول|دخول|تسجيل|Sign\s*in|Log\s*in|Next|التالي/i.test(txt);
      });

      if (!submitButton) {
        submitButton = doc.querySelector('#idSIButton9, button[type="submit"], input[type="submit"], form button.btn-primary');
      }

      return { usernameInput, passwordInput, submitButton };
    },

    /**
     * إدخال قيمة في حقل مع تنشيط دورة حياة Angular بشكل كامل وصحيح
     */
    setNativeValue(input, value) {
      if (!input) return false;
      try { input.focus(); } catch (_) {}

      const strVal = String(value);
      let desc = null;
      let cur = input;
      while (cur) {
        desc = Object.getOwnPropertyDescriptor(cur, "value");
        if (desc?.set) break;
        cur = Object.getPrototypeOf(cur);
      }

      if (desc?.set) {
        desc.set.call(input, strVal);
      } else {
        input.value = strVal;
      }
      if (input.value !== strVal) {
        input.value = strVal;
      }

      if (typeof Event !== "undefined") {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      }
      return true;
    },

    /**
     * تعبئة بيانات الدخول في الصفحة تلقائياً مع خيار الضغط على زر الدخول
     */
    autofill(doc = (typeof document !== "undefined" ? document : null), credentials, autoSubmit = false) {
      if (!credentials || !credentials.username || !credentials.password) {
        return { ok: false, message: "بيانات الدخول غير مكتملة." };
      }

      const { usernameInput, passwordInput, submitButton } = this.findLoginElements(doc);

      let filledUser = false;
      let filledPass = false;

      if (usernameInput) {
        filledUser = this.setNativeValue(usernameInput, credentials.username);
      }
      if (passwordInput) {
        filledPass = this.setNativeValue(passwordInput, credentials.password);
      }

      let submitted = false;
      if (autoSubmit && submitButton && (filledUser || filledPass)) {
        setTimeout(() => {
          try { submitButton.click(); } catch (_) {}
        }, 150);
        submitted = true;
      }

      return {
        ok: filledUser || filledPass,
        filledUser,
        filledPass,
        submitted,
        hasSubmitButton: !!submitButton
      };
    }
  };

  // التصدير للبيئات المختلفة
  if (typeof module !== "undefined" && module.exports) {
    module.exports = NeprasQuickLogin;
  }
  globalThis.NeprasQuickLogin = NeprasQuickLogin;
})();
