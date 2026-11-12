"use strict";

/**
 * ==============================================================================
 * 🚀 أداة مزامنة وتوحيد أرقام الإصدارات (scripts/release.js)
 * ------------------------------------------------------------------------------
 * • يقرأ رقم الإصدار الحقيقي من package.json الجذري.
 * • يمرره ويحدث به تلقائياً:
 *   - extension/manifest.json
 *   - desktop/package.json
 *   - mobile/package.json و variables.gradle
 *   - license-server/package.json
 * ==============================================================================
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const rootPkgPath = path.join(rootDir, "package.json");

if (!fs.existsSync(rootPkgPath)) {
  console.error("Missing root package.json");
  process.exit(1);
}

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
const version = rootPkg.version;
console.log(`[Nepras Release] Target Version: ${version}`);

// 1. extension/manifest.json
const manifestPath = path.join(rootDir, "extension", "manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("✓ Updated extension/manifest.json");
}

// 2. desktop/package.json
const desktopPkgPath = path.join(rootDir, "desktop", "package.json");
if (fs.existsSync(desktopPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(desktopPkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("✓ Updated desktop/package.json");
}

// 3. mobile/package.json
const mobilePkgPath = path.join(rootDir, "mobile", "package.json");
if (fs.existsSync(mobilePkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(mobilePkgPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(mobilePkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("✓ Updated mobile/package.json");
}

// 4. license-server/package.json (تصحيح 1.3.1 إلى النسخة الموحدة)
const licPkgPath = path.join(rootDir, "license-server", "package.json");
if (fs.existsSync(licPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(licPkgPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(licPkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("✓ Updated license-server/package.json");
}

console.log("🎉 All packages successfully unified at version: " + version);
