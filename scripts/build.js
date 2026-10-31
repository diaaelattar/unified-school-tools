"use strict";
// Builds dist/<target> (desktop | mobile): host shell + a patched copy of the unmodified extension in ./ext
const fs = require("fs");
const path = require("path");

const target = process.argv[2];
if (!["desktop", "mobile"].includes(target)) { console.error("usage: node scripts/build.js desktop|mobile"); process.exit(1); }
const root = path.resolve(__dirname, "..");
const out = path.join(root, "dist", target);
const extSrc = path.join(root, "extension");

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of ["host.html", "host.css", "host-core.js", "host-ui.js"]) fs.copyFileSync(path.join(root, "shared", f), path.join(out, f));
if (target === "mobile") fs.copyFileSync(path.join(out, "host.html"), path.join(out, "index.html"));
fs.copyFileSync(path.join(root, target, "src", "platform-backend.js"), path.join(out, "platform-backend.js"));

const ext = path.join(out, "ext");
copyDir(extSrc, ext);
fs.copyFileSync(path.join(root, "shared", "nepras-shim.js"), path.join(ext, "nepras-shim.js"));

// popup.html: shim must be the very first script
const popupPath = path.join(ext, "popup.html");
let popup = fs.readFileSync(popupPath, "utf8");
if (!popup.includes("nepras-shim.js")) {
  if (!/<head[^>]*>/i.test(popup)) throw new Error("popup.html has no <head>");
  popup = popup.replace(/<head[^>]*>/i, (m) => m + '\n<script src="nepras-shim.js"></script>');
  fs.writeFileSync(popupPath, popup);
}

// background page replaces the MV3 service worker
fs.writeFileSync(path.join(ext, "_background.html"),
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nepras background</title>\n' +
  '<script src="nepras-shim.js"></script>\n' +
  '<script src="modules/nepras_security_guard.js"></script>\n' +
  '<script src="modules/school_manager.js"></script>\n' +
  '<script src="modules/class_books_store.js"></script>\n' +
  '<script src="background.js"></script>\n</head><body></body></html>\n');

// offscreen document is not used (background.js falls back to data: URLs when chrome.offscreen is absent)
console.log("built", path.relative(root, out));
