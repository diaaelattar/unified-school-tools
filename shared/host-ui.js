/* Nepras host UI (shared by Desktop and Mobile). Requires host-core.js and platform-backend.js. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const backend = window.NeprasBackend;
  const isAndroid = backend.platform === "android";

  // Platform class
  document.body.className = "plat-" + (isAndroid ? "android" : "desktop") + " drawer-closed mode-overlay";

  const extBase = new URL("ext/", location.href).href;

  function toast(msg, ms = 2500) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), ms);
  }
  window.neprasToast = toast;

  // ---------------------------------------------------------------- Drawer & Dock Management
  let isDrawerOpen = false;
  let isDocked = localStorage.getItem("nepras_drawer_docked") === "1";

  function setDockMode(docked) {
    isDocked = !!docked;
    localStorage.setItem("nepras_drawer_docked", isDocked ? "1" : "0");
    document.body.classList.toggle("mode-docked", isDocked);
    document.body.classList.toggle("mode-overlay", !isDocked);
    const pinBtn = $("#btn-pin-drawer");
    if (pinBtn) pinBtn.classList.toggle("pinned", isDocked);
    requestAnimationFrame(notifyLayout);
  }

  function setDrawerOpen(open) {
    isDrawerOpen = !!open;
    document.body.classList.toggle("drawer-open", isDrawerOpen);
    document.body.classList.toggle("drawer-closed", !isDrawerOpen);
    requestAnimationFrame(notifyLayout);
  }

  function toggleDrawer() {
    setDrawerOpen(!isDrawerOpen);
  }

  function notifyLayout() {
    if (backend.layout) {
      const rect = hostRect();
      backend.layout(rect);
    }
  }

  function hostRect() {
    const el = $("#tab-host");
    if (!el) return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  // ---------------------------------------------------------------- Panel overlay (for tabs.create extension pages)
  let desktopLicenseState = null;
  const isDesktopWithLicense = !isAndroid && !!(window.nepDesktop && window.nepDesktop.getLicenseStatus);

  const panelFrames = new Map();
  const ui = {
    openPanel(tabId, url) {
      if (isDesktopWithLicense && desktopLicenseState && desktopLicenseState.locked) {
        core.removeTab(tabId);
        setDrawerOpen(true);
        toast("🔒 يرجى تفعيل الاشتراك السنوي لكود المدرسة أولاً", 3500);
        return;
      }
      const layer = $("#panel-layer");
      const wrap = document.createElement("div");
      wrap.className = "panel-container";

      const headerBar = document.createElement("div");
      headerBar.className = "panel-header-bar";

      const titleSpan = document.createElement("span");
      titleSpan.className = "panel-title";
      titleSpan.textContent = "معاينة المستند والطباعة — نبراس";

      const close = document.createElement("button");
      close.className = "close";
      close.textContent = "إغلاق النافذة ✕";
      close.onclick = () => core.removeTab(tabId);

      headerBar.append(titleSpan, close);

      const f = document.createElement("iframe");
      f.src = url;
      panelFrames.set(tabId, f);

      wrap.append(headerBar, f);
      wrap.dataset.tab = tabId;
      layer.append(wrap);
      layer.classList.remove("hidden");
      if (backend.setOverlay) backend.setOverlay(true);
    },
    closePanel(tabId) {
      const f = panelFrames.get(tabId);
      panelFrames.delete(tabId);
      if (f && f.parentElement) f.parentElement.remove();
      const layer = $("#panel-layer");
      if (!layer.children.length) {
        layer.classList.add("hidden");
        if (backend.setOverlay) backend.setOverlay(false);
      }
    },
    panelTabIdFor(win) {
      for (const [id, f] of panelFrames) if (f.contentWindow === win) return id;
      return undefined;
    },
    onActiveTab() {
      render();
    },
    onShowBrowser() {
      if (isAndroid) showView("browser");
    }
  };

  // ---------------------------------------------------------------- Tab Strip & Status
  let core;
  let lastSig = "";

  function updateAddressBar(activeTab) {
    const urlDisplay = $("#current-url-display");
    const statusDot = $("#tools-status-dot");
    const spinner = $("#loading-spinner");
    if (!urlDisplay || !activeTab) return;

    const rawUrl = activeTab.url || activeTab.pendingUrl || "";
    let clean = rawUrl;
    try {
      const u = new URL(rawUrl);
      clean = u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch (_) {}

    urlDisplay.textContent = clean || "جاري الاتصال بصفحة المدرسة...";

    // Status dot indicator
    if (statusDot) {
      const isEmis = /emis\.gov\.eg/i.test(rawUrl);
      const isLogin = /login\.microsoftonline\.com/i.test(rawUrl) || /\/login/i.test(rawUrl);
      if (isEmis && !isLogin) {
        statusDot.className = "status-dot ready";
        statusDot.title = "متصل ببيانات التلميذ والمعلم (نبراس جاهز)";
      } else {
        statusDot.className = "status-dot waiting";
        statusDot.title = isLogin ? "صفحة تسجيل الدخول" : "في انتظار صفحة المدرسة";
      }
    }

    // Spinner
    if (spinner) {
      spinner.classList.toggle("hidden", activeTab.status !== "loading");
    }

    // Active portal pill highlight
    $$(".portal-pill").forEach((pill) => {
      const target = pill.dataset.url;
      if (target && rawUrl.startsWith(target)) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    });
  }

  function render() {
    if (!core) return;
    const list = [...core.tabs.values()].filter((t) => t.kind === "web");
    const emptyHint = $("#empty-hint");
    if (emptyHint) emptyHint.classList.toggle("hidden", list.length > 0);

    const activeTab = core.tabs.get(core.activeTabId);
    updateAddressBar(activeTab);

    const sig = JSON.stringify(list.map((t) => [t.id, t.title, t.url, t.status])) + core.activeTabId;
    if (sig === lastSig) return;
    lastSig = sig;

    const strip = $("#tabstrip");
    if (!strip) return;
    strip.textContent = "";

    for (const t of list) {
      const chip = document.createElement("div");
      chip.className = "tabchip" + (t.id === core.activeTabId ? " active" : "");
      
      const label = document.createElement("span");
      let name = t.title || "";
      if (!name || name === "about:blank") {
        try { name = new URL(t.url).hostname; } catch (_) { name = "بيانات التلميذ والمعلم"; }
      }
      label.textContent = name;
      label.title = t.url || name;

      const x = document.createElement("b");
      x.textContent = "×";
      x.title = "إغلاق التبويب";
      x.onclick = (e) => {
        e.stopPropagation();
        core.removeTab(t.id);
      };

      chip.onclick = () => core.setActive(t.id);
      chip.append(label, x);
      strip.append(chip);
    }

    notifyLayout();
  }

  // ---------------------------------------------------------------- Mobile View Switching
  function showView(v) {
    const isBrowser = (v === "browser" || v === "student" || v === "teacher");
    document.body.classList.toggle("view-browser", isBrowser);
    document.body.classList.toggle("view-panel", v === "panel");
    const np = $("#nav-panel");
    const ns = $("#nav-student");
    const nt = $("#nav-teacher");
    const nb = $("#nav-browser");
    if (np) np.classList.toggle("active", v === "panel");
    if (ns) ns.classList.toggle("active", v === "student");
    if (nt) nt.classList.toggle("active", v === "teacher");
    if (nb) nb.classList.toggle("active", isBrowser);

    if (isAndroid) {
      setDrawerOpen(v === "panel");
      if (backend.setBrowserVisible) backend.setBrowserVisible(isBrowser);

      if (v === "student" && core) {
        const studentTab = [...core.tabs.values()].find((t) => (t.url || "").includes("student.emis.gov.eg"));
        if (studentTab) {
          core.setActive(studentTab.id);
        } else {
          core.createTab({ url: "https://student.emis.gov.eg/", active: true });
        }
      } else if (v === "teacher" && core) {
        const teacherTab = [...core.tabs.values()].find((t) => (t.url || "").includes("teacher.emis.gov.eg"));
        if (teacherTab) {
          core.setActive(teacherTab.id);
        } else {
          core.createTab({ url: "https://teacher.emis.gov.eg/", active: true });
        }
      }
    } else {
      if (backend.setBrowserVisible) backend.setBrowserVisible(true);
    }
    requestAnimationFrame(notifyLayout);
  }

  function loadFrame(frame, url) {
    return new Promise((resolve) => {
      frame.addEventListener("load", () => resolve(), { once: true });
      frame.src = url;
    });
  }

  async function waitFor(cond, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (cond()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  // ---------------------------------------------------------------- Boot & Wire Events
  async function main() {
    const manifest = await (await fetch(extBase + "manifest.json")).json();
    const verEl = $(".drawer-version");
    if (verEl && manifest && manifest.version) {
      verEl.textContent = "v" + manifest.version;
    }
    let messages = {};
    try { messages = await (await fetch(extBase + "_locales/ar/messages.json")).json(); } catch (_) {}
    core = NeprasHost.start({ backend, ui, extBase, manifest, messages });
    window.__neprasCore = core;
    await core.boot();

    // Background page first
    await loadFrame($("#bg-frame"), extBase + "_background.html");
    await waitFor(() => [...core.ctxs.values()].some((c) => c.role === "background"), 5000);

    // Panel frame
    await loadFrame($("#panel-frame"), extBase + "popup.html" + (isAndroid ? "?mobileFull=1" : ""));

    // Apply saved dock mode
    setDockMode(isDocked);

    // Drawer width restoration and resizer
    const savedW = localStorage.getItem("nepras_drawer_width");
    if (savedW && Number(savedW) >= 600) {
      document.documentElement.style.setProperty("--drawer-width", savedW + "px");
    }

    const resizer = $("#drawer-resizer");
    if (resizer) {
      let startX = 0, startW = 0;
      const onMouseMove = (e) => {
        const dx = startX - e.clientX;
        const newW = Math.max(680, Math.min(window.innerWidth - 120, startW + dx));
        document.documentElement.style.setProperty("--drawer-width", newW + "px");
        notifyLayout();
      };
      const onMouseUp = () => {
        resizer.classList.remove("active");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        const curW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--drawer-width")) || 720;
        localStorage.setItem("nepras_drawer_width", Math.round(curW));
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        notifyLayout();
      };
      resizer.addEventListener("mousedown", (e) => {
        startX = e.clientX;
        startW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--drawer-width")) || 720;
        resizer.classList.add("active");
        document.body.style.userSelect = "none";
        document.body.style.cursor = "ew-resize";
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });
    }

    // Initial drawer state:
    // On Desktop: keep drawer closed initially so user sees the clean full-screen portal & login!
    // On Android: default to browser view so Ministry portal and login load immediately
    if (isAndroid) {
      showView("student");
    } else {
      setDrawerOpen(false);
    }

    // Top Header & Drawer Buttons
    const btnToggleTools = $("#btn-toggle-tools");
    if (btnToggleTools) btnToggleTools.onclick = () => toggleDrawer();

    const fabTools = $("#fab-tools");
    if (fabTools) fabTools.onclick = () => setDrawerOpen(true);

    const btnCloseDrawer = $("#btn-close-drawer");
    if (btnCloseDrawer) btnCloseDrawer.onclick = () => setDrawerOpen(false);

    const backdrop = $("#drawer-backdrop");
    if (backdrop) backdrop.onclick = () => { if (!isDocked) setDrawerOpen(false); };

    const btnPinDrawer = $("#btn-pin-drawer");
    if (btnPinDrawer) btnPinDrawer.onclick = () => setDockMode(!isDocked);

    // Downloads folder
    const btnDownloads = $("#btn-open-downloads");
    if (btnDownloads) {
      btnDownloads.onclick = async () => {
        try {
          if (backend.openFolder) await backend.openFolder();
          else toast("مجلد التنزيلات: Documents/Nepras");
        } catch (e) {
          toast("تعذر فتح المجلد: " + e.message);
        }
      };
    }

    // DevTools
    const btnDevTools = $("#btn-devtools");
    if (btnDevTools) {
      if (window.nepDesktop && window.nepDesktop.toggleDevTools) {
        btnDevTools.onclick = () => window.nepDesktop.toggleDevTools();
      } else {
        btnDevTools.classList.add("hidden");
      }
    }

    // Fullscreen
    const btnFullscreen = $("#btn-fullscreen");
    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      };
    }

    // Navigation Controls
    const btnBack = $("#btn-back");
    if (btnBack) btnBack.onclick = () => backend.goBack && backend.goBack(core.activeTabId);

    const btnFwd = $("#btn-fwd");
    if (btnFwd) btnFwd.onclick = () => backend.goForward && backend.goForward(core.activeTabId);

    const btnReload = $("#btn-reload");
    if (btnReload) btnReload.onclick = () => core.activeTabId != null && backend.reloadTab(core.activeTabId);

    const btnHome = $("#btn-home");
    if (btnHome) btnHome.onclick = () => core.navigateActive("https://student.emis.gov.eg/");

    const btnNewTab = $("#btn-newtab");
    if (btnNewTab) btnNewTab.onclick = () => core.createTab({ url: "https://student.emis.gov.eg/", active: true });

    // Ministry Portals Switcher
    $$(".portal-pill, #empty-hint .portal-pill").forEach((b) => {
      b.onclick = () => {
        const url = b.dataset.url;
        if (url) {
          showView("browser");
          core.navigateActive(url);
        }
      };
    });

    // Mobile nav
    const navPanel = $("#nav-panel");
    if (navPanel) navPanel.onclick = () => showView("panel");

    const navStudent = $("#nav-student");
    if (navStudent) navStudent.onclick = () => showView("student");

    const navTeacher = $("#nav-teacher");
    if (navTeacher) navTeacher.onclick = () => showView("teacher");

    const navBrowser = $("#nav-browser");
    if (navBrowser) navBrowser.onclick = () => showView("student");

    // Listen to shim closePage message (when popup clicks its internal close button)
    window.addEventListener("message", (e) => {
      if (e.data && e.data.kind === "closePage") {
        if (isAndroid) {
          showView("browser");
        } else {
          setDrawerOpen(false);
        }
      }
    });

    // Window resize
    window.addEventListener("resize", notifyLayout);

    // Backend window.open & switchView
    backend.on("openWindow", (url) => {
      core.createTab({ url, active: true });
      showView("browser");
    });
    backend.on("switchView", (v) => {
      if (isAndroid && v) showView(v);
    });

    // Initial student portal tab
    await core.createTab({ url: "https://student.emis.gov.eg/", active: true });

    // ---------------------------------------------------------------- Desktop-Only Annual Subscription Gate
    if (isDesktopWithLicense) {
      const subBadgeBtn = $("#btn-desktop-sub-badge");
      const subBadgeText = $("#sub-badge-text");
      const gateEl = $("#desktop-license-gate");
      const statusBanner = $("#lic-status-banner");
      const codeInput = $("#lic-school-code-input");
      const keyInput = $("#lic-key-input");
      const serverInput = $("#lic-server-url-input");
      const btnCheckSchool = $("#btn-lic-check-school");
      const btnActivateKey = $("#btn-lic-activate-key");
      const btnSaveServer = $("#btn-lic-save-server");

      function renderDesktopLicense(st) {
        if (!st) return;
        desktopLicenseState = st;

        if (subBadgeBtn && subBadgeText) {
          subBadgeBtn.classList.remove("hidden", "sub-active", "sub-warn", "sub-locked");
          if (!st.locked && st.status === "ACTIVE") {
            subBadgeBtn.classList.add("sub-active");
            subBadgeText.textContent = `مشترك: كود ${st.schoolCode} (${st.daysRemaining} يوم)`;
          } else if (!st.locked && st.status === "TRIAL") {
            subBadgeBtn.classList.add("sub-active");
            subBadgeText.textContent = `فترة تجريبية: كود ${st.schoolCode} (متبقي ${st.daysRemaining} يوم)`;
          } else if (!st.locked && st.status === "WARNING") {
            subBadgeBtn.classList.add("sub-warn");
            subBadgeText.textContent = `ينتهي خلال ${st.daysRemaining} يوم (${st.schoolCode})`;
          } else if (st.schoolCode) {
            subBadgeBtn.classList.add("sub-locked");
            subBadgeText.textContent = st.status === "EXPIRED_TRIAL" ? `انتهت التجربة: كود ${st.schoolCode}` : `غير مشترك: كود ${st.schoolCode}`;
          } else {
            subBadgeBtn.classList.add("sub-locked");
            subBadgeText.textContent = "تفعيل اشتراك المدرسة";
          }
        }

        if (gateEl) {
          gateEl.classList.toggle("hidden", !st.locked);
        }
        const panelFrame = $("#panel-frame");
        if (panelFrame) {
          panelFrame.style.pointerEvents = st.locked ? "none" : "auto";
        }

        if (codeInput && st.schoolCode && document.activeElement !== codeInput) {
          codeInput.value = st.schoolCode;
        }
        if (serverInput && st.serverUrl && document.activeElement !== serverInput) {
          serverInput.value = st.serverUrl;
        }

        if (statusBanner) {
          statusBanner.classList.remove("lic-banner-warn", "lic-banner-error", "lic-banner-ok");
          if (!st.locked) {
            statusBanner.classList.add("lic-banner-ok");
          } else if (st.status === "EXPIRED" || st.status === "EXPIRED_TRIAL" || st.status === "SUSPENDED" || st.status === "TAMPERED") {
            statusBanner.classList.add("lic-banner-error");
          } else {
            statusBanner.classList.add("lic-banner-warn");
          }
          statusBanner.textContent = st.message || "";
        }
      }

      if (subBadgeBtn) {
        subBadgeBtn.onclick = () => {
          setDrawerOpen(true);
          if (desktopLicenseState && !desktopLicenseState.locked) {
            const expStr = desktopLicenseState.expiresAt
              ? new Date(desktopLicenseState.expiresAt).toLocaleDateString("ar-EG")
              : "";
            if (desktopLicenseState.status === "TRIAL") {
              toast(`⏱️ فترة تجريبية مجانية | كود المدرسة: ${desktopLicenseState.schoolCode} | صالحة حتى: ${expStr} (متبقي ${desktopLicenseState.daysRemaining} يوم)`, 5000);
            } else {
              toast(`✅ اشتراك سنوي نشط | كود المدرسة: ${desktopLicenseState.schoolCode} | صالح حتى: ${expStr} (متبقي ${desktopLicenseState.daysRemaining} يوم)`, 4500);
            }
          }
        };
      }

      if (btnCheckSchool) {
        btnCheckSchool.onclick = async () => {
          const code = (codeInput?.value || "").trim();
          const srv = (serverInput?.value || "").trim();
          btnCheckSchool.disabled = true;
          btnCheckSchool.textContent = "جاري الفحص...";
          try {
            const res = await window.nepDesktop.checkSchoolLicense({ schoolCode: code, serverUrl: srv || undefined });
            if (res?.status) renderDesktopLicense(res.status);
            toast(res?.message || "تم فحص حالة اشتراك المدرسة", 4000);
          } catch (e) {
            toast("تعذر الفحص: " + e.message, 4000);
          } finally {
            btnCheckSchool.disabled = false;
            btnCheckSchool.textContent = "🔄 فحص التفعيل التلقائي";
          }
        };
      }

      if (btnActivateKey) {
        btnActivateKey.onclick = async () => {
          const code = (codeInput?.value || "").trim();
          const key = (keyInput?.value || "").trim();
          const srv = (serverInput?.value || "").trim();
          if (!code) return toast("يرجى إدخال كود المدرسة أو تسجيل الدخول أولاً", 3500);
          if (!key) return toast("يرجى إدخال مفتاح التفعيل السنوي", 3500);
          btnActivateKey.disabled = true;
          btnActivateKey.textContent = "جاري التفعيل...";
          try {
            const res = await window.nepDesktop.activateSchoolKey({
              schoolCode: code,
              licenseKey: key,
              serverUrl: srv || undefined
            });
            if (res?.status) renderDesktopLicense(res.status);
            toast(res?.message || "تمت عملية التفعيل", 4500);
            if (res?.ok) keyInput.value = "";
          } catch (e) {
            toast("خطأ أثناء التفعيل: " + e.message, 4000);
          } finally {
            btnActivateKey.disabled = false;
            btnActivateKey.textContent = "✅ تفعيل الاشتراك السنوي";
          }
        };
      }

      if (btnSaveServer) {
        btnSaveServer.onclick = async () => {
          const srv = (serverInput?.value || "").trim();
          if (!srv) return;
          try {
            const st = await window.nepDesktop.setLicenseServerUrl(srv);
            if (st) renderDesktopLicense(st);
            toast("تم حفظ رابط سيرفر التراخيص بنجاح", 3000);
          } catch (e) {
            toast(e.message, 3500);
          }
        };
      }

      window.nepDesktop.onLicenseUpdate((st) => renderDesktopLicense(st));
      const initialSt = await window.nepDesktop.getLicenseStatus();
      if (initialSt) renderDesktopLicense(initialSt);
    }

    setInterval(render, 400);
    render();
  }

  main().catch((e) => {
    console.error(e);
    toast("تعذر تشغيل نبراس: " + e.message, 8000);
  });
})();
