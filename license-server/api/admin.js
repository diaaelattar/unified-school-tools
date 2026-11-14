"use strict";

const {
  getAdminSecret,
  normalizeSchoolCode,
  signLicenseTicket
} = require("../lib/crypto");
const db = require("../lib/db");

const crypto = require("crypto");

// SEC-03: Rate Limiting ومقاومة التخمين في الذاكرة
const failedAttemptsByIp = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // حظر 15 دقيقة بعد تكرار الخطأ

function checkRateLimit(clientIp) {
  const entry = failedAttemptsByIp.get(clientIp);
  if (!entry) return true;
  if (Date.now() - entry.lastAttempt > LOCKOUT_MS) {
    failedAttemptsByIp.delete(clientIp);
    return true;
  }
  return entry.count < MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(clientIp) {
  const entry = failedAttemptsByIp.get(clientIp) || { count: 0, lastAttempt: Date.now() };
  entry.count += 1;
  entry.lastAttempt = Date.now();
  failedAttemptsByIp.set(clientIp, entry);
}

function resetFailedAttempt(clientIp) {
  failedAttemptsByIp.delete(clientIp);
}

function setCors(req, res) {
  const allowedOrigin = process.env.ADMIN_ALLOWED_ORIGIN || "";
  const origin = req.headers["origin"] || "";
  if (allowedOrigin && origin && (origin === allowedOrigin || origin.endsWith("." + allowedOrigin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!allowedOrigin) {
    // تقييد افتراضي للواجهات المحلية والمحددة
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Secret");
  res.setHeader("Cache-Control", "no-store");
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch (_) { return {}; }
}

function isAuthorized(req, body) {
  let expected;
  try {
    expected = getAdminSecret();
  } catch (err) {
    return false;
  }

  // SEC-03: قبول التوثيق فقط عبر Authorization: Bearer أو X-Admin-Secret
  const headerSecret = req.headers["x-admin-secret"] || "";
  const authHeader = String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const provided = String(authHeader || headerSecret).trim();

  if (!provided || !expected) return false;

  const hashProvided = crypto.createHash("sha256").update(provided, "utf8").digest();
  const hashExpected = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const clientIp = req.headers["x-forwarded-for"] || req.connection?.remoteAddress || "local";
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      ok: false,
      code: "TOO_MANY_REQUESTS",
      message: "تم حظر المحاولات مؤقتاً لتجاوز الحد الأقصى للمحاولات الخاطئة. يرجى الانتظار."
    });
  }

  const body = parseBody(req);
  if (!isAuthorized(req, body)) {
    recordFailedAttempt(clientIp);
    return res.status(401).json({
      ok: false,
      code: "UNAUTHORIZED",
      message: "كلمة مرور لوحة التحكم غير صحيحة أو غير مصرح لك بالوصول."
    });
  }

  resetFailedAttempt(clientIp);

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const op = String(url.searchParams.get("op") || body.op || "dashboard").trim();

    if (op === "dashboard" || op === "list") {
      const [schools, keys, backend] = await Promise.all([
        db.listSchoolSubscriptions(),
        db.listActivationKeys(),
        db.getStorageBackendName()
      ]);
      const schoolsWithToken = schools.map((s) => ({
        ...s,
        signedToken: "NEPRAS1." + signLicenseTicket(s)
      }));
      return res.status(200).json({
        ok: true,
        backend,
        serverTime: Date.now(),
        schools: schoolsWithToken,
        keys
      });
    }

    // إضافة أو تحديث اشتراك مدرسة مباشرة بكود المدرسة
    if (op === "upsert-school") {
      const schoolCode = normalizeSchoolCode(body.schoolCode);
      if (!schoolCode) {
        return res.status(400).json({ ok: false, message: "كود المدرسة مطلوب." });
      }
      const planDays = Number(body.planDays || 365);
      const now = Date.now();
      const sub = await db.upsertSchoolSubscription({
        schoolCode,
        schoolName: body.schoolName || `مدرسة ${schoolCode}`,
        directorate: body.directorate || "",
        administration: body.administration || "",
        phone: body.phone || "",
        notes: body.notes || "",
        status: body.status || "active",
        planDays,
        startsAt: now,
        expiresAt: body.expiresAt ? Number(body.expiresAt) : (now + planDays * db.DAY_MS),
        resetExpiry: true
      });
      return res.status(200).json({
        ok: true,
        school: sub,
        message: `تم تفعيل اشتراك المدرسة (${sub.schoolName} - كود: ${sub.schoolCode}) لمدة ${sub.daysRemaining} يوم.`
      });
    }

    // تجديد اشتراك مدرسة لسنة إضافية (+365 يوم)
    if (op === "renew-school") {
      const days = Number(body.days || 365);
      const sub = await db.renewSchoolSubscription(body.schoolCode, days);
      return res.status(200).json({
        ok: true,
        school: sub,
        message: `تم تجديد اشتراك المدرسة (${sub.schoolName}) بإضافة ${days} يوماً (المتبقي الآن: ${sub.daysRemaining} يوم).`
      });
    }

    // إيقاف مؤقت أو إعادة تفعيل مدرسة
    if (op === "toggle-status") {
      const existing = await db.getSchoolSubscription(body.schoolCode);
      if (!existing) return res.status(404).json({ ok: false, message: "المدرسة غير موجودة." });
      const newStatus = existing.status === "suspended" ? "active" : "suspended";
      const sub = await db.upsertSchoolSubscription({
        ...existing,
        status: newStatus
      });
      return res.status(200).json({
        ok: true,
        school: sub,
        message: newStatus === "active" ? "تم إعادة تفعيل اشتراك المدرسة." : "تم إيقاف اشتراك المدرسة."
      });
    }

    // حذف اشتراك مدرسة
    if (op === "delete-school") {
      await db.deleteSchoolSubscription(body.schoolCode);
      return res.status(200).json({ ok: true, message: "تم حذف سجل المدرسة." });
    }

    // توليد مفاتيح تفعيل سنوية جديدة
    if (op === "generate-keys") {
      const keys = await db.createActivationKeys({
        count: body.count || 1,
        planDays: body.planDays || 365,
        boundSchoolCode: body.boundSchoolCode || null,
        schoolNameHint: body.schoolNameHint || "",
        notes: body.notes || ""
      });
      return res.status(200).json({
        ok: true,
        keys,
        message: `تم توليد ${keys.length} مفتاح تفعيل سنوي بنجاح.`
      });
    }

    // حذف مفتاح تفعيل
    if (op === "delete-key") {
      await db.deleteActivationKey(body.licenseKey);
      return res.status(200).json({ ok: true, message: "تم حذف المفتاح." });
    }

    return res.status(400).json({ ok: false, message: "عملية غير معروفة: " + op });
  } catch (err) {
    console.error("Admin API Error:", err);
    return res.status(500).json({
      ok: false,
      code: "SERVER_ERROR",
      message: "حدث خطأ داخلي في الخادم. يرجى المحاولة لاحقاً."
    });
  }
};
