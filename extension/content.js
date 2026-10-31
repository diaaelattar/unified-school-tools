// ==========================================
// 🚀 MAIN CONTROLLER: content.js (v1.0 - سحب البحث + بيانات العاملين)
// ==========================================

console.log("[نبراس] تم تشغيل محرك بيانات التلاميذ والعاملين.");

// تنظيف ذاكرة الإضافة فوراً لمنع تنفيذ أي أوامر سحب عميق سابقة
chrome.storage.local.remove(["pendingExportTask", "exportTask", "pendingClassReportTask"]);

// كاشف المدرسة المدرسية الحالية في صفحة الوزارة (عزل المدارس المتزامنة)
function neprasDetectCurrentPageSchool() {
  try {
    let code = "";
    let name = "";
    let stage = "";

    const norm = (s) => {
      if (!s) return "";
      const ar = "٠١٢٣٤٥٦٧٨٩";
      const str = String(s).replace(/[٠-٩]/g, (d) => String(ar.indexOf(d))).trim();
      const digits = str.replace(/\D/g, "");
      return (/^\d{4,12}$/.test(digits)) ? digits : "";
    };

    // 1. فحص الشارات والشريط العلوي في واجهة الوزارة (البحث عن كود المدرسة الرسمي أو البريد مع استبعاد الرقم المسلسل الداخلي)
    const badges = document.querySelectorAll(".badge, .badge-pill, span, div, p, a, label, b, strong, h1, h2, h3, h4, h5, h6");
    for (let i = 0; i < badges.length; i++) {
      const b = badges[i];
      if (b.children.length > 3) continue;
      const t = (b.innerText || b.textContent || "").trim();
      if (!t) continue;

      if (!code) {
        const mMail = t.match(/([0-9]{4,12})@[a-z0-9.]*emis\.gov\.eg/i);
        if (mMail) code = norm(mMail[1]);
        const mCode = t.match(/(?:كود\s*(?:المدرسة|المؤسسة)|الرقم\s*التعريفي)\s*[:\-]?\s*([٠-٩0-9]{5,12})/);
        if (!code && mCode) code = norm(mCode[1]);
      }

      if (!name) {
        const mSch = t.match(/(?:اسم\s*المدرسة|المدرسة)\s*[:\-]?\s*([^\n\r<>|•]+)/);
        if (mSch) {
          const cn = mSch[1].replace(/المرحل[ةه].*$/, "").replace(/التبعي[ةه].*$/, "").replace(/الرقم\s*المسلسل.*$/, "").trim();
          if (cn.length >= 3 && !/^\d+$/.test(cn) && /[\u0600-\u06FF]/.test(cn)) name = cn;
        }
      }

      if (!stage) {
        const mSt = t.match(/(?:المرحل[ةه]|مرحلة)\s*[:\-]?\s*([^\n\r<>|•]+)/);
        if (mSt) {
          const cs = mSt[1].replace(/التبعي[ةه].*$/, "").replace(/الرقم.*$/, "").trim();
          if (cs.length >= 2) stage = cs;
        }
      }

      if (code && name && stage) break;
    }

    // 2. فحص نص الصفحة بالكامل كخيار احتياطي
    if ((!code || !name) && document.body) {
      const fullTxt = (document.body.innerText || "").slice(0, 8000);
      if (!code) {
        const fbMail = fullTxt.match(/([0-9]{4,12})@[a-z0-9.]*emis\.gov\.eg/i);
        if (fbMail) code = norm(fbMail[1]);
        const fbCode = fullTxt.match(/(?:كود\s*(?:المدرسة|المؤسسة)|الرقم\s*التعريفي)\s*[:\-]?\s*([٠-٩0-9]{5,12})/);
        if (!code && fbCode) code = norm(fbCode[1]);
      }
      if (!name) {
        const fbName = fullTxt.match(/(?:اسم\s*المدرسة|المدرسة)\s*[:\-]?\s*([\u0600-\u06FF0-9\s]{3,40})/);
        if (fbName) {
          const fn = fbName[1].trim();
          if (fn.length >= 3 && !/^\d+$/.test(fn)) name = fn;
        }
      }
    }

    // 3. فحص الذاكرة المحلية للجلسة (دون التقاط serial الداخلي ككود مدرسة)
    if (!code) {
      for (const st of [localStorage, sessionStorage]) {
        if (!st) continue;
        for (let j = 0; j < st.length; j++) {
          const k = st.key(j) || "";
          const v = st.getItem(k) || "";
          const lk = k.toLowerCase().replace(/[_-]/g, "");
          const cleanV = v.trim().replace(/^["']|["']$/g, "");
          if (!code && (lk.includes("schoolcode") || lk === "schoolid" || lk === "schcode" || lk === "sc") && norm(cleanV)) {
            code = norm(cleanV);
          }
          if (!name && (lk.includes("schoolname") || lk === "arabicschoolname") && cleanV.length >= 3 && !/^\d+$/.test(cleanV)) {
            name = cleanV;
          }
        }
      }
    }

    if (code) {
      return { schoolCode: code, schoolName: name || `مدرسة ${code}`, stage: stage || "" };
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  return null;
}

function neprasNotifyTabSchool() {
  const d = neprasDetectCurrentPageSchool();
  if (d && d.schoolCode) {
    if (globalThis.NeprasSchoolManager?.registerOrUpdateSchool) {
      globalThis.NeprasSchoolManager.registerOrUpdateSchool({
        code: d.schoolCode,
        name: d.schoolName,
        stage: d.stage
      }).catch(() => {});
    }
    chrome.runtime.sendMessage({
      action: "NEPRAS_TAB_SCHOOL_DETECTED",
      ...d
    }).catch(() => {});
  }
}

function neprasShowQuickLoginToast(text) {
  let toast = document.getElementById("nepras-quick-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "nepras-quick-toast";
    toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:30px;box-shadow:0 4px 16px rgba(0,0,0,0.25);font-size:13px;font-weight:700;z-index:9999999;transition:opacity 0.3s ease;font-family:system-ui,-apple-system,sans-serif;direction:rtl;";
    document.body.appendChild(toast);
  }
  toast.innerText = text;
  toast.style.opacity = "1";
  toast.style.display = "block";
  setTimeout(() => {
    if (toast) toast.style.opacity = "0";
    setTimeout(() => { if (toast) toast.style.display = "none"; }, 300);
  }, 3500);
}

async function neprasSetupQuickLoginOnPage() {
  try {
    if (!globalThis.NeprasQuickLogin) return;
    if (!globalThis.NeprasQuickLogin.isLoginPage(location.href, document)) return;

    const settings = await globalThis.NeprasQuickLogin.getSettings().catch(() => ({ autoFill: true, autoLogin: true, autoCapture: true }));
    const creds = await globalThis.NeprasQuickLogin.getCredentials().catch(() => null);

    // 1. التعبئة التلقائية الفورية والدخول التلقائي إذا كانت البيانات محفوظة والميزة مفعّلة
    if (creds && creds.username && creds.password && settings.autoFill !== false) {
      setTimeout(() => {
        try {
          const res = globalThis.NeprasQuickLogin.autofill(document, creds, settings.autoLogin !== false);
          if (res.ok) {
            if (settings.autoLogin) {
              neprasShowQuickLoginToast(`🚀 نبراس: تم تعبئة حساب (${creds.username}) والدخول تلقائياً...`);
            } else {
              neprasShowQuickLoginToast(`⚡ نبراس: تم تعبئة بيانات حساب (${creds.username}) تلقائياً.`);
            }
          }
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }, 400);
    }

    // 2. زر عائم سريع كاختصار ذكي ومريح
    if (creds && creds.username && !document.getElementById("nepras-quick-login-floater")) {
      const floater = document.createElement("div");
      floater.id = "nepras-quick-login-floater";
      floater.style.cssText = "position:fixed;top:16px;left:16px;z-index:999999;background:linear-gradient(135deg, #1e40af, #2563eb);color:#fff;padding:8px 14px;border-radius:24px;box-shadow:0 4px 14px rgba(37,99,235,0.35);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:system-ui,-apple-system,sans-serif;direction:rtl;border:1px solid rgba(255,255,255,0.3);user-select:none;transition:transform 0.15s ease;";
      floater.innerHTML = `<span>⚡</span><span>دخول سريع بنبراس</span>`;
      floater.title = `تعبئة بيانات حساب ${creds.username} المسجلة في نبراس فوراً`;

      floater.addEventListener("mouseenter", () => { floater.style.transform = "scale(1.05)"; });
      floater.addEventListener("mouseleave", () => { floater.style.transform = "scale(1)"; });

      floater.addEventListener("click", () => {
        const res = globalThis.NeprasQuickLogin.autofill(document, creds, false);
        if (res.ok) {
          neprasShowQuickLoginToast("✅ تم تعبئة اسم المستخدم وكلمة المرور بنجاح.");
        } else {
          neprasShowQuickLoginToast("⚠️ لم يتم العثور على حقول الدخول.");
        }
      });

      document.body.appendChild(floater);
    }

    // 3. الالتقاط التلقائي الذكي: حفظ بيانات الدخول عند قيام المستخدم بتسجيل الدخول
    if (settings.autoCapture !== false) {
      const { usernameInput, passwordInput, submitButton } = globalThis.NeprasQuickLogin.findLoginElements(document);

      const captureAndSave = () => {
        try {
          const u = (usernameInput?.value || "").trim();
          const p = passwordInput?.value || "";
          if (u && p && u.length >= 3 && p.length >= 3) {
            // حفظ الحساب فوراً في الخزنة
            globalThis.NeprasQuickLogin.saveCredentials(u, p).then(() => {
              neprasShowQuickLoginToast(`🔑 نبراس: تم حفظ بيانات حساب (${u}) محلياً بأمان!`);
            }).catch(() => {});
          }
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      };

      if (submitButton) {
        submitButton.addEventListener("click", captureAndSave, { capture: true });
      }
      if (passwordInput) {
        passwordInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") captureAndSave();
        }, { capture: true });
      }
      const loginForm = (submitButton && submitButton.form) || document.querySelector("form");
      if (loginForm) {
        loginForm.addEventListener("submit", captureAndSave, { capture: true });
      }
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(neprasNotifyTabSchool, 350);
    setTimeout(neprasSetupQuickLoginOnPage, 600);
  }, { once: true });
} else {
  setTimeout(neprasNotifyTabSchool, 350);
  setTimeout(neprasSetupQuickLoginOnPage, 600);
}

// الاستجابة للرسائل القادمة من الواجهة
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "NEPRAS_CHECK_LOGIN_PAGE") {
    const isLogin = !!globalThis.NeprasQuickLogin?.isLoginPage(location.href, document);
    sendResponse({ ok: true, isLoginPage: isLogin, url: location.href });
    return true;
  }

  if (request.action === "NEPRAS_AUTOFILL_LOGIN") {
    (async () => {
      try {
        if (!globalThis.NeprasQuickLogin) {
          sendResponse({ ok: false, message: "وحدة الدخول السريع غير محملة بالصفحة." });
          return;
        }
        let creds = request.credentials;
        if (!creds || !creds.username || !creds.password) {
          creds = await globalThis.NeprasQuickLogin.getCredentials();
        }
        if (!creds || !creds.username || !creds.password) {
          sendResponse({ ok: false, message: "لا توجد بيانات دخول محفوظة في نبراس بعد." });
          return;
        }

        const res = globalThis.NeprasQuickLogin.autofill(document, creds, !!request.autoSubmit);
        if (res.ok) {
          neprasShowQuickLoginToast("✅ تم تعبئة بيانات الدخول بنجاح عبر نبراس.");
          sendResponse({ ok: true, ...res });
        } else {
          sendResponse({ ok: false, message: "لم يتم العثور على حقول تسجيل الدخول في هذه الصفحة." });
        }
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_DETECT_TAB_SCHOOL") {
    const detected = neprasDetectCurrentPageSchool();
    sendResponse({ ok: !!detected, ...(detected || {}) });
    return true;
  }

  if (request.action === "NEPRAS_SPA_NAVIGATE") {
    try {
      const targetPath = String(request.targetPath || "").trim();
      if (!targetPath) {
        sendResponse({ ok: false, message: "مسار التنقل غير محدد." });
        return true;
      }
      if (location.pathname.toLowerCase().includes(targetPath.toLowerCase())) {
        sendResponse({ ok: true, alreadyThere: true, path: location.pathname });
        return true;
      }
      // 1) البحث عن رابط Angular مباشر في القائمة الجانبية أو العلوية والضغط عليه
      const anchors = Array.from(document.querySelectorAll("a[href], a[routerlink], [ng-reflect-router-link]"));
      const matchAnchor = anchors.find((a) => {
        const href = (a.getAttribute("href") || a.getAttribute("routerlink") || a.getAttribute("ng-reflect-router-link") || "").toLowerCase();
        return href.includes(targetPath.toLowerCase());
      });
      if (matchAnchor) {
        matchAnchor.click();
        sendResponse({ ok: true, method: "anchor_click", path: targetPath });
        return true;
      }
      // 2) التنقل عبر History API مع إطلاق حدث popstate ليلتقطه Angular Router دون إعادة تحميل الصفحة
      window.history.pushState({}, "", targetPath);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      sendResponse({ ok: true, method: "history_push", path: targetPath });
    } catch (err) {
      sendResponse({ ok: false, message: err?.message || String(err) });
    }
    return true;
  }

  if (request.action === "NEPRAS_CLICK_REPORT_BUTTON") {
    (async () => {
      try {
        const selector = request.selector || "";
        const textMatch = request.textMatch || "";
        const clickKey = `${selector}||${textMatch}`;
        const lastClick = window.__neprasLastReportClick;
        if (lastClick && lastClick.key === clickKey && Date.now() - lastClick.ts < 4500) {
          sendResponse({ ok: true, clickedText: lastClick.clickedText || textMatch, deduplicated: true });
          return;
        }
        const timeoutMs = Number(request.timeoutMs) || 12000;
        const startTs = Date.now();

        function normAr(s) {
          if (!s) return "";
          return String(s)
            .replace(/[ً-ٰٟ]/g, "")
            .replace(/[أإآ]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/[ى]/g, "ي")
            .replace(/[​-‍﻿ ]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
        }

        const normTarget = normAr(textMatch);

        function matchCandidate(el) {
          if (!el || el.nodeType !== 1) return false;
          const rawTxt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          const normTxt = normAr(rawTxt);

          if (normTarget && normTxt.includes(normTarget)) return true;

          if (normTarget.includes("غياب") || normTarget.includes("رصد")) {
            if ((normTxt.includes("رصد") && normTxt.includes("غياب")) ||
                (normTxt.includes("غياب") && normTxt.includes("اسماء")) ||
                (normTxt.includes("تقرير") && normTxt.includes("غياب")) ||
                (normTxt.includes("كشف") && normTxt.includes("غياب"))) {
              return true;
            }
          }

          const attrVal = normAr(
            (el.getAttribute("title") || "") + " " +
            (el.getAttribute("aria-label") || "") + " " +
            (el.getAttribute("value") || "") + " " +
            (el.getAttribute("routerlink") || "") + " " +
            (el.getAttribute("ng-reflect-router-link") || "")
          );
          if (normTarget && attrVal.includes(normTarget)) return true;
          if (normTarget.includes("غياب") && (attrVal.includes("absence") || attrVal.includes("report"))) return true;

          return false;
        }

        function findTargetInDoc(doc) {
          if (!doc) return null;
          if (selector) {
            try {
              const fromSel = Array.from(doc.querySelectorAll(selector));
              const match = fromSel.find((el) => {
                if (!textMatch) return true;
                return matchCandidate(el);
              });
              if (match) return match;
            } catch (_) {}
          }

          const clickables = Array.from(doc.querySelectorAll("button, a, input[type='button'], input[type='submit'], .buttonBlock button, .btn, .btn-success, [role='button'], label"));
          const found = clickables.find(matchCandidate);
          if (found) return found;

          if (selector) {
            try {
              const allSel = Array.from(doc.querySelectorAll(selector));
              if (allSel.length === 1) return allSel[0];
            } catch (_) {}
          }
          return null;
        }

        let targetEl = null;
        while (Date.now() - startTs < timeoutMs) {
          targetEl = findTargetInDoc(document);

          if (!targetEl) {
            const iframes = Array.from(document.querySelectorAll("iframe, frame"));
            for (const ifr of iframes) {
              try {
                const subDoc = ifr.contentDocument || ifr.contentWindow?.document;
                if (subDoc) {
                  targetEl = findTargetInDoc(subDoc);
                  if (targetEl) break;
                }
              } catch (_) {}
            }
          }

          if (targetEl) break;
          await new Promise((r) => setTimeout(r, 400));
        }

        if (!targetEl) {
          sendResponse({ ok: false, message: `لم يتم العثور على زر تقرير الغياب (${textMatch || selector}) في الصفحة الحالية. تأكد من اكتمال تحميل الصفحة.` });
          return;
        }

        const clickable = targetEl.closest("button, a, input, [role='button']") || targetEl;
        const clickedText = (clickable.innerText || clickable.textContent || clickable.value || "").trim();
        window.__neprasLastReportClick = { key: clickKey, ts: Date.now(), clickedText };
        clickable.scrollIntoView({ behavior: "smooth", block: "center" });
        try { clickable.focus(); } catch (_) {}
        clickable.click();
        sendResponse({ ok: true, clickedText });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }
  if (request.action === "NEPRAS_START_TABLET_REGISTER") {
    (async () => {
      try {
        if (!window.NeprasTablet?.startTabletRegistration) {
          sendResponse({ ok: false, message: "وحدة التابلت غير محملة في صفحة الوزارة." });
          return;
        }
        const result = await window.NeprasTablet.startTabletRegistration(request.plan || [], (prog) => {
          chrome.runtime.sendMessage({ action: "NEPRAS_TABLET_PROGRESS", ...prog }).catch(() => {});
        });
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_EXPORT_TABLET_TABLE") {
    (async () => {
      try {
        if (!window.NeprasTablet?.exportTabletTableWorkbook) {
          sendResponse({ ok: false, message: "وحدة التابلت غير محملة." });
          return;
        }
        const XLSX = window.XLSX || globalThis.XLSX;
        if (!XLSX && typeof window.neprasEnsureLazyLib === "function") {
          await window.neprasEnsureLazyLib("xlsx");
        }
        const activeXlsx = window.XLSX || globalThis.XLSX;
        if (!activeXlsx) throw new Error("تعذر تحميل مكتبة معالجة الجداول Excel.");
        const wb = window.NeprasTablet.exportTabletTableWorkbook(activeXlsx);
        let blob;
        if (wb instanceof Uint8Array || (wb && wb.buffer instanceof ArrayBuffer)) {
          blob = new Blob([wb], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        } else {
          const wbout = activeXlsx.write(wb, { bookType: "xlsx", type: "array" });
          blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        }
        const stamp = globalThis.NeprasEgypt ? globalThis.NeprasEgypt.todayStamp() : "";
        const filename = `كشف_التابلت_المدرسي_${stamp}.xlsx`;
        if (window.neprasDialog?.triggerDownload) {
          await window.neprasDialog.triggerDownload(blob, filename, { folder: "التابلت_المدرسي" });
        }
        sendResponse({ ok: true, filename });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_SAVE_TABLET_CHANGES") {
    try {
      const saved = window.NeprasTablet?.saveTabletChanges ? window.NeprasTablet.saveTabletChanges() : false;
      sendResponse({ ok: saved });
    } catch (e) {
      sendResponse({ ok: false, message: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === "NEPRAS_START_ADD_STUDENTS") {
    (async () => {
      try {
        if (!window.NeprasAddStudent?.startAddStudents) {
          sendResponse({ ok: false, message: "وحدة إضافة الطلاب غير محملة في صفحة الوزارة." });
          return;
        }
        const result = await window.NeprasAddStudent.startAddStudents(request.students || [], (prog) => {
          chrome.runtime.sendMessage({ action: "NEPRAS_ADD_STUDENT_PROGRESS", ...prog }).catch(() => {});
        }, request.options || {});
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  

  

  if (request.action === "NEPRAS_SCRAPE_ATTENDANCE_TABLE") {
    (async () => {
      try {
        if (typeof window.neprasScrapeCurrentAttendanceTable === 'function') {
          const res = await window.neprasScrapeCurrentAttendanceTable(request.options || {});
          sendResponse(res);
        } else if (typeof neprasScrapeCurrentAttendanceTable === 'function') {
          const res = await neprasScrapeCurrentAttendanceTable(request.options || {});
          sendResponse(res);
        } else {
          sendResponse({ ok: false, message: 'وحدة استيراد الغياب غير محملة بالتبويب الحالي. يرجى تحديث الصفحة والمحاولة مجدداً.' });
        }
      } catch (e) {
        sendResponse({ ok: false, message: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_SUBMIT_AND_CONFIRM_STUDENT") {
    (async () => {
      try {
        if (!window.NeprasAddStudent?.submitAndConfirmStudent) {
          sendResponse({ ok: false, message: "وحدة إضافة الطلاب غير محملة في صفحة الوزارة." });
          return;
        }
        const result = await window.NeprasAddStudent.submitAndConfirmStudent();
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_QUICK_REGISTER_STUDENT_BY_NID") {
    (async () => {
      try {
        if (!window.NeprasAddStudent?.quickRegisterByNid) {
          sendResponse({ ok: false, message: "وحدة إضافة الطلاب غير محملة." });
          return;
        }
        const result = await window.NeprasAddStudent.quickRegisterByNid(request.nationalId);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_OPEN_STATS_DASHBOARD") {
    try {
      if (typeof window.neprasShowStatsDashboardModal === "function") {
        window.neprasShowStatsDashboardModal(request.initialData || null);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, message: "وحدة مركز الإحصائيات غير محملة بالصفحة." });
      }
    } catch (err) {
      sendResponse({ ok: false, message: err?.message || String(err) });
    }
    return true;
  }

  if (request.action === "NEPRAS_START_EXEMPTION_REMOVAL") {
    (async () => {
      try {
        if (!window.NeprasExemptionRemoval?.runBatchExemptionRemoval) {
          sendResponse({ ok: false, message: "وحدة حذف الإعفاءات غير محملة في صفحة الوزارة. يرجى التأكد من فتح موقع بيانات الطلاب وتحديث الصفحة." });
          return;
        }
        const result = await window.NeprasExemptionRemoval.runBatchExemptionRemoval(
          request.rows || [],
          {
            ...(request.options || {}),
            onProgress: (current, total, code) => {
              chrome.runtime.sendMessage({ action: "NEPRAS_EXEMPTION_PROGRESS", current, total, code }).catch(() => {});
            },
            onLog: (message, logType) => {
              chrome.runtime.sendMessage({ action: "NEPRAS_EXEMPTION_LOG", message, logType }).catch(() => {});
            }
          }
        );
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_STOP_EXEMPTION_REMOVAL") {
    try {
      window.NeprasExemptionRemoval?.requestStop?.();
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, message: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === "NEPRAS_START_QUICK_EDITS") {
    (async () => {
      try {
        if (!window.NeprasQuickEdits || typeof window.NeprasQuickEdits.executeQuickEdits !== "function") {
          sendResponse({ ok: false, message: "وحدة تعديل التخصص واللغات غير محملة في صفحة الوزارة." });
          return;
        }

        const res = await window.NeprasQuickEdits.executeQuickEdits(request, (progress) => {
          chrome.runtime.sendMessage({
            action: "NEPRAS_QUICK_EDITS_PROGRESS",
            ...progress
          }).catch(() => {});
        });

        sendResponse(res);
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_STOP_QUICK_EDITS") {
    try {
      window.NeprasQuickEdits?.requestStop?.();
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, message: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === "REFRESH_STUDENT_TOOLBARS") {
    try { if (typeof window.injectPageToolbars === "function") window.injectPageToolbars(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    sendResponse({ ok: true });
    return;
  }

  if (request.action === "SET_STUDENT_STAGE") {
    try {
      if (typeof window.neprasSetSelectedStage === "function") {
        window.neprasSetSelectedStage(request.stage || "", true);
      }
      if (typeof window.injectPageToolbars === "function") {
        window.injectPageToolbars();
      }
      sendResponse({ status: "success" });
    } catch (error) {
      sendResponse({ status: "error", message: error?.message || String(error) });
    }
    return true;
  }

  if (request.action === "START_SCHOOL_STATS") {
    try { window.neprasResetGlobalStop?.(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    const stage =
      request.stage || "";

    if (
      typeof window.neprasCollectSchoolStatistics !==
      "function"
    ) {
      sendResponse({
        status: "error",
        message:
          "محرك إحصاء المدرسة غير محمل."
      });
      return true;
    }

    (async () => {
      let lockToken = "";

      try {
        const lock =
          await chrome.runtime.sendMessage({
            action:
              "NEPRAS_SCHOOL_STATS_LOCK_ACQUIRE"
          });

        if (!lock?.ok) {
          const message =
            lock?.busy
              ? "هناك تحديث إحصاء مدرسة يعمل بالفعل. انتظر انتهاءه."
              : (
                  lock?.message ||
                  "تعذر حجز عملية إحصاء المدرسة."
                );

          sendResponse({
            status: "busy",
            message
          });

          return;
        }

        lockToken =
          String(
            lock.token || ""
          );

        sendResponse({
          status: "started"
        });

        try {
          const result =
            await window.neprasCollectSchoolStatistics(
              stage
            );

          chrome.runtime.sendMessage({
            action:
              "SCHOOL_STATS_FINISHED",
            result
          }).catch(() => {});
          chrome.runtime.sendMessage({
            action: "NEPRAS_USER_NOTICE",
            payload: {
              type: "success",
              title: "اكتمل تحديث الإحصاء",
              message: `تم تحديث إحصاء المدرسة بنجاح.
إجمالي الطلاب: ${Number(result?.totalStudents || result?.total || 0)}`
            }
          }).catch(() => {});
        } catch (error) {
          const rawMessage = error?.message || String(error);
          const stopped = error?.code === "USER_STOPPED" || rawMessage.includes("USER_STOPPED") || window.__NEPRAS_STOP_ALL_REQUESTED__ === true;
          const message = stopped ? "تم إيقاف تحديث الإحصاء بواسطة المستخدم." : rawMessage;

          chrome.storage.local.set({
            neprasSchoolStatsLastError:
              message
          }).catch(() => {});
          chrome.runtime.sendMessage({
            action: "NEPRAS_USER_NOTICE",
            payload: {
              type: stopped ? "warning" : "error",
              title: stopped ? "تم إيقاف العملية" : "تعذر تحديث الإحصاء",
              message
            }
          }).catch(() => {});
        }
      } catch (error) {
        try {
          sendResponse({
            status: "error",
            message:
              error?.message ||
              String(error)
          });
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      } finally {
        if (lockToken) {
          chrome.runtime.sendMessage({
            action:
              "NEPRAS_SCHOOL_STATS_LOCK_RELEASE",
            token: lockToken
          }).catch(() => {});
        }

        chrome.runtime.sendMessage({
          action:
            "NEPRAS_CLEANUP_COMMAND_STATE",
          scope: "student",
          reason:
            "school_stats_finished"
        }).catch(() => {});
      }
    })();

    return true;
  }

  if (request.action === "EXPORT_SCHOOL_STATS_EXCEL") {
    chrome.storage.local.get("neprasSchoolStatsV1").then((data) => {
      try {
        window.neprasExportSchoolStatisticsExcel?.(data?.neprasSchoolStatsV1);
      } catch (error) {
        console.error("Nepras school stats export:", error);
        window.neprasDialog?.alert(`❌ ${error?.message || error}`, { type: "error" });
      }
    });
    sendResponse({ status: "started" });
    return true;
  }


  if (request.action === "GET_SCHOOL_STATS_DETAILS") {
    chrome.storage.local.get("neprasSchoolStatsV1").then((data) => {
      try {
        const stats = data?.neprasSchoolStatsV1;
        if (typeof window.neprasStatsGetDetailPayload !== "function") {
          sendResponse({
            status: "error",
            message: "محرك تفاصيل الإحصاء غير محمل."
          });
          return;
        }

        const payload =
          window.neprasStatsGetDetailPayload(
            stats,
            request.filter || {}
          );

        sendResponse({
          status: "success",
          payload
        });
      } catch (error) {
        sendResponse({
          status: "error",
          message: error?.message || String(error)
        });
      }
    });
    return true;
  }

  if (request.action === "EXPORT_SCHOOL_STATS_DETAIL_EXCEL") {
    chrome.storage.local.get("neprasSchoolStatsV1").then((data) => {
      try {
        window.neprasExportSchoolStatisticsDetailExcel?.(
          data?.neprasSchoolStatsV1,
          request.filter || {}
        );
      } catch (error) {
        console.error("Nepras school stats detail export:", error);
        window.neprasDialog?.alert(`❌ ${error?.message || error}`, { type: "error" });
      }
    });

    sendResponse({ status: "started" });
    return true;
  }

  if (request.action === "START_CLASS_LISTS_EXCEL") {
    try { window.neprasResetGlobalStop?.(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    const stage = request.stage || "";

    if (typeof window.neprasExportClassListsFromStudentList !== "function") {
      sendResponse({ status: "error", message: "محرك قوائم الفصول Excel غير محمل." });
      return true;
    }

    sendResponse({ status: "started" });

    (async () => {
      try {
        await window.neprasExportClassListsFromStudentList(stage);
      } catch (error) {
        const message = error?.message || String(error);
        const stopped = error?.code === "USER_STOPPED" || message.includes("USER_STOPPED") || window.__NEPRAS_STOP_ALL_REQUESTED__ === true;
        if (stopped) {
          window.neprasDialog?.alert("تم إيقاف تنزيل قوائم الفصول Excel. لم يُنشأ أي ملف.", { type: "warning", title: "تم إيقاف العملية" });
        } else {
          console.error("Nepras class lists excel:", error);
          window.neprasDialog?.alert(`❌ ${message}`, { type: "error", title: "تعذر إنشاء قوائم الفصول" });
        }
      }
    })();
    return true;
  }

  if (request.action === "START_EXPENSES_ANALYSIS") {
    try { window.neprasResetGlobalStop?.(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    const stage = request.stage || "";

    if (typeof window.neprasAnalyzeExpensesAndExemptions !== "function") {
      sendResponse({ status: "error", message: "محرك المصروفات غير محمل." });
      return true;
    }

    sendResponse({ status: "started" });

    (async () => {
      try {
        const result = await window.neprasAnalyzeExpensesAndExemptions(stage);
        chrome.runtime.sendMessage({ action: "EXPENSES_ANALYSIS_FINISHED", result }).catch(() => {});
        chrome.runtime.sendMessage({
          action: "NEPRAS_USER_NOTICE",
          payload: {
            type: "success",
            title: "اكتمل تحليل المصروفات",
            message: `تم تحليل بيانات المصروفات والإعفاءات بنجاح.
المسددون: ${result.paid}
المطلوب منهم السداد: ${result.due}`
          }
        }).catch(() => {});
        window.neprasDialog?.alert(
          `تم تحليل بيانات المصروفات والإعفاءات بنجاح.\nالمسددون: ${result.paid}\nالمطلوب منهم السداد: ${result.due}`,
          { type: "success", title: "اكتمل تحليل المصروفات" }
        );
      } catch (error) {
        const message = error?.message || String(error);
        const stopped = error?.code === "USER_STOPPED" || message.includes("USER_STOPPED") || window.__NEPRAS_STOP_ALL_REQUESTED__ === true;
        if (stopped) {
          chrome.storage.local.set({ neprasExpensesLastError: "تم إيقاف التحليل بواسطة المستخدم." }).catch(() => {});
          chrome.runtime.sendMessage({
            action: "NEPRAS_USER_NOTICE",
            payload: {
              type: "warning",
              title: "تم إيقاف العملية",
              message: "تم إيقاف تحليل المصروفات. لم يتم اعتماد نتيجة جزئية جديدة."
            }
          }).catch(() => {});
          window.neprasDialog?.alert("تم إيقاف تحليل المصروفات. لم يتم اعتماد نتيجة جزئية جديدة.", { type: "warning", title: "تم إيقاف العملية" });
        } else {
          chrome.storage.local.set({ neprasExpensesLastError: message }).catch(() => {});
          chrome.runtime.sendMessage({
            action: "NEPRAS_USER_NOTICE",
            payload: {
              type: "error",
              title: "تعذر تحليل المصروفات",
              message
            }
          }).catch(() => {});
          window.neprasDialog?.alert(message, { type: "error", title: "تعذر تحليل المصروفات" });
        }
      } finally {
        try { hideFloatingStatus?.(300); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        chrome.runtime.sendMessage({
          action: "NEPRAS_CLEANUP_COMMAND_STATE",
          scope: "student",
          reason: "expenses_analysis_finished"
        }).catch(() => {});
      }
    })();

    return true;
  }

  if (request.action === "EXPORT_EXPENSES_EXCEL") {
    chrome.storage.local.get("neprasExpensesAnalysisV1").then(data => {
      try {
        window.neprasExportExpensesExcel?.(data?.neprasExpensesAnalysisV1);
      } catch (error) {
        window.neprasDialog?.alert(error?.message || String(error), {
          type: "error",
          title: "تعذر تصدير ملف المصروفات"
        });
      }
    });
    sendResponse({ status: "started" });
    return true;
  }

  if (request.action === "EXPORT_EXPENSES_CATEGORY_EXCEL") {
    chrome.storage.local.get("neprasExpensesAnalysisV1").then(data => {
      try {
        window.neprasExportExpensesCategoryExcel?.(
          data?.neprasExpensesAnalysisV1,
          request.category || "all"
        );
      } catch (error) {
        window.neprasDialog?.alert(error?.message || String(error), {
          type: "error",
          title: "تعذر تصدير القائمة"
        });
      }
    });
    sendResponse({ status: "started" });
    return true;
  }

  if (request.action === "PRIME_STUDENT_API_SESSION") {
    (async () => {
      try {
        if (typeof window.neprasApiAutoPrimeSession !== "function") {
          throw new Error("محرك تجهيز الاتصال غير متاح.");
        }
        const ok = await window.neprasApiAutoPrimeSession();
        sendResponse({status:"success", primed:!!ok});
      } catch (error) {
        sendResponse({status:"error", message:error?.message || String(error)});
      }
    })();
    return true;
  }

  if (request.action === "LOOKUP_STUDENT_ANY_SCHOOL") {
    (async () => {
      try {
        if (typeof window.neprasApiLookupStudentByNationalId !== "function") throw new Error("محرك البحث غير متاح.");
        const data = await window.neprasApiLookupStudentByNationalId(request.nationalId || "");
        sendResponse({status:"success", data});
      } catch (error) { sendResponse({status:"error", message:error?.message || String(error)}); }
    })();
    return true;
  }

  if (request.action === "GET_EXPENSES_DETAILS") {
    chrome.storage.local.get("neprasExpensesAnalysisV1").then(data => {
      try {
        const result = data?.neprasExpensesAnalysisV1;
        const rows = window.neprasExpensesRowsByCategory?.(result, request.category || "all") || [];
        sendResponse({
          status: "success",
          title: window.neprasExpensesCategoryTitle?.(request.category || "all") || "بيانات المصروفات",
          rows
        });
      } catch (error) {
        sendResponse({ status: "error", message: error?.message || String(error) });
      }
    });
    return true;
  }

  if (request.action === "GET_AVAILABLE_STUDENT_GRADES") {
    try {
      const grades = typeof window.neprasGetAvailableGradesForPopup === "function"
        ? window.neprasGetAvailableGradesForPopup()
        : [];
      sendResponse({ status: "success", grades: Array.isArray(grades) ? grades : [] });
    } catch (error) {
      sendResponse({ status: "error", grades: [], message: error?.message || String(error) });
    }
    return true;
  }

  if (request.action === "STAFF_WORKER_OPEN") {
    neprasHandleStaffWorkerOpen(request.task).then(() => {
      sendResponse({ status: "started" });
    }).catch((error) => {
      sendResponse({ status: "error", message: error?.message || String(error) });
    });
    return true;
  }

  if (request.action === "STAFF_WORKER_CANCEL") {
    neprasStaffWorkerContext = null;
    neprasStaffWorkerHandled = true;
    sendResponse({ status: "cancelled" });
    return true;
  }

  // v1.0:
  // EXECUTE_PENDING_TASK الخاص بالسحب العادي يتم استقباله في modules/export.js فقط.
  // كان content.js يعامله بالخطأ كسحب عميق، فيبدأ محركان معًا ويتعارضان.
  if (request.action === "START_DEEP_EXTRACTION") {
    const task = request.task || {
      type: "SINGLE_GRADE",
      grade: request.grade,
      gradeText: request.gradeText,
      stage: request.stage
    };

    runSearchOnlyExtraction(task);
    sendResponse({ status: "started", mode: "deep" });
    return true;
  }

  if (request.action === "EXECUTE_TEACHER_TASK") {
    if (request.taskType === "FETCH_CORE_STAFF_DATA") {
      neprasRunStaffWorkerBatch("CORE");
      sendResponse({ status: "started", mode: "CORE" });
      return true;
    }
    if (request.taskType === "FETCH_NADB_STAFF_DATA") {
      neprasRunStaffWorkerBatch("NADB");
      sendResponse({ status: "started", mode: "NADB" });
      return true;
    }
    if (request.taskType === "FETCH_PARTTIME_STAFF_DATA") {
      neprasRunStaffWorkerBatch("PARTTIME");
      sendResponse({ status: "started", mode: "PARTTIME" });
      return true;
    }
    // جميع العاملين: الأساسي + المنتدب + معلم الحصة.
    if (request.taskType === "FETCH_ALL_STAFF_DATA") {
      neprasRunStaffWorkerBatch("BOTH");
      sendResponse({ status: "started", mode: "BOTH" });
      return true;
    }
    if (request.taskType === "FETCH_STATUS_SHEETS_PDF") {
      neprasRunStatusSheetsPdfBatch(!!request.individual);
      sendResponse({ status: "started", mode: "STATUS_SHEETS_PDF", individual: !!request.individual });
      return true;
    }
    // v1.2.76 — صحيفة أحوال فردية بكود المعلم أو الرقم القومي.
    if (request.taskType === "FETCH_SINGLE_STATUS_SHEET") {
      neprasRunSingleStatusSheet(request.lookup);
      sendResponse({ status: "started", mode: "SINGLE_STATUS_SHEET" });
      return true;
    }
  }

  if (request.action === "START_CORE_STAFF_EXTRACTION") {
    neprasRunStaffWorkerBatch("CORE");
    sendResponse({ status: "started", mode: "CORE" });
    return true;
  }

  if (request.action === "START_NADB_STAFF_EXTRACTION") {
    neprasRunStaffWorkerBatch("NADB");
    sendResponse({ status: "started", mode: "NADB" });
    return true;
  }

  if (request.action === "STOP_STAFF_EXTRACTION") {
    neprasStopStaffExtraction();
    sendResponse({ status: "stopped" });
    return true;
  }

  if (request.action === "FETCH_ALL_STAFF_DATA") {
    neprasRunStaffWorkerBatch("BOTH");
    sendResponse({ status: "started", mode: "BOTH" });
    return true;
  }

  return false;
});

// لا يتم حقن أزرار سحب الصفوف داخل صفحات الموقع.
// السحب يتم من نافذة الإضافة فقط، حتى لا تظهر أزرار الصفوف على teacher.emis.gov.eg.


let neprasStaffStopRequested = false;
let neprasStaffWorkerContext = null;
let neprasStaffWorkerHandled = false;

function neprasEnsureStaffChoicePanel() {
  // تم إلغاء الأزرار الجانبية العائمة داخل صفحة المعلم بالوزارة استجابة لطلب المستخدم:
  // كافة عمليات تنزيل وإحصاءات وسجلات العاملين تُدار حصرياً وبشكل شامل من داخل نافذة أداة نبراس.
  document.getElementById("neprasStaffChoicePanel")?.remove();
  return;
}

async function neprasStopStaffExtraction() {
  // Unified stop flag for ALL teacher/staff extraction engines.
  // Do not clear running flags here; let the active async loop unwind
  // through its own finally blocks so a second run cannot overlap.
  neprasStaffStopRequested = true;
  neprasV24StopRequested = true;

  // Stop status-sheet batch immediately and cancel its active download watcher.
  try {
    if (neprasStatusSheetBatch) {
      neprasStatusSheetBatch.stoppedByUser = true;
      neprasStatusSheetBatch.running = false;
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  try {
    const current = await neprasGetStaffState();
    if (current) {
      current.active = false;
      current.stoppedByUser = true;
      current.stopAt = Date.now();
      await chrome.storage.local.set({ [NEPRAS_STAFF_STATE_KEY]: current });
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  try {
    window.postMessage({ source: NEPRAS_EXTENSION_SOURCE, type: "STOP_STAFF_EXTRACTION" }, window.location.origin);
    chrome.runtime.sendMessage({ action: "STAFF_BATCH_STOP" }).catch(() => {});
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  window.NeprasLegacy?.status("⏹ <b>تم إيقاف تنزيل بيانات العاملين</b><br>لن يبدأ التنزيل تلقائيًا بعد تحديث الصفحة.");
}

// حالة سحب العاملين تُرسم عبر نظام الرسائل الموحّد (ui/nepras-ui.js) بنفس الأسماء والتواقيع القديمة.
function neprasStaffStopHooks() {
  return { onStop: () => { neprasStopStaffExtraction(); } };
}

function neprasShowBulkStatus(message, isError = false) {
  const L = window.NeprasLegacy;
  const text = String(message || "");
  if (!L || !text) return;
  const flag = (isError || /🔴|❌|تعذر/.test(text)) ? false : (/✅|تم إيقاف/.test(text) ? true : undefined);
  const running = L.classify(text, flag) === "running";
  L.status(text, flag, running ? neprasStaffStopHooks() : undefined);
}

function neprasShowBulkProgressV1766(title, current, total, subtitle = "", tone = "green") {
  window.NeprasLegacy?.progress(title || "جاري العمل", current, total, subtitle, tone, neprasStaffStopHooks());
}



// ==========================================================
// سحب بيانات الطلاب - إعادة توجيه إلى محرك Deep Scrape الأصلي
// ==========================================================
async function runSearchOnlyExtraction(task) {
  const gradeMap = {
    "1": "الصف الأول", "2": "الصف الثاني", "3": "الصف الثالث",
    "4": "الصف الرابع", "5": "الصف الخامس", "6": "الصف السادس"
  };

  try {
    if (task?.stage && typeof window.neprasSetSelectedStage === "function") {
      window.neprasSetSelectedStage(task.stage, true);
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  if (typeof processDeepScrapeForGrade !== "function") {
    window.neprasDialog?.alert("❌ محرك تنزيل بيانات الطلاب غير محمل. تأكد من modules/export.js.", { type: "error" });
    return;
  }

  if (task?.type === "SINGLE_GRADE") {
    const gradeText = task.gradeText || gradeMap[String(task.grade)] || String(task.grade || "").trim();
    try {
      await processDeepScrapeForGrade(gradeText);
    } catch (error) {
      console.error("Nepras Students:", error);
      window.neprasDialog?.alert(`❌ تعذر تنزيل بيانات ${gradeText}: ${error?.message || error}`, { type: "error" });
    }
    return;
  }

  if (task?.type === "ALL_GRADES") {
    try {
      if (
        typeof processDeepScrapeAllGrades ===
        "function"
      ) {
        await processDeepScrapeAllGrades();
      } else {
        const discovered =
          typeof window.neprasGetAvailableGradesForPopup ===
          "function"
            ? window.neprasGetAvailableGradesForPopup()
            : [];

        const allDeepData = [];

        for (const grade of discovered) {
          if (
            typeof isScrapeCancelled !== "undefined" &&
            isScrapeCancelled
          ) {
            break;
          }

          const result =
            await processDeepScrapeForGrade(
              grade.text,
              {
                batchMode: true,
                suppressExport: true,
                suppressCleanup: true
              }
            );

          if (Array.isArray(result?.data)) {
            allDeepData.push(...result.data);
          }
        }

        if (
          allDeepData.length &&
          typeof exportDeepFormattedExcel ===
          "function"
        ) {
          exportDeepFormattedExcel(
            allDeepData,
            generateUnifiedFilename(
              "تنزيل_شامل_بيانات_جميع_الصفوف"
            )
          );
        }
      }
    } catch (error) {
      console.error(
        "Nepras Deep ALL_GRADES:",
        error
      );

      window.neprasDialog?.alert(`❌ تعذر التنزيل الشامل لجميع الصفوف: ${
          error?.message || error
        }`, { type: "error" });
    }
  }
}

// ==========================================================
// 📊 سحب بيانات العاملين — v1.0 (Angular API bridge)
// مبدأ العمل:
// 1) لا نرسل API مباشرة من extension context.
// 2) teacher_api_bridge.js يعمل في MAIN world ويترك Angular
//    هو الذي يرسل الطلبات الحقيقية.
// 3) نلتقط Responses الحقيقية لـ:
//      GetEmployeeByEmpFlag
//      EmployeesNadb
//      GetEmployeeFullData
// 4) لا نلمس كود الطلاب أو الغياب أو بقية وظائف الإضافة.
// ==========================================================

const NEPRAS_STAFF_STATE_KEY = "neprasStaffApiRunState_v13";
const NEPRAS_STAFF_BRIDGE_SOURCE = "NEPRAS_TEACHER_API_BRIDGE";
const NEPRAS_EXTENSION_SOURCE = "NEPRAS_EXTENSION";

const NEPRAS_STAFF_CONFIG_V13 = {
  maxPages: 200,
  responseTimeout: 30000,
  detailTimeout: 30000,
  betweenEmployeesMs: 250
};

const NEPRAS_STAFF_FILTERS_V13 = [
  { type: "قوة أساسية", status: "علي رأس عملة" },
  { type: "منتدب", status: "" }
];

const NEPRAS_STAFF_HEADERS_V13 = [
  "كود الموظف",
  "اسم الموظف الكامل",
  "الاسم الأول",
  "اسم الأب",
  "الجد",
  "اللقب",
  "الرقم القومي",
  "نوع التوظيف",
  "تاريخ الميلاد",
  "محل الميلاد",
  "النوع",
  "الديانة",
  "الحالة الاجتماعية",
  "تاريخ الحالة الاجتماعية",
  "التليفون",
  "محمول",
  "البريد الإلكتروني",
  "محافظة العنوان",
  "العنوان",
  "تاريخ التعيين",
  "تاريخ استلام العمل",
  "المجموعة النوعية",
  "الوظيفة",
  "نوع المؤهل",
  "المؤهل",
  "جهة الحصول",
  "تاريخ المؤهل",
  "المرحلة",
  "مادة التدريس",
  "الموقف من العمل",
  "اسم الجهة الأصلية",
  "الجهة الأصلية",
  "الإدارة الأصلية",
  "المديرية الأصلية",
  "جهة الندب",
  "إدارة الندب",
  "مديرية الندب",
  "النوع الوظيفي",
  "تصنيف العامل",
  "حالة التنزيل"
];

function neprasBridgeSend(type, payload = {}) {
  window.postMessage({
    source: NEPRAS_EXTENSION_SOURCE,
    type,
    ...payload
  }, window.location.origin);
}

let neprasBridgeMessageQueue = [];

function neprasHandleBridgeMessage(event) {
  // التحقق الأمني من مصدر الرسالة لضمان عدم قبول أي رسائل من خارج نطاق الموقع
  if (event.source !== window || event.origin !== window.location.origin) return;
  const msg = event?.data;
  if (!msg || msg.source !== NEPRAS_STAFF_BRIDGE_SOURCE) return;
  neprasBridgeMessageQueue.push(msg);
  if (neprasBridgeMessageQueue.length > 300) neprasBridgeMessageQueue.splice(0, neprasBridgeMessageQueue.length - 300);
  window.__neprasBridgeMessageQueue = neprasBridgeMessageQueue;
  // ROUTE_CHANGED is intentionally ignored. v1.0 is the single source of truth for staff extraction.
  const waiters = window.__neprasBridgeWaiters || [];
  for (let i = waiters.length - 1; i >= 0; i--) {
    const waiter = waiters[i];
    try {
      if (!waiter.predicate(msg)) continue;
      waiters.splice(i, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }
}

window.addEventListener("message", neprasHandleBridgeMessage);
window.__neprasBridgeWaiters = window.__neprasBridgeWaiters || [];
window.__neprasBridgeMessageQueue = window.__neprasBridgeMessageQueue || neprasBridgeMessageQueue;


// No automatic staff route heartbeat.


function neprasBridgeWait(predicate, timeout = NEPRAS_STAFF_CONFIG_V13.responseTimeout) {
  // First inspect messages that arrived before the waiter was created.
  // This prevents a race condition with very fast Responses, especially
  // EmployeesNadb, which may return before the next await is installed.
  try {
    for (let i = window.__neprasBridgeMessageQueue.length - 1; i >= 0; i--) {
      const queued = window.__neprasBridgeMessageQueue[i];
      if (predicate(queued)) {
        window.__neprasBridgeMessageQueue.splice(i, 1);
        return Promise.resolve(queued);
      }
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  return new Promise((resolve, reject) => {
    const waiter = {
      predicate,
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = window.__neprasBridgeWaiters.indexOf(waiter);
        if (index >= 0) window.__neprasBridgeWaiters.splice(index, 1);
        reject(new Error("انتهت مهلة انتظار رد موقع الوزارة."));
      }, timeout)
    };
    window.__neprasBridgeWaiters.push(waiter);
  });
}

function neprasNormalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function neprasNormalizeDate(value) {
  if (!value) return "";
  const s = String(value);
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : neprasNormalizeText(s);
}

function neprasBuildStaffRowFromApi(fullResponse, staff, filter) {
  const basic = fullResponse?.basicInfo || {};
  const qlf = fullResponse?.qlf || {};
  const job = fullResponse?.job || {};
  const nadb = staff?._nadb || {};

  const first = neprasNormalizeText(basic.empFirstName);
  const father = neprasNormalizeText(basic.empFatherName);
  const grand = neprasNormalizeText(basic.empGrandFatherName);
  const family = neprasNormalizeText(basic.empFamilyName);
  const fullName = [first, father, grand, family].filter(Boolean).join(" ") || neprasNormalizeText(staff?.fullName || staff?.name);

  const category = neprasNormalizeText(staff?._category || filter.type || "");
  const actualFlag = neprasNormalizeText(staff?.empFlag || basic.empFlagDesc || basic.empFlag || filter.status || "");

  const row = {
    "كود الموظف": neprasNormalizeText(basic.empCode || staff?.empCode || staff?.code),
    "اسم الموظف الكامل": fullName,
    "الرقم القومي": neprasNormalizeText(basic.nationalIdNum),
    "نوع التوظيف": neprasNormalizeText(basic.recruitmentTypeDesc),
    "الاسم الأول": first,
    "اسم الأب": father,
    "الجد": grand,
    "اللقب": family,
    "تاريخ الميلاد": neprasNormalizeDate(basic.empBirthDate),
    "محل الميلاد": neprasNormalizeText(basic.birthDesc || basic.brchDesc),
    "النوع": neprasNormalizeText(basic.genderDesc),
    "الديانة": neprasNormalizeText(basic.empReligion),
    "الحالة الاجتماعية": neprasNormalizeText(basic.martStatDesc),
    "تاريخ الحالة الاجتماعية": neprasNormalizeDate(basic.martDate),
    "التليفون": neprasNormalizeText(basic.tel),
    "محمول": neprasNormalizeText(basic.empMobile),
    "البريد الإلكتروني": neprasNormalizeText(basic.empEmail),
    "محافظة العنوان": neprasNormalizeText(basic.orgMudriaName || basic.toMudriaName),
    "العنوان": neprasNormalizeText(basic.addressDesc),
    "تاريخ التعيين": neprasNormalizeDate(basic.empHiredate),
    "تاريخ استلام العمل": neprasNormalizeDate(basic.empStartDate),
    "المجموعة النوعية": neprasNormalizeText(job.jobClassDesc),
    "الوظيفة": neprasNormalizeText(job.jobDesc || staff?.jobName),
    "نوع المؤهل": neprasNormalizeText(qlf.qlfTypeName),
    "المؤهل": neprasNormalizeText(qlf.qlfName),
    "جهة الحصول": neprasNormalizeText(qlf.qlfEntityName),
    "تاريخ المؤهل": neprasNormalizeDate(qlf.empQlfDate),
    "المرحلة": neprasNormalizeText(job.stageDesc || basic.stageName),
    "مادة التدريس": neprasNormalizeText(job.subjectDesc),
    "الموقف من العمل": actualFlag,
    "اسم الجهة الأصلية": neprasNormalizeText(nadb.fromGehaName || basic.secondmentRelatedName || basic.schoolName),
    "الجهة الأصلية": neprasNormalizeText(nadb.fromGehaName || basic.schoolName),
    "الإدارة الأصلية": neprasNormalizeText(nadb.fromEdaraName || basic.edaraName),
    "المديرية الأصلية": neprasNormalizeText(nadb.fromMudriaName || basic.orgMudriaName),
    "جهة الندب": neprasNormalizeText(nadb.toGehaName || basic.toGehaName),
    "إدارة الندب": neprasNormalizeText(nadb.toEdaraName || basic.toEdaraName),
    "مديرية الندب": neprasNormalizeText(nadb.toMudriaName || basic.toMudriaName),
    "النوع الوظيفي": neprasNormalizeText(job.degreeDesc),
    "تصنيف العامل": category,
    "حالة التنزيل": ""
  };

  return row;
}

const NEPRAS_STAFF_DATA_FIELDS = [

    [
        "الرقم القومي",
        ["الرقم القومي"]
    ],

    [
        "نوع التوظيف",
        ["نوع التوظيف"]
    ],

    [
        "الاسم الأول",
        [
            "الاسم الأول",
            "الاسم الاول"
        ]
    ],

    [
        "اسم الأب",
        ["اسم الأب"]
    ],

    [
        "الجد",
        ["الجد"]
    ],

    [
        "اللقب",
        ["اللقب"]
    ],

    [
        "تاريخ الميلاد",
        ["تاريخ الميلاد"]
    ],

    [
        "محل الميلاد",
        ["محل الميلاد"]
    ],

    [
        "النوع",
        ["النوع"]
    ],

    [
        "الديانة",
        ["الديانة"]
    ],

    [
        "الحالة الاجتماعية",
        ["الحالة الاجتماعية"]
    ],

    [
        "تاريخ الحالة الاجتماعية",
        ["تاريخ الحالة الاجتماعية"]
    ],

    [
        "التليفون",
        [
            "التليفون",
            "الهاتف"
        ]
    ],

    [
        "محمول",
        [
            "محمول",
            "المحمول",
            "رقم المحمول"
        ]
    ],

    [
        "البريد الإلكتروني",
        [
            "البريد الإلكتروني",
            "البريد الالكتروني"
        ]
    ],

    [
        "محافظة العنوان",
        ["محافظة العنوان"]
    ],

    [
        "العنوان",
        ["العنوان"]
    ],

    [
        "تاريخ التعيين",
        ["تاريخ التعيين"]
    ],

    [
        "تاريخ استلام العمل",
        ["تاريخ استلام العمل"]
    ],

    [
        "المجموعة النوعية",
        ["المجموعة النوعية"]
    ],

    [
        "الوظيفة",
        [
            "الوظيفة",
            "الوظيفه"
        ]
    ],

    [
        "نوع المؤهل",
        ["نوع المؤهل"]
    ],

    [
        "المؤهل",
        ["المؤهل"]
    ],

    [
        "جهة الحصول",
        ["جهة الحصول"]
    ],

    [
        "تاريخ المؤهل",
        ["تاريخ المؤهل"]
    ],

    [
        "المرحلة",
        [
            "المرحلة",
            "المرحله"
        ]
    ],

    [
        "مادة التدريس",
        ["مادة التدريس"]
    ],

    [
        "الموقف من العمل",
        ["الموقف من العمل"]
    ],

    [
        "اسم الجهة الأصلية",
        [
            "اسم الجهة الأصلية",
            "الجهة الأصلية"
        ]
    ],

    [
        "الجهة الأصلية",
        ["الجهة الأصلية"]
    ],

    [
        "الإدارة الأصلية",
        ["الإدارة الأصلية"]
    ],

    [
        "المديرية الأصلية",
        ["المديرية الأصلية"]
    ],

    [
        "جهة الندب",
        ["جهة الندب"]
    ],

    [
        "إدارة الندب",
        ["إدارة الندب"]
    ],

    [
        "مديرية الندب",
        ["مديرية الندب"]
    ],

    [
        "النوع الوظيفي",
        ["النوع الوظيفي"]
    ]
];

// ==========================================================
// أدوات النصوص
// ==========================================================

function neprasLooseText(
    value
) {

    return neprasNormalizeText(
        value
    )
        .replace(
            /[ًٌٍَُِّْـ]/g,
            ""
        )
        .replace(
            /[إأآٱ]/g,
            "ا"
        )
        .replace(
            /ى/g,
            "ي"
        )
        .replace(
            /ة/g,
            "ه"
        )
        .toLowerCase();
}

function neprasCleanFieldLabel(
    text
) {

    return neprasLooseText(
        text
    )
        .replace(
            /[\*:：]+$/g,
            ""
        )
        .trim();
}

// ==========================================================
// قراءة قيمة عنصر
// ==========================================================

function neprasReadControlValue(
    el
) {

    if (!el) {
        return "";
    }

    const tag =
        el.tagName?.toLowerCase();

    if (tag === "select") {

        const selectedText =
            el.options?.[el.selectedIndex]?.text ||
            el.value ||
            "";

        return neprasNormalizeText(selectedText);
    }

    if (
        tag === "input" ||
        tag === "textarea"
    ) {

        return neprasNormalizeText(
            el.value ||
            el.getAttribute("value") ||
            ""
        );
    }

    return neprasNormalizeText(
        el.innerText ||
        el.textContent ||
        ""
    );
}

function neprasIsMeaningfulExtractedValue(value, labelText = "") {
    const v = neprasNormalizeText(value);
    if (!v) return false;
    if (/^\*+$/.test(v)) return false;
    if (/^42$/.test(v)) return false;
    if (/^yyyy[-/ ]mm[-/ ]dd$/i.test(v)) return false;
    if (/^اختر(?:\s+|$)/i.test(v)) return false;
    if (/^اختار(?:\s+|$)/i.test(v)) return false;
    if (labelText && neprasCleanFieldLabel(v) === neprasCleanFieldLabel(labelText)) return false;
    if (/^[*:：\-_.]+$/.test(v)) return false;

    // v1.0: صفحة تفاصيل العاملين تحتوي عناوين أقسام داخل نفس الحاوية.
    // الإصدارات السابقة كانت أحيانًا تعتبر عنوان القسم قيمة لحقل فارغ.
    const junk = neprasCleanFieldLabel(v);
    const sectionHeadings = new Set([
      neprasCleanFieldLabel("البيانات الاساسية"),
      neprasCleanFieldLabel("البيانات الأساسية"),
      neprasCleanFieldLabel("بيانات التعيين والوظيفة الحالية"),
      neprasCleanFieldLabel("بيانات التعيين"),
      neprasCleanFieldLabel("بيانات الوظيفة الحالية"),
      neprasCleanFieldLabel("بيانات المؤهل"),
      neprasCleanFieldLabel("بيانات الندب"),
      neprasCleanFieldLabel("بيانات الاتصال"),
      neprasCleanFieldLabel("بيانات الموظف")
    ]);
    if (sectionHeadings.has(junk)) return false;

    return true;
}

// ==========================================================
// هل العنصر ظاهر؟

function neprasIsVisible(
    el
) {

    if (
        !el ||
        el.nodeType !== 1
    ) {

        return false;
    }


    const st =
        getComputedStyle(el);


    return (
        st.display !== "none" &&
        st.visibility !== "hidden" &&
        st.opacity !== "0"
    );
}


// ==========================================================
// البحث عن قيمة حقل داخل صفحة الموظف
// ==========================================================

function neprasFindFieldValue(
    doc,
    aliases
) {

    const wanted = aliases.map(neprasCleanFieldLabel);

    const tryValue = (value, labelText = "") => {
        const v = neprasNormalizeText(value);
        return neprasIsMeaningfulExtractedValue(v, labelText) ? v : "";
    };

    for (const label of Array.from(doc.querySelectorAll("label"))) {
        const rawLabel = label.innerText || label.textContent || "";
        const labelText = neprasCleanFieldLabel(rawLabel);
        if (!wanted.includes(labelText)) continue;

        const forId = label.getAttribute("for");
        if (forId) {
            const target = doc.getElementById(forId);
            const value = tryValue(neprasReadControlValue(target), labelText);
            if (value) return value;
        }

        let parent = label;
        for (let level = 0; level < 6 && parent; level++, parent = parent.parentElement) {
            const controls = Array.from(parent.querySelectorAll("input:not([type='hidden']), textarea, select"))
                .filter(neprasIsVisible);

            for (const control of controls) {
                const value = tryValue(neprasReadControlValue(control), labelText);
                if (value) return value;
            }

            const children = Array.from(parent.children || []);
            const index = children.indexOf(label);
            const candidates = index >= 0
                ? children.slice(index + 1).concat(children.filter(x => x !== label))
                : children.filter(x => x !== label);

            for (const child of candidates) {
                if (!child || child.contains(label) || !neprasIsVisible(child)) continue;

                const nested = child.querySelector?.("input:not([type='hidden']), textarea, select");
                const value = nested
                    ? tryValue(neprasReadControlValue(nested), labelText)
                    : tryValue(child.innerText || child.textContent || "", labelText);

                if (value && value.length < 500) return value;
            }
        }
    }

    // احتياط إضافي لصفحات Angular التي لا تستخدم <label> بالشكل التقليدي:
    // ابحث عن نص الحقل ثم أقرب حاوية تحتوي على قيمة فعلية.
    const allElements = Array.from(doc.querySelectorAll("div,span,p,strong,b,td,th"));
    for (const alias of wanted) {
        for (const el of allElements) {
            if (!neprasIsVisible(el)) continue;
            const text = neprasCleanFieldLabel(el.innerText || el.textContent || "");
            if (text !== alias) continue;

            let box = el.parentElement;
            for (let level = 0; level < 5 && box; level++, box = box.parentElement) {
                const controls = Array.from(box.querySelectorAll("input:not([type='hidden']), textarea, select"))
                    .filter(neprasIsVisible);
                for (const control of controls) {
                    const value = tryValue(neprasReadControlValue(control), alias);
                    if (value) return value;
                }

                const texts = Array.from(box.children || [])
                    .filter(x => x !== el && neprasIsVisible(x))
                    .map(x => neprasNormalizeText(x.innerText || x.textContent || ""))
                    .filter(v => neprasIsMeaningfulExtractedValue(v, alias) && v.length < 500);

                if (texts.length) return texts[0];
            }
        }
    }

    return "";
}


// ==========================================================
// استخراج بيانات الموظف بالكامل
// ==========================================================

function neprasExtractFullStaffData(
    doc,
    staff
) {

    const data = {};


    for (
        const [
            column,
            aliases
        ]
        of NEPRAS_STAFF_DATA_FIELDS
    ) {

        data[column] =
            neprasFindFieldValue(
                doc,
                aliases
            );
    }


    const fullName = [
        data["الاسم الأول"],
        data["اسم الأب"],
        data["الجد"],
        data["اللقب"]
    ]
        .filter(Boolean)
        .join(" ")
        .replace(
            /\s+/g,
            " "
        )
        .trim();


    data["كود الموظف"] =
        neprasNormalizeText(
            staff?.code
        );


    data["اسم الموظف الكامل"] =
        (neprasIsMeaningfulExtractedValue(fullName) ? fullName : "") ||
        neprasNormalizeText(staff?.name);

    for (const key of Object.keys(data)) {
        if (!neprasIsMeaningfulExtractedValue(data[key])) data[key] = "";
    }


    data["تصنيف العامل"] =
        neprasNormalizeText(
            staff?._filterType
        );


    data["الموقف من العمل"] =
        data["الموقف من العمل"] ||
        neprasNormalizeText(
            staff?._filterStatus ||
            staff?.status
        );


    const ordered = {

        "كود الموظف":
            data["كود الموظف"],

        "اسم الموظف الكامل":
            data["اسم الموظف الكامل"]
    };


    for (
        const [
            column
        ]
        of NEPRAS_STAFF_DATA_FIELDS
    ) {

        ordered[column] =
            data[column] ||
            "";
    }


    ordered["تصنيف العامل"] =
        data["تصنيف العامل"];


    ordered["الموقف من العمل"] =
        ordered["الموقف من العمل"] ||
        data["الموقف من العمل"];


    ordered["حالة التنزيل"] =
        "";


    return ordered;
}




function neprasWaitForBridgeApi(endpoint, predicate = () => true, timeout = NEPRAS_STAFF_CONFIG_V13.responseTimeout) {
  return neprasBridgeWait((msg) => {
    if (msg.type !== "API_RESPONSE") return false;
    if (!String(msg.url || "").includes(endpoint)) return false;
    return predicate(msg);
  }, timeout);
}

async function neprasGetCachedFullData(empCode) {
  const requestId = `full_${empCode}_${Date.now()}`;
  neprasBridgeSend("GET_LAST_API", {
    requestId,
    endpoint: "/api/Employee/GetEmployeeFullData",
    empCode: String(empCode)
  });

  const result = await neprasBridgeWait((msg) =>
    msg.type === "LAST_API_RESPONSE" &&
    msg.requestId === requestId &&
    String(msg.empCode || msg.response?.data?.basicInfo?.empCode || "") === String(empCode) &&
    !!msg.response?.data?.basicInfo?.empCode
  , 5000);

  const data = result.response?.data;
  if (String(data?.basicInfo?.empCode) !== String(empCode)) return null;
  return data;
}

async function neprasRunSiteSearch(filter) {
  // IMPORTANT: do not automate Angular's internal search form.
  // The ministry site itself must perform the search. Nepras only reads the
  // currently displayed employee table after the user has executed the native search.
  const expectedType = neprasNormalizeText(filter?.type || "");
  const expectedStatus = neprasNormalizeText(filter?.status || "");

  const tableReady = await neprasEnsureCurrentList();
  if (!tableReady) {
    throw new Error("لم تظهر قائمة العاملين. نفّذ البحث من صفحة الوزارة أولًا.");
  }

  // Read the visible selected filters from the actual page controls.
  const typeSelect = document.querySelector('select[formcontrolname="nadbType"]');
  const statusSelect = document.querySelector('select[formcontrolname="empFlagControl"]');

  const actualType = neprasNormalizeText(
    typeSelect?.selectedOptions?.[0]?.text || typeSelect?.value || ""
  );
  const actualStatus = neprasNormalizeText(
    statusSelect?.selectedOptions?.[0]?.text || statusSelect?.value || ""
  );

  const typeMatches = !expectedType ||
    neprasLooseText(actualType).includes(neprasLooseText(expectedType));
  const statusMatches = !expectedStatus ||
    neprasLooseText(actualStatus).includes(neprasLooseText(expectedStatus));

  if (!typeMatches) {
    throw new Error(
      `النوع الحالي في بحث الوزارة هو «${actualType || "غير محدد"}»، والمطلوب «${expectedType}». اختره من بحث الوزارة ثم اضغط بحث.`
    );
  }

  if (!statusMatches) {
    throw new Error(
      `الموقف الحالي في بحث الوزارة هو «${actualStatus || "غير محدد"}»، والمطلوب «${expectedStatus}». اختره من بحث الوزارة ثم اضغط بحث.`
    );
  }

  const table = neprasGetStaffTable();
  const rows = table
    ? Array.from(table.querySelectorAll("tbody tr"))
        .filter((row) => row.querySelectorAll("td").length >= 4)
    : [];

  if (!rows.length) {
    throw new Error(
      `تم تحديد «${expectedType}${expectedStatus ? " — " + expectedStatus : ""}»، لكن جدول العاملين فارغ. اضغط «عرض كل العاملين» من موقع الوزارة ثم أعد زر التنزيل.`
    );
  }

  const data = [];
  for (const row of rows) {
    const staff = neprasExtractStaffFromRow(row);
    if (!staff?.code && !staff?.name) continue;
    data.push({
      empCode: String(staff.code || ""),
      fullName: staff.name || "",
      empFlag: expectedStatus || "",
      _category: expectedType,
      _status: expectedStatus,
      _viewButton: staff._viewButton || null
    });
  }

  return {
    data,
    recordsTotal: data.length,
    recordsFiltered: data.length,
    responseTime: Date.now(),
    source: "DOM_TABLE"
  };
}

async function neprasOpenEmployeeViaBridge(empCode) {
  const requestId = `open_${empCode}_${Date.now()}`;
  const startedAt = Date.now();

  neprasBridgeSend("OPEN_EMPLOYEE_DIRECT", {
    requestId,
    empCode: String(empCode)
  });

  await neprasBridgeWait((msg) =>
    msg.type === "EMPLOYEE_OPEN_DIRECT_STARTED" &&
    msg.requestId === requestId &&
    String(msg.empCode || '') === String(empCode)
  , 10000);

  return startedAt;
}

async function neprasNextStaffPage() {
  const requestId = `next_${Date.now()}`;
  const startedAt = Date.now();
  neprasBridgeSend("NEXT_PAGE", { requestId });
  await neprasBridgeWait((msg) =>
    msg.type === "NEXT_PAGE_STARTED" && msg.requestId === requestId
  , 10000);

  const endpoint = "/api/Employee/GetEmployeeByEmpFlag";
  // Caller will choose correct endpoint through filter; this helper only
  // signals the click. The actual response is handled by neprasWaitForBridgeApi.
  return startedAt;
}

async function neprasSaveStaffState(state) {
  await chrome.storage.local.set({ [NEPRAS_STAFF_STATE_KEY]: state });
}

async function neprasGetStaffState() {
  const result = await chrome.storage.local.get(NEPRAS_STAFF_STATE_KEY);
  const state = result?.[NEPRAS_STAFF_STATE_KEY] || null;
  // توافق مع حالة محفوظة من إصدار قبل تغيير اسم العمود «حالة السحب» → «حالة التنزيل».
  if (state && Array.isArray(state.results)) {
    for (const row of state.results) {
      if (row && row["حالة السحب"] !== undefined && row["حالة التنزيل"] === undefined) { // compat-legacy-term
        row["حالة التنزيل"] = row["حالة السحب"]; // compat-legacy-term
        delete row["حالة السحب"]; // compat-legacy-term
      }
    }
  }
  return state;
}

async function neprasClearStaffState() {
  await chrome.storage.local.remove(NEPRAS_STAFF_STATE_KEY);
}

function neprasIsEmployeeDetailPage() {
  return /\/dashboard\/employeeAllInformation/i.test(location.href) ||
    !!document.querySelector("app-employee-all-information");
}

function neprasIsStaffListPage() {
  return /\/dashboard\/employee(?:\?|$)/i.test(location.href) ||
    !!document.querySelector("app-employee-list");
}

async function neprasWaitForDetailDomData(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const host = document.querySelector("app-employee-all-information");
    const text = neprasNormalizeText(document.body?.innerText || "");
    const hasLabels = ["الرقم القومي", "الاسم الأول", "الوظيفة"].filter((x) => text.includes(x)).length >= 2;
    const controls = document.querySelectorAll(
      "app-employee-all-information input:not([type='hidden']), app-employee-all-information select, app-employee-all-information textarea"
    ).length;
    if (host && (hasLabels || controls >= 4)) return true;
    await new Promise((r) => setTimeout(r, 180));
  }
  return false;
}

async function neprasTryGetCachedApiDataQuick(empCode, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const cached = await neprasGetCachedFullData(empCode).catch(() => null);
    if (cached) return cached;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

function neprasCleanStaffRowValues(row) {
  const out = { ...(row || {}) };
  const junkLabels = new Set([
    "البيانات الاساسية",
    "البيانات الأساسية",
    "بيانات التعيين والوظيفة الحالية",
    "بيانات التعيين",
    "بيانات الوظيفة الحالية",
    "بيانات المؤهل",
    "بيانات الندب",
    "بيانات الاتصال",
    "بيانات الموظف",
    "التليفون",
    "الهاتف",
    "محمول",
    "محمول*",
    "المحمول",
    "رقم المحمول",
    "البريد الإلكتروني",
    "البريد الالكتروني",
    "تاريخ التعيين",
    "تاريخ التعيين *",
    "تاريخ استلام العمل",
    "تاريخ استلام العمل *"
  ].map(neprasCleanFieldLabel));

  const dateKeys = new Set([
    "تاريخ الميلاد",
    "تاريخ الحالة الاجتماعية",
    "تاريخ التعيين",
    "تاريخ استلام العمل",
    "تاريخ المؤهل"
  ]);
  const phoneKeys = new Set(["التليفون", "محمول"]);

  for (const key of Object.keys(out)) {
    let value = neprasNormalizeText(out[key]);
    const cleaned = neprasCleanFieldLabel(value);

    // لا نسمح أبدًا لعناوين الحقول أو الأقسام أن تتحول إلى بيانات.
    if (junkLabels.has(cleaned)) value = "";

    if (dateKeys.has(key)) {
      if (/^(?:01[\/-]01[\/-]1900|1[\/-]1[\/-]1900)$/.test(value)) {
        value = "";
      } else if (value && !/^(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})(?:\s.*)?$/.test(value)) {
        value = "";
      }
    }

    if (phoneKeys.has(key)) {
      // الهاتف الحقيقي أرقام فقط (مع السماح بعلامة + والمسافات/الشرطات).
      // أي كلمة label مثل «التليفون» أو «محمول*» تُحذف.
      const digits = String(value || "").replace(/\D/g, "");
      if (!value || digits.length < 6 || digits.length > 15) value = "";
    }

    if (key === "البريد الإلكتروني") {
      // لا نقبل 0 أو اسم حقل أو أي نص لا يشبه بريدًا إلكترونيًا.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) value = "";
    }

    out[key] = value;
  }

  return out;
}

function neprasMergeRows(primary, secondary) {
  const out = { ...(primary || {}) };
  for (const [k, v] of Object.entries(secondary || {})) {
    if ((!out[k] || !neprasNormalizeText(out[k])) && neprasNormalizeText(v)) out[k] = v;
  }
  return out;
}

async function neprasProcessDetailResume(state) {
  const staff = state.currentStaff;
  if (!staff?.empCode) return false;

  neprasShowBulkStatus(
    `📥 <b>تنزيل بيانات الموظف</b><br>` +
    `الموظف: <b>${staff.fullName || staff.empCode}</b><br>` +
    `الكود: <b>${staff.empCode}</b><br>` +
    `تم تنزيل: <b>${state.results.length}</b>`
  );

  try {
    // الصفحة نفسها تعرض البيانات بعد أن تنفذ Angular EmployeeFullData.
    // لذلك نعتمد أولًا على DOM بدل انتظار رسالة bridge، مما يمنع التوقف عند 0.
    const ready = await neprasWaitForDetailDomData(15000);
    if (!ready) throw new Error("لم تظهر بيانات الموظف في صفحة التفاصيل خلال المهلة.");
    if (neprasStaffStopRequested) return false;

    const domRow = neprasExtractFullStaffData(document, {
      code: staff.empCode,
      name: staff.fullName,
      _filterType: state.filter?.type,
      _filterStatus: state.filter?.status,
      status: staff.empFlag
    });
    domRow["كود الموظف"] = String(staff.empCode || domRow["كود الموظف"] || "");
    domRow["اسم الموظف الكامل"] = domRow["اسم الموظف الكامل"] || neprasNormalizeText(staff.fullName);
    domRow["تصنيف العامل"] = state.filter?.type || "";
    domRow["الموقف من العمل"] = domRow["الموقف من العمل"] || state.filter?.status || neprasNormalizeText(staff.empFlag);

    // إثراء سريع من API إن كان الرد جاهزًا بالفعل. لا ننتظر API طويلًا.
    const apiData = await neprasTryGetCachedApiDataQuick(staff.empCode, 8);
    let row = domRow;
    if (apiData) {
      const apiRow = neprasBuildStaffRowFromApi(apiData, staff, state.filter);
      row = neprasMergeRows(domRow, apiRow);
    }
    row["حالة التنزيل"] = "تم بنجاح";

    const existingIndex = state.results.findIndex((r) =>
      String(r["كود الموظف"] || "") === String(row["كود الموظف"] || "")
    );

    if (existingIndex >= 0) {
      state.results[existingIndex] = neprasMergeRows(state.results[existingIndex], row);
      state.results[existingIndex]["حالة التنزيل"] = "تم بنجاح";
    } else {
      state.results.push(row);
    }

    // ثبّت النتيجة فورًا، ثم انتقل مباشرة للموظف التالي بدون رجوع للقائمة.
    state.staffIndex += 1;
    state.currentStaff = null;
    state.detailStartedAt = 0;

    const nextStaff = state.currentPageStaff[state.staffIndex] || null;
    const finishedPage = !nextStaff;

    await neprasSaveStaffState(state);

    neprasShowBulkStatus(
      `✅ <b>تم تنزيل بيانات الموظف بنجاح</b><br>` +
      `الموظف: <b>${row["اسم الموظف الكامل"] || staff.fullName || staff.empCode}</b><br>` +
      `الكود: <b>${row["كود الموظف"] || staff.empCode}</b><br>` +
      `الموظف الحالي: <b>${state.staffIndex}</b> / <b>${state.currentPageStaff.length}</b><br>` +
      `تم تنزيل: <b>${state.results.length}</b>`
    );

    if (finishedPage) {
      await neprasFinishStaffRun(state);
      return true;
    }

    state.currentStaff = nextStaff;
    state.detailStartedAt = Date.now();
    await neprasSaveStaffState(state);

    neprasShowBulkStatus(
      `📊 <b>تنزيل جميع بيانات العاملين</b><br>` +
      `النوع: <b>${state.filter?.type || ''}</b>` +
      (state.filter?.status ? ` — <b>${state.filter.status}</b>` : ` — <b>بدون موقف من العمل</b>`) +
      `<br>الموظف: <b>${nextStaff.fullName || nextStaff.empCode}</b>` +
      `<br>الكود: <b>${nextStaff.empCode}</b>` +
      `<br>الموظف الحالي: <b>${state.staffIndex + 1}</b> / <b>${state.currentPageStaff.length}</b>` +
      `<br>تم تنزيل: <b>${state.results.length}</b>`
    );

    await new Promise((r) => setTimeout(r, NEPRAS_STAFF_CONFIG_V13.betweenEmployeesMs));
    await neprasOpenEmployeeViaBridge(nextStaff.empCode);
    return true;
  } catch (error) {
    const row = {
      "كود الموظف": String(staff.empCode || ""),
      "اسم الموظف الكامل": neprasNormalizeText(staff.fullName),
      "تصنيف العامل": state.filter?.type || "",
      "الموقف من العمل": state.filter?.status || neprasNormalizeText(staff.empFlag),
      "حالة التنزيل": `خطأ: ${error?.message || error}`
    };
    state.results.push(row);
    state.staffIndex += 1;
    state.currentStaff = null;
    state.detailStartedAt = 0;

    const nextStaff = state.currentPageStaff[state.staffIndex] || null;
    if (!nextStaff) {
      await neprasSaveStaffState(state);
      await neprasFinishStaffRun(state);
      return true;
    }

    state.currentStaff = nextStaff;
    state.detailStartedAt = Date.now();
    await neprasSaveStaffState(state);
    await neprasOpenEmployeeViaBridge(nextStaff.empCode);
    return true;
  }
}

async function neprasEnsureCurrentList() {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (document.querySelector("app-employee-list table tbody tr")) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function neprasProcessStaffState() {
  if (neprasStaffStopRequested) return;
  let state = await neprasGetStaffState();
  if (!state?.active) return;

  // Detail-page phase.
  if (neprasIsEmployeeDetailPage() && state.currentStaff?.empCode) {
    await neprasProcessDetailResume(state);
    return;
  }

  if (!neprasIsStaffListPage()) return;

  // Make sure the Angular list exists again after history.back().
  await neprasEnsureCurrentList();

  if (!state.filters?.length) state.filters = NEPRAS_STAFF_FILTERS_V13;
  if (state.filterIndex == null) state.filterIndex = 0;
  if (state.results == null) state.results = [];
  if (state.seenCodes == null) state.seenCodes = [];
  if (state.staffIndex == null) state.staffIndex = 0;
  if (state.currentPageStaff == null) state.currentPageStaff = [];
  if (state.recordsTotal == null) state.recordsTotal = 0;
  if (state.pageStart == null) state.pageStart = 0;

  const filter = state.filters[state.filterIndex];
  if (!filter) {
    await neprasFinishStaffRun(state);
    return;
  }

  state.filter = filter;

  // If we do not have a current page snapshot, use the real Angular search.
  if (!state.currentPageStaff.length || state.staffIndex >= state.currentPageStaff.length) {
    const shouldSearch = !state.currentPageStaff.length;

    if (shouldSearch) {
      neprasShowBulkStatus(
        `⏳ <b>تنزيل بيانات العاملين</b><br>` +
        `النوع: <b>${filter.type}</b>` +
        (filter.status ? `<br>الموقف: <b>${filter.status}</b>` : `<br><span style="color:#666">بدون اختيار موقف من العمل</span>`) +
        `<br>جاري تنزيل قائمة العاملين...`
      );

      const page = await neprasRunSiteSearch(filter);
      if (neprasStaffStopRequested) return;
      state.currentPageStaff = page.data.map((item) => ({
        ...item,
        empCode: item.empCode,
        fullName: item.fullName,
        _category: filter.type,
        _status: filter.status || "",
        _nadb: item
      }));
      state.recordsTotal = page.recordsTotal;
      state.pageStart = 0;
      state.staffIndex = 0;
      state.pageNo = 1;
      await neprasSaveStaffState(state);
    }
  }

  if (!state.currentPageStaff.length) {
    state.filterIndex += 1;
    state.currentPageStaff = [];
    state.staffIndex = 0;
    state.recordsTotal = 0;
    state.pageStart = 0;
    await neprasSaveStaffState(state);
    await neprasProcessStaffState();
    return;
  }

  // Page complete.
  if (state.staffIndex >= state.currentPageStaff.length) {
    const moreOnServer = false;
    if (moreOnServer && state.pageNo < NEPRAS_STAFF_CONFIG_V13.maxPages) {
      const startedAt = await neprasNextStaffPage();
      const endpoint = filter.status
        ? "/api/Employee/GetEmployeeByEmpFlag"
        : "/api/Employee/EmployeesNadb";
      const cachedRequestId = `next_cached_${startedAt}`;
      neprasBridgeSend("GET_LAST_API", {
        requestId: cachedRequestId,
        endpoint
      });

      const response = await neprasBridgeWait((msg) => {
        if (msg.type === "API_RESPONSE") {
          return String(msg.url || "").includes(endpoint) && msg.time >= startedAt && msg.ok && msg.data;
        }
        if (msg.type === "LAST_API_RESPONSE") {
          return msg.requestId === cachedRequestId &&
            String(msg.endpoint || "").includes(endpoint) &&
            Number(msg.response?.time || 0) >= startedAt &&
            !!msg.response?.ok && !!msg.response?.data;
        }
        return false;
      }, NEPRAS_STAFF_CONFIG_V13.responseTimeout);

      const responsePayload = response.type === "LAST_API_RESPONSE"
        ? response.response
        : response;
      if (neprasStaffStopRequested) return;
      const pageData = responsePayload.data?.data || [];
      if (!pageData.length) {
        state.filterIndex += 1;
        state.currentPageStaff = [];
        state.staffIndex = 0;
        state.recordsTotal = 0;
        state.pageStart = 0;
      } else {
        state.currentPageStaff = pageData.map((item) => ({
          ...item,
          empCode: item.empCode,
          fullName: item.fullName,
          _category: filter.type,
          _status: filter.status || "",
          _nadb: item
        }));
        state.pageStart += state.currentPageStaff.length;
        state.staffIndex = 0;
        state.pageNo = (state.pageNo || 1) + 1;
      }
      await neprasSaveStaffState(state);
      return neprasProcessStaffState();
    }

    // Next filter.
    state.filterIndex += 1;
    state.currentPageStaff = [];
    state.staffIndex = 0;
    state.recordsTotal = 0;
    state.pageStart = 0;
    state.pageNo = 1;
    await neprasSaveStaffState(state);
    return neprasProcessStaffState();
  }

  const staff = state.currentPageStaff[state.staffIndex];
  if (!staff?.empCode) {
    state.staffIndex += 1;
    await neprasSaveStaffState(state);
    return neprasProcessStaffState();
  }

  // Before navigating, save everything in extension storage.
  state.currentStaff = staff;
  state.detailStartedAt = Date.now();
  await neprasSaveStaffState(state);

  neprasShowBulkStatus(
    `📊 <b>تنزيل جميع بيانات العاملين</b><br>` +
    `النوع: <b>${filter.type}</b>` +
    (filter.status ? ` — <b>${filter.status}</b>` : ` — <b>بدون موقف من العمل</b>`) +
    `<br>الموظف: <b>${staff.fullName || staff.empCode}</b>` +
    `<br>الكود: <b>${staff.empCode}</b>` +
    `<br>الموظف الحالي: <b>${state.staffIndex + 1}</b> / <b>${state.currentPageStaff.length}</b>` +
    `<br>تم تنزيل: <b>${state.results.length}</b>`
  );

  try {
    await neprasOpenEmployeeViaBridge(staff.empCode);
  } catch (error) {
    state.results.push({
      "كود الموظف": String(staff.empCode),
      "اسم الموظف الكامل": neprasNormalizeText(staff.fullName),
      "تصنيف العامل": filter.type,
      "الموقف من العمل": filter.status || neprasNormalizeText(staff.empFlag),
      "حالة التنزيل": `خطأ: ${error?.message || error}`
    });
    state.staffIndex += 1;
    state.currentStaff = null;
    await neprasSaveStaffState(state);
    return neprasProcessStaffState();
  }
}

async function neprasFinishStaffRun(state) {
  try {
    neprasShowBulkStatus(
      `⏳ <b>اكتمل جمع بيانات العاملين</b><br>` +
      (state.mode === "NADB" ? `النوع: <b>منتدب</b><br>` : `النوع: <b>قوة أساسية</b><br>`) +
      (state.filter?.status ? `الموقف: <b>${state.filter.status}</b><br>` : ``) +
      `إجمالي السجلات: <b>${state.results.length}</b><br>` +
      `جاري إنشاء ملف Excel...`
    );

    neprasExportAllStaffToExcelV13(state.results, state.mode);

    const success = state.results.filter((r) => r["حالة التنزيل"] === "تم بنجاح").length;
    const errors = state.results.length - success;

    neprasShowBulkStatus(
      `✅ <b>اكتمل تنزيل جميع بيانات العاملين</b><br><br>` +
      (state.mode === "NADB" ? `النوع: <b>منتدب</b><br>` : `النوع: <b>قوة أساسية</b><br>`) +
      (state.filter?.status ? `الموقف: <b>${state.filter.status}</b><br>` : ``) +
      `<br>إجمالي السجلات: <b>${state.results.length}</b><br>` +
      `تم بنجاح: <b>${success}</b><br>` +
      `أخطاء: <b>${errors}</b><br><br>` +
      `📥 تم إنشاء ملف Excel منسق.`
    );

    window.neprasDialog?.success(
      `✅ تم الانتهاء من تنزيل بيانات العاملين.\n\n` +
      (state.mode === "NADB" ? `النوع: منتدب\n` : `النوع: قوة أساسية\n`) +
      (state.filter?.status ? `الموقف: ${state.filter.status}\n\n` : `\n`) +
      `إجمالي السجلات: ${state.results.length}\n` +
      `تم بنجاح: ${success}\n` +
      `أخطاء: ${errors}`
    );
  } finally {
    await neprasClearStaffState();
    neprasAllStaffRunning = false;
  }
}

// ZIP/XLSX writing (CRC32, zip container, column letters, XML escaping, cells, table styles, table sheet,
// package assembly) lives in modules/xlsx_writer.js, shared with modules/export.js and modules/attendance.js.
// Here only the staff data is described: column widths, the summary sheet and the title.

function neprasStaffWidth(headers,rows,c){
  let m=Math.max(12,String(headers[c]??"").length+4);
  for(let r=0;r<Math.min(rows.length,700);r++){
    const value=String(rows[r]?.[c]??"").replace(/[\r\n]+/g," ").trim();
    m=Math.max(m,value.length+2);
  }
  if(neprasXlsxIsNationalIdHeader(headers[c]))return 22;
  const h=String(headers[c]??"");
  if(/الاسم الكامل|اسم العامل|اسم الموظف/.test(h))return Math.min(50,Math.max(30,m));
  if(/العنوان|الوظيفة|المؤهل|التخصص|المادة|الجهة|الإدارة|المديرية|الموقف|حالة/.test(h))return Math.min(60,Math.max(28,m));
  return Math.min(c===1?50:44,Math.max(12,m));
}

function neprasBuildStaffWorkbook(headers, rows, title, summaryRows, infoLines = []) {
  const cleanTitle=String(title || "بيانات العاملين").replace(/^نبراس\s*[—\-:|]\s*/i, "").trim() || "بيانات العاملين";
  const sheet1=neprasXlsxBuildTableSheetXml({
    headers,
    rows,
    title:cleanTitle,
    infoLines,
    countLine:`عدد العاملين: ${rows.length} — توثيق رسمي: نبراس لإدارة الحكومة الإلكترونية`,
    widths:headers.map((_,c)=>neprasStaffWidth(headers,rows,c)),
    rightAlignCols:[1, 2],
    numericCols:[0],
    selected:true,
    printFit:true,
    footerSigners:["مسئول شؤون العاملين", "وكيل شؤون العاملين", "مدير المدرسة"]
  });
  let sumXml="";summaryRows.forEach((r,ri)=>{const rr=ri+1;sumXml+=`<row r="${rr}">`;r.forEach((v,c)=>{const styleId=ri===0?7:(ri===1?1:(c===0?3:4));sumXml+=neprasXlsxTextCell(`${neprasZipColumnName(c)}${rr}`,v,styleId);});sumXml+=`</row>`;});
  const sheet2=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B${Math.max(1,summaryRows.length)}"/><sheetViews><sheetView rightToLeft="1" showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="68" customWidth="1"/></cols><sheetData>${sumXml}</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
  return neprasXlsxBuildPackage({
    sheets:[{name:"بيانات العاملين",xml:sheet1},{name:"ملخص",xml:sheet2}],
    stylesXml:NEPRAS_XLSX_TABLE_STYLES
  });
}

async function neprasExportAllStaffToExcelV13(rows, mode = "CORE", options = {}) {
  // v1.0: partial=true is used only when the user stops the staff pull.
  // The workbook then contains exactly the employees completed up to that moment.
  const isPartial = options?.partial === true;
  // v1.0: الاسم الكامل كافٍ للمستخدم؛ أجزاء الاسم تبقى داخلية فقط ولا تُصدر في Excel.
  const drop = new Set(["الاسم الأول", "اسم الأب", "الجد", "اللقب"]);
  const cleanRows = (rows || []).map(neprasCleanStaffRowValues);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ neprasCachedStaffList: cleanRows }).catch(() => {});
    }
    if (typeof window !== 'undefined') {
      window.neprasCachedStaffList = cleanRows;
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  const baseHeaders = NEPRAS_STAFF_HEADERS_V13.filter(h => !drop.has(h));
  const extra = [];
  for (const row of cleanRows) for (const key of Object.keys(row || {})) if (!baseHeaders.includes(key) && !drop.has(key) && !extra.includes(key)) extra.push(key);
  const headers = [...baseHeaders, ...extra];
  const normalized = cleanRows.map(row => headers.map(h => neprasNormalizeText(row?.[h] || "")));
  const success = cleanRows.filter(r => {
    const state = String(r?.["حالة التنزيل"] || "");
    return state === "تم بنجاح" || state.startsWith("تم — بيانات القائمة");
  }).length;
  const errors = cleanRows.length - success;
  const label = mode === "NADB" ? "العاملين المنتدبين" : mode === "PARTTIME" ? "معلمي الحصة" : mode === "BOTH" ? "جميع العاملين" : "العاملين الأساسيين";
  const summary = [[(globalThis.NeprasBrand?.name || "نبراس"), ""],["تقرير تنزيل جميع بيانات العاملين", label],["النوع",label]];
  if (isPartial) summary.push(["حالة الملف", "جزئي — تم الإيقاف بواسطة المستخدم"]);
  summary.push(["تاريخ التنزيل",new Date().toLocaleString("ar-EG")],["إجمالي السجلات",String(normalized.length)],["تم بنجاح",String(success)],["به أخطاء",String(errors)]);
  const reportTitle = isPartial ? `بيانات ${label} — حتى لحظة الإيقاف` : `بيانات ${label}`;

  const foundSchool = cleanRows.find(r => r["الجهة"] || r["اسم الجهة الأصلية"] || r["الجهة الأصلية"]);
  const rawSch = foundSchool?.["الجهة"] || foundSchool?.["اسم الجهة الأصلية"] || foundSchool?.["الجهة الأصلية"] || "";
  const foundDir = cleanRows.find(r => r["المديرية الأصلية"] || r["مديرية الندب"]);
  const rawDir = foundDir?.["المديرية الأصلية"] || foundDir?.["مديرية الندب"] || "";
  const foundAdm = cleanRows.find(r => r["الإدارة الأصلية"] || r["إدارة الندب"]);
  const rawAdm = foundAdm?.["الإدارة الأصلية"] || foundAdm?.["إدارة الندب"] || "";

  const gov = rawDir ? (rawDir.startsWith("مديرية") ? rawDir : `مديرية التربية والتعليم بـ${rawDir}`) : "مديرية التربية والتعليم";
  const adm = rawAdm ? (rawAdm.includes("إدارة") ? (rawAdm.endsWith("التعليمية") ? rawAdm : `${rawAdm} التعليمية`) : `إدارة ${rawAdm} التعليمية`) : "الإدارة التعليمية";
  const sch = rawSch ? (rawSch.startsWith("مدرسة") ? rawSch : `مدرسة ${rawSch}`) : "المدرسة";
  const year = (globalThis.NeprasEgypt?.academicYearLabel?.() || "2026 / 2027").replace(" / ", "-");

  const infoLines = [
    gov,
    adm,
    sch,
    `العام الدراسي: ${year}`
  ];

  const bytes = neprasBuildStaffWorkbook(headers, normalized, reportTitle, summary, infoLines);
  const d = new Date();
  const stamp = [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0"),String(d.getHours()).padStart(2,"0"),String(d.getMinutes()).padStart(2,"0")].join("-");
  const modeLabel = mode === "BOTH" ? "جميع_العاملين" : mode === "NADB" ? "العاملين_المنتدبين" : mode === "PARTTIME" ? "معلمي_الحصة" : "العاملين_الأساسي";
  const blob = new Blob([bytes], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const partialTag = isPartial ? "_حتى_لحظة_الإيقاف" : "";
  const rawFileName = `بيانات_${modeLabel}${partialTag}_${stamp}.xlsx`;
  const successTitle = isPartial ? "تم حفظ البيانات التي تم تنزيلها حتى الإيقاف" : "تم تنزيل بيانات العاملين بنجاح";
  const successMessage = isPartial ? "تم حفظ ما اكتمل تنزيله حتى لحظة الإيقاف." : "تم إنشاء ملف بيانات العاملين بنجاح.";
  if (window.neprasDialog?.triggerDownload) {
    await window.neprasDialog.triggerDownload(blob, rawFileName, { title: successTitle, message: successMessage, folder: "بيانات العاملين" });
  } else {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download=rawFileName; a.style.display="none"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
}

let neprasAllStaffRunning = false;

const NEPRAS_STAFF_MODE_CONFIG = {
  CORE: {
    filter: { type: "قوة أساسية", status: "علي رأس عملة" },
    label: "العاملين الأساسيين",
    fileLabel: "العاملين_الأساسي"
  },
  NADB: {
    // المنتدب ليس له «الموقف من العمل».
    filter: { type: "منتدب", status: "" },
    label: "العاملين المنتدبين",
    fileLabel: "العاملين_المنتدبين"
  }
};



// ==========================================================
// Stable staff helpers restored from original working source
// ==========================================================
function neprasGetStaffTable() {

    const tables =
        Array.from(
            document.querySelectorAll(
                "app-employee-list table"
            )
        );


    if (!tables.length) {

        return Array.from(
            document.querySelectorAll(
                "table"
            )
        )
            .find(
                t =>
                    /كود الموظف|اسم الموظف|الموظف/i
                        .test(
                            neprasNormalizeText(
                                t.innerText
                            )
                        )
            ) ||
            null;
    }


    return tables.find(
        t =>
            /كود الموظف|اسم الموظف|الموظف/i
                .test(
                    neprasNormalizeText(
                        t.innerText
                    )
                )
    ) ||
    tables[0];
}

function neprasExtractStaffFromRow(
    row
) {

    if (!row) {
        return null;
    }


    const cells =
        Array.from(
            row.querySelectorAll(
                "td"
            )
        );


    if (!cells.length) {
        return null;
    }


    const text =
        cells.map(
            cell =>
                neprasNormalizeText(
                    cell.innerText ||
                    cell.textContent ||
                    ""
                )
        );


    console.log(
        "Nepras: خلايا الصف:",
        text
    );


    let code = "";
    let name = "";


    // ======================================
    // البحث عن كود الموظف
    // ======================================

    for (
        const value
        of text
    ) {

        const cleaned =
            value.replace(
                /\s/g,
                ""
            );


        if (
            /^\d{4,}$/.test(
                cleaned
            )
        ) {

            code =
                cleaned;

            break;
        }
    }


    // ======================================
    // البحث عن الاسم
    // ======================================

    for (
        const value
        of text
    ) {

        if (!value) {
            continue;
        }


        const cleaned =
            value.replace(
                /\s/g,
                ""
            );


        if (
            /^\d{4,}$/.test(
                cleaned
            )
        ) {
            continue;
        }


        if (
            neprasLooseText(
                value
            ).includes(
                "عرض"
            )
        ) {
            continue;
        }


        if (
            value.length > 4 &&
            /[ء-ي]/.test(
                value
            )
        ) {

            name =
                value;

            break;
        }
    }


    // ======================================
    // زر عرض
    // ======================================

    let viewButton =
        null;


    try {

        viewButton =
            document.evaluate(
                "./td[6]/div/button/a",
                row,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

    } catch (error) {

        console.warn(
            "Nepras: تعذر استخدام XPath لزر العرض:",
            error
        );
    }


    // احتياط: الخلية السادسة

    if (
        !viewButton &&
        cells[5]
    ) {

        viewButton =
            cells[5].querySelector(
                "a,button,[role='button']"
            );
    }


    // احتياط أخير

    if (!viewButton) {

        viewButton =
            Array.from(
                row.querySelectorAll(
                    "a,button,[role='button']"
                )
            )
                .find(
                    el => {

                        const value =
                            neprasLooseText(
                                el.innerText ||
                                el.textContent ||
                                el.getAttribute(
                                    "aria-label"
                                ) ||
                                el.title ||
                                ""
                            );


                        return value.includes(
                            "عرض"
                        );
                    }
                );
    }


    console.log(
        "Nepras: الموظف المستخرج:",
        {
            code,
            name,
            hasViewButton:
                !!viewButton
        }
    );


    return {

        code,

        name,

        status: "",

        _viewButton:
            viewButton ||
            null
    };
}


// ==========================================================
// 🧭 Stable worker-tab extraction (one employee per tab)
// القائمة الرئيسية لا تغادر مكانها. كل موظف يفتح في تبويب عامل مستقل.
// ==========================================================



// ----------------------------------------------------------
// جعل رسالة الإنجاز قابلة للإغلاق مع إخفاء تلقائي
// ----------------------------------------------------------
function neprasMakeFinishedStatusClosable(autoHideMs = 20000) {
  // بطاقة النتيجة في نظام الرسائل الموحّد قابلة للإغلاق وتختفي تلقائيًا (نجاح 12ث، تحذير 20ث، الخطأ يبقى).
  // الدالة باقية لأن 13 موضع استدعاء ما زال يناديها.
}

// ==========================================================
// 📄 سحب صحف الأحوال PDF - الأساسي + المنتدب
// ==========================================================
let neprasStatusSheetBatch = null;

// Phase 1b: the legacy DOM-scraping + worker-tab status-sheet pipeline
// (neprasRunStatusSheetsPdfBatchLegacy and everything it called: page
// scraping helpers, the worker-tab orchestration, and the download-ready
// message handlers) has been removed — it had zero callers. The current
// button uses neprasRunStatusSheetsPdfBatch -> neprasRunStatusSheetsPdfMemoryV1766
// (direct API + in-memory PDF merge, see below), which shares only the
// neprasStatusSheetBatch mutex variable above with the old code. See
// PHASE_NOTES.md, "Phase 1b".

async function neprasHandleStaffWorkerOpen(task) {
  if (!task?.empCode) throw new Error('كود الموظف غير موجود.');
  neprasStaffWorkerContext = task;
  neprasStaffWorkerHandled = false;

  try {
    // تبويب العامل لا يحتاج قائمة العاملين ولا زر "عرض".
    // لدينا empCode بالفعل، لذلك نستخدم مسار employeeAllInformation
    // مباشرة عبر bridge داخل نفس تبويب Angular.
    const requestId = `worker_open_direct_${task.empCode}_${Date.now()}`;
    neprasBridgeSend('OPEN_EMPLOYEE_DIRECT', {
      requestId,
      empCode: String(task.empCode)
    });

    await neprasBridgeWait(
      (msg) =>
        msg.type === 'EMPLOYEE_OPEN_DIRECT_STARTED' &&
        msg.requestId === requestId &&
        String(msg.empCode || '') === String(task.empCode),
      20000
    );

    const start = Date.now();
    while (!neprasIsEmployeeDetailPage() && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 150));
    }

    const ready = await neprasWaitForDetailDomData(30000);
    if (!ready) throw new Error('لم تظهر بيانات الموظف في صفحة التفاصيل.');

    const row = neprasExtractFullStaffData(document, {
      code: String(task.empCode),
      name: task.fullName || '',
      _filterType: task.filter?.type || '',
      _filterStatus: task.filter?.status || '',
      status: task.empFlag || ''
    });

    row['كود الموظف'] = String(task.empCode);
    row['اسم الموظف الكامل'] = row['اسم الموظف الكامل'] || neprasNormalizeText(task.fullName || '');
    row['تصنيف العامل'] = task.filter?.type || '';
    row['الموقف من العمل'] = row['الموقف من العمل'] || task.filter?.status || neprasNormalizeText(task.empFlag || '');
    row['حالة التنزيل'] = 'تم بنجاح';

    await chrome.runtime.sendMessage({
      action: 'STAFF_WORKER_RESULT',
      taskId: task.taskId,
      workerTabId: task.workerTabId,
      ok: true,
      row
    });
  } catch (error) {
    await chrome.runtime.sendMessage({
      action: 'STAFF_WORKER_RESULT',
      taskId: task.taskId,
      workerTabId: task.workerTabId,
      ok: false,
      row: {
        'كود الموظف': String(task.empCode || ''),
        'اسم الموظف الكامل': neprasNormalizeText(task.fullName || ''),
        'تصنيف العامل': task.filter?.type || '',
        'الموقف من العمل': task.filter?.status || '',
        'حالة التنزيل': `خطأ: ${error?.message || error}`
      }
    });
  }
}

// Result/finish messages arrive back in the stable main listing tab.


// ==========================================================
// 🚀 v1.0: محرك المعلمين السريع عبر API الحقيقي للموقع
// - قائمة العاملين: بحث وزارة واحد لكل فئة ثم Responses الحقيقية.
// - التفاصيل: GetEmployeeFullData بتوازي آمن.
// - صحف الأحوال: CRevisionNew01 مباشرة + PDF واحد مجمع.
// - الرجوع تلقائيًا للمسار القديم عند فشل الـAPI السريع.
// ==========================================================

const NEPRAS_TEACHER_FAST_V172 = {
  detailConcurrency: 6,
  pdfConcurrency: 4,
  retries: 1,
  apiTimeout: 30000,
  listLength: 100
};

let neprasTeacherFastRunning = false;

function neprasTeacherNorm(value) {
  return neprasLooseText(value || "");
}

function neprasTeacherIsPartTime(staff) {
  const haystack = neprasNormalizeText([
    staff?.jobName,
    staff?.empFlag,
    staff?.recruitmentTypeDesc,
    staff?.employmentType,
    staff?.fullName
  ].filter(Boolean).join(" "));
  return /معلم\s*بال(?:حصه|حصة)|معلم\s*حصه|بالحص[هة]/i.test(haystack);
}

function neprasTeacherSamePlace(a, b) {
  const x = neprasTeacherNorm(a);
  const y = neprasTeacherNorm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

async function neprasTeacherDirectApi({
  method = "GET",
  url,
  body = null,
  responseType = "json",
  timeout = NEPRAS_TEACHER_FAST_V172.apiTimeout,
  customHeaders = null
}) {
  const requestId =
    `teacher_api_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  neprasBridgeSend(
    "DIRECT_API_REQUEST",
    {
      requestId,
      method,
      url,
      body,
      responseType,
      timeout,
      customHeaders
    }
  );

  const msg =
    await neprasBridgeWait(
      m =>
        m.requestId === requestId &&
        (
          m.type ===
            "DIRECT_API_RESULT" ||
          m.type ===
            "BRIDGE_COMMAND_ERROR"
        ),
      timeout + 1500
    );

  if (
    msg?.type ===
    "BRIDGE_COMMAND_ERROR"
  ) {
    throw new Error(
      msg?.message ||
      "تعذر تنزيل بيانات العاملين."
    );
  }

  if (!msg?.ok) {
    throw new Error(
      msg?.message ||
      "تعذر تنزيل بيانات العاملين."
    );
  }

  return msg;
}

async function neprasTeacherDirectApiRetry(options, retries = NEPRAS_TEACHER_FAST_V172.retries) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    neprasV24AssertRunning();
    try {
      const result = await neprasTeacherDirectApi(options);
      neprasV24AssertRunning();
      return result;
    } catch (error) {
      if (error?.code === "USER_STOPPED" || neprasV24StopRequested || neprasStaffStopRequested) {
        throw neprasV24MakeUserStopError();
      }
      lastError = error;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 450 + attempt * 350));
      }
    }
  }
  throw lastError || new Error("فشل طلب API المعلمين.");
}


function neprasTeacherExpectedListTotalV1764(payload, fallbackCount = 0) {
  const filtered = Number(payload?.recordsFiltered);
  const total = Number(payload?.recordsTotal);
  const fallback = Math.max(0, Number(fallbackCount) || 0);

  if (Number.isFinite(filtered) && filtered >= 0) {
    // DataTables may expose recordsFiltered=0 before a filter is applied in a few builds.
    // Never let that hide rows that actually arrived from the current request.
    if (filtered > 0 || fallback === 0) return filtered;
  }

  if (Number.isFinite(total) && total >= 0) {
    return Math.max(total, fallback);
  }

  return fallback;
}

function neprasTeacherDedupListRowsV1764(rows) {
  const dedup = new Map();
  for (const item of Array.isArray(rows) ? rows : []) {
    const code = String(item?.empCode || '').trim();
    if (!code) continue;
    if (!dedup.has(code)) dedup.set(code, item);
  }
  return [...dedup.values()];
}

async function neprasTeacherSearchAndCaptureList(mode) {
  // v1.0: every run MUST build a fresh inventory from the ministry now.
  // Never trust the currently rendered table because it may be paginated or stale
  // after a teacher is added/removed without reloading the page.
  await neprasV24WaitListPage(15000).catch(async () => {
    await neprasV24OpenMenuList();
    await neprasV24WaitListPage(15000);
  });

  const config = NEPRAS_STAFF_MODE_CONFIG[mode];
  const endpoint = mode === "CORE"
    ? "/api/Employee/GetEmployeeByEmpFlag"
    : "/api/Employee/EmployeesNadb";

  const requestId =
    `teacher_list_${mode}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const startedAt = Date.now();

  neprasBridgeSend("SEARCH_STAFF", {
    requestId,
    filterType: config.filter.type,
    filterStatus: config.filter.status || ""
  });

  await neprasBridgeWait(
    m =>
      m.type === "SEARCH_STARTED" &&
      m.requestId === requestId,
    15000
  );

  const response = await neprasBridgeWait(
    m =>
      m.type === "API_RESPONSE" &&
      String(m.url || "").includes(endpoint) &&
      Number(m.time || 0) >= startedAt &&
      m.ok &&
      m.data,
    30000
  );

  const payload = response?.data || {};
  const firstData = Array.isArray(payload.data) ? payload.data : [];
  const expectedTotal = neprasTeacherExpectedListTotalV1764(payload, firstData.length);
  const originalBody =
    response?.requestBody && typeof response.requestBody === "object"
      ? { ...response.requestBody }
      : null;

  let all = [...firstData];

  // The first page shown by the site is commonly 10/25/100 rows.
  // Continue by server start/length until the CURRENT filtered count is exhausted.
  if (expectedTotal > firstData.length) {
    if (!originalBody) {
      throw new Error(
        `تعذر التأكد من العدد الحالي للعاملين (${firstData.length} من ${expectedTotal}).`
      );
    }

    const directUrl =
      mode === "CORE"
        ? "https://professopi.emis.gov.eg/api/Employee/GetEmployeeByEmpFlag"
        : "https://professopi.emis.gov.eg/api/Employee/EmployeesNadb";

    const pageLength = Math.max(
      1,
      Number(originalBody.length || firstData.length || NEPRAS_TEACHER_FAST_V172.listLength)
    );

    const firstStart = Math.max(0, Number(originalBody.start || 0));
    let startOffset = firstStart + pageLength;
    let guard = 0;
    // FINAL: الحارس يعتمد على العدد الحالي الذي أعاده سيرفر الوزارة، وليس حدًا ثابتًا لعدد العاملين.
    const maxPageRequests = Math.max(2, Math.ceil(Math.max(0, expectedTotal - firstStart) / pageLength) + 3);

    while (startOffset < expectedTotal) {
      neprasV24AssertRunning();
      if (++guard > maxPageRequests) {
        throw new Error("تعذر إنهاء تنزيل قائمة العاملين الحالية بأمان.");
      }

      const body = {
        ...originalBody,
        start: startOffset,
        length: pageLength
      };

      const next = await neprasTeacherDirectApiRetry({
        method: "POST",
        url: directUrl,
        body
      });

      const rows = Array.isArray(next?.data?.data)
        ? next.data.data
        : [];

      if (!rows.length) break;
      all.push(...rows);
      startOffset += pageLength;
    }
  }

  const currentRows = neprasTeacherDedupListRowsV1764(all);

  // Critical integrity rule: never export a silent partial snapshot.
  // If the ministry says N workers exist now, Nepras must have N unique codes now.
  if (expectedTotal > 0 && currentRows.length < expectedTotal) {
    throw new Error(
      `قائمة العاملين الحالية غير مكتملة: تم العثور على ${currentRows.length} من ${expectedTotal}. سيتم إعادة المحاولة بدل تصدير بيانات ناقصة.`
    );
  }

  return {
    data: currentRows,
    recordsTotal: expectedTotal,
    requestBody: originalBody,
    capturedAt: Date.now(),
    complete: expectedTotal === 0 || currentRows.length >= expectedTotal
  };
}


async function neprasTeacherCaptureNadbFromSiteV1724() {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    neprasV24AssertRunning();

    const requestId =
      `teacher_nadb_native_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    try {
      neprasBridgeSend("SEARCH_NADB_NATIVE", { requestId });

      await neprasBridgeWait(
        m => m.type === "SEARCH_STARTED" && m.requestId === requestId,
        10000
      );

      const response = await neprasBridgeWait(
        m =>
          m.type === "API_RESPONSE" &&
          String(m.url || "").includes("/api/Employee/EmployeesNadb") &&
          m.ok &&
          m.data &&
          Number(m.time || 0) >= startedAt - 1000,
        12000
      );

      const payload = response?.data || {};
      const firstRows = Array.isArray(payload?.data) ? payload.data : [];
      const expectedTotal = neprasTeacherExpectedListTotalV1764(payload, firstRows.length);
      const requestBody =
        response?.requestBody && typeof response.requestBody === "object"
          ? { ...response.requestBody }
          : null;

      let all = [...firstRows];

      if (expectedTotal > firstRows.length) {
        if (!requestBody) {
          throw new Error(
            `تعذر التأكد من العدد الحالي للمنتدبين (${firstRows.length} من ${expectedTotal}).`
          );
        }

        const pageLength = Math.max(
          1,
          Number(requestBody.length || firstRows.length || NEPRAS_TEACHER_FAST_V172.listLength)
        );
        const firstStart = Math.max(0, Number(requestBody.start || 0));
        let startOffset = firstStart + pageLength;
        let guard = 0;
        // FINAL: عدد الصفحات محسوب من العدد الحالي للمنتدبين، بلا حد مدرسي ثابت.
        const maxPageRequests = Math.max(2, Math.ceil(Math.max(0, expectedTotal - firstStart) / pageLength) + 3);

        while (startOffset < expectedTotal) {
          neprasV24AssertRunning();
          if (++guard > maxPageRequests) throw new Error("تعذر إنهاء تنزيل قائمة المنتدبين الحالية بأمان.");

          const next = await neprasTeacherDirectApiRetry({
            method: "POST",
            url: "https://professopi.emis.gov.eg/api/Employee/EmployeesNadb",
            body: {
              ...requestBody,
              start: startOffset,
              length: pageLength
            }
          });

          const rows = Array.isArray(next?.data?.data) ? next.data.data : [];
          if (!rows.length) break;
          all.push(...rows);
          startOffset += pageLength;
        }
      }

      const currentRows = neprasTeacherDedupListRowsV1764(all);
      if (expectedTotal > 0 && currentRows.length < expectedTotal) {
        throw new Error(
          `قائمة المنتدبين الحالية غير مكتملة: تم العثور على ${currentRows.length} من ${expectedTotal}.`
        );
      }

      return {
        data: currentRows,
        recordsTotal: expectedTotal,
        requestBody,
        capturedAt: Date.now(),
        complete: expectedTotal === 0 || currentRows.length >= expectedTotal
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 700));
      }
    }
  }

  throw lastError || new Error("تعذر تنزيل بيانات المنتدبين.");
}



async function neprasTeacherLoadListsFast(wantedModes = ["CORE", "NADB"]) {
  const result = {
    core: [],
    nadbAll: [],
    nadbIncoming: [],
    currentSchoolName: "",
    currentSchoolCode: 0,
    currentEdaraCode: 0
  };

  neprasShowBulkStatus(
    `🚀 <b>جاري تجهيز بيانات العاملين</b><br>` +
    `تنزيل القوة الأساسية...`
  );

  const coreResp =
    await neprasTeacherSearchAndCaptureList(
      "CORE"
    );

  result.core =
    coreResp.data;

  result.currentSchoolCode =
    Number(
      coreResp?.requestBody?.schoolCode ||
      0
    );

  result.currentEdaraCode =
    Number(
      coreResp?.requestBody?.EdaraCode ||
      0
    );

  result.currentSchoolName =
    neprasNormalizeText(
      result.core.find(
        x =>
          x?.schoolName
      )?.schoolName ||
      result.core.find(
        x =>
          x?.gehaName
      )?.gehaName ||
      ""
    );


  if (
    wantedModes.includes(
      "NADB"
    )
  ) {
    neprasShowBulkStatus(
      `🚀 <b>جاري تجهيز بيانات العاملين</b><br>` +
      `تم تنزيل القوة الأساسية: <b>${result.core.length}</b><br>` +
      `جاري تنزيل المنتدبين...`
    );

    const coreBody =
      coreResp?.requestBody || {};

    const schoolCode =
      Number(
        coreBody?.schoolCode ||
        coreBody?.GehaCode ||
        0
      );

    const edaraCode =
      Number(
        coreBody?.EdaraCode ||
        coreBody?.edaraCode ||
        0
      );

    if (!schoolCode) {
      throw new Error(
        "تعذر تحديد بيانات المدرسة."
      );
    }

    const nadbResp =
      await neprasTeacherDirectApiRetry({
        method:
          "POST",
        url:
          "https://professopi.emis.gov.eg/api/Employee/EmployeesNadb",
        body: {
          draw:
            1,
          columns:
            [],
          order:
            [],
          start:
            0,
          length:
            100,
          search: {
            value:
              "",
            regex:
              false
          },
          GehaCode:
            schoolCode,
          userType:
            4
        },
        customHeaders: {
          ed:
            String(
              edaraCode || 0
            ),
          md:
            "0",
          sc:
            String(
              schoolCode
            ),
          ty:
            "4"
        },
        timeout:
          12000
      });

    result.nadbAll =
      Array.isArray(
        nadbResp?.data?.data
      )
        ? nadbResp.data.data
        : [];

    result.nadbIncoming =
      result.nadbAll.filter(
        item => {
          if (
            !result.currentSchoolName
          ) {
            return true;
          }

          return neprasTeacherSamePlace(
            item?.toGehaName,
            result.currentSchoolName
          );
        }
      );
  }

  return result;
}

async function neprasTeacherMapConcurrent(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      neprasV24AssertRunning();
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      if (onProgress) onProgress(i + 1, items.length, results[i]);
    }
  }

  const count = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: count }, () => runner()));
  return results;
}

async function neprasTeacherFetchFullRowFast(staff, mode) {
  const config =
    NEPRAS_STAFF_MODE_CONFIG[
      mode
    ];

  try {
    // v1.0: لا نرسل ed/sc بقيمة 0 لأنها كانت تطغى على رؤوس الجلسة
    // الصحيحة التي التقطها الموقع نفسه. نضيفها فقط إذا كانت معلومة فعلاً.
    const customHeaders = {
      ty: "4",
      md: "0"
    };

    const resolvedEdaraCode = Number(
      staff?.__edaraCode ||
      staff?.toEdaraCode ||
      staff?.edaraCode ||
      0
    );
    const resolvedSchoolCode = Number(
      staff?.__schoolCode ||
      staff?.schoolCode ||
      0
    );

    if (resolvedEdaraCode > 0) customHeaders.ed = String(resolvedEdaraCode);
    if (resolvedSchoolCode > 0) customHeaders.sc = String(resolvedSchoolCode);

    const res = await neprasTeacherDirectApiRetry({
      method: "POST",
      url: "https://professopi.emis.gov.eg/api/Employee/GetEmployeeFullData",
      body: {
        empCode: Number(staff.empCode)
      },
      customHeaders,
      timeout: 12000
    });

    if (!res?.data?.basicInfo) {
      throw new Error("لم يرجع الموقع البيانات الأساسية للموظف.");
    }

    const enrichedStaff = {
      ...staff,
      _category: config.filter.type,
      _status: config.filter.status || "",
      _nadb: staff
    };

    const row = neprasBuildStaffRowFromApi(
      res.data,
      enrichedStaff,
      config.filter
    );

    if (!neprasTeacherFastRowCompleteV1765(row, res.data, staff)) {
      throw new Error("FAST_INCOMPLETE_DATA");
    }

    row["حالة التنزيل"] = "تم بنجاح";
    return row;
  } catch (error) {
    if (error?.code === "USER_STOPPED" || neprasV24StopRequested || neprasStaffStopRequested) {
      throw neprasV24MakeUserStopError();
    }
    return {
      "كود الموظف": String(staff.empCode || ""),
      "اسم الموظف الكامل": neprasNormalizeText(staff.fullName || ""),
      "تصنيف العامل": config.filter.type,
      "الموقف من العمل": config.filter.status || neprasNormalizeText(staff.empFlag),
      "حالة التنزيل": `خطأ: ${error?.message || error}`
    };
  }
}


// ==========================================================
// ✅ v1.0 — Native Site Requests Only
// الموقع نفسه يفتح الموظف ويصدر الطلب الطبيعي.
// نبراس يلتقط Response فقط.
// ==========================================================

let neprasTeacherNativeRunActive = false;

// ==========================================================
// v1.0 — Adaptive Teacher Site Health Engine
// لا يرسل أي طلب API جديد ولا يلمس Authorization/MSAL.
// يقرأ فقط نتائج الطلبات الطبيعية التي ينفذها موقع الوزارة نفسه
// ويختار بين مسار طبيعي ومسار متحمل للبطء بصورة تلقائية.
// ==========================================================
const NEPRAS_TEACHER_HEALTH = {
  mode: "NORMAL",
  lastModeChangeAt: 0,
  degradedUntil: 0,
  lastReason: "",
  consecutiveHealthy: 0,
  consecutiveNetworkFailures: 0,
  lastNetworkFailureAt: 0,
  circuitOpenUntil: 0
};

function neprasTeacherRecentApiMessages(windowMs = 45000) {
  const now = Date.now();
  return (window.__neprasBridgeMessageQueue || [])
    .filter(msg =>
      msg?.type === "API_RESPONSE" &&
      /professopi\.emis\.gov\.eg|\/api\/Employee\/|\/api\/Helpers\//i.test(String(msg?.url || "")) &&
      now - Number(msg?.time || 0) <= windowMs
    );
}

function neprasTeacherPageShowsNetworkFailure() {
  try {
    const text = neprasNormalizeText(document.body?.innerText || "");
    return /Http failure response|Unknown Error|GetEmployeeFullData:\s*0|GetDropDowns:\s*0/i.test(text);
  } catch (_) {
    return false;
  }
}


function neprasTeacherObserveDegraded(reason = "الموقع غير مستقر") {
  const now = Date.now();

  NEPRAS_TEACHER_HEALTH.mode = "DEGRADED";
  NEPRAS_TEACHER_HEALTH.lastModeChangeAt = now;
  NEPRAS_TEACHER_HEALTH.degradedUntil =
    Math.max(
      Number(NEPRAS_TEACHER_HEALTH.degradedUntil || 0),
      now + 45000
    );
  NEPRAS_TEACHER_HEALTH.lastReason =
    String(reason || "الموقع غير مستقر");
  NEPRAS_TEACHER_HEALTH.consecutiveHealthy = 0;

  // مهم:
  // الرصد السلبي لخطأ قديم/ظاهر في الصفحة لا يفتح Circuit Breaker.
  // القاطع لا يعمل إلا بعد فشل محاولة حقيقية جديدة.
}

function neprasTeacherMarkDegraded(reason = "بطء أو فشل اتصال") {
  const now = Date.now();
  NEPRAS_TEACHER_HEALTH.mode = "DEGRADED";
  NEPRAS_TEACHER_HEALTH.lastModeChangeAt = now;
  NEPRAS_TEACHER_HEALTH.degradedUntil = now + 120000;
  NEPRAS_TEACHER_HEALTH.lastReason = String(reason || "بطء أو فشل اتصال");
  NEPRAS_TEACHER_HEALTH.consecutiveHealthy = 0;
  NEPRAS_TEACHER_HEALTH.consecutiveNetworkFailures += 1;
  NEPRAS_TEACHER_HEALTH.lastNetworkFailureAt = now;

  // Circuit breaker: after repeated network failures, stop pressing
  // the ministry site for a short period instead of hammering retries.
  if (NEPRAS_TEACHER_HEALTH.consecutiveNetworkFailures >= 2) {
    const extra = Math.min(
      18000,
      5000 + (NEPRAS_TEACHER_HEALTH.consecutiveNetworkFailures - 2) * 2500
    );
    NEPRAS_TEACHER_HEALTH.circuitOpenUntil =
      Math.max(NEPRAS_TEACHER_HEALTH.circuitOpenUntil || 0, now + extra);
  }
}

function neprasTeacherMarkHealthy() {
  NEPRAS_TEACHER_HEALTH.consecutiveHealthy += 1;

  if (NEPRAS_TEACHER_HEALTH.consecutiveHealthy >= 2) {
    NEPRAS_TEACHER_HEALTH.consecutiveNetworkFailures = 0;
    NEPRAS_TEACHER_HEALTH.circuitOpenUntil = 0;
  }

  if (
    NEPRAS_TEACHER_HEALTH.mode === "DEGRADED" &&
    Date.now() >= NEPRAS_TEACHER_HEALTH.degradedUntil &&
    NEPRAS_TEACHER_HEALTH.consecutiveHealthy >= 3
  ) {
    NEPRAS_TEACHER_HEALTH.mode = "NORMAL";
    NEPRAS_TEACHER_HEALTH.lastModeChangeAt = Date.now();
    NEPRAS_TEACHER_HEALTH.lastReason = "استقرت استجابات الموقع";
  }
}

function neprasTeacherGetAdaptivePlan() {
  const messages = neprasTeacherRecentApiMessages(45000);

  const statusZero = messages.filter(
    m => Number(m?.status || 0) === 0
  );

  const dropDownZero = statusZero.filter(
    m => String(m?.url || "").includes("/api/Helpers/GetDropDowns")
  ).length;

  const fullDataZero = statusZero.filter(
    m => String(m?.url || "").includes("/api/Employee/GetEmployeeFullData")
  ).length;

  const serverErrors = messages.filter(
    m => Number(m?.status || 0) >= 500
  ).length;

  const healthyEmployeeResponses = messages.filter(
    m =>
      m?.ok &&
      Number(m?.status || 0) >= 200 &&
      Number(m?.status || 0) < 300 &&
      /\/api\/Employee\//i.test(String(m?.url || ""))
  ).length;

  const pageError = neprasTeacherPageShowsNetworkFailure();

  // v1.0:
  // هذه مجرد إشارات حالة للموقع؛ لا نحسبها كـ"فشل محاولة"
  // ولا نفتح Circuit Breaker بسبب نفس الخطأ القديم كل مرة.
  if (dropDownZero >= 1) {
    neprasTeacherObserveDegraded(
      "خدمة تجهيز القوائم بالموقع غير مستقرة حاليًا"
    );
  } else if (fullDataZero >= 1) {
    neprasTeacherObserveDegraded(
      "خدمة بيانات الموظف غير مستقرة حاليًا"
    );
  } else if (statusZero.length >= 1) {
    neprasTeacherObserveDegraded(
      "تم رصد استجابة شبكة غير مستقرة من موقع الوزارة"
    );
  } else if (serverErrors >= 2) {
    neprasTeacherObserveDegraded(
      "تم رصد أخطاء مؤقتة من خادم الوزارة"
    );
  } else if (pageError) {
    neprasTeacherObserveDegraded(
      "رسالة فشل اتصال قديمة/حالية ظاهرة في صفحة الوزارة"
    );
  } else if (healthyEmployeeResponses >= 2) {
    neprasTeacherMarkHealthy();
  }

  const degraded =
    NEPRAS_TEACHER_HEALTH.mode === "DEGRADED" ||
    Date.now() < Number(NEPRAS_TEACHER_HEALTH.degradedUntil || 0);

  return degraded ? {
    mode: "DEGRADED",
    label: "🟠 وضع الموقع المزدحم",
    reason: NEPRAS_TEACHER_HEALTH.lastReason || "استجابة الموقع غير مستقرة",
    searchAttempts: 5,
    searchWaitMs: 13000,
    openAttempts: 4,
    openStartedWaitMs: 9000,
    detailWaitMs: 14000,

    // الـAPI إثراء فقط بعد ظهور DOM؛ لا ننتظره طويلًا.
    apiWaitMs: 900,

    retryBaseMs: 1300,
    betweenEmployeesMs: 500
  } : {
    mode: "NORMAL",
    label: "🟢 الوضع الطبيعي",
    reason: "استجابة الموقع مستقرة",
    searchAttempts: 3,
    searchWaitMs: 6500,
    openAttempts: 2,
    openStartedWaitMs: 7000,
    detailWaitMs: 6500,
    apiWaitMs: 650,
    retryBaseMs: 350,
    betweenEmployeesMs: 90
  };
}

function neprasTeacherRowHasUsefulDomData(row) {
  if (!row) return false;

  const important = [
    "اسم الموظف الكامل",
    "الرقم القومي",
    "نوع التوظيف",
    "تاريخ الميلاد",
    "محل الميلاد",
    "النوع",
    "الديانة",
    "العنوان",
    "تاريخ استلام العمل",
    "الوظيفة",
    "المؤهل",
    "المرحلة"
  ];

  const count = important.filter(
    key => !!neprasNormalizeText(row?.[key] || "")
  ).length;

  // صفحة التفاصيل الحقيقية عادة تعطينا عددًا كبيرًا من هذه الحقول.
  // لا نشترط أن تكون كل الخانات ممتلئة؛ بعض بيانات الوزارة فارغة فعلًا.
  return (
    !!neprasNormalizeText(row?.["اسم الموظف الكامل"] || "") &&
    count >= 5
  );
}

async function neprasTeacherWaitForCircuit(plan, context = "") {
  const now = Date.now();
  const until = Number(NEPRAS_TEACHER_HEALTH.circuitOpenUntil || 0);

  if (plan?.mode !== "DEGRADED" || until <= now) {
    return;
  }

  const remaining = Math.min(18000, Math.max(0, until - now));

  if (!remaining) return;

  neprasShowBulkStatus(
    `🟠 <b>جاري الانتظار لحظات لاستكمال التنزيل...</b><br>` +
    `سيستكمل نبراس تلقائيًا.`
  );

  const step = 500;
  let left = remaining;
  while (left > 0) {
    neprasV24AssertRunning();
    await new Promise(resolve => setTimeout(resolve, Math.min(step, left)));
    left -= step;
  }
}

async function neprasTeacherAdaptiveBackoff(attempt, plan, reason = "") {
  await neprasTeacherWaitForCircuit(plan, reason);

  const base = Number(plan?.retryBaseMs || 400);
  const delay = Math.min(5000, base * Math.max(1, attempt + 1));
  neprasShowBulkStatus(
    `${plan?.mode === "DEGRADED" ? "🟠" : "🟢"} <b>جاري استكمال التنزيل...</b>`
  );
  await new Promise(resolve => setTimeout(resolve, delay));
}

function neprasTeacherNativeListRow(staff, mode) {
  const config = NEPRAS_STAFF_MODE_CONFIG[mode];

  return {
    "كود الموظف": String(staff?.empCode || ""),
    "اسم الموظف الكامل": neprasNormalizeText(staff?.fullName || ""),
    "نوع التوظيف": neprasNormalizeText(
      staff?.empFlag || (mode === "NADB" ? "منتدب" : "")
    ),
    "الوظيفة": neprasNormalizeText(staff?.jobName || ""),
    "الجهة": neprasNormalizeText(
      staff?.schoolName ||
      staff?.gehaName ||
      staff?.toGehaName ||
      staff?.fromGehaName ||
      ""
    ),
    "الإدارة الأصلية": neprasNormalizeText(
      staff?.edaraName ||
      staff?.fromEdaraName ||
      ""
    ),
    "المديرية الأصلية": neprasNormalizeText(
      staff?.mudriaName ||
      staff?.fromMudriaName ||
      ""
    ),
    "تصنيف العامل": neprasNormalizeText(staff?.__neprasStaffCategory || config?.filter?.type || mode),
    "الموقف من العمل":
      mode === "NADB"
        ? ""
        : (
            config?.filter?.status ||
            neprasNormalizeText(staff?.empFlag || "")
          ),
    "حالة التنزيل": "تم — بيانات القائمة"
  };
}



function neprasTeacherReadCurrentTableRowsDomV1732() {
  const table = neprasGetStaffTable() || document.querySelector('table');
  if (!table) return [];

  const result = [];
  const seen = new Set();

  for (const tr of table.querySelectorAll('tbody tr')) {
    const cells = Array.from(tr.querySelectorAll('td'));
    if (!cells.length) continue;

    let empCode = '';
    for (const cell of cells) {
      const candidate = String(cell.textContent || '').replace(/\D/g, '');
      if (candidate.length >= 5 && candidate.length <= 10) {
        empCode = candidate;
        break;
      }
    }
    if (!empCode || seen.has(empCode)) continue;
    seen.add(empCode);

    const fullName = neprasNormalizeText(cells[1]?.textContent || '');
    const jobName = neprasNormalizeText(cells[2]?.textContent || '');
    const gehaName = neprasNormalizeText(cells[3]?.textContent || '');
    const empFlag = neprasNormalizeText(cells[4]?.textContent || '');

    result.push({
      empCode,
      fullName,
      jobName,
      gehaName,
      schoolName: gehaName,
      empFlag
    });
  }

  return result;
}

function neprasTeacherDomHasEmployeeV1732(empCode) {
  const code = String(empCode || '').trim();
  if (!code) return false;
  return neprasTeacherReadCurrentTableRowsDomV1732().some(
    row => String(row?.empCode || '') === code
  );
}


async function neprasTeacherSearchEmployeeCodeV1733(staff) {
  const code = String(staff?.empCode || '').replace(/\D/g, '').trim();
  if (!code) throw new Error('كود الموظف غير موجود.');

  await neprasTeacherNativeReturnToList();

  if (neprasTeacherDomHasEmployeeV1732(code)) {
    return true;
  }

  let lastError = null;
  let plan = neprasTeacherGetAdaptivePlan();

  for (let attempt = 0; attempt < plan.searchAttempts; attempt++) {
    neprasV24AssertRunning();
    plan = neprasTeacherGetAdaptivePlan();

    try {
      const requestId = `teacher_code_${code}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      neprasBridgeSend('SEARCH_EMPLOYEE_CODE_NATIVE', {
        requestId,
        empCode: code
      });

      await neprasBridgeWait(
        msg =>
          msg.type === 'EMPLOYEE_CODE_SEARCH_STARTED' &&
          msg.requestId === requestId &&
          String(msg.empCode || '') === code,
        Math.min(5000, plan.openStartedWaitMs)
      ).catch(() => null);

      const started = Date.now();
      while (Date.now() - started < plan.searchWaitMs) {
        neprasV24AssertRunning();
        if (neprasTeacherDomHasEmployeeV1732(code)) {
          neprasTeacherMarkHealthy();
          return true;
        }

        const bridgeError = (window.__neprasBridgeMessageQueue || [])
          .slice(-30)
          .find(m => m?.type === 'BRIDGE_COMMAND_ERROR' && m?.requestId === requestId);
        if (bridgeError) {
          throw new Error(bridgeError.message || 'فشل البحث المباشر عن الموظف.');
        }

        const recentZero = neprasTeacherRecentApiMessages(8000)
          .some(
            m =>
              Number(m?.status || 0) === 0 &&
              Number(m?.time || 0) >= started - 250
          );
        if (recentZero) {
          neprasTeacherObserveDegraded(
            'الموقع أعاد استجابة شبكة غير مستقرة أثناء البحث عن الموظف'
          );
          plan = neprasTeacherGetAdaptivePlan();
        }

        await new Promise(r => setTimeout(r, plan.mode === 'DEGRADED' ? 320 : 180));
      }

      lastError = new Error(`لم يظهر الموظف ${code} بعد البحث المباشر.`);
      neprasTeacherMarkDegraded(lastError.message);
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || error || '');
      if (/Unknown Error|Status\s*0|0 Unknown|انتهت مهلة|timeout|network/i.test(msg)) {
        neprasTeacherMarkDegraded(msg);
      }
    }

    plan = neprasTeacherGetAdaptivePlan();
    if (attempt < plan.searchAttempts - 1) {
      await neprasTeacherAdaptiveBackoff(attempt, plan, `تعذر تجهيز الموظف ${code} مؤقتًا.`);
    }
  }

  throw lastError || new Error(`تعذر البحث عن الموظف ${code}.`);
}

async function neprasTeacherEnsureCoreTableV1730() {
  await neprasV24WaitListPage(10000);

  // v1.0: force a NEW ministry search on every extraction.
  // A rendered table can be an old snapshot and can contain only one page.
  const coreResp = await neprasTeacherSearchAndCaptureList("CORE");

  if (!Array.isArray(coreResp?.data)) {
    throw new Error("تعذر تجهيز قائمة القوة الأساسية الحالية.");
  }

  if (
    Number(coreResp?.recordsTotal || 0) > 0 &&
    coreResp.data.length < Number(coreResp.recordsTotal)
  ) {
    throw new Error(
      `قائمة القوة الأساسية غير مكتملة (${coreResp.data.length} من ${coreResp.recordsTotal}).`
    );
  }

  return coreResp;
}

async function neprasTeacherNativeReturnToList() {
  if (neprasIsStaffListPage()) {
    await neprasV24WaitListPage(8000);
    return;
  }

  // v1.0: ممنوع history.back() أثناء محرك العاملين.
  // الفيديو أثبت أن الرجوع بسجل المتصفح قد يعمل Full Document Reload،
  // وده يمسح حالة JavaScript ويوقف العداد بعد الموظف الحالي.
  // الرجوع الآن يتم من رابط «بيانات الموظفين» داخل Angular نفسه،
  // وبالتالي يبقى نفس المستند ونفس عملية السحب شغالة.
  await neprasV24OpenMenuList();
  await neprasV24WaitListPage(12000);
  await new Promise(r => setTimeout(r, 220));
}

async function neprasTeacherNativeOpenAndCapture(staff, mode) {
  const code = String(staff?.empCode || "").trim();

  if (!code) {
    throw new Error("كود الموظف غير موجود.");
  }

  const isPartTime = neprasTeacherIsPartTime(staff);
  const config = NEPRAS_STAFF_MODE_CONFIG[mode];
  let lastError = null;
  let plan = neprasTeacherGetAdaptivePlan();

  await neprasTeacherSearchEmployeeCodeV1733(staff);

  for (let attempt = 0; attempt < plan.openAttempts; attempt++) {
    neprasV24AssertRunning();
    plan = neprasTeacherGetAdaptivePlan();

    const requestId =
      `native_emp_${code}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    neprasShowBulkStatus(
      `${plan.mode === "DEGRADED" ? "🟠" : "🟢"} <b>جاري تنزيل بيانات الموظف</b><br>` +
      `الموظف: <b>${neprasNormalizeText(staff?.fullName || code)}</b>`
    );

    try {
      neprasBridgeSend("OPEN_EMPLOYEE", {
        requestId,
        empCode: code
      });

      await neprasBridgeWait(
        msg =>
          msg.type === "EMPLOYEE_OPEN_STARTED" &&
          msg.requestId === requestId &&
          String(msg.empCode || "") === code,
        plan.openStartedWaitMs
      );

      // v1.0 — DOM FIRST:
      // إذا صفحة الموظف ظهرت وبها بيانات كاملة نقرأها فورًا.
      // لا ننتظر API متعطل بينما البيانات أمامنا بالفعل.
      const domReady = await neprasWaitForDetailDomData(
        plan.detailWaitMs
      );

      let domRow = null;

      if (domReady) {
        domRow = neprasExtractFullStaffData(document, {
          code,
          name: staff?.fullName || "",
          _filterType: config?.filter?.type || "",
          _filterStatus:
            mode === "NADB"
              ? ""
              : (config?.filter?.status || ""),
          status: staff?.empFlag || ""
        });

        domRow["كود الموظف"] = code;
        domRow["اسم الموظف الكامل"] =
          domRow["اسم الموظف الكامل"] ||
          neprasNormalizeText(staff?.fullName || "");

        domRow = neprasCleanStaffRowValues(domRow);
      }

      // رد API أصبح إثراءً اختياريًا قصيرًا فقط.
      // نجرب cache أولًا لأن الموقع ربما أرسل الرد أثناء تحميل الصفحة.
      let apiData = null;

      try {
        if (typeof neprasGetCachedFullData === "function") {
          for (let quick = 0; quick < 3; quick++) {
            apiData =
              await neprasGetCachedFullData(code)
                .catch(() => null);

            if (apiData?.basicInfo) break;

            await new Promise(
              resolve => setTimeout(resolve, 100)
            );
          }
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

      if (!apiData?.basicInfo) {
        const apiMsg =
          await neprasBridgeWait(
            msg =>
              msg.type === "API_RESPONSE" &&
              String(msg.url || "").includes("/api/Employee/GetEmployeeFullData") &&
              msg.ok &&
              String(msg?.data?.basicInfo?.empCode || "") === code &&
              Number(msg.time || 0) >= startedAt - 800,
            plan.apiWaitMs
          ).catch(() => null);

        apiData = apiMsg?.data || null;
      }

      let row = null;

      if (apiData?.basicInfo) {
        row = neprasBuildStaffRowFromApi(
          apiData,
          {
            ...staff,
            _category: config?.filter?.type || "",
            _status:
              mode === "NADB"
                ? ""
                : (config?.filter?.status || ""),
            _nadb: staff
          },
          {
            type: config?.filter?.type || "",
            status:
              mode === "NADB"
                ? ""
                : (config?.filter?.status || "")
          }
        );

        row = neprasCleanStaffRowValues(row);
      }

      if (domRow) {
        // API أولًا ثم DOM يملأ الناقص، مع تنظيف القيم الوهمية.
        row = row
          ? neprasMergeRows(row, domRow)
          : domRow;
      }

      if (row) {
        row = neprasCleanStaffRowValues(row);
      }

      // لو DOM واضح ومفيد، نعتبر الموظف ناجحًا حتى لو API نفسه واقع.
      // دي أهم قاعدة في v1.0.
      const domIsUseful =
        neprasTeacherRowHasUsefulDomData(domRow);

      if (!apiData?.basicInfo && domIsUseful) {
        neprasTeacherObserveDegraded(
          "بيانات الصفحة متاحة رغم بطء API — تم الاعتماد على الصفحة"
        );
      }

      if (!row) {
        const zeroSeen = neprasTeacherRecentApiMessages(12000)
          .some(
            m =>
              Number(m?.status || 0) === 0 &&
              Number(m?.time || 0) >= startedAt - 500
          );

        if (zeroSeen) {
          // فشل فعلي للمحاولة الحالية: هنا فقط نفتح مسار retry/circuit.
          neprasTeacherMarkDegraded(
            'تعذر الحصول على بيانات الموظف من الصفحة والـAPI في المحاولة الحالية'
          );
          throw new Error(
            'الموقع لم يُرجع بيانات الموظف مؤقتًا.'
          );
        }

        throw new Error(
          "لم تظهر بيانات الموظف من API أو صفحة التفاصيل."
        );
      }

      row["كود الموظف"] = code;
      row["اسم الموظف الكامل"] =
        row["اسم الموظف الكامل"] ||
        neprasNormalizeText(staff?.fullName || "");
      row["تصنيف العامل"] = neprasNormalizeText(staff?.__neprasStaffCategory || row["تصنيف العامل"] || config?.filter?.type || mode);
      row["الموقف من العمل"] = mode === "NADB"
        ? ""
        : (row["الموقف من العمل"] || config?.filter?.status || neprasNormalizeText(staff?.empFlag || ""));
      row["حالة التنزيل"] = "تم بنجاح";

      // نجاح قراءة بيانات موظف من الصفحة أو API دليل مباشر أن المسار يعمل الآن.
      NEPRAS_TEACHER_HEALTH.circuitOpenUntil = 0;
      NEPRAS_TEACHER_HEALTH.consecutiveNetworkFailures = 0;
      neprasTeacherMarkHealthy();

      await neprasTeacherNativeReturnToList();
      return row;
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || error || '');
      if (/Unknown Error|Status\s*0|0 Unknown|انتهت مهلة|timeout|network|لم تظهر بيانات/i.test(msg)) {
        neprasTeacherMarkDegraded(msg);
      }

      await neprasTeacherNativeReturnToList().catch(() => {});
      plan = neprasTeacherGetAdaptivePlan();

      if (attempt < plan.openAttempts - 1) {
        await neprasTeacherAdaptiveBackoff(attempt, plan, `تعذر تنزيل بيانات ${staff?.fullName || code} مؤقتًا.`);
        try {
          await neprasTeacherSearchEmployeeCodeV1733(staff);
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }
    }
  }

  if (isPartTime) {
    return {
      ...neprasTeacherNativeListRow(staff, mode),
      "حالة التنزيل": "تم — بيانات القائمة فقط (تفاصيل معلم الحصة غير متاحة)"
    };
  }

  throw lastError || new Error("تعذر تنزيل بيانات الموظف بعد المحاولات الذكية.");
}

async function neprasTeacherNativeGetLists(wantedModes) {
  const result = {
    core: [],
    nadb: [],
    coreExpected: 0,
    nadbExpected: 0,
    currentSchoolName: "",
    capturedAt: Date.now()
  };

  if (
    wantedModes.includes(
      "CORE"
    ) ||
    wantedModes.includes(
      "NADB"
    )
  ) {
    neprasShowBulkStatus(
      `📊 <b>جاري تجهيز بيانات العاملين</b><br>` +
      `تنزيل القائمة الحالية...`
    );

    // v1.0:
    // لا نعيد تشغيل بحث القوة الأساسية إذا الجدول الحالي جاهز.
    const coreResp =
      await neprasTeacherEnsureCoreTableV1730();

    result.core = Array.isArray(coreResp?.data) ? coreResp.data : [];
    result.coreExpected = Number(coreResp?.recordsTotal || result.core.length || 0);

    result.currentSchoolName =
      neprasNormalizeText(
        result.core.find(
          x =>
            x?.schoolName
        )?.schoolName ||
        result.core.find(
          x =>
            x?.gehaName
        )?.gehaName ||
        ""
      );
  }

  if (
    wantedModes.includes(
      "NADB"
    )
  ) {
    neprasShowBulkStatus(
      `📊 <b>جاري تجهيز بيانات العاملين</b><br>` +
      `جاري تنزيل المنتدبين...`
    );

    // الانتقال للمنتدب مرة واحدة فقط بعد تجهيز الأساسي.
    let nadbResp = null;
    let rows = [];

    try {
      nadbResp = await neprasTeacherCaptureNadbFromSiteV1724();
      rows = Array.isArray(nadbResp?.data) ? nadbResp.data : [];
      result.nadbExpected = Number(nadbResp?.recordsTotal || rows.length || 0);
    } catch (error) {
      // v1.0: never fall back to the currently rendered page because it can be
      // only the first page or an old snapshot. Try a second fresh server-backed
      // search route; if that cannot be verified, fail instead of exporting partial data.
      const altResp = await neprasTeacherSearchAndCaptureList("NADB");
      rows = Array.isArray(altResp?.data) ? altResp.data : [];
      result.nadbExpected = Number(altResp?.recordsTotal || rows.length || 0);
    }

    // The API request is already scoped to the logged-in school. A name-only filter
    // can accidentally drop a valid newly-added/delegated employee when ministry text
    // differs by punctuation/spelling. Use it only when it does NOT reduce the server snapshot.
    if (result.currentSchoolName && rows.length) {
      const sameSchoolRows = rows.filter(item =>
        neprasTeacherSamePlace(item?.toGehaName, result.currentSchoolName)
      );
      if (
        sameSchoolRows.length === rows.length ||
        (result.nadbExpected > 0 && sameSchoolRows.length >= result.nadbExpected)
      ) {
        rows = sameSchoolRows;
      }
    }

    result.nadb = neprasTeacherDedupListRowsV1764(rows);
    if (!result.nadbExpected) result.nadbExpected = result.nadb.length;
  }

  return result;
}


async function neprasTeacherNativeGetListsAdaptive(wantedModes) {
  let lastError = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    neprasV24AssertRunning();

    let plan = neprasTeacherGetAdaptivePlan();

    // لو الجدول ظاهر بالفعل نستفيد منه فورًا حتى لو توجد Toast قديمة بالصفحة.
    // Circuit Breaker مخصص فقط لإعادة المحاولة بعد فشل حقيقي.
    try {
      const lists = await neprasTeacherNativeGetLists(wantedModes);

      const coreRequired = wantedModes.includes("CORE");
      const coreOk = !coreRequired || (Array.isArray(lists?.core) && lists.core.length > 0);

      if (!coreOk) {
        throw new Error("قائمة القوة الأساسية لم تظهر بعد.");
      }

      if (
        coreRequired &&
        Number(lists?.coreExpected || 0) > 0 &&
        lists.core.length < Number(lists.coreExpected)
      ) {
        throw new Error(
          `قائمة القوة الأساسية الحالية غير مكتملة (${lists.core.length} من ${lists.coreExpected}).`
        );
      }

      if (
        wantedModes.includes("NADB") &&
        Number(lists?.nadbExpected || 0) > 0 &&
        Array.isArray(lists?.nadb) &&
        lists.nadb.length < Number(lists.nadbExpected)
      ) {
        throw new Error(
          `قائمة المنتدبين الحالية غير مكتملة (${lists.nadb.length} من ${lists.nadbExpected}).`
        );
      }

      // Empty NADB can be legitimate. Retry it only if there is a recent
      // network failure; otherwise accept the empty list.
      const recentZero =
        neprasTeacherRecentApiMessages(12000)
          .some(m => Number(m?.status || 0) === 0);

      if (
        wantedModes.includes("NADB") &&
        recentZero &&
        (!Array.isArray(lists?.nadb) || !lists.nadb.length)
      ) {
        neprasTeacherMarkDegraded(
          "تعذر التأكد من قائمة المنتدبين بسبب Status 0"
        );
        throw new Error("قائمة المنتدبين لم تستقر بعد.");
      }

      neprasTeacherMarkHealthy();
      return lists;
    } catch (error) {
      lastError = error;

      const recentZero =
        neprasTeacherRecentApiMessages(15000)
          .some(m => Number(m?.status || 0) === 0);

      if (recentZero || neprasTeacherPageShowsNetworkFailure()) {
        neprasTeacherMarkDegraded(
          error?.message || "موقع الوزارة لا يستجيب أثناء تجهيز القوائم"
        );
      }

      plan = neprasTeacherGetAdaptivePlan();

      if (attempt < 3) {
        await neprasTeacherAdaptiveBackoff(
          attempt,
          plan,
          "تعذر تجهيز قائمة العاملين من الموقع مؤقتًا."
        );
      }
    }
  }

  throw lastError || new Error("تعذر تجهيز قوائم العاملين بعد المحاولات الذكية.");
}



// ==========================================================
// 🚀 v1.0 — Smart adaptive accelerator for staff details
// يبدأ بتوازي منخفض، يرفع السرعة فقط بعد نجاحات سريعة متتالية،
// ويخفضها أو يرجع للمسار المرئي الآمن فور رصد بطء/فشل حقيقي.
// لا يغيّر تسجيل الدخول أو الجلسة؛ يستخدم نفس رؤوس الطلب التي التقطها
// موقع الوزارة نفسه، والمسار المرئي يظل fallback لكل سجل يفشل سريعًا.
// ==========================================================
// v1.0 — التسريع الآمن لا يعتمد أي رد سريع ناقص.
// نستخدم GetEmployeeFullData فقط إذا أعاد الأقسام الأساسية كاملة بما يكفي،
// وإلا يرجع الموظف تلقائيًا لمسار الصفحة المرئي المعروف باكتماله.
function neprasTeacherFastRowCompleteV1765(row, rawData, staff) {
  if (!row || !rawData?.basicInfo) return false;

  const critical = [
    row["كود الموظف"],
    row["اسم الموظف الكامل"],
    row["الرقم القومي"],
    row["الاسم الأول"],
    row["اسم الأب"],
    row["تاريخ الميلاد"]
  ];

  if (critical.filter(v => String(v || "").trim()).length < 5) return false;

  const hasJobSection = !!rawData?.job && Object.values(rawData.job || {}).some(v => String(v ?? "").trim());
  const hasQlfSection = !!rawData?.qlf && Object.values(rawData.qlf || {}).some(v => String(v ?? "").trim());

  // معلم الحصة قد لا يملك نفس أقسام الوظيفة/المؤهل في بعض قواعد الوزارة.
  if (!neprasTeacherIsPartTime(staff) && (!hasJobSection || !hasQlfSection)) return false;

  const usefulFields = [
    "الرقم القومي","نوع التوظيف","تاريخ الميلاد","النوع","الديانة",
    "العنوان","تاريخ التعيين","تاريخ استلام العمل","الوظيفة","نوع المؤهل",
    "المؤهل","جهة الحصول","المرحلة","مادة التدريس","الموقف من العمل"
  ];
  const usefulCount = usefulFields.reduce((n, key) => n + (String(row[key] || "").trim() ? 1 : 0), 0);
  return neprasTeacherIsPartTime(staff) ? usefulCount >= 6 : usefulCount >= 9;
}

const NEPRAS_STAFF_SMART_SPEED_V1759 = {
  startConcurrency: 2,
  maxConcurrency: 4,
  minConcurrency: 1,
  fastBatchAvgMs: 3200,
  slowBatchAvgMs: 6500,
  normalPauseMs: 120,
  degradedPauseMs: 450
};

function neprasTeacherJobKeyV1759(job) {
  return `${job?.mode || ""}:${String(job?.staff?.empCode || "")}`;
}

function neprasTeacherFastRowOkV1759(row) {
  const state = String(row?.["حالة التنزيل"] || "");
  return state === "تم بنجاح" || state.startsWith("تم — بيانات القائمة");
}

function neprasTeacherFastRowHardFailureV1759(row) {
  const state = String(row?.["حالة التنزيل"] || "");
  return /HTTP_(?:0|401|403|429|5\d\d)|XHR_NETWORK_ERROR|NETWORK|انتهت مهلة|timeout|Unknown Error|Status\s*0|0 Unknown/i.test(state);
}

async function neprasTeacherRunAdaptiveFastDetailsV1759(jobs, onProgress, sharedRowsByKey = null) {
  // v1.0: use a shared map so completed employees remain available
  // even when the user stops the operation before the whole run finishes.
  const rowsByKey = sharedRowsByKey instanceof Map ? sharedRowsByKey : new Map();
  const fallbackJobs = [];
  const networkJobs = [...jobs];
  let processed = 0;
  let fastSuccess = 0;
  let fastFailed = 0;
  let disabled = false;

  if (!networkJobs.length) {
    return { rowsByKey, fallbackJobs, fastSuccess, fastFailed, disabled };
  }

  let plan = neprasTeacherGetAdaptivePlan();
  let concurrency = plan.mode === "DEGRADED"
    ? 1
    : NEPRAS_STAFF_SMART_SPEED_V1759.startConcurrency;
  let cursor = 0;
  let consecutiveBadBatches = 0;

  while (cursor < networkJobs.length) {
    neprasV24AssertRunning();
    plan = neprasTeacherGetAdaptivePlan();

    // لو الموقع دخل وضع مزدحم أثناء التشغيل نقلل التوازي فورًا.
    if (plan.mode === "DEGRADED") {
      concurrency = Math.max(NEPRAS_STAFF_SMART_SPEED_V1759.minConcurrency, Math.min(concurrency, 2));
    }

    const batch = networkJobs.slice(cursor, cursor + concurrency);
    const batchStartedAt = Date.now();

    const outcomes = await Promise.all(
      batch.map(async (job) => {
        const startedAt = Date.now();
        try {
          const row = await neprasTeacherFetchFullRowFast(job.staff, job.mode);
          return {
            job,
            row,
            ok: neprasTeacherFastRowOkV1759(row),
            hardFailure: neprasTeacherFastRowHardFailureV1759(row),
            stopped: false,
            ms: Date.now() - startedAt
          };
        } catch (error) {
          if (error?.code === "USER_STOPPED" || neprasV24StopRequested || neprasStaffStopRequested) {
            // Do not reject Promise.all: other requests in the same small batch may
            // already have completed successfully and must be committed first.
            return {
              job,
              row: null,
              ok: false,
              hardFailure: false,
              stopped: true,
              ms: Date.now() - startedAt
            };
          }
          return {
            job,
            row: null,
            ok: false,
            hardFailure: /HTTP_(?:0|401|403|429|5\d\d)|XHR_NETWORK_ERROR|NETWORK|انتهت مهلة|timeout|Unknown Error|Status\s*0|0 Unknown/i.test(String(error?.message || error || "")),
            stopped: false,
            ms: Date.now() - startedAt
          };
        }
      })
    );

    let batchOk = 0;
    let batchFail = 0;
    let hardFailures = 0;
    let totalMs = 0;
    let stoppedInBatch = false;

    for (const outcome of outcomes) {
      totalMs += Number(outcome.ms || 0);

      if (outcome.stopped) {
        stoppedInBatch = true;
        continue;
      }

      processed += 1;

      if (outcome.ok && outcome.row) {
        // Commit every completed employee immediately to the shared map.
        rowsByKey.set(neprasTeacherJobKeyV1759(outcome.job), outcome.row);
        batchOk += 1;
        fastSuccess += 1;
      } else {
        fallbackJobs.push(outcome.job);
        batchFail += 1;
        fastFailed += 1;
        if (outcome.hardFailure) hardFailures += 1;
      }

      if (onProgress) {
        onProgress(processed, jobs.length, {
          phase: "fast",
          concurrency,
          fastSuccess,
          fastFailed
        });
      }
    }

    // Only after successful rows from the current batch are committed do we
    // propagate the stop request to the outer runner, which will export them.
    if (stoppedInBatch || neprasV24StopRequested || neprasStaffStopRequested) {
      throw neprasV24MakeUserStopError();
    }

    cursor += batch.length;
    const avgMs = outcomes.length ? totalMs / outcomes.length : (Date.now() - batchStartedAt);
    const failureRate = outcomes.length ? batchFail / outcomes.length : 0;

    if (batchFail === 0 && avgMs <= NEPRAS_STAFF_SMART_SPEED_V1759.fastBatchAvgMs && plan.mode !== "DEGRADED") {
      consecutiveBadBatches = 0;
      concurrency = Math.min(
        NEPRAS_STAFF_SMART_SPEED_V1759.maxConcurrency,
        concurrency + 1
      );
      neprasTeacherMarkHealthy();
    } else if (batchFail > 0 || avgMs >= NEPRAS_STAFF_SMART_SPEED_V1759.slowBatchAvgMs || plan.mode === "DEGRADED") {
      consecutiveBadBatches += 1;
      concurrency = Math.max(
        NEPRAS_STAFF_SMART_SPEED_V1759.minConcurrency,
        concurrency - 1
      );
    } else {
      consecutiveBadBatches = 0;
    }

    // لو المسار السريع نفسه غير مناسب للجلسة الحالية، لا نكرر الضغط.
    // نضع كل الباقي في fallback المرئي الآمن ونوقف التسريع لهذه العملية فقط.
    const shouldDisableFast =
      (hardFailures >= 1 && failureRate >= 0.5) ||
      consecutiveBadBatches >= 2;

    if (shouldDisableFast && cursor < networkJobs.length) {
      disabled = true;
      fallbackJobs.push(...networkJobs.slice(cursor));
      cursor = networkJobs.length;
      break;
    }

    if (cursor < networkJobs.length) {
      const pause = neprasTeacherGetAdaptivePlan().mode === "DEGRADED"
        ? NEPRAS_STAFF_SMART_SPEED_V1759.degradedPauseMs
        : NEPRAS_STAFF_SMART_SPEED_V1759.normalPauseMs;
      await new Promise(resolve => setTimeout(resolve, pause));
    }
  }

  return { rowsByKey, fallbackJobs, fastSuccess, fastFailed, disabled };
}

async function neprasRunNativeStaffExtractionV1730(mode) {
  if (
    neprasTeacherNativeRunActive ||
    neprasV24Running ||
    neprasAllStaffRunning ||
    neprasStatusSheetBatch
  ) {
    window.neprasDialog?.alert(
      "يوجد تنزيل بيانات عاملين يعمل بالفعل.",
      { type: "warning" }
    );
    return;
  }

  neprasTeacherNativeRunActive = true;
  neprasV24Running = true;
  neprasAllStaffRunning = true;
  neprasV24StopRequested = false;
  neprasStaffStopRequested = false;

  const results = [];
  // v1.0: completed staff rows live here from the first successful employee.
  // This map survives a USER_STOPPED unwind and is exported as a partial file.
  const completedRowsByKey = new Map();
  let orderedJobs = [];
  const selectionLabel =
    mode === "CORE" ? "العاملين الأساسيين" :
    mode === "NADB" ? "العاملين المنتدبين" :
    mode === "PARTTIME" ? "معلمي الحصة" :
    "جميع العاملين";

  try {
    const isAll = mode === "BOTH";
    const isPartTimeOnly = mode === "PARTTIME";
    const wantedModes = isAll || mode === "NADB" ? ["CORE", "NADB"] : ["CORE"];

    const lists = await neprasTeacherNativeGetListsAdaptive(wantedModes);
    const coreAll = Array.isArray(lists?.core) ? lists.core : [];
    const nadbAll = Array.isArray(lists?.nadb) ? lists.nadb : [];
    const coreRegular = coreAll.filter(staff => !neprasTeacherIsPartTime(staff));
    const partTime = coreAll.filter(staff => neprasTeacherIsPartTime(staff));

    const jobs = [];
    if (mode === "CORE") {
      coreRegular.forEach(staff => jobs.push({ staff: { ...staff, __neprasStaffCategory: "قوة أساسية" }, mode: "CORE" }));
    } else if (mode === "NADB") {
      nadbAll.forEach(staff => jobs.push({ staff: { ...staff, __neprasStaffCategory: "منتدب" }, mode: "NADB" }));
    } else if (isPartTimeOnly) {
      partTime.forEach(staff => jobs.push({ staff: { ...staff, __neprasStaffCategory: "معلم بالحصة" }, mode: "CORE" }));
    } else {
      coreRegular.forEach(staff => jobs.push({ staff: { ...staff, __neprasStaffCategory: "قوة أساسية" }, mode: "CORE" }));
      partTime.forEach(staff => jobs.push({ staff: { ...staff, __neprasStaffCategory: "معلم بالحصة" }, mode: "CORE" }));
      nadbAll.forEach(staff => jobs.push({ staff: { ...staff, __neprasStaffCategory: "منتدب" }, mode: "NADB" }));
    }

    const unique = [];
    const seen = new Set();
    for (const job of jobs) {
      const code = String(job?.staff?.empCode || "").trim();
      if (!code) continue;
      const key = `${job.mode}:${code}:${job?.staff?.__neprasStaffCategory || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(job);
    }
    orderedJobs = unique;

    if (!unique.length) {
      const label = isPartTimeOnly ? "معلمي الحصة" : "العاملين";
      throw new Error(`لم يتم العثور على ${label} في القائمة الحالية.`);
    }

    let expectedCurrent = unique.length;
    if (mode === "CORE") expectedCurrent = coreRegular.length;
    else if (mode === "NADB") expectedCurrent = Number(lists?.nadbExpected || nadbAll.length || 0);
    else if (isPartTimeOnly) expectedCurrent = partTime.length;
    else if (isAll) expectedCurrent = coreAll.length + nadbAll.length;

    if (expectedCurrent > 0 && unique.length < expectedCurrent) {
      throw new Error(
        `تعذر اعتماد العدد الحالي للعاملين: تم تجهيز ${unique.length} من ${expectedCurrent}. لن يتم تصدير ملف ناقص.`
      );
    }

    neprasShowBulkStatus(
      `🟢 <b>جاري تنزيل ${selectionLabel}</b><br>` +
      `العدد الحالي: <b>${unique.length}</b>`
    );

    // v1.0: مسار سريع حذر أولًا. أي سجل ناقص أو أي جلسة لا تقبل
    // الطلب السريع تنتقل تلقائيًا للمسار المرئي الكامل، بدون تصدير نقص.
    const fast = await neprasTeacherRunAdaptiveFastDetailsV1759(
      unique,
      (done, total) => {
        neprasShowBulkStatus(
          `🟢 <b>جاري تنزيل ${selectionLabel}</b><br>` +
          `تم تجهيز: <b>${done}</b> من <b>${total}</b>`
        );
      },
      completedRowsByKey
    );

    const resultMap = completedRowsByKey;
    const fallbackJobs = Array.isArray(fast?.fallbackJobs) ? fast.fallbackJobs : [];

    if (fallbackJobs.length) {
      neprasShowBulkStatus(
        `🟠 <b>جاري استكمال ${selectionLabel}</b><br>` +
        `المتبقي: <b>${fallbackJobs.length}</b> — يرجى الانتظار وعدم لمس الصفحة.`
      );
    }

    for (let i = 0; i < fallbackJobs.length; i++) {
      neprasV24AssertRunning();
      const job = fallbackJobs[i];
      const key = neprasTeacherJobKeyV1759(job);

      try {
        let row = await neprasTeacherNativeOpenAndCapture(job.staff, job.mode);
        if (row) {
          row["تصنيف العامل"] = job?.staff?.__neprasStaffCategory || row["تصنيف العامل"] || "";
        }
        resultMap.set(key, row);
      } catch (error) {
        if (error?.code === "USER_STOPPED" || neprasV24StopRequested || neprasStaffStopRequested) {
          throw (error?.code === "USER_STOPPED" ? error : neprasV24MakeUserStopError());
        }
        resultMap.set(key, {
          ...neprasTeacherNativeListRow(job.staff, job.mode),
          "تصنيف العامل": job?.staff?.__neprasStaffCategory || "",
          "حالة التنزيل": `خطأ: ${error?.message || error}`
        });
      }

      if (i < fallbackJobs.length - 1) {
        const plan = neprasTeacherGetAdaptivePlan();
        await new Promise(resolve => setTimeout(resolve, Math.min(180, Number(plan?.betweenEmployeesMs || 90))));
      }
    }

    for (const job of unique) {
      const key = neprasTeacherJobKeyV1759(job);
      let row = resultMap.get(key);
      if (!row) {
        row = {
          ...neprasTeacherNativeListRow(job.staff, job.mode),
          "تصنيف العامل": job?.staff?.__neprasStaffCategory || "",
          "حالة التنزيل": "خطأ: لم يكتمل تنزيل بيانات الموظف"
        };
      } else {
        row["تصنيف العامل"] = job?.staff?.__neprasStaffCategory || row["تصنيف العامل"] || "";
      }
      results.push(row);
    }

    const success = results.filter(row => {
      const state = String(row?.["حالة التنزيل"] || "");
      return state === "تم بنجاح" || state.startsWith("تم — بيانات القائمة");
    }).length;
    const errors = results.length - success;

    neprasShowBulkStatus(`🟢 <b>اكتمل جمع البيانات</b><br>جاري إنشاء ملف Excel...`);
    neprasExportAllStaffToExcelV13(results, mode);

    neprasShowBulkStatus(
      `✅ <b>تم تنزيل ${selectionLabel}</b><br><br>` +
      `إجمالي السجلات: <b>${results.length}</b><br>` +
      `تم بنجاح: <b>${success}</b><br>` +
      `أخطاء: <b>${errors}</b><br><br>` +
      `📥 تم إنشاء ملف Excel.`
    );

    neprasMakeFinishedStatusClosable();
    return results;
  } catch (error) {
    if (
      error?.code === "USER_STOPPED" ||
      neprasV24StopRequested ||
      neprasStaffStopRequested
    ) {
      // Build the partial file only from rows that were genuinely completed
      // before the stop request. Unprocessed employees are never fabricated.
      const partialRows = [];
      for (const job of orderedJobs) {
        const row = completedRowsByKey.get(neprasTeacherJobKeyV1759(job));
        if (!row) continue;
        const state = String(row?.["حالة التنزيل"] || "");
        if (state === "تم بنجاح" || state.startsWith("تم — بيانات القائمة")) {
          partialRows.push(row);
        }
      }

      results.splice(0, results.length, ...partialRows);

      if (partialRows.length) {
        neprasShowBulkStatus(
          `⏹ <b>تم إيقاف العملية</b><br>` +
          `جاري حفظ ما تم تنزيله: <b>${partialRows.length}</b> سجل...`
        );
        try {
          neprasExportAllStaffToExcelV13(partialRows, mode, { partial: true });
          neprasShowBulkStatus(
            `⏹ <b>تم إيقاف العملية</b><br><br>` +
            `تم حفظ <b>${partialRows.length}</b> سجل حتى لحظة الإيقاف.<br>` +
            `📥 تم إنشاء ملف Excel جزئي تلقائيًا.`
          );
        } catch (exportError) {
          neprasShowBulkStatus(
            `⏹ <b>تم إيقاف العملية</b><br>` +
            `تم الاحتفاظ بـ <b>${partialRows.length}</b> سجل، لكن تعذر إنشاء ملف Excel.`
          );
        }
      } else {
        neprasShowBulkStatus(
          `⏹ <b>تم إيقاف العملية</b><br>` +
          `لم يكتمل أي سجل قبل الإيقاف، لذلك لم يتم إنشاء ملف فارغ.`
        );
      }
      neprasMakeFinishedStatusClosable();
      return results;
    }

    console.error("Nepras staff:", error);
    neprasShowBulkStatus(
      `🔴 <b>تعذر إكمال تنزيل بيانات العاملين</b><br>` +
      `${neprasNormalizeText(error?.message || error || "")}`
    );
    neprasMakeFinishedStatusClosable();
    return results;
  } finally {
    neprasTeacherNativeRunActive = false;
    neprasV24Running = false;
    neprasAllStaffRunning = false;
    neprasV24StopRequested = false;
    neprasStaffStopRequested = false;
    await neprasClearStaffState().catch(() => {});
  }
}


function neprasRunStaffWorkerBatch(mode) {
  return neprasRunNativeStaffExtractionV1730(mode);
}

async function neprasTeacherFetchStatusPdfFast(staff) {
  const res = await neprasTeacherDirectApiRetry({
    method: "GET",
    url:
      `https://professopi.emis.gov.eg/api/Employee/CRevisionNew01?EmpCode=${encodeURIComponent(staff.empCode)}`,
    responseType: "base64",
    timeout: 45000
  });

  if (!res?.base64) {
    throw new Error("لم يرجع الموقع ملف صحيفة الأحوال.");
  }

  return {
    ...staff,
    base64: res.base64
  };
}


async function neprasRunStatusSheetsPdfBatch(individual = false) {
  return neprasRunStatusSheetsPdfMemoryV1766(individual);
}

// ================================================================
// v1.0 — تنزيل فردي لصحف الأحوال: بدل دمج كل المعلمين في ملف PDF واحد،
// نحزم كل صحيفة في ملف مضغوط (ZIP) واحد يحتوي ملف PDF مستقل لكل معلم،
// عشان المستخدم يقدر يفتح/يطبع صحيفة معلم واحد لوحدها. بنعمل الـZIP يدويًا
// (تخزين بدون ضغط - "store") من غير ما نحتاج مكتبة خارجية جديدة، لأن
// ملفات الـPDF نفسها مضغوطة أصلاً وده كافٍ لحجم معقول.
// ================================================================
// كتابة الأرشيف نفسها (CRC32 والترويسات وعلامة UTF-8 للأسماء العربية) في neprasBuildZip من modules/xlsx_writer.js
// الذي يُحقن قبل هذا الملف في نفس العالم. كانت هنا نسخة ثانية كاملة (neprasBuildZipStore) تكرّرها بايتًا ببايت.
// الإدخال: [{ name: "اسم.pdf", data: Uint8Array }] — والمخرج Uint8Array لأرشيف ZIP صالح.

// اسم صحيفة آمن للمعلم داخل الأرشيف: الاسم لو متاح وإلا الكود الوظيفي، مع
// ضمان عدم تكرار نفس الاسم لأكتر من معلم.
function neprasStatusSheetEntryName(staff, usedNames) {
  const rawName = String(staff?.name || staff?.empName || staff?.fullName || staff?.empCode || "معلم").trim() || "معلم";
  let base = rawName.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "معلم";
  if (staff?.empCode && !base.includes(String(staff.empCode))) base += `_${staff.empCode}`;
  let candidate = `${base}.pdf`;
  let n = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${n}.pdf`;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}

async function neprasTeacherFetchStatusPdfMemoryV1766(staff) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    neprasV24AssertRunning();
    try {
      const result = await neprasTeacherFetchStatusPdfFast(staff);
      const base64 = String(result?.base64 || "").trim();
      if (!base64) throw new Error("لم يصل ملف الصحيفة.");
      const headBin = atob(base64.slice(0, 16));
      if (!headBin.startsWith("%PDF")) throw new Error("الملف المستلم غير صالح.");
      return result;
    } catch (error) {
      if (error?.code === "USER_STOPPED" || neprasV24StopRequested || neprasStaffStopRequested) throw neprasV24MakeUserStopError();
      lastError = error;
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 + attempt * 500));
    }
  }
  throw lastError || new Error("تعذر تجهيز صحيفة الأحوال.");
}

async function neprasRunStatusSheetsPdfMemoryV1766(individual = false) {
  if (neprasTeacherFastRunning || neprasStatusSheetBatch || neprasAllStaffRunning || neprasV24Running) {
    window.neprasDialog?.alert("يوجد تنزيل بيانات عاملين يعمل بالفعل.", { type: "warning" });
    return;
  }

  neprasTeacherFastRunning = true;
  neprasV24Running = true;
  neprasV24StopRequested = false;
  neprasStaffStopRequested = false;
  neprasStatusSheetBatch = { running: true, stoppedByUser: false, mode: "memory" };

  try {
    neprasShowBulkProgressV1766("جاري تجهيز صحف الأحوال", 0, 1, "تنزيل القائمة الحالية");

    const lists = await neprasTeacherNativeGetListsAdaptive(["CORE", "NADB"]);
    neprasV24AssertRunning();

    const candidates = [
      ...(Array.isArray(lists?.core) ? lists.core.map(s => ({ ...s, mode: "CORE" })) : []),
      ...(Array.isArray(lists?.nadb) ? lists.nadb.map(s => ({ ...s, mode: "NADB" })) : [])
    ];

    const dedup = new Map();
    const skipped = [];
    for (const staff of candidates) {
      const code = String(staff?.empCode || "").trim();
      if (!code || dedup.has(code)) continue;
      if (neprasTeacherIsPartTime(staff)) {
        skipped.push(staff);
        continue;
      }
      dedup.set(code, staff);
    }

    const eligible = [...dedup.values()];
    if (!eligible.length) throw new Error("لا توجد صحف أحوال متاحة في القائمة الحالية.");
    try { await neprasEnsureLib("pdflib"); } catch (_) { throw new Error("تعذر تجهيز ملف PDF."); }

    const merged = individual ? null : await PDFLib.PDFDocument.create();
    const individualFiles = individual ? [] : null;
    const usedEntryNames = individual ? new Set() : null;
    const errors = [];
    let processed = 0;
    const concurrency = Math.min(3, eligible.length);

    for (let start = 0; start < eligible.length; start += concurrency) {
      neprasV24AssertRunning();
      const slice = eligible.slice(start, start + concurrency);
      const results = await Promise.all(slice.map(async staff => {
        try {
          return { ok: true, staff, report: await neprasTeacherFetchStatusPdfMemoryV1766(staff) };
        } catch (error) {
          return { ok: false, staff, error };
        }
      }));

      for (const item of results) {
        neprasV24AssertRunning();
        processed += 1;
        if (!item.ok) {
          errors.push({ staff: item.staff, reason: item.error?.message || String(item.error) });
        } else {
          const srcBytes = Uint8Array.from(atob(item.report.base64), c => c.charCodeAt(0));
          if (individual) {
            individualFiles.push({
              name: neprasStatusSheetEntryName(item.staff, usedEntryNames),
              data: srcBytes
            });
          } else {
            const src = await PDFLib.PDFDocument.load(srcBytes);
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach(page => merged.addPage(page));
          }
        }

        neprasShowBulkProgressV1766(
          "جاري تجهيز صحف الأحوال",
          processed,
          eligible.length,
          `تم تجهيز ${processed} من ${eligible.length}`
        );
      }
    }

    if (errors.length) {
      neprasShowBulkProgressV1766(
        "تعذر إكمال صحف الأحوال",
        eligible.length - errors.length,
        eligible.length,
        `تعذر تجهيز ${errors.length} صحيفة. لم يتم تنزيل ملف ناقص.`,
        "red"
      );
      neprasMakeFinishedStatusClosable();
      return null;
    }

    neprasShowBulkProgressV1766(
      "جاري إنشاء الملف النهائي",
      eligible.length,
      eligible.length,
      individual ? "تجهيز الملف المضغوط بالصحف الفردية" : "تجميع الصحف في ملف واحد"
    );

    const d = new Date();
    const stamp = [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0"), String(d.getHours()).padStart(2,"0"), String(d.getMinutes()).padStart(2,"0")].join("-");
    const schoolSafe = neprasNormalizeText(lists?.currentSchoolName || "المدرسة").replace(/[\/:*?"<>|]+/g, "_").slice(0, 80);

    let bytes, mimeType, rawFileName, successTitle, successMessage, doneMessage;
    if (individual) {
      bytes = neprasBuildZip(individualFiles);
      mimeType = "application/zip";
      rawFileName = `صحف_أحوال_العاملين_فردي_${schoolSafe}_${stamp}.zip`;
      successTitle = "تم تجهيز صحف الأحوال بنجاح";
      successMessage = `تم حفظ ملف مضغوط يضم ${individualFiles.length} صحيفة فردية (صحيفة PDF مستقلة لكل معلم).`;
      doneMessage = `تم تنزيل ملف مضغوط يضم ${individualFiles.length} صحيفة فردية${skipped.length ? ` — تم تجاهل ${skipped.length} معلم بالحصة` : ""}`;
    } else {
      bytes = await merged.save();
      mimeType = "application/pdf";
      rawFileName = `صحف_أحوال_العاملين_${schoolSafe}_${stamp}.pdf`;
      successTitle = "تم تجهيز صحف الأحوال بنجاح";
      successMessage = `تم حفظ ملف PDF المجمع بنجاح.`;
      doneMessage = `تم تنزيل ملف واحد يضم ${eligible.length} صحيفة${skipped.length ? ` — تم تجاهل ${skipped.length} معلم بالحصة` : ""}`;
    }
    neprasV24AssertRunning();

    const blob = new Blob([bytes], { type: mimeType });
    if (window.neprasDialog?.triggerDownload) {
      await window.neprasDialog.triggerDownload(blob, rawFileName, {
        title: successTitle,
        message: successMessage,
        folder: "صحف الأحوال"
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = rawFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }

    const mainCard = window.NeprasUI?.getProgress('main');
    if (mainCard && typeof mainCard.finish === 'function') {
      mainCard.finish({
        kind: 'success',
        title: 'تم تجهيز صحف الأحوال بنجاح',
        markup: doneMessage,
        autoHide: 8000
      });
    } else {
      window.NeprasLegacy?.status(`✅ <b>تم تجهيز صحف الأحوال بنجاح</b><br>${doneMessage}`);
    }
    neprasMakeFinishedStatusClosable();
    return { ok: true, reports: eligible.length, skipped: skipped.length };
  } catch (error) {
    if (error?.code === "USER_STOPPED" || neprasV24StopRequested || neprasStaffStopRequested) {
      const mainCard = window.NeprasUI?.getProgress('main');
      if (mainCard && mainCard.finish) {
        mainCard.finish({
          kind: 'info',
          title: 'تم إيقاف العملية',
          markup: 'لم يتم تنزيل ملف جزئي',
          autoHide: 6000
        });
      } else {
        neprasShowBulkProgressV1766("تم إيقاف العملية", 0, 1, "لم يتم تنزيل ملف جزئي", "orange");
      }
      neprasMakeFinishedStatusClosable();
      return null;
    }
    console.error("Nepras status sheets:", error);
    const mainCard = window.NeprasUI?.getProgress('main');
    if (mainCard && mainCard.finish) {
      mainCard.finish({
        kind: 'error',
        title: 'تعذر تجهيز صحف الأحوال',
        markup: neprasNormalizeText(error?.message || error || ""),
        autoHide: 0
      });
    } else {
      neprasShowBulkProgressV1766("تعذر تجهيز صحف الأحوال", 0, 1, neprasNormalizeText(error?.message || error || ""), "red");
    }
    neprasMakeFinishedStatusClosable();
    return null;
  } finally {
    neprasTeacherFastRunning = false;
    neprasV24Running = false;
    neprasV24StopRequested = false;
    neprasStaffStopRequested = false;
    neprasStatusSheetBatch = null;
  }
}

// ================================================================
// v1.2.76 — صحيفة أحوال فردية لمعلم واحد، بكود المعلم (EmpCode) أو بالرقم القومي.
//
// - المُدخل يُحلَّل في neprasParseStatusSheetLookup: الأرقام العربية/الفارسية تُحوَّل للاتينية،
//   المسافات والشرطات تُهمَل، و14 رقمًا = رقم قومي، و1-10 أرقام = كود معلم. غير ذلك يُرفض بسبب واضح.
// - البحث محصور في عاملي المدرسة الحالية (الأساسي + المنتدب) من نفس قائمة الوزارة التي تعتمد عليها
//   باقي الميزات، فلا نطلب صحيفة لموظف لا يخص المدرسة.
// - الكود: مطابقة مباشرة على empCode في القائمة.
// - الرقم القومي: مطابقة مباشرة على أي حقل في صف القائمة إن كان الرقم موجودًا فيه، وإلا نقرأ
//   GetEmployeeFullData (basicInfo.nationalIdNum) لعاملي المدرسة بتوازي محدود ونتوقف عند أول تطابق.
// - جلب الـPDF عبر neprasTeacherFetchStatusPdfMemoryV1766 نفسها (3 محاولات + التحقق من %PDF).
// ================================================================
// يرجّع { ok:true, kind:"nationalId"|"empCode", value } أو { ok:false, message }.
function neprasParseStatusSheetLookup(raw) {
  const cleaned = NeprasEgypt.toLatinDigits(raw).replace(/[\s\-_.,\u200e\u200f\u066c]+/g, "");
  if (!cleaned) {
    return { ok: false, message: "اكتب كود المعلم أو الرقم القومي أولًا." };
  }
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, message: "المسموح أرقام فقط (كود المعلم أو الرقم القومي)." };
  }
  if (cleaned.length === 14) {
    if (!/^[23]/.test(cleaned)) {
      return { ok: false, message: "الرقم القومي غير صحيح: يجب أن يبدأ بالرقم 2 أو 3." };
    }
    return { ok: true, kind: "nationalId", value: cleaned };
  }
  if (cleaned.length >= 11) {
    return {
      ok: false,
      message: `الرقم القومي يتكوّن من 14 رقمًا (المكتوب ${cleaned.length}). وكود المعلم لا يزيد على 10 أرقام.`
    };
  }
  const code = cleaned.replace(/^0+(?=\d)/, "");
  return { ok: true, kind: "empCode", value: code };
}

// يبحث في صف قائمة واحد: هل أي حقل (نص/رقم) فيه يساوي الرقم القومي المطلوب تمامًا؟
// المطابقة كاملة للحقل (بعد توحيد الأرقام وحذف المسافات) فلا يُلتقط رقم قومي كجزء من رقم أطول.
function neprasStatusSheetRowHasNationalId(row, nid) {
  if (!row || typeof row !== "object" || !/^\d{14}$/.test(nid)) return false;
  for (const value of Object.values(row)) {
    if (value == null || typeof value === "object") continue;
    if (NeprasEgypt.toLatinDigits(value).replace(/\s+/g, "") === nid) return true;
  }
  return false;
}

async function neprasStatusSheetFetchNationalId(staff) {
  const customHeaders = { ty: "4", md: "0" };
  const edara = Number(staff?.__edaraCode || staff?.toEdaraCode || staff?.edaraCode || 0);
  const school = Number(staff?.__schoolCode || staff?.schoolCode || 0);
  if (edara > 0) customHeaders.ed = String(edara);
  if (school > 0) customHeaders.sc = String(school);

  const res = await neprasTeacherDirectApiRetry({
    method: "POST",
    url: "https://professopi.emis.gov.eg/api/Employee/GetEmployeeFullData",
    body: { empCode: Number(staff.empCode) },
    customHeaders,
    timeout: 12000
  });
  return NeprasEgypt.toLatinDigits(res?.data?.basicInfo?.nationalIdNum).replace(/\D/g, "");
}

// يرجّع { staff } عند التطابق، أو { staff:null, unchecked } حيث unchecked = عدد السجلات التي تعذر فحصها.
async function neprasFindStaffForStatusSheet(parsed, candidates) {
  if (parsed.kind === "empCode") {
    const hit = candidates.find((s) => String(s?.empCode || "").trim().replace(/^0+(?=\d)/, "") === parsed.value);
    return { staff: hit || null, unchecked: 0 };
  }

  const direct = candidates.find((s) => neprasStatusSheetRowHasNationalId(s, parsed.value));
  if (direct) return { staff: direct, unchecked: 0 };

  let found = null;
  let unchecked = 0;
  let done = 0;
  await neprasTeacherMapConcurrent(
    candidates,
    4,
    async (staff) => {
      if (found) return null;
      try {
        const nid = await neprasStatusSheetFetchNationalId(staff);
        if (nid && nid === parsed.value && !found) found = staff;
      } catch (error) {
        if (error?.code === "USER_STOPPED") throw error;
        unchecked += 1;
      }
      return null;
    },
    () => {
      done += 1;
      neprasShowBulkProgressV1766(
        "جاري البحث بالرقم القومي",
        Math.min(done, candidates.length),
        candidates.length,
        `تم فحص ${Math.min(done, candidates.length)} من ${candidates.length}`
      );
    }
  );
  return { staff: found, unchecked };
}

async function neprasRunSingleStatusSheet(lookupRaw) {
  const title = "صحيفة أحوال فردية";
  const parsed = neprasParseStatusSheetLookup(lookupRaw);
  if (!parsed.ok) {
    window.neprasDialog?.alert(parsed.message, { type: "warning", title: "المُدخل غير صحيح" });
    return null;
  }

  if (neprasTeacherFastRunning || neprasStatusSheetBatch || neprasAllStaffRunning || neprasV24Running) {
    window.neprasDialog?.alert("يوجد تنزيل بيانات عاملين يعمل بالفعل.", { type: "warning" });
    return null;
  }

  neprasTeacherFastRunning = true;
  neprasV24Running = true;
  neprasV24StopRequested = false;
  neprasStaffStopRequested = false;
  neprasStatusSheetBatch = { running: true, stoppedByUser: false, mode: "single" };

  try {
    neprasShowBulkProgressV1766(title, 0, 1, "تنزيل قائمة العاملين الحالية");

    const lists = await neprasTeacherNativeGetListsAdaptive(["CORE", "NADB"]);
    neprasV24AssertRunning();

    const dedup = new Map();
    for (const staff of [
      ...(Array.isArray(lists?.core) ? lists.core.map((s) => ({ ...s, mode: "CORE" })) : []),
      ...(Array.isArray(lists?.nadb) ? lists.nadb.map((s) => ({ ...s, mode: "NADB" })) : [])
    ]) {
      const code = String(staff?.empCode || "").trim();
      if (code && !dedup.has(code)) dedup.set(code, staff);
    }
    const candidates = [...dedup.values()];
    if (!candidates.length) throw new Error("لا توجد قائمة عاملين متاحة حاليًا.");

    neprasShowBulkProgressV1766(
      title, 0, 1,
      parsed.kind === "nationalId" ? "جاري البحث بالرقم القومي" : "جاري البحث بكود المعلم"
    );

    const { staff, unchecked } = await neprasFindStaffForStatusSheet(parsed, candidates);
    neprasV24AssertRunning();

    if (!staff) {
      const label = parsed.kind === "nationalId" ? "الرقم القومي" : "كود المعلم";
      const extra = unchecked
        ? ` (تعذر فحص ${unchecked} سجل بسبب أخطاء اتصال، فأعد المحاولة للتأكد)`
        : "";
      neprasShowBulkProgressV1766(
        title, 0, 1,
        `لم يُعثر على ${label} ${parsed.value} ضمن عاملي المدرسة الحالية (الأساسي + المنتدب)${extra}.`,
        "red"
      );
      neprasMakeFinishedStatusClosable();
      return null;
    }

    const who = neprasNormalizeText(staff.fullName || staff.name || staff.empName || staff.empCode);
    neprasShowBulkProgressV1766(title, 0, 1, `جاري تنزيل صحيفة: ${who}`);

    const report = await neprasTeacherFetchStatusPdfMemoryV1766(staff);
    neprasV24AssertRunning();

    const bytes = Uint8Array.from(atob(report.base64), (c) => c.charCodeAt(0));
    const entry = neprasStatusSheetEntryName(staff, new Set());
    const fileName = `صحيفة_أحوال_${entry}`;
    const blob = new Blob([bytes], { type: "application/pdf" });

    if (window.neprasDialog?.triggerDownload) {
      await window.neprasDialog.triggerDownload(blob, fileName, {
        title: "تم تجهيز صحيفة الأحوال",
        message: `تم حفظ صحيفة أحوال: ${who}`,
        folder: "صحف الأحوال"
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }

    neprasShowBulkProgressV1766(title, 1, 1, `تم تنزيل صحيفة: ${who}`);
    neprasMakeFinishedStatusClosable();
    return { ok: true, empCode: String(staff.empCode) };
  } catch (error) {
    if (error?.code === "USER_STOPPED" || neprasV24StopRequested || neprasStaffStopRequested) {
      neprasShowBulkProgressV1766("تم إيقاف العملية", 0, 1, "لم يتم تنزيل أي ملف", "orange");
      neprasMakeFinishedStatusClosable();
      return null;
    }
    console.error("Nepras single status sheet:", error);
    neprasShowBulkProgressV1766(
      "تعذر تنزيل الصحيفة", 0, 1,
      neprasNormalizeText(error?.message || error || ""), "red"
    );
    neprasMakeFinishedStatusClosable();
    return null;
  } finally {
    neprasTeacherFastRunning = false;
    neprasV24Running = false;
    neprasV24StopRequested = false;
    neprasStaffStopRequested = false;
    neprasStatusSheetBatch = null;
  }
}

// Phase 1b: neprasRunStatusSheetsPdfBatchFastDisabledV1729 removed — an
// abandoned intermediate implementation (name says "Disabled") with zero
// callers. Its shared helpers (neprasTeacherFetchStatusPdfFast,
// neprasTeacherLoadListsFast, neprasTeacherMapConcurrent) are still used by
// the live neprasRunStatusSheetsPdfMemoryV1766 path and were kept. See
// PHASE_NOTES.md, "Phase 1b".


// ==========================================================
// ✅ v1.0: سحب العاملين بالطريقة الأصلية التي حددها المستخدم
// نفس التبويب - بحث أصلي - عرض الموظف - استخراج - رجوع للقائمة - بحث جديد
// بدون worker tabs وبدون API search وبدون history.back().
// ==========================================================
const NEPRAS_V24_XPATH = {
  staffMenu: "/html/body/app-root/app-applayout/main-menu/div/div/nav/div/ul/li[2]/div/div/a",
  advancedSearch: "/html/body/app-root/app-applayout/div/div/div/app-employee-list/form/div/div/div/div/div[1]/div[2]/button[2]",
  showAllCore: "/html/body/app-root/app-applayout/div/div/div/app-employee-list/form/div/div/div/div/div[2]/div/div[1]/div/div[3]/div/a",
  showAllNadb: "/html/body/app-root/app-applayout/div/div/div/app-employee-list/form/div/div/div/div/div[2]/div/div[1]/div/div[2]/div/a"
};

let neprasV24Running = false;
let neprasV24StopRequested = false;

function neprasV24MakeUserStopError() {
  const error = new Error("تم إيقاف التنزيل بواسطة المستخدم.");
  error.code = "USER_STOPPED";
  return error;
}

function neprasV24AssertRunning() {
  if (neprasV24StopRequested) throw neprasV24MakeUserStopError();
}

function neprasV24XPath(path, root = document) {
  try {
    return document.evaluate(path, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  } catch (_) {
    return null;
  }
}

async function neprasV24WaitFor(predicate, timeout = 12000, interval = 80, label = "العنصر") {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    neprasV24AssertRunning();
    try {
      const result = await predicate();
      if (result) return result;
    } catch (e) {
      lastError = e;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`انتهت مهلة انتظار ${label}${lastError ? `: ${lastError.message}` : ""}.`);
}

async function neprasV24WaitListPage(timeout = 20000) {
  return neprasV24WaitFor(() => {
    const listRoute = /\/dashboard\/employee(?:\?|$)/i.test(location.pathname + location.search) &&
      !/employeeAllInformation/i.test(location.pathname);
    return listRoute && document.querySelector("app-employee-list") && neprasGetStaffTable();
  }, timeout, 180, "صفحة العاملين");
}

function neprasV24Click(el) {
  if (!el) throw new Error("العنصر المطلوب للنقر غير موجود.");
  const target = el.closest?.("button") || el;
  target.scrollIntoView?.({ block: "center", inline: "center" });
  target.click();
}

async function neprasV24OpenMenuList() {
  if (/\/dashboard\/employee(?:\?|$)/i.test(location.pathname) && !/employeeAllInformation/i.test(location.pathname)) {
    return neprasV24WaitListPage();
  }
  const anchor = await neprasV24WaitFor(
    () => neprasV24XPath(NEPRAS_V24_XPATH.staffMenu) ||
      [...document.querySelectorAll("main-menu a,a")].find(a => /بيانات الموظفين|الموظفين/i.test(neprasNormalizeText(a.innerText || a.textContent || ""))),
    10000, 160, "رابط بيانات الموظفين"
  );
  neprasV24Click(anchor);
  await neprasV24WaitListPage(25000);
}


// لا يوجد تشغيل تلقائي عند Refresh. متابعة التنقل داخل Angular تتم عبر ROUTE_CHANGED.
// إظهار خيارات السحب عند فتح صفحة قائمة العاملين فقط.
function neprasScheduleStaffChoicePanel() {
  try {
    if (neprasStaffWorkerContext) return;
    neprasEnsureStaffChoicePanel();
  } catch (error) {
    console.warn("Nepras: تعذر إنشاء لوحة اختيار سحب العاملين:", error);
  }
}

function neprasEnsurePrep12DWidget() {
  const prep = window.NeprasPrep12D || globalThis.NeprasPrep12D;
  if (!prep || !prep.isPrepRegisterPage(document)) return;
  if (document.getElementById("neprasPrep12DWidget")) return;

  const summary = prep.readSummaryFromPage(document);

  const widget = document.createElement("div");
  widget.id = "neprasPrep12DWidget";
  widget.dir = "rtl";
  widget.style.cssText = [
    "position:fixed",
    "left:20px",
    "bottom:20px",
    "z-index:2147483645",
    "width:290px",
    "max-width:calc(100vw - 40px)",
    "background:#ffffff",
    "border-radius:12px",
    "box-shadow:0 8px 30px rgba(0,0,0,0.18)",
    "border:1.5px solid #2563eb",
    "padding:14px",
    "font-family:Tahoma,Arial,sans-serif",
    "text-align:right"
  ].join(";");

  widget.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-weight:700;font-size:13px;color:#1e3a8a;">📊 نبراس — استمارة الإعدادية وكشف 12 د</div>
      <button id="neprasPrepWidgetClose" type="button" style="border:0;background:transparent;color:#94a3b8;font-size:14px;cursor:pointer;padding:0 4px;">✕</button>
    </div>
    <div style="font-size:11px;color:#475569;margin-bottom:10px;line-height:1.5;">
      إجمالي المقيدين: <b>${summary.total || '—'}</b> | المسجلون: <b style="color:#16a34a;">${summary.registered || '—'}</b> | المتخلفون: <b style="color:#dc2626;">${summary.missing || '—'}</b>
    </div>
    <div style="display:flex;gap:6px;">
      <button id="neprasPrepScanInPageBtn" type="button" style="flex:1;background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 4px;font-weight:700;font-size:12px;cursor:pointer;">⚡ استيراد وإحصاء</button>
      <button id="neprasPrepRevealInPageBtn" type="button" style="background:#0f766e;color:#fff;border:0;border-radius:6px;padding:8px 8px;font-weight:700;font-size:12px;cursor:pointer;" title="إلغاء حجب أزرار كشف 12 د">🔓 إظهار 12 د</button>
    </div>
    <div id="neprasPrepInPageStatus" style="font-size:11px;margin-top:8px;display:none;"></div>
  `;

  (document.body || document.documentElement).appendChild(widget);

  document.getElementById("neprasPrepWidgetClose")?.addEventListener("click", () => {
    widget.style.display = "none";
  });

  document.getElementById("neprasPrepRevealInPageBtn")?.addEventListener("click", () => {
    const revealed = prep.revealHidden12DButtons(document);
    const status = document.getElementById("neprasPrepInPageStatus");
    if (status) {
      status.style.display = "block";
      status.style.color = revealed > 0 ? "#16a34a" : "#64748b";
      status.textContent = revealed > 0 ? `✅ تم إظهار وتفعيل ${revealed} زر لكشف 12 د!` : "ℹ️ لا يوجد أزرار محجوبة حالياً بالصفحة.";
    }
  });

  document.getElementById("neprasPrepScanInPageBtn")?.addEventListener("click", () => {
    const status = document.getElementById("neprasPrepInPageStatus");
    if (status) {
      status.style.display = "block";
      status.style.color = "#2563eb";
      status.textContent = "يرجى الضغط على أيقونة نبراس في شريط المتصفح لإتمام الإحصاء وتنزيل الكشوف.";
    }
  });
}

function neprasSchedulePrep12DWidget() {
  try {
    neprasEnsurePrep12DWidget();
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}

setTimeout(neprasScheduleStaffChoicePanel, 1200);
setTimeout(neprasSchedulePrep12DWidget, 1500);
document.addEventListener("DOMContentLoaded", () => {
  neprasScheduleStaffChoicePanel();
  neprasSchedulePrep12DWidget();
}, { once: true });
const __neprasStaffPanelTimer = setInterval(() => {
  try {
    if (!chrome.runtime || !chrome.runtime.id) { clearInterval(__neprasStaffPanelTimer); return; }
    if (/^\/dashboard\/employee(?:\/)?(?:\?|$)/i.test(location.pathname + location.search) && !neprasStaffWorkerContext) {
      neprasEnsureStaffChoicePanel();
    }
    neprasSchedulePrep12DWidget();
  } catch (_) { clearInterval(__neprasStaffPanelTimer); }
}, 1500);
