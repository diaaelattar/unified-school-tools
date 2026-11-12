"use strict";

const crypto = require("crypto");

/**
 * ==============================================================================
 * 🔐 نظام التشفير غير المتماثل (Asymmetric Ed25519 Cryptography)
 * ------------------------------------------------------------------------------
 * • المفتاح الخاص (Private Key): يُحفظ فقط على سيرفر Vercel (بيئة الإنتاج)،
 *   وهو المسؤول الوحيد عن توقيع تذاكر التراخيص السنوية للمدارس.
 * • المفتاح العام (Public Key): يوضع في تطبيق سطح المكتب للتحقق فقط من التوقيع.
 * • يستحيل رياضياً لأي شخص فك أو تزوير التراخيص حتى مع قراءة كود العميل كاملاً.
 * • يعتمد 100% على مكتبة crypto الرسمية في Node.js دون أي برمجيات خارجية
 *   تثير اشتباه برامج الحماية (Antivirus Clean & Safe).
 * ==============================================================================
 */

// المفتاح العام kid=2 المعتمد
const ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAU3iLSrsb81TmQwoxkhMQudco/dTye9eqkc08cABAH2I=
-----END PUBLIC KEY-----`;

function getPrivateKey() {
  const custom = process.env.LICENSE_PRIVATE_KEY || process.env.NEPRAS_LICENSE_PRIVATE_KEY;
  if (!custom || custom.trim().length < 20) {
    throw new Error("CRITICAL SECURITY ERROR: LICENSE_PRIVATE_KEY environment variable is missing on server.");
  }
  let key = custom.trim();
  if (!key.includes("BEGIN PRIVATE KEY")) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }
  return key;
}

function getPublicKey() {
  return ED25519_PUBLIC_KEY;
}

function getAdminSecret() {
  const secret = process.env.ADMIN_SECRET || process.env.NEPRAS_ADMIN_KEY;
  if (!secret || String(secret).trim().length < 12) {
    throw new Error("CRITICAL SECURITY ERROR: ADMIN_SECRET environment variable is missing or too short (must be >= 12 chars).");
  }
  return String(secret).trim();
}

/**
 * توحيد كود المدرسة (تحويل الأرقام العربية إلى لاتينية وإزالة المسافات)
 */
function normalizeSchoolCode(raw) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const str = String(raw || "")
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .trim();
  const clean = str.replace(/\s+/g, "");
  return clean;
}

/**
 * توليد مفتاح تفعيل سنوي قياسي مثل: NEPRAS-2027-A8F3-9C2D
 */
function generateLicenseKey(prefix = "NEPRAS") {
  const seg = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${seg()}-${seg()}`;
}

/**
 * إنشاء تذكرة ترخيص موقعة رقمياً بتشفير Ed25519 مرتبطة بكود المدرسة وتاريخ الانتهاء
 */
function signLicenseTicket(payload, customPrivateKey) {
  const now = Date.now();
  const cleanPayload = {
    v: 1,
    schoolCode: normalizeSchoolCode(payload.schoolCode),
    schoolName: String(payload.schoolName || "").trim(),
    status: String(payload.status || "active"),
    startsAt: Number(payload.startsAt || now),
    expiresAt: Number(payload.expiresAt || 0),
    issuedAt: now,
    serverTime: now,
    licenseKey: String(payload.licenseKey || "")
  };

  const dataB64 = Buffer.from(JSON.stringify(cleanPayload), "utf8").toString("base64url");
  const privKey = customPrivateKey || getPrivateKey();
  const sig = crypto
    .sign(null, Buffer.from(dataB64, "utf8"), privKey)
    .toString("base64url");

  return `${dataB64}.${sig}`;
}

/**
 * التحقق من صحة التوقيع الرقمي لتذكرة الترخيص باستخدام المفتاح العام (Public Key)
 */
function verifyLicenseTicket(token, customPublicKey) {
  try {
    const cleanToken = String(token || "").trim().replace(/^NEPRAS1\./i, "");
    const parts = cleanToken.split(".");
    if (parts.length !== 2) return { valid: false, reason: "MALFORMED_TOKEN" };
    const [dataB64, sig] = parts;
    const pubKey = customPublicKey || getPublicKey();

    const sigBuf = Buffer.from(sig, "base64url");
    const valid = crypto.verify(
      null,
      Buffer.from(dataB64, "utf8"),
      pubKey,
      sigBuf
    );

    if (!valid) {
      return { valid: false, reason: "INVALID_SIGNATURE" };
    }

    const payload = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8"));
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, reason: err.message || "PARSE_ERROR" };
  }
}

module.exports = {
  ED25519_PUBLIC_KEY,
  getPrivateKey,
  getPublicKey,
  getAdminSecret,
  normalizeSchoolCode,
  generateLicenseKey,
  signLicenseTicket,
  verifyLicenseTicket
};
