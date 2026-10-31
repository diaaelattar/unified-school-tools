/* Mobile (Capacitor) platform backend. Talks to native EmisBrowserPlugin. */
(function () {
  "use strict";
  const handlers = {};
  const on = (evt, cb) => { (handlers[evt] = handlers[evt] || []).push(cb); };
  const emit = (evt, ...a) => (handlers[evt] || []).forEach((cb) => { try { cb(...a); } catch (e) { console.error(e); } });

  let _plugin = null;
  function getPlugin() {
    if (_plugin) return _plugin;
    if (window.Capacitor) {
      if (typeof window.Capacitor.registerPlugin === "function") {
        try { _plugin = window.Capacitor.registerPlugin("EmisBrowser"); } catch (_) {}
      }
      if (!_plugin && window.Capacitor.Plugins && window.Capacitor.Plugins.EmisBrowser) {
        _plugin = window.Capacitor.Plugins.EmisBrowser;
      }
    }
    return _plugin;
  }

  let activeTabId = 1;
  let listenersAdded = false;

  function ensureListeners() {
    if (listenersAdded) return;
    const P = getPlugin();
    if (P && typeof P.addListener === "function") {
      listenersAdded = true;
      P.addListener("tabUpdate", (data) => {
        emit("tabUpdate", activeTabId, data);
      });

      P.addListener("tabLoaded", (data) => {
        emit("tabLoaded", activeTabId, data.url);
      });

      P.addListener("tabMessage", (data) => {
        try {
          const obj = typeof data.raw === "string" ? JSON.parse(data.raw) : data.raw;
          emit("tabMessage", activeTabId, obj);
        } catch (e) {
          console.error("tabMessage parse error:", e);
        }
      });

      P.addListener("webRequest", (data) => {
        try {
          if (data && data.name && data.details) {
            emit("request", data.name, data.details);
          }
        } catch (e) {
          console.error("webRequest parse error:", e);
        }
      });

      P.addListener("switchView", (data) => {
        try {
          if (data && data.view) emit("switchView", data.view);
        } catch (_) {}
      });
    }
  }

  setInterval(ensureListeners, 100);

  const backend = {
    platform: "android",
    on,
    loadState: async () => {
      try { return localStorage.getItem("nepras_mobile_state"); } catch (_) { return null; }
    },
    saveState: async (s) => {
      try { localStorage.setItem("nepras_mobile_state", s); } catch (_) {}
    },

    async createTab(id, url, opts) {
      activeTabId = id;
      ensureListeners();
      const P = getPlugin();
      if (P) {
        await P.init({ url: url || "https://student.emis.gov.eg/", visible: true });
      }
      emit("tabUpdate", id, { status: "complete", url: url || "https://student.emis.gov.eg/", title: "بيانات التلميذ والمعلم" });
    },

    async navigate(id, url) {
      activeTabId = id;
      const P = getPlugin();
      if (P) {
        emit("tabUpdate", id, { status: "loading", url });
        await P.navigate({ url });
      }
    },

    async reloadTab(id) {
      const P = getPlugin();
      if (P) await P.reload();
    },

    goBack(id) {
      const P = getPlugin();
      if (P) P.goBack();
    },

    goForward(id) {
      const P = getPlugin();
      if (P) P.goForward();
    },

    async removeTab(id) {
      // mobile single-view
    },

    setActiveTab(id) {
      activeTabId = id;
    },

    setBrowserVisible(visible) {
      const P = getPlugin();
      if (P) P.setVisible({ visible: !!visible });
    },

    async exec(id, code, world) {
      const P = getPlugin();
      if (!P) return { ok: false, error: "Native plugin not available" };
      try {
        const res = await P.executeScript({ code });
        let val = res && res.result;
        if (typeof val === "string") {
          const trimmed = val.trim();
          if (trimmed === "null" || trimmed === "undefined") {
            val = null;
          } else if (trimmed === "true") {
            val = true;
          } else if (trimmed === "false") {
            val = false;
          } else {
            try { val = JSON.parse(trimmed); } catch (_) {}
          }
        }
        return { ok: true, result: val };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },

    sendToTab(id, obj) {
      const P = getPlugin();
      if (P) {
        P.sendToTab({ data: JSON.stringify(obj) });
      }
    },

    setWebRequestUrls() {},

    async fetchUrl(opts) {
      const P = getPlugin();
      if (P && typeof P.fetchUrl === "function") {
        return P.fetchUrl(opts);
      }
      throw new Error("NATIVE_FETCH_UNAVAILABLE");
    },

    async saveFile({ filename, base64, mime }) {
      const P = getPlugin();
      if (P && typeof P.saveFile === "function") {
        try {
          const res = await P.saveFile({ filename, base64, mime });
          if (res && res.path) return res;
        } catch (err) {
          console.warn("Native saveFile fallback:", err);
        }
      }
      try {
        const bin = atob(base64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const blob = new Blob([u8], { type: mime || "application/octet-stream" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename.split("/").pop();
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
        return { path: filename, size: u8.length };
      } catch (e) {
        throw new Error("DOWNLOAD_FAILED: " + e.message);
      }
    },

    deleteFile: async () => {},
    openPath: async () => {},
    showItem: async () => {},
    openFolder: async () => {}
  };

  window.NeprasBackend = backend;
})();
