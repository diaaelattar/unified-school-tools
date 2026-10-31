(() => {
  "use strict";
  if (globalThis.__NEPRAS_PAGE_LOADER__) return;
  globalThis.__NEPRAS_PAGE_LOADER__ = true;

  // 🔐 حفظ واستعادة جلسة الدخول (sessionStorage <-> localStorage) في مواقع الوزارة قبل إقلاع Angular
  try {
    const BACKUP_KEY = "__nepras_session_backup_v1__";
    const isEmis = /(^|\.)emis\.gov\.eg$/i.test(location.hostname || "");
    if (isEmis && typeof localStorage !== "undefined" && typeof sessionStorage !== "undefined") {
      if (/\/logout|\/LogOff/i.test(location.pathname || "")) {
        try { localStorage.removeItem(BACKUP_KEY); } catch (_) {}
      } else {
        try {
          const rawBackup = localStorage.getItem(BACKUP_KEY);
          if (rawBackup) {
            const parsed = JSON.parse(rawBackup);
            if (parsed && typeof parsed === "object") {
              for (const k of Object.keys(parsed)) {
                if (k && k !== BACKUP_KEY && sessionStorage.getItem(k) == null && parsed[k] != null) {
                  sessionStorage.setItem(k, String(parsed[k]));
                }
              }
            }
          }
        } catch (_) {}

        const syncBackup = () => {
          try {
            if (/\/logout|\/LogOff/i.test(location.pathname || "")) return;
            const snap = {};
            let hasAny = false;
            for (let i = 0; i < sessionStorage.length; i++) {
              const sk = sessionStorage.key(i);
              if (!sk || sk === BACKUP_KEY) continue;
              const sv = sessionStorage.getItem(sk);
              if (sv != null && sv !== "") {
                snap[sk] = sv;
                hasAny = true;
              }
            }
            if (hasAny) localStorage.setItem(BACKUP_KEY, JSON.stringify(snap));
          } catch (_) {}
        };
        syncBackup();
        setInterval(syncBackup, 2500);
      }
    }
  } catch (_) {}

  let injectionRequested = false;
  let bridgeRequested = false;

  async function requestBridge() {
    if (bridgeRequested || !/teacher\.emis\.gov\.eg/i.test(location.hostname)) return;
    bridgeRequested = true;
    try {
      const res = await chrome.runtime.sendMessage({ action: 'NEPRAS_REQUEST_BRIDGE_INJECTION' });
      if (!res?.ok) bridgeRequested = false;
    } catch (_) { bridgeRequested = false; }
  }

  async function requestFullInjection() {
    if (injectionRequested) return;
    injectionRequested = true;
    try {
      const res = await chrome.runtime.sendMessage({ action: 'NEPRAS_REQUEST_SITE_INJECTION' });
      if (res?.ok) globalThis.__NEPRAS_SITE_INJECTION_CONFIRMED__ = true;
      else injectionRequested = false;
    } catch (_) { injectionRequested = false; }
  }

  async function start() {
    // جسر صفحة المعلم يُحقن مبكرًا قدر الإمكان.
    await requestBridge();
    // باقي الأدوات تُحقن عند اكتمال تحميل الصفحة.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => requestFullInjection(), { once: true });
    } else {
      await requestFullInjection();
    }
  }

  start();
})();
