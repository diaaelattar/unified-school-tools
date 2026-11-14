// ==========================================
// 🔐 NEPRAS QUICK LOGIN & CREDENTIAL VAULT: modules/quick_login.js
// ==========================================
// إدارة وحفظ بيانات دخول موقع الوزارة محلياً وبأمان، وتعبئتها تلقائياً
// ==========================================

(() => {
  "use strict";

  const STORAGE_KEY = "neprasMinistryAuthCredentials";
  const SETTINGS_KEY = "neprasMinistryAuthSettings";
  const VAULT_IDB_NAME = "nepras_vault_keystore";
  const VAULT_IDB_STORE = "keys";
  const VAULT_KEY_ID = "vault_aes_gcm_v3";
  let _inMemoryAesKey = null;

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function getSubtleCrypto() {
    if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
      return globalThis.crypto;
    }
    try {
      const nodeCrypto = require("crypto");
      if (nodeCrypto?.webcrypto?.subtle) return nodeCrypto.webcrypto;
    } catch (_) {}
    return null;
  }

  function openVaultKeyDb() {
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") return resolve(null);
      try {
        const req = indexedDB.open(VAULT_IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(VAULT_IDB_STORE)) {
            db.createObjectStore(VAULT_IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function getOrCreateAesKey() {
    if (_inMemoryAesKey) return _inMemoryAesKey;
    const webCrypto = getSubtleCrypto();
    if (!webCrypto?.subtle) {
      throw new Error("Web Crypto API غير متاح لتشفير بيانات الدخول بأمان.");
    }

    const db = await openVaultKeyDb();
    if (db) {
      const existing = await new Promise((resolve) => {
        try {
          const tx = db.transaction(VAULT_IDB_STORE, "readonly");
          const getReq = tx.objectStore(VAULT_IDB_STORE).get(VAULT_KEY_ID);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
      if (existing) {
        _inMemoryAesKey = existing;
        return existing;
      }
    }

    // مفتاح AES-GCM-256 عشوائي غير قابل للاستخراج (non-extractable) لكل تثبيت
    const key = await webCrypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(VAULT_IDB_STORE, "readwrite");
          tx.objectStore(VAULT_IDB_STORE).put(key, VAULT_KEY_ID);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (_) {
          resolve(false);
        }
      });
    }

    _inMemoryAesKey = key;
    return key;
  }

  async function encodeSecret(str) {
    if (!str) return "";
    const plain = String(str);

    // تفضيل التشفير عبر نظام التشغيل (Electron safeStorage / DPAPI) عند توفره
    if (typeof window !== "undefined" && typeof window.nepDesktop?.encryptSecret === "function") {
      try {
        const res = await window.nepDesktop.encryptSecret(plain);
        if (res && typeof res === "string") return "v4:" + res;
      } catch (_) {}
    }

    const webCrypto = getSubtleCrypto();
    const key = await getOrCreateAesKey();
    const iv = webCrypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plain);
    const cipherBuf = await webCrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );
    return `v3:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipherBuf))}`;
  }

  async function decodeSecret(str) {
    if (!str) return "";
    const s = String(str);
    try {
      if (s.startsWith("v4:")) {
        if (typeof window !== "undefined" && typeof window.nepDesktop?.decryptSecret === "function") {
          const dec = await window.nepDesktop.decryptSecret(s.slice(3));
          return typeof dec === "string" ? dec : "";
        }
        return "";
      }

      if (s.startsWith("v3:")) {
        const parts = s.split(":");
        if (parts.length !== 3) return "";
        const webCrypto = getSubtleCrypto();
        const key = await getOrCreateAesKey();
        const iv = base64ToBytes(parts[1]);
        const ct = base64ToBytes(parts[2]);
        const plainBuf = await webCrypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          key,
          ct
        );
        return new TextDecoder().decode(plainBuf);
      }

      // البيانات القديمة بـ XOR الثابت (v2:) لم تعد مدعومة لأسباب أمنية
      if (s.startsWith("v2:")) {
        return "";
      }

      // توافق عكسي مع البيانات القديمة المخزنة بـ Base64
      return decodeURIComponent(escape(atob(s)));
    } catch (_) {
      return "";
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

      const encodedU = await encodeSecret(u);
      const encodedP = await encodeSecret(p);
      const now = new Date().toISOString();

      // تحديث أو إضافة الحساب في قائمة الحسابات
      let existingIdx = -1;
      for (let i = 0; i < accounts.length; i++) {
        const decU = await decodeSecret(accounts[i].u);
        if (decU && decU.toLowerCase() === u.toLowerCase()) {
          existingIdx = i;
          break;
        }
      }
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
        const targetLower = String(targetUsername).trim().toLowerCase();
        for (const a of raw.accounts) {
          const decU = await decodeSecret(a.u);
          if (decU && decU.toLowerCase() === targetLower) {
            return {
              username: decU,
              password: await decodeSecret(a.p),
              label: a.label || decU,
              updatedAt: a.updatedAt || ""
            };
          }
        }
      }

      if (!raw.u || !raw.p) return null;
      const username = await decodeSecret(raw.u);
      const password = await decodeSecret(raw.p);
      if (!username || !password) return null;
      return {
        username,
        password,
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
        const list = [];
        for (const a of raw.accounts) {
          const username = await decodeSecret(a.u);
          const password = await decodeSecret(a.p);
          if (username && password) {
            list.push({
              username,
              password,
              label: a.label || username,
              updatedAt: a.updatedAt || ""
            });
          }
        }
        return list;
      }
      if (raw.u && raw.p) {
        const username = await decodeSecret(raw.u);
        const password = await decodeSecret(raw.p);
        if (!username || !password) return [];
        return [{
          username,
          password,
          label: username,
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
