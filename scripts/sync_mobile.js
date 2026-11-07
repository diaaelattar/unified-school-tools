"use strict";

/**
 * ==============================================================================
 * 🔄 سكريبت المزامنة الموحدة لتطبيق الأندرويد (Nepras Mobile Assets Sync)
 * ------------------------------------------------------------------------------
 * • يجعل مجلد extension هو المصدر الوحيد للحقيقة (Single Source of Truth).
 * • ينسخ كافة ملفات الإضافة المحدثة تلقائياً إلى أصول تطبيق الأندرويد.
 * • يمنع تباعد الكود بين سطح المكتب والهاتف المحمول نهائياً.
 * ==============================================================================
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.resolve(__dirname, "../extension");
const PUBLIC_DIR = path.resolve(__dirname, "../mobile/android/app/src/main/assets/public");
const DEST_DIR = path.join(PUBLIC_DIR, "ext");
const SHARED_DIR = path.resolve(__dirname, "../shared");
const MOBILE_SRC = path.resolve(__dirname, "../mobile/src");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === "tests" || entry.name.endsWith(".test.js")) continue;

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("--- مزامنة أصول وتطبيق الأندرويد الكامل ---");
console.log("مجلد الأصول العام:", PUBLIC_DIR);

try {
  // 1. مزامنة مجلد الإضافة المحدث
  copyDirRecursive(SRC_DIR, DEST_DIR);
  if (fs.existsSync(path.join(SHARED_DIR, "nepras-shim.js"))) {
    fs.copyFileSync(path.join(SHARED_DIR, "nepras-shim.js"), path.join(DEST_DIR, "nepras-shim.js"));
  }

  // 2. مزامنة ملفات الواجهة الموحدة والمشتركة
  const hostFiles = ["host.html", "host.css", "host-core.js", "host-ui.js", "nepras_logger.js"];
  for (const f of hostFiles) {
    const sPath = path.join(SHARED_DIR, f);
    if (fs.existsSync(sPath)) {
      fs.copyFileSync(sPath, path.join(PUBLIC_DIR, f));
    }
  }
  // index.html في أندرويد هو نسخة من host.html
  fs.copyFileSync(path.join(SHARED_DIR, "host.html"), path.join(PUBLIC_DIR, "index.html"));

  // 3. مزامنة الباك إند المخصص للأندرويد والمزود بمحرك التفعيل والترخيص
  fs.copyFileSync(path.join(MOBILE_SRC, "platform-backend.js"), path.join(PUBLIC_DIR, "platform-backend.js"));

  // 4. إنشاء صفحة الخلفية _background.html الموحدة
  const bgHtmlContent =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nepras background</title>\n' +
    '<script src="nepras-shim.js"></script>\n' +
    '<script src="modules/nepras_logger.js"></script>\n' +
    '<script src="modules/nepras_security_guard.js"></script>\n' +
    '<script src="modules/school_manager.js"></script>\n' +
    '<script src="modules/class_books_store.js"></script>\n' +
    '<script src="background.js"></script>\n</head><body></body></html>\n';
  fs.writeFileSync(path.join(DEST_DIR, "_background.html"), bgHtmlContent, "utf8");

  console.log("✅ تمت مزامنة كامل أصول وكود تطبيق الأندرويد بنجاح تام 100%!");
} catch (err) {
  console.error("❌ فشلت المزامنة:", err.message);
  process.exit(1);
}
