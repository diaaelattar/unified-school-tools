"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test, summary } = require("./_helpers.js");

const extRoot = path.resolve(__dirname, "..");

test("html_sinks: no raw document.write or eval in extension modules and controllers", () => {
  const dirs = ["modules", "controllers", "ui"];
  for (const d of dirs) {
    const dirPath = path.join(extRoot, d);
    if (!fs.existsSync(dirPath)) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith(".js")) continue;
      const code = fs.readFileSync(path.join(dirPath, f), "utf8");
      assert(!/\bdocument\.write\s*\(/.test(code), `${d}/${f} must not use document.write`);
      assert(!/\beval\s*\(/.test(code), `${d}/${f} must not use eval()`);
    }
  }
});

test("T14 lazy_libs: exports NeprasLazyLibs.ensure and popup.html defers heavy libraries", () => {
  const lazy = require("../modules/lazy_libs.js");
  assert.strictEqual(typeof global.NeprasLazyLibs?.ensure, "function");
  const html = fs.readFileSync(path.join(extRoot, "popup.html"), "utf8");
  assert(html.includes('src="modules/lazy_libs.js"'), "popup.html must include lazy_libs.js");
  assert(html.includes('defer src="xlsx.full.min.js"'), "xlsx.full.min.js should be deferred");
  assert(html.includes('defer src="pdf-lib.min.js"'), "pdf-lib.min.js should be deferred");
  assert(html.includes('defer src="pdf.min.js"'), "pdf.min.js should be deferred");
  assert(lazy === undefined || typeof global.NeprasLazyLibs.ensure === "function");
});

test("T13 popup.css: declares @layer base, components, utilities", () => {
  const css = fs.readFileSync(path.join(extRoot, "popup.css"), "utf8");
  assert(css.includes("@layer base, components, utilities;"), "popup.css must declare CSS @layer order");
});

test("T15 absence_controller: computes badges accurately for continuous & discontinuous modes", () => {
  const ctrl = require("../controllers/absence_controller.js");
  assert.strictEqual(typeof ctrl.getAbsenceBadgeInfo, "function");
  assert.strictEqual(typeof ctrl.wrapPrintToolbar, "function");
  assert(ctrl.getAbsenceBadgeInfo(5, "CONTINUOUS").text.includes("إنذار أول"));
  assert(ctrl.getAbsenceBadgeInfo(15, "CONTINUOUS").text.includes("إنذار بالفصل"));
  assert(ctrl.getAbsenceBadgeInfo(21, "DISCONTINUOUS").text.includes("إنذار ثالث"));
  assert(ctrl.getAbsenceBadgeInfo(30, "DISCONTINUOUS").text.includes("إنذار بالفصل"));
  const wrapped = ctrl.wrapPrintToolbar("<html><body><p>ok</p></body></html>", "تقرير <اختبار>");
  assert(wrapped.includes("تقرير &lt;اختبار&gt;"), "wrapPrintToolbar must escape title");
});

test("T16 xlsx_writer: sanitizes formula injection prefixes safely", () => {
  const vm = require("vm");
  const code = fs.readFileSync(path.join(extRoot, "modules/xlsx_writer.js"), "utf8");
  const ctx = { TextEncoder, Uint8Array, Array, String, Number, Date, Math, RegExp, console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  assert.strictEqual(typeof ctx.neprasSanitizeFormulaCell, "function", "neprasSanitizeFormulaCell must be defined");
  assert.strictEqual(ctx.neprasSanitizeFormulaCell("=CMD()"), "'=CMD()");
  assert.strictEqual(ctx.neprasSanitizeFormulaCell("+1+1"), "'+1+1");
  assert.strictEqual(ctx.neprasSanitizeFormulaCell("@SUM(A1)"), "'@SUM(A1)");
  assert.strictEqual(ctx.neprasSanitizeFormulaCell("-"), "-");
  assert.strictEqual(ctx.neprasSanitizeFormulaCell("-12.5"), "-12.5");
});

test("T17 supabase edge function: license/index.ts exists and enforces 5-device cap", () => {
  const edgePath = path.resolve(extRoot, "../supabase/functions/license/index.ts");
  assert(fs.existsSync(edgePath), "supabase/functions/license/index.ts must exist");
  const ts = fs.readFileSync(edgePath, "utf8");
  assert(ts.includes("MAX_DEVICES_PER_SCHOOL = 5"), "must enforce 5-device cap");
  assert(ts.includes("Ed25519"), "must sign with Ed25519");
});

summary("html_sinks_and_units");
