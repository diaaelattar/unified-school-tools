/**
 * نبراس - مساعد الانتظار المشروط (NeprasWait)
 *
 * الهدف: استبدال الانتظارات الزمنية الثابتة (setTimeout بمدة مخمَّنة) بانتظار
 * حالة فعلية في الصفحة: قيمة مختارة، أو علامات Angular، أو هدوء الـ DOM.
 *
 * ملاحظة: كل الملفات المحقونة تشترك في عالم معزول واحد، وتكرار const على
 * مستوى السكربت يُسقط الملف كله بـ SyntaxError (انظر PHASE_NOTES.md، هوتفيكس
 * NEPRAS_ZIP_CRC_TABLE). لذلك كل شيء هنا داخل IIFE ولا يُكشف إلا window.NeprasWait.
 */
(() => {
  if (window.NeprasWait) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function checkCancelled(isCancelled) {
    if (typeof isCancelled === "function" && isCancelled()) {
      throw new Error("CANCELLED");
    }
  }

  /**
   * ينتظر حتى يُرجع predicate قيمة صادقة.
   * يُرجع القيمة، أو null عند انتهاء المهلة (لا يرمي عند المهلة).
   * يرمي "CANCELLED" إن أعاد isCancelled() القيمة true.
   */
  async function until(predicate, { timeout = 8000, interval = 100, isCancelled } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      checkCancelled(isCancelled);
      let value = null;
      try { value = await predicate(); } catch (_) { /* نتجاهل أخطاء الفحص ونعيد */ }
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  /**
   * ينتظر حتى تثبت قيمة read() عبر عدد متتالٍ من القراءات (مثل عدد صفوف الجدول).
   * يُرجع القيمة المستقرة أو null عند المهلة. القيم الفارغة/null لا تُعدّ استقرارًا.
   */
  async function stable(read, { hits = 3, interval = 150, timeout = 8000, isCancelled } = {}) {
    let last;
    let count = 0;
    const result = await until(() => {
      let current;
      try { current = read(); } catch (_) { current = null; }
      if (current === null || current === undefined || current === "") {
        count = 0;
        last = undefined;
        return null;
      }
      const key = typeof current === "object" ? JSON.stringify(current) : String(current);
      if (key === last) count += 1;
      else { last = key; count = 1; }
      return count >= hits ? { value: current } : null;
    }, { timeout, interval, isCancelled });
    return result ? result.value : null;
  }

  /**
   * ينتظر أن يمر quietMs بلا أي تغيير في الـ DOM تحت root.
   * يُرجع true عند الهدوء، وfalse عند انتهاء المهلة والصفحة ما زالت تتغير.
   */
  function domQuiet(root = document.body, { quietMs = 400, timeout = 6000, isCancelled } = {}) {
    return new Promise((resolve, reject) => {
      if (!root || typeof MutationObserver !== "function") { resolve(true); return; }
      let quietTimer = null;
      let hardTimer = null;
      let watchTimer = null;
      let done = false;

      const finish = (value, error) => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(hardTimer);
        clearInterval(watchTimer);
        if (error) reject(error); else resolve(value);
      };

      const armQuiet = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(true), quietMs);
      };

      const observer = new MutationObserver(armQuiet);
      observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
      armQuiet();
      hardTimer = setTimeout(() => finish(false), timeout);

      // فحص الإلغاء دوريًا (المراقب لا يعمل إن لم يتغير شيء).
      watchTimer = setInterval(() => {
        try { checkCancelled(isCancelled); } catch (err) { finish(false, err); }
      }, 150);
    });
  }

  /**
   * هل عنصر الاختيار تحت إدارة Angular؟ (لو لم نجد أي علامة ng-* لا نشترط شيئًا منها.)
   */
  function isAngularManaged(el) {
    if (!el) return false;
    const cls = el.classList;
    return !!(cls && (cls.contains("ng-pristine") || cls.contains("ng-dirty") ||
      cls.contains("ng-touched") || cls.contains("ng-untouched") ||
      cls.contains("ng-valid") || cls.contains("ng-invalid")));
  }

  function isEnabled(el) {
    return !!el && !el.disabled && el.getAttribute("aria-disabled") !== "true";
  }

  /**
   * بعد اختيار قيمة في <select>: ينتظر إشارات فعلية أن الصفحة استوعبت الاختيار.
   *
   * الإشارات (كلها اختيارية ما عدا القيمة):
   *   1) select.value === value
   *   2) إن كان العنصر تحت Angular: صار ng-dirty أو ng-touched (لم يبقَ ng-pristine فقط)
   *   3) الزر المستهدف (إن مُرِّر) صار مفعّلًا
   *   4) هدوء الـ DOM مدة quietMs
   *
   * minMs: حدّ أدنى ثابت لا ننتظر أقل منه (لأن الإشارات لم تُتحقق على الموقع الحي بعد،
   *        فلا نُقصّر أي انتظار كان يعمل قبلها؛ الإشارات تُطيل عند الحاجة فقط).
   * maxExtraMs: أقصى إطالة إضافية فوق minMs لو الصفحة لم تستقر.
   *
   * يُرجع { ok, waitedMs, reasons } حيث reasons توضح ما لم يتحقق (للتشخيص).
   */
  async function settleAfterSelect(select, value, {
    minMs = 1000,
    maxExtraMs = 4000,
    quietMs = 400,
    getButton = null,
    isCancelled
  } = {}) {
    const started = Date.now();
    await sleep(minMs);
    checkCancelled(isCancelled);

    const reasons = [];
    const deadline = started + minMs + maxExtraMs;
    const wantedValue = String(value);

    const remaining = () => Math.max(0, deadline - Date.now());

    const valueOk = await until(() => String(select?.value) === wantedValue, {
      timeout: remaining(), interval: 80, isCancelled
    });
    if (!valueOk) reasons.push("value-not-applied");

    if (isAngularManaged(select)) {
      const touched = await until(() => {
        const c = select.classList;
        return c.contains("ng-dirty") || c.contains("ng-touched");
      }, { timeout: remaining(), interval: 100, isCancelled });
      if (!touched) reasons.push("angular-still-pristine");
    }

    if (typeof getButton === "function") {
      const btnReady = await until(() => isEnabled(getButton()), {
        timeout: remaining(), interval: 100, isCancelled
      });
      if (!btnReady) reasons.push("button-not-enabled");
    }

    const quiet = await domQuiet(document.body, {
      quietMs,
      timeout: Math.max(quietMs + 50, remaining()),
      isCancelled
    });
    if (!quiet) reasons.push("dom-still-changing");

    return { ok: reasons.length === 0, waitedMs: Date.now() - started, reasons };
  }

  window.NeprasWait = Object.freeze({
    sleep, until, stable, domQuiet, settleAfterSelect, isAngularManaged
  });
})();
