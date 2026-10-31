"use strict";

const {
  normalizeSchoolCode,
  signLicenseTicket
} = require("../lib/crypto");
const db = require("../lib/db");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch (_) { return {}; }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const body = parseBody(req);
    const action = String(url.searchParams.get("action") || body.action || "").trim();

    if (action === "health" || req.method === "GET") {
      const backend = await db.getStorageBackendName();
      return res.status(200).json({
        ok: true,
        service: "nepras-desktop-license-server",
        backend,
        serverTime: Date.now()
      });
    }

    // -------------------------------------------------------------------------
    // 1) التحقق التلقائي من اشتراك المدرسة بكود المدرسة (check-school)
    // -------------------------------------------------------------------------
    if (action === "check-school") {
      const schoolCode = normalizeSchoolCode(body.schoolCode || body.school_code);
      if (!schoolCode) {
        return res.status(400).json({
          ok: false,
          code: "SCHOOL_CODE_REQUIRED",
          message: "يرجى تسجيل الدخول على موقع الوزارة أولاً أو إدخال كود المدرسة."
        });
      }

      const sub = await db.recordSchoolCheck(schoolCode, {
        schoolName: body.schoolName || "",
        directorate: body.directorate || "",
        administration: body.administration || "",
        deviceInfo: body.deviceInfo || ""
      });

      if (!sub) {
        return res.status(200).json({
          ok: false,
          subscribed: false,
          status: "UNSUBSCRIBED",
          schoolCode,
          serverTime: Date.now(),
          message: `المدرسة ذات الكود (${schoolCode}) غير مسجلة في الاشتراك السنوي لتطبيق سطح المكتب. يرجى إدخال مفتاح التفعيل أو التواصل مع الإدارة لتفعيل كود المدرسة.`
        });
      }

      if (sub.status === "suspended") {
        return res.status(200).json({
          ok: false,
          subscribed: false,
          status: "SUSPENDED",
          schoolCode,
          schoolName: sub.schoolName,
          serverTime: Date.now(),
          message: `اشتراك المدرسة (${sub.schoolName || schoolCode}) موقوف حالياً من قِبل الإدارة. يرجى التواصل مع الدعم الفني.`
        });
      }

      if (sub.status === "expired" || Date.now() >= sub.expiresAt) {
        return res.status(200).json({
          ok: false,
          subscribed: false,
          status: "EXPIRED",
          schoolCode,
          schoolName: sub.schoolName,
          expiresAt: sub.expiresAt,
          serverTime: Date.now(),
          message: `انتهت فترة الاشتراك السنوي للمدرسة (${sub.schoolName || schoolCode}) بتاريخ ${new Date(sub.expiresAt).toLocaleDateString("ar-EG")}. يرجى تجديد الاشتراك السنوي للمتابعة.`
        });
      }

      const ticket = signLicenseTicket({
        schoolCode: sub.schoolCode,
        schoolName: sub.schoolName,
        status: "active",
        startsAt: sub.startsAt,
        expiresAt: sub.expiresAt,
        licenseKey: sub.licenseKey
      });

      return res.status(200).json({
        ok: true,
        subscribed: true,
        status: sub.daysRemaining <= 10 ? "WARNING" : "ACTIVE",
        schoolCode: sub.schoolCode,
        schoolName: sub.schoolName,
        startsAt: sub.startsAt,
        expiresAt: sub.expiresAt,
        daysRemaining: sub.daysRemaining,
        ticket,
        serverTime: Date.now(),
        message: sub.daysRemaining <= 10
          ? `⚠️ تنبيه: ينتهي الاشتراك السنوي للمدرسة (${sub.schoolName || sub.schoolCode}) خلال ${sub.daysRemaining} يوم.`
          : `✅ اشتراك سنوي نشط للمدرسة (${sub.schoolName || sub.schoolCode})`
      });
    }

    // -------------------------------------------------------------------------
    // 2) تفعيل اشتراك مدرسة باستخدام مفتاح تفعيل سنوي (activate-key)
    // -------------------------------------------------------------------------
    if (action === "activate-key") {
      const schoolCode = normalizeSchoolCode(body.schoolCode || body.school_code);
      const licenseKey = String(body.licenseKey || body.license_key || "").trim().toUpperCase();
      const schoolName = String(body.schoolName || body.school_name || "").trim();

      if (!schoolCode) {
        return res.status(400).json({
          ok: false,
          code: "SCHOOL_CODE_REQUIRED",
          message: "يرجى إدخال كود المدرسة أو تسجيل الدخول لحساب المدرسة على موقع الوزارة أولاً."
        });
      }

      if (!licenseKey) {
        return res.status(400).json({
          ok: false,
          code: "LICENSE_KEY_REQUIRED",
          message: "يرجى إدخال مفتاح التفعيل السنوي."
        });
      }

      // أولاً: هل هذا المفتاح مسجل بالفعل لهذه المدرسة في جدول المدارس؟
      const existingSchool = await db.getSchoolSubscription(schoolCode);
      if (existingSchool && existingSchool.licenseKey === licenseKey) {
        if (existingSchool.status === "active" && existingSchool.expiresAt > Date.now()) {
          const ticket = signLicenseTicket(existingSchool);
          return res.status(200).json({
            ok: true,
            subscribed: true,
            status: existingSchool.daysRemaining <= 10 ? "WARNING" : "ACTIVE",
            schoolCode: existingSchool.schoolCode,
            schoolName: existingSchool.schoolName,
            startsAt: existingSchool.startsAt,
            expiresAt: existingSchool.expiresAt,
            daysRemaining: existingSchool.daysRemaining,
            ticket,
            serverTime: Date.now(),
            message: `✅ تم استعادة الاشتراك السنوي للمدرسة (${existingSchool.schoolName || schoolCode}) بنجاح!`
          });
        }
      }

      // ثانياً: فحص جدول مفاتيح التفعيل
      const keyRow = await db.getActivationKey(licenseKey);
      if (!keyRow) {
        return res.status(200).json({
          ok: false,
          code: "INVALID_KEY",
          message: "مفتاح التفعيل غير صحيح. تأكد من كتابة المفتاح بشكل سليم."
        });
      }

      if (keyRow.status === "revoked") {
        return res.status(200).json({
          ok: false,
          code: "REVOKED_KEY",
          message: "هذا المفتاح ملغى من قِبل الإدارة."
        });
      }

      if (keyRow.boundSchoolCode && keyRow.boundSchoolCode !== schoolCode) {
        return res.status(200).json({
          ok: false,
          code: "KEY_BOUND_TO_OTHER_SCHOOL",
          message: `هذا المفتاح مرتبط بمدرسة أخرى (كود: ${keyRow.boundSchoolCode}) ولا يمكن استخدامه لمدرسة مختلفة.`
        });
      }

      if (keyRow.status === "used" && keyRow.boundSchoolCode === schoolCode && existingSchool) {
        // المفتاح مستخدم لنفس المدرسة — نرجع بيانات اشتراكها الحالي
        if (existingSchool.status === "active" && existingSchool.expiresAt > Date.now()) {
          const ticket = signLicenseTicket(existingSchool);
          return res.status(200).json({
            ok: true,
            subscribed: true,
            status: existingSchool.daysRemaining <= 10 ? "WARNING" : "ACTIVE",
            schoolCode: existingSchool.schoolCode,
            schoolName: existingSchool.schoolName,
            startsAt: existingSchool.startsAt,
            expiresAt: existingSchool.expiresAt,
            daysRemaining: existingSchool.daysRemaining,
            ticket,
            serverTime: Date.now(),
            message: `✅ تم التحقق من الاشتراك السنوي للمدرسة (${existingSchool.schoolName || schoolCode}) بنجاح!`
          });
        }
        return res.status(200).json({
          ok: false,
          code: "KEY_ALREADY_USED",
          message: "تم استنفاد فترة هذا المفتاح سابقاً. يرجى الحصول على مفتاح تجديد سنوي جديد."
        });
      }

      // تفعيل المفتاح الجديد للمدرسة (إضافة 365 يوماً أو planDays)
      const now = Date.now();
      const baseTime = existingSchool && existingSchool.expiresAt > now ? existingSchool.expiresAt : now;
      const planDays = Number(keyRow.planDays || 365);
      const expiresAt = baseTime + planDays * db.DAY_MS;

      const updatedSub = await db.upsertSchoolSubscription({
        schoolCode,
        schoolName: schoolName || existingSchool?.schoolName || keyRow.schoolNameHint || `مدرسة ${schoolCode}`,
        directorate: body.directorate || existingSchool?.directorate || "",
        administration: body.administration || existingSchool?.administration || "",
        licenseKey,
        status: "active",
        planDays,
        startsAt: existingSchool?.startsAt || now,
        expiresAt,
        checkCount: (existingSchool?.checkCount || 0) + 1,
        lastCheckAt: now
      });

      await db.markActivationKeyUsed(licenseKey, schoolCode);

      const ticket = signLicenseTicket(updatedSub);

      return res.status(200).json({
        ok: true,
        subscribed: true,
        status: "ACTIVE",
        schoolCode: updatedSub.schoolCode,
        schoolName: updatedSub.schoolName,
        startsAt: updatedSub.startsAt,
        expiresAt: updatedSub.expiresAt,
        daysRemaining: updatedSub.daysRemaining,
        ticket,
        serverTime: now,
        message: `🎉 تم تفعيل الاشتراك السنوي للمدرسة (${updatedSub.schoolName}) بنجاح لمدة ${updatedSub.daysRemaining} يوم! سيعمل البرنامج الآن تلقائياً على أي جهاز.`
      });
    }

    return res.status(400).json({ ok: false, message: "UNKNOWN_ACTION" });
  } catch (err) {
    console.error("License API Error:", err);
    return res.status(500).json({
      ok: false,
      code: "SERVER_ERROR",
      message: "حدث خطأ في خادم التراخيص: " + (err.message || String(err))
    });
  }
};
