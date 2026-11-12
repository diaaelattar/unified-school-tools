"use strict";

/**
 * ==============================================================================
 * 🛠️ أداة بناء ومزامنة الواجهة ونظام الرموز (tools/build-ui.js)
 * ------------------------------------------------------------------------------
 * • يقرأ extension/ui/tokens.css و components.css.
 * • يولّد extension/ui/_styles.js المعتمد لحقن الواجهة داخل Shadow DOM في صفحات الوزارة.
 * • يضمن سلامة التحديث البصري وعدم الحاجة لأي تعديل يدوي.
 * ==============================================================================
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const uiDir = path.join(rootDir, "extension", "ui");

const tokensPath = path.join(uiDir, "tokens.css");
const componentsPath = path.join(uiDir, "components.css");
const outPath = path.join(uiDir, "_styles.js");

function buildUi() {
  if (!fs.existsSync(tokensPath) || !fs.existsSync(componentsPath)) {
    console.error("Missing tokens.css or components.css in extension/ui/");
    process.exit(1);
  }

  const tokensCss = fs.readFileSync(tokensPath, "utf8");
  const componentsCss = fs.readFileSync(componentsPath, "utf8");

  const combined = `${tokensCss}\n\n${componentsCss}`;
  const jsonEncoded = JSON.stringify(combined);

  const header = `/* مولَّد تلقائيًا من tokens.css + components.css عبر tools/build-ui.js — لا تعدّله يدويًا */\n`;
  const code = `${header}globalThis.NEPRAS_UI_STYLES = ${jsonEncoded};\n`;

  fs.writeFileSync(outPath, code, "utf8");
  console.log("✅ Successfully built extension/ui/_styles.js");
}

if (require.main === module) {
  buildUi();
}

module.exports = { buildUi };
