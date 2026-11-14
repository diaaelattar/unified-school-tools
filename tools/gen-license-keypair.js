"use strict";

/**
 * أداة توليد زوج مفاتيح Ed25519 جديد لتوقيع تذاكر التراخيص (T01).
 * تطبع المفتاح الخاص والعام على stdout فقط دون كتابة أي ملفات في المستودع.
 * التشغيل: node tools/gen-license-keypair.js
 */
const crypto = require("crypto");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

console.log("=== LICENSE_PRIVATE_KEY (ضعه في متغيرات بيئة الخادم السرية فقط — لا تشاركه) ===");
console.log(privateKey.trim());
console.log("\n=== ED25519_PUBLIC_KEY (ضعه في كود التحقق بالعميل) ===");
console.log(publicKey.trim());
