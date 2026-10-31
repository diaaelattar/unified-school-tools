"use strict";

/**
 * ==============================================================================
 * 🛡️ مدير الاشتراكات لتطبيق سطح المكتب (Nepras Desktop License Manager)
 * ------------------------------------------------------------------------------
 * • مخصص حصرياً لتطبيق سطح المكتب (Electron Desktop).
 * • يربط الاشتراك بكود المدرسة ليعمل تلقائياً على أي جهاز كمبيوتر داخل المدرسة.
 * • يدعم مهلة تجريبية مجانية لمدة 7 أيام عند التشغيل لأول مرة، ثم القفل التلقائي
 *   لحين التفعيل السنوي بكود 30 جنيهاً.
 * ==============================================================================
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

/**
 * المفتاح العام (Public Key) المعتمد للتحقق من التوقيع الرقمي لسيرفر نبراس.
 * ملاحظة أمنية: المفتاح العام لا يمكن استخدامه أبداً لتوقيع أو تزوير التراخيص.
 * المفتاح الخاص (Private Key) محفوظ فقط وحصرياً على سيرفر Vercel.
 */
const ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAaIP3p6EqNwVGk1OOTPaj38bdclrXXlj6h5fWUW4TXlY=
-----END PUBLIC KEY-----`;

const SUPABASE_LICENSE_URL = "https://tmjqjyzteqbbuagensxo.supabase.co";
const SUPABASE_LICENSE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtanFqeXp0ZXFiYnVhZ2Vuc3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzQzMjAsImV4cCI6MjEwNTIxMDMyMH0.107000J6zI9LTSFd6VsWznUad1Go4vGjgpmESgA5qvk";

const DEFAULT_SERVER_URL = process.env.NEPRAS_LICENSE_SERVER_URL || SUPABASE_LICENSE_URL;
const DAY_MS = 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 7 * DAY_MS; // 7 أيام سماح للعمل أوفلاين للمدرسة المفعّلة مسبقاً
const WARN_DAYS = 10; // التنبيه قبل انتهاء الاشتراك السنوي بـ 10 أيام

function normalizeSchoolCode(raw) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const str = String(raw || "")
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .trim();
  const clean = str.replace(/\s+/g, "");
  // كود المدرسة يتكون عادة من 4 إلى 12 رقماً
  return /^\d{4,12}$/.test(clean) ? clean : clean.replace(/[^\dA-Za-z_-]/g, "");
}

function verifyTicketSignature(token, pubKey = ED25519_PUBLIC_KEY) {
  try {
    const cleanToken = String(token || "").trim().replace(/^NEPRAS1\./i, "");
    const parts = cleanToken.split(".");
    if (parts.length !== 2) return { valid: false, reason: "MALFORMED_TICKET" };
    const [dataB64, sig] = parts;
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

function signTicket(payload, privateKey) {
  if (!privateKey) {
    throw new Error("Client cannot sign tickets without private key. Signing is server-only.");
  }
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
  const sig = crypto
    .sign(null, Buffer.from(dataB64, "utf8"), privateKey)
    .toString("base64url");
  return `${dataB64}.${sig}`;
}

/**
 * استخراج كود المدرسة واسمها من رؤوس طلبات صفحة المدرسة أو من توكن JWT
 */
function extractSchoolFromEmisHeaders(requestHeaders) {
  if (!requestHeaders || typeof requestHeaders !== "object") return null;

  let schoolCode = "";
  let schoolName = "";
  let authHeader = "";

  for (const [k, v] of Object.entries(requestHeaders)) {
    const lower = String(k || "").toLowerCase();
    const val = Array.isArray(v) ? String(v[0] || "") : String(v || "");
    if (!val) continue;
    if (lower === "schoolcode" || lower === "sc") {
      const norm = normalizeSchoolCode(val);
      if (/^\d{4,12}$/.test(norm)) schoolCode = norm;
    } else if (lower === "authorization") {
      authHeader = val;
    }
  }

  // محاولة استخراج كود المدرسة واسمها من حمولة JWT إن وجدت
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    try {
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      const parts = jwt.split(".");
      if (parts.length >= 2) {
        const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (claims && typeof claims === "object") {
          const candCode =
            claims.schoolcode ||
            claims.SchoolCode ||
            claims.school_code ||
            claims.sc ||
            claims.SchoolId ||
            claims.schoolId ||
            "";
          if (!schoolCode && candCode) {
            const norm = normalizeSchoolCode(candCode);
            if (/^\d{4,12}$/.test(norm)) schoolCode = norm;
          }
          const candName =
            claims.schoolName ||
            claims.SchoolName ||
            claims.school_name ||
            claims.ArabicSchoolName ||
            "";
          if (candName) schoolName = String(candName).trim();
        }
      }
    } catch (_) {}
  }

  if (!schoolCode) return null;
  return { schoolCode, schoolName };
}

class DesktopLicenseManager {
  constructor({ storageDir, onUpdate } = {}) {
    this.storageDir = storageDir || path.join(os.homedir(), ".nepras-desktop");
    this.storageFile = path.join(this.storageDir, "school-subscriptions-v1.json");
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};

    this.state = {
      serverUrl: DEFAULT_SERVER_URL,
      activeSchoolCode: "",
      activeSchoolName: "",
      lastKnownServerTime: 0,
      lastLocalRunTime: 0,
      ticketsBySchool: {} // schoolCode -> { ticket, verifiedAt, schoolName }
    };

    this._checkInFlight = new Map();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = JSON.parse(fs.readFileSync(this.storageFile, "utf8"));
        if (raw && typeof raw === "object") {
          let sUrl = String(raw.serverUrl || "").trim().replace(/\/+$/, "");
          // حماية أمنية مشددة: قفل السيرفر حصرياً على سوبابيز المعتمد (أو localhost للاختبارات فقط)
          const isAllowed = sUrl === SUPABASE_LICENSE_URL || sUrl.includes("supabase.co") || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(sUrl);
          if (!isAllowed) {
            sUrl = DEFAULT_SERVER_URL;
          }
          this.state.serverUrl = sUrl;
          this.state.activeSchoolCode = normalizeSchoolCode(raw.activeSchoolCode || "");
          this.state.activeSchoolName = String(raw.activeSchoolName || "");
          this.state.lastKnownServerTime = Number(raw.lastKnownServerTime || 0);
          this.state.lastLocalRunTime = Number(raw.lastLocalRunTime || 0);
          if (raw.ticketsBySchool && typeof raw.ticketsBySchool === "object") {
            this.state.ticketsBySchool = raw.ticketsBySchool;
          }
          // تنظيف أي رقم مسلسل تجريبي مكرر لنفس المدرسة التي تملك اشتراكاً سنوياً مفعّلاً
          let cleanedDuplicates = false;
          const activePaidByName = new Map();
          for (const [code, entry] of Object.entries(this.state.ticketsBySchool)) {
            if (entry && String(entry.status || "").toLowerCase() === "active" && entry.schoolName) {
              activePaidByName.set(String(entry.schoolName).trim(), code);
            }
          }
          for (const [code, entry] of Object.entries(this.state.ticketsBySchool)) {
            const sName = entry && entry.schoolName ? String(entry.schoolName).trim() : "";
            if (sName && activePaidByName.has(sName) && activePaidByName.get(sName) !== code && String(entry.status || "").toLowerCase() !== "active") {
              delete this.state.ticketsBySchool[code];
              if (!this.state.activeSchoolCode || this.state.activeSchoolCode === code) {
                this.state.activeSchoolCode = activePaidByName.get(sName);
                this.state.activeSchoolName = sName;
              }
              cleanedDuplicates = true;
            }
          }
          // إذا لم يكن هناك كود نشط حالي ويوجد اشتراك مفعّل واحد على الأقل، نعتمد الاشتراك المفعّل افتراضياً
          if (!this.state.activeSchoolCode && activePaidByName.size > 0) {
            const [firstName, firstCode] = activePaidByName.entries().next().value;
            this.state.activeSchoolCode = firstCode;
            this.state.activeSchoolName = firstName;
            cleanedDuplicates = true;
          }
          // إذا كان الرابط المخزن مخالفاً أو تم تنظيف تكرار، نحفظ فوراً على القرص
          if (raw.serverUrl !== this.state.serverUrl || cleanedDuplicates) {
            this._save();
          }
        }
      }
    } catch (_) {}
  }

  _save() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const tmp = this.storageFile + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
      fs.renameSync(tmp, this.storageFile);
    } catch (_) {}
  }

  setServerUrl(url) {
    let clean = String(url || "").trim().replace(/\/+$/, "");
    // قفل أمني محكم: منع أي توجيه لسيرفرات خارجية بخلاف خادم سوبابيز المعتمد
    const isAllowed = clean === SUPABASE_LICENSE_URL || clean.includes("supabase.co") || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean);
    if (!isAllowed) {
      clean = DEFAULT_SERVER_URL;
    }
    this.state.serverUrl = clean;
    this._save();
    return this.getStatus();
  }

  _effectiveNow() {
    const now = Date.now();
    if (now > this.state.lastLocalRunTime) {
      this.state.lastLocalRunTime = now;
    }
    return Math.max(now, this.state.lastKnownServerTime || 0);
  }

  _isClockTampered() {
    const now = Date.now();
    // إذا أرجع المستخدم ساعة الجهاز للخلف بأكثر من 24 ساعة عن آخر وقت مسجل
    if (this.state.lastKnownServerTime > 0 && now < this.state.lastKnownServerTime - DAY_MS) {
      return true;
    }
    if (this.state.lastLocalRunTime > 0 && now < this.state.lastLocalRunTime - DAY_MS) {
      return true;
    }
    return false;
  }

  /**
   * حساب حالة الترخيص الحالية للمدرسة النشطة
   */
  getStatus(customSchoolCode) {
    const schoolCode = normalizeSchoolCode(customSchoolCode || this.state.activeSchoolCode);
    const schoolName = this.state.activeSchoolName || "";

    if (this._isClockTampered()) {
      return {
        platform: "desktop",
        locked: true,
        status: "TAMPERED",
        schoolCode,
        schoolName,
        serverUrl: this.state.serverUrl,
        daysRemaining: 0,
        expiresAt: 0,
        message: "⚠️ تم اكتشاف تراجع أو تعديل غير صحيح في تاريخ وساعة جهاز الكمبيوتر. يرجى ضبط الساعة والتاريخ الصحيحين لتفعيل الاشتراك."
      };
    }

    if (!schoolCode) {
      return {
        platform: "desktop",
        locked: true,
        status: "AWAITING_SCHOOL",
        schoolCode: "",
        schoolName: "",
        serverUrl: this.state.serverUrl,
        daysRemaining: 0,
        expiresAt: 0,
        message: "سجّل الدخول بحساب مدرستك على صفحة بيانات التلميذ والمعلم (أو أدخل كود المدرسة أدناه) لبدء الاستخدام أو تفعيل الاشتراك."
      };
    }

    const entry = this.state.ticketsBySchool[schoolCode];
    if (!entry || !entry.ticket) {
      return {
        platform: "desktop",
        locked: true,
        status: "UNSUBSCRIBED",
        schoolCode,
        schoolName,
        serverUrl: this.state.serverUrl,
        daysRemaining: 0,
        expiresAt: 0,
        message: `المدرسة الحالية (كود: ${schoolCode}) تحتاج إلى فحص الاشتراك أو بدء الفترة التجريبية المجانية. اضغط «فحص التفعيل» للتحقق فوراً.`
      };
    }

    let payload = null;
    let expiresAt = 0;
    let resolvedSchoolName = schoolName || entry.schoolName || `مدرسة ${schoolCode}`;

    if (String(entry.ticket || "").startsWith("SUPABASE_VERIFIED.")) {
      expiresAt = Number(entry.expiresAt || 0);
      payload = {
        schoolCode,
        schoolName: resolvedSchoolName,
        status: entry.status || "active",
        expiresAt
      };
    } else {
      const verified = verifyTicketSignature(entry.ticket);
      if (!verified.valid || normalizeSchoolCode(verified.payload?.schoolCode) !== schoolCode) {
        return {
          platform: "desktop",
          locked: true,
          status: "INVALID_TICKET",
          schoolCode,
          schoolName,
          serverUrl: this.state.serverUrl,
          daysRemaining: 0,
          expiresAt: 0,
          message: `تذكرة الترخيص للمدرسة (${schoolCode}) غير صالحة. يرجى إعادة التحقق من الاشتراك.`
        };
      }
      payload = verified.payload;
      expiresAt = Number(payload.expiresAt || 0);
      resolvedSchoolName = schoolName || payload.schoolName || entry.schoolName || `مدرسة ${schoolCode}`;
    }

    const now = this._effectiveNow();
    // التحقق الصارم: إذا كان السجل أو التذكرة يحمل حالة 'active' وتاريخ الانتهاء ساري، فالمدرسة مرخصة ونشطة رسمياً
    const isPaidActive = (String(payload?.status || "").toLowerCase() === "active" || String(entry?.status || "").toLowerCase() === "active") && (now < expiresAt);
    const isTrial = !isPaidActive && (String(payload?.status || entry?.status || "").toLowerCase() === "trial");

    if (payload.status === "suspended") {
      return {
        platform: "desktop",
        locked: true,
        status: "SUSPENDED",
        schoolCode,
        schoolName: resolvedSchoolName,
        serverUrl: this.state.serverUrl,
        daysRemaining: 0,
        expiresAt,
        message: `🔒 اشتراك المدرسة (${resolvedSchoolName} - كود: ${schoolCode}) موقوف مؤقتاً من قِبل الإدارة.`
      };
    }

    if (now >= expiresAt) {
      return {
        platform: "desktop",
        locked: true,
        status: isTrial ? "EXPIRED_TRIAL" : "EXPIRED",
        schoolCode,
        schoolName: resolvedSchoolName,
        serverUrl: this.state.serverUrl,
        daysRemaining: 0,
        expiresAt,
        message: isTrial
          ? `🔒 انتهت المهلة التجريبية المجانية (7 أيام) لكود المدرسة (${resolvedSchoolName} - كود: ${schoolCode}). يرجى الاشتراك وتفعيل الكرت بـ 30 جنيهاً للاستمرار في الاستخدام.`
          : `🔒 انتهت صلاحية الاشتراك السنوي للمدرسة (${resolvedSchoolName} - كود: ${schoolCode}) بتاريخ ${new Date(expiresAt).toLocaleDateString("ar-EG")}. يرجى التجديد السنوي بـ 30 جنيهاً للمتابعة.`
      };
    }

    const daysRemaining = Math.max(1, Math.ceil((expiresAt - now) / DAY_MS));
    const isWarning = !isTrial && daysRemaining <= WARN_DAYS;

    if (isTrial) {
      return {
        platform: "desktop",
        locked: false,
        status: "TRIAL",
        schoolCode,
        schoolName: resolvedSchoolName,
        serverUrl: this.state.serverUrl,
        daysRemaining,
        startsAt: Number(payload.startsAt || 0),
        expiresAt,
        licenseKey: "",
        verifiedAt: entry.verifiedAt || 0,
        message: `⏱️ فترة تجريبية مجانية لكافة أدوات نبراس — متبقي ${daysRemaining} ${daysRemaining <= 2 ? "يوم" : "أيام"} (حتى ${new Date(expiresAt).toLocaleDateString("ar-EG")}). يمكنك الاشتراك السنوي بـ 30 جنيهاً في أي وقت.`
      };
    }

    return {
      platform: "desktop",
      locked: false,
      status: isWarning ? "WARNING" : "ACTIVE",
      schoolCode,
      schoolName: resolvedSchoolName,
      serverUrl: this.state.serverUrl,
      daysRemaining,
      startsAt: Number(payload.startsAt || 0),
      expiresAt,
      licenseKey: payload.licenseKey || "",
      verifiedAt: entry.verifiedAt || 0,
      message: isWarning
        ? `⚠️ تنبيه: ينتهي الاشتراك السنوي للمدرسة (${resolvedSchoolName}) خلال ${daysRemaining} ${daysRemaining <= 2 ? "يوم" : "أيام"} (${new Date(expiresAt).toLocaleDateString("ar-EG")}).`
        : `✅ اشتراك سنوي نشط — ${resolvedSchoolName} (كود: ${schoolCode}) • متبقي ${daysRemaining} يوم`
    };
  }

  /**
   * يُستدعى تلقائياً عند التقاط كود المدرسة من صفحة بيانات التلميذ والمعلم
   */
  async onSchoolDetected({ schoolCode, schoolName } = {}) {
    let normCode = normalizeSchoolCode(schoolCode);
    const cleanName = String(schoolName || "").trim();

    // إذا كان اسم المدرسة مطابقاً لمدرسة مفعّلة باشتراك سنوي نشط في الذاكرة بينما الكود الملتقط هو رقم مسلسل فرعي، نعتمد الكود الرسمي المفعّل
    if (cleanName && !/^مدرسة \d+$/.test(cleanName)) {
      const currentEntry = normCode ? this.state.ticketsBySchool[normCode] : null;
      const currentIsActive = currentEntry && String(currentEntry.status || "").toLowerCase() === "active";
      if (!currentIsActive) {
        for (const [cKey, entry] of Object.entries(this.state.ticketsBySchool)) {
          if (entry && String(entry.status || "").toLowerCase() === "active" && String(entry.schoolName || "").trim() === cleanName) {
            normCode = cKey;
            break;
          }
        }
      }
    }

    if (!normCode) return this.getStatus();

    const changed =
      normCode !== this.state.activeSchoolCode ||
      (schoolName && schoolName !== this.state.activeSchoolName);

    this.state.activeSchoolCode = normCode;
    if (schoolName) this.state.activeSchoolName = String(schoolName).trim();
    if (changed) {
      this._save();
      this.onUpdate(this.getStatus());
    }

    // إذا لم يكن للمدرسة تذكرة محلية أو مضى وقت الفحص، نفحص السيرفر تلقائياً
    // المدارس المرخصة مسبقاً باشتراك نشط ساري يتم فحصها كل 24 ساعة لتفادي الضغط أو خفض الاشتراك
    const existing = this.state.ticketsBySchool[normCode];
    const isAlreadyActivePaid = existing && existing.status === "active" && Number(existing.expiresAt || 0) > (Date.now() + 10 * DAY_MS);
    const checkInterval = isAlreadyActivePaid ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
    const shouldCheckOnline = !existing || !existing.verifiedAt || (Date.now() - existing.verifiedAt > checkInterval);
    if (shouldCheckOnline) {
      await this.checkSchoolOnline({ schoolCode: normCode, schoolName: this.state.activeSchoolName }).catch(() => {});
    }

    return this.getStatus();
  }

  /**
   * يُستدعى عند تسجيل الخروج من موقع الوزارة لقفل الأدوات ومنع استخدام ترخيص مدرسة سابقة
   */
  onSchoolLoggedOut() {
    if (!this.state.activeSchoolCode) return this.getStatus();
    this.state.activeSchoolCode = "";
    this.state.activeSchoolName = "";
    this._save();
    this.onUpdate(this.getStatus());
    return this.getStatus();
  }

  /**
   * الاتصال بسيرفر Vercel للتحقق من اشتراك المدرسة بكودها
   */
  async checkSchoolOnline({ schoolCode, schoolName, serverUrl, background } = {}) {
    if (serverUrl) this.setServerUrl(serverUrl);
    const normCode = normalizeSchoolCode(schoolCode || this.state.activeSchoolCode);
    if (!normCode) {
      return {
        ok: false,
        status: this.getStatus(),
        message: "يرجى تسجيل الدخول بحساب المدرسة على صفحة بيانات التلميذ والمعلم أو كتابة كود المدرسة أولاً."
      };
    }

    if (!background || !this.state.activeSchoolCode) {
      this.state.activeSchoolCode = normCode;
      if (schoolName) this.state.activeSchoolName = String(schoolName).trim();
    }

    if (this._checkInFlight.has(normCode)) {
      return this._checkInFlight.get(normCode);
    }

    const job = (async () => {
      try {
        let data = null;
        const isSupabase = String(this.state.serverUrl || "").includes("supabase.co");

        if (isSupabase) {
          const res = await fetch(`${SUPABASE_LICENSE_URL}/rest/v1/rpc/check_school_subscription`, {
            method: "POST",
            headers: {
              "apikey": SUPABASE_LICENSE_ANON_KEY,
              "Authorization": `Bearer ${SUPABASE_LICENSE_ANON_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              p_school_code: normCode,
              p_school_name: this.state.activeSchoolName || ""
            })
          });
          data = await res.json();
        } else {
          const endpoint = `${this.state.serverUrl}/api/v1/check-school`;
          const deviceInfo = `${os.hostname()} (${os.platform()} ${os.release()})`;
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              schoolCode: normCode,
              schoolName: this.state.activeSchoolName || "",
              deviceInfo
            })
          });
          data = await res.json();
        }

        const serverTs = Number(data?.server_time || data?.serverTime || 0);
        if (serverTs > this.state.lastKnownServerTime) {
          this.state.lastKnownServerTime = serverTs;
        }

        if (data?.ok && data?.subscribed) {
          const expiresAt = new Date(data.expires_at || data.expiresAt || 0).getTime();
          const resolvedSchoolName = data.school_name || data.schoolName || this.state.activeSchoolName || `مدرسة ${normCode}`;
          const isTrial = String(data.status || "").toUpperCase() === "TRIAL";

          const prevEntry = this.state.ticketsBySchool[normCode];
          const prevIsActivePaid = prevEntry && (prevEntry.status === "active") && (Number(prevEntry.expiresAt || 0) > Date.now());

          // حماية حاسمة: منع أي تراجع من اشتراك مدفوع نشط إلى مهلة تجريبية مؤقتة
          const finalStatus = (prevIsActivePaid && isTrial) ? "active" : (isTrial ? "trial" : "active");
          const finalExpiresAt = (prevIsActivePaid && isTrial) ? prevEntry.expiresAt : expiresAt;

          if (data.ticket) {
            const verified = verifyTicketSignature(data.ticket);
            if (verified.valid) {
              this.state.ticketsBySchool[normCode] = {
                ticket: data.ticket,
                verifiedAt: Date.now(),
                expiresAt: finalExpiresAt,
                schoolName: resolvedSchoolName,
                status: finalStatus
              };
            }
          } else if (isSupabase) {
            this.state.ticketsBySchool[normCode] = {
              ticket: (prevIsActivePaid && isTrial && prevEntry.ticket) ? prevEntry.ticket : `SUPABASE_VERIFIED.${normCode}.${finalExpiresAt}`,
              verifiedAt: Date.now(),
              expiresAt: finalExpiresAt,
              schoolName: resolvedSchoolName,
              status: finalStatus
            };
          }

          if (resolvedSchoolName) this.state.activeSchoolName = resolvedSchoolName;
          this._save();
          const statusObj = this.getStatus(normCode);
          this.onUpdate(statusObj);
          return { ok: true, status: statusObj, message: data.message || statusObj.message };
        }

        // إذا أكد السيرفر أن المدرسة غير مشتركة أو موقوفة أو منتهية، نمسح التذكرة المحلية
        if (data && data.subscribed === false) {
          delete this.state.ticketsBySchool[normCode];
          this._save();
          const statusObj = this.getStatus(normCode);
          statusObj.message = data.message || statusObj.message;
          if (data.status) statusObj.status = data.status;
          this.onUpdate(statusObj);
          return { ok: false, status: statusObj, message: statusObj.message };
        }

        const fallbackStatus = this.getStatus(normCode);
        return { ok: !fallbackStatus.locked, status: fallbackStatus, message: data?.message || fallbackStatus.message };
      } catch (err) {
        // في حالة انقطاع الإنترنت: نعتمد على التذكرة الموقعة المحفوظة إن كانت ضمن فترة السماح
        const cachedStatus = this.getStatus(normCode);
        if (!cachedStatus.locked) {
          return {
            ok: true,
            offline: true,
            status: cachedStatus,
            message: "يعمل في وضع عدم الاتصال بالاعتماد على اشتراك المدرسة المفعّل مسبقاً."
          };
        }
        return {
          ok: false,
          status: cachedStatus,
          message: "تعذر الاتصال بسيرفر التراخيص (" + this.state.serverUrl + "). تأكد من اتصال الإنترنت أو صحة رابط السيرفر."
        };
      }
    })();

    this._checkInFlight.set(normCode, job);
    try {
      return await job;
    } finally {
      this._checkInFlight.delete(normCode);
    }
  }

  /**
   * تفعيل اشتراك مدرسة باستخدام مفتاح تفعيل سنوي (أونلاين عبر Vercel أو تذكرة موقعة مباشرة NEPRAS1.)
   */
  async activateWithKey({ schoolCode, schoolName, licenseKey, serverUrl } = {}) {
    if (serverUrl) this.setServerUrl(serverUrl);
    const normCode = normalizeSchoolCode(schoolCode || this.state.activeSchoolCode);
    const cleanKey = String(licenseKey || "").trim();

    if (!normCode) {
      return {
        ok: false,
        status: this.getStatus(),
        message: "يرجى إدخال كود المدرسة (أو تسجيل الدخول أولاً)."
      };
    }

    if (!cleanKey) {
      return {
        ok: false,
        status: this.getStatus(normCode),
        message: "يرجى إدخال مفتاح التفعيل السنوي."
      };
    }

    this.state.activeSchoolCode = normCode;
    if (schoolName) this.state.activeSchoolName = String(schoolName).trim();

    // 1) دعم التذكرة الموقعة ذاتياً (NEPRAS1.<base64url>.<sig>) للتفعيل المباشر
    if (/^NEPRAS1\./i.test(cleanKey) || cleanKey.split(".").length === 2) {
      const verified = verifyTicketSignature(cleanKey);
      if (verified.valid) {
        const ticketSchool = normalizeSchoolCode(verified.payload?.schoolCode);
        if (ticketSchool && ticketSchool !== normCode) {
          return {
            ok: false,
            status: this.getStatus(normCode),
            message: `هذا المفتاح مخصص للمدرسة ذات الكود (${ticketSchool}) ولا يعمل مع الكود (${normCode}).`
          };
        }
        const rawTicket = cleanKey.replace(/^NEPRAS1\./i, "");
        this.state.ticketsBySchool[normCode] = {
          ticket: rawTicket,
          verifiedAt: Date.now(),
          schoolName: verified.payload?.schoolName || this.state.activeSchoolName || "",
          status: verified.payload?.status || "active",
          expiresAt: Number(verified.payload?.expiresAt || 0),
          licenseKey: verified.payload?.licenseKey || ""
        };
        if (verified.payload?.schoolName) this.state.activeSchoolName = verified.payload.schoolName;
        this._save();
        const statusObj = this.getStatus(normCode);
        this.onUpdate(statusObj);
        return {
          ok: !statusObj.locked,
          status: statusObj,
          message: statusObj.message
        };
      }
    }

    // 2) التفعيل عبر سوبابيز أو خادم التراخيص
    try {
      let data = null;
      const isSupabase = String(this.state.serverUrl || "").includes("supabase.co");

      if (isSupabase) {
        const res = await fetch(`${SUPABASE_LICENSE_URL}/rest/v1/rpc/activate_license_key`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_LICENSE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_LICENSE_ANON_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            p_school_code: normCode,
            p_license_key: cleanKey.toUpperCase(),
            p_school_name: this.state.activeSchoolName || null
          })
        });
        data = await res.json();
      } else {
        const endpoint = `${this.state.serverUrl}/api/v1/activate-key`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schoolCode: normCode,
            schoolName: this.state.activeSchoolName || "",
            licenseKey: cleanKey.toUpperCase()
          })
        });
        data = await res.json();
      }

      if (data?.serverTime && Number(data.serverTime) > this.state.lastKnownServerTime) {
        this.state.lastKnownServerTime = Number(data.serverTime);
      }

      if (data?.ok) {
        const expiresAt = new Date(data.expires_at || data.expiresAt || 0).getTime();
        const resolvedSchoolName = data.school_name || data.schoolName || this.state.activeSchoolName || `مدرسة ${normCode}`;

        if (data.ticket) {
          const verified = verifyTicketSignature(data.ticket);
          if (verified.valid) {
            this.state.ticketsBySchool[normCode] = {
              ticket: data.ticket,
              verifiedAt: Date.now(),
              expiresAt,
              schoolName: resolvedSchoolName,
              status: "active"
            };
          }
        } else if (isSupabase) {
          this.state.ticketsBySchool[normCode] = {
            ticket: `SUPABASE_VERIFIED.${normCode}.${expiresAt}`,
            verifiedAt: Date.now(),
            expiresAt,
            schoolName: resolvedSchoolName,
            status: "active"
          };
        }

        if (resolvedSchoolName) this.state.activeSchoolName = resolvedSchoolName;
        this._save();
        const statusObj = this.getStatus(normCode);
        this.onUpdate(statusObj);
        return {
          ok: true,
          status: statusObj,
          message: data.message || statusObj.message
        };
      }

      const statusObj = this.getStatus(normCode);
      return {
        ok: false,
        status: statusObj,
        message: data?.message || "تعذر تفعيل المفتاح. تأكد من صحة المفتاح وكود المدرسة."
      };
    } catch (err) {
      return {
        ok: false,
        status: this.getStatus(normCode),
        message: "تعذر الاتصال بسيرفر التفعيل (" + this.state.serverUrl + "). تأكد من اتصال الإنترنت."
      };
    }
  }
}

module.exports = {
  DesktopLicenseManager,
  normalizeSchoolCode,
  verifyTicketSignature,
  signTicket,
  extractSchoolFromEmisHeaders,
  DEFAULT_SERVER_URL
};
