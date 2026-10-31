"use strict";

const fs = require("fs");
const path = require("path");
const { normalizeSchoolCode, generateLicenseKey } = require("./crypto");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * طبقة قاعدة البيانات الموحدة:
 * 1) PostgreSQL (Vercel Postgres / Neon / Supabase) عند توفر POSTGRES_URL أو DATABASE_URL
 * 2) Upstash Redis / Vercel KV REST عند توفر KV_REST_API_URL و KV_REST_API_TOKEN
 * 3) ملف JSON محلي للتجربة والاختبار المحلي
 */

let pgPool = null;
let pgInitDone = false;

function getPgConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    ""
  ).trim();
}

function getKvConfig() {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

async function getPgPool() {
  const connStr = getPgConnectionString();
  if (!connStr) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: connStr,
      ssl: connStr.includes("localhost") || connStr.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
      max: 5
    });
  }
  if (!pgInitDone) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS school_subscriptions (
        school_code VARCHAR(32) PRIMARY KEY,
        school_name TEXT NOT NULL DEFAULT '',
        directorate TEXT NOT NULL DEFAULT '',
        administration TEXT NOT NULL DEFAULT '',
        phone VARCHAR(64) NOT NULL DEFAULT '',
        license_key VARCHAR(64) NOT NULL DEFAULT '',
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        plan_days INTEGER NOT NULL DEFAULT 365,
        starts_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        check_count INTEGER NOT NULL DEFAULT 0,
        last_check_at BIGINT NOT NULL DEFAULT 0,
        last_device_info TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activation_keys (
        license_key VARCHAR(64) PRIMARY KEY,
        bound_school_code VARCHAR(32) DEFAULT NULL,
        school_name_hint TEXT NOT NULL DEFAULT '',
        plan_days INTEGER NOT NULL DEFAULT 365,
        status VARCHAR(24) NOT NULL DEFAULT 'unused',
        notes TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        used_at BIGINT DEFAULT NULL
      );
    `);
    pgInitDone = true;
  }
  return pgPool;
}

// ---------------- KV / Upstash Redis Helper ----------------
async function kvCommand(...args) {
  const cfg = getKvConfig();
  if (!cfg) throw new Error("KV_NOT_CONFIGURED");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `KV_HTTP_${res.status}`);
  return data.result;
}

// ---------------- Local File Fallback ----------------
function getLocalDbFile() {
  if (process.env.NEPRAS_LOCAL_DB_PATH) return process.env.NEPRAS_LOCAL_DB_PATH;
  const dir = process.env.VERCEL ? "/tmp" : path.join(__dirname, "..", ".data");
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return path.join(dir, "nepras-subscriptions-db.json");
}

function readLocalStore() {
  const f = getLocalDbFile();
  try {
    if (fs.existsSync(f)) {
      const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
      return {
        schools: parsed.schools && typeof parsed.schools === "object" ? parsed.schools : {},
        keys: parsed.keys && typeof parsed.keys === "object" ? parsed.keys : {}
      };
    }
  } catch (_) {}
  return { schools: {}, keys: {} };
}

function writeLocalStore(store) {
  const f = getLocalDbFile();
  fs.writeFileSync(f, JSON.stringify(store, null, 2), "utf8");
}

function formatSchoolRow(row) {
  if (!row) return null;
  const now = Date.now();
  const expiresAt = Number(row.expires_at ?? row.expiresAt ?? 0);
  const startsAt = Number(row.starts_at ?? row.startsAt ?? 0);
  let status = String(row.status || "active");
  if (status === "active" && expiresAt > 0 && now >= expiresAt) {
    status = "expired";
  }
  const daysRemaining = expiresAt > now ? Math.max(1, Math.ceil((expiresAt - now) / DAY_MS)) : 0;
  return {
    schoolCode: normalizeSchoolCode(row.school_code ?? row.schoolCode),
    schoolName: String(row.school_name ?? row.schoolName ?? ""),
    directorate: String(row.directorate ?? ""),
    administration: String(row.administration ?? ""),
    phone: String(row.phone ?? ""),
    licenseKey: String(row.license_key ?? row.licenseKey ?? ""),
    status,
    planDays: Number(row.plan_days ?? row.planDays ?? 365),
    startsAt,
    expiresAt,
    daysRemaining,
    notes: String(row.notes ?? ""),
    checkCount: Number(row.check_count ?? row.checkCount ?? 0),
    lastCheckAt: Number(row.last_check_at ?? row.lastCheckAt ?? 0),
    lastDeviceInfo: String(row.last_device_info ?? row.lastDeviceInfo ?? ""),
    createdAt: Number(row.created_at ?? row.createdAt ?? now),
    updatedAt: Number(row.updated_at ?? row.updatedAt ?? now)
  };
}

function formatKeyRow(row) {
  if (!row) return null;
  return {
    licenseKey: String(row.license_key ?? row.licenseKey ?? "").trim().toUpperCase(),
    boundSchoolCode: row.bound_school_code || row.boundSchoolCode || null,
    schoolNameHint: String(row.school_name_hint ?? row.schoolNameHint ?? ""),
    planDays: Number(row.plan_days ?? row.planDays ?? 365),
    status: String(row.status || "unused"),
    notes: String(row.notes ?? ""),
    createdAt: Number(row.created_at ?? row.createdAt ?? Date.now()),
    usedAt: row.used_at || row.usedAt ? Number(row.used_at ?? row.usedAt) : null
  };
}

// ============================================================================
// العمليات الموحدة على قاعدة البيانات
// ============================================================================

async function getStorageBackendName() {
  if (getPgConnectionString()) return "postgresql";
  if (getKvConfig()) return "vercel-kv";
  return "local-json";
}

async function getSchoolSubscription(rawCode) {
  const schoolCode = normalizeSchoolCode(rawCode);
  if (!schoolCode) return null;

  const pool = await getPgPool();
  if (pool) {
    const { rows } = await pool.query(
      "SELECT * FROM school_subscriptions WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );
    return rows[0] ? formatSchoolRow(rows[0]) : null;
  }

  if (getKvConfig()) {
    const raw = await kvCommand("HGET", "nepras:schools", schoolCode);
    return raw ? formatSchoolRow(JSON.parse(raw)) : null;
  }

  const store = readLocalStore();
  return store.schools[schoolCode] ? formatSchoolRow(store.schools[schoolCode]) : null;
}

async function upsertSchoolSubscription(input) {
  const now = Date.now();
  const schoolCode = normalizeSchoolCode(input.schoolCode || input.school_code);
  if (!schoolCode) throw new Error("SCHOOL_CODE_REQUIRED");

  const existing = await getSchoolSubscription(schoolCode);
  const planDays = Number(input.planDays || input.plan_days || existing?.planDays || 365);
  const startsAt = Number(input.startsAt || input.starts_at || existing?.startsAt || now);
  const expiresAt = Number(
    input.expiresAt ||
    input.expires_at ||
    (input.resetExpiry ? now + planDays * DAY_MS : existing?.expiresAt || (startsAt + planDays * DAY_MS))
  );

  const record = {
    school_code: schoolCode,
    school_name: String(input.schoolName ?? input.school_name ?? existing?.schoolName ?? "").trim(),
    directorate: String(input.directorate ?? existing?.directorate ?? "").trim(),
    administration: String(input.administration ?? existing?.administration ?? "").trim(),
    phone: String(input.phone ?? existing?.phone ?? "").trim(),
    license_key: String(input.licenseKey ?? input.license_key ?? existing?.licenseKey ?? generateLicenseKey()).trim().toUpperCase(),
    status: String(input.status || existing?.status || "active"),
    plan_days: planDays,
    starts_at: startsAt,
    expires_at: expiresAt,
    notes: String(input.notes ?? existing?.notes ?? "").trim(),
    check_count: Number(input.checkCount ?? existing?.checkCount ?? 0),
    last_check_at: Number(input.lastCheckAt ?? existing?.lastCheckAt ?? 0),
    last_device_info: String(input.lastDeviceInfo ?? existing?.lastDeviceInfo ?? ""),
    created_at: Number(existing?.createdAt || now),
    updated_at: now
  };

  const pool = await getPgPool();
  if (pool) {
    await pool.query(
      `INSERT INTO school_subscriptions (
        school_code, school_name, directorate, administration, phone, license_key,
        status, plan_days, starts_at, expires_at, notes, check_count, last_check_at,
        last_device_info, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (school_code) DO UPDATE SET
        school_name = EXCLUDED.school_name,
        directorate = EXCLUDED.directorate,
        administration = EXCLUDED.administration,
        phone = EXCLUDED.phone,
        license_key = EXCLUDED.license_key,
        status = EXCLUDED.status,
        plan_days = EXCLUDED.plan_days,
        starts_at = EXCLUDED.starts_at,
        expires_at = EXCLUDED.expires_at,
        notes = EXCLUDED.notes,
        check_count = EXCLUDED.check_count,
        last_check_at = EXCLUDED.last_check_at,
        last_device_info = EXCLUDED.last_device_info,
        updated_at = EXCLUDED.updated_at`,
      [
        record.school_code, record.school_name, record.directorate, record.administration,
        record.phone, record.license_key, record.status, record.plan_days,
        record.starts_at, record.expires_at, record.notes, record.check_count,
        record.last_check_at, record.last_device_info, record.created_at, record.updated_at
      ]
    );
    return formatSchoolRow(record);
  }

  if (getKvConfig()) {
    await kvCommand("HSET", "nepras:schools", schoolCode, JSON.stringify(record));
    return formatSchoolRow(record);
  }

  const store = readLocalStore();
  store.schools[schoolCode] = record;
  writeLocalStore(store);
  return formatSchoolRow(record);
}

async function recordSchoolCheck(rawCode, meta = {}) {
  const existing = await getSchoolSubscription(rawCode);
  if (!existing) return null;
  const now = Date.now();
  return await upsertSchoolSubscription({
    ...existing,
    schoolName: existing.schoolName || meta.schoolName || "",
    directorate: existing.directorate || meta.directorate || "",
    administration: existing.administration || meta.administration || "",
    checkCount: (existing.checkCount || 0) + 1,
    lastCheckAt: now,
    lastDeviceInfo: String(meta.deviceInfo || existing.lastDeviceInfo || "").slice(0, 200)
  });
}

async function renewSchoolSubscription(rawCode, additionalDays = 365) {
  const existing = await getSchoolSubscription(rawCode);
  if (!existing) throw new Error("SCHOOL_NOT_FOUND");
  const now = Date.now();
  const baseTime = Math.max(now, existing.expiresAt || now);
  const newExpiresAt = baseTime + Number(additionalDays || 365) * DAY_MS;
  return await upsertSchoolSubscription({
    ...existing,
    status: "active",
    expiresAt: newExpiresAt
  });
}

async function deleteSchoolSubscription(rawCode) {
  const schoolCode = normalizeSchoolCode(rawCode);
  if (!schoolCode) return false;

  const pool = await getPgPool();
  if (pool) {
    await pool.query("DELETE FROM school_subscriptions WHERE school_code = $1", [schoolCode]);
    return true;
  }

  if (getKvConfig()) {
    await kvCommand("HDEL", "nepras:schools", schoolCode);
    return true;
  }

  const store = readLocalStore();
  delete store.schools[schoolCode];
  writeLocalStore(store);
  return true;
}

async function listSchoolSubscriptions() {
  const pool = await getPgPool();
  if (pool) {
    const { rows } = await pool.query("SELECT * FROM school_subscriptions ORDER BY updated_at DESC");
    return rows.map(formatSchoolRow);
  }

  if (getKvConfig()) {
    const all = await kvCommand("HGETALL", "nepras:schools");
    const list = [];
    if (Array.isArray(all)) {
      for (let i = 1; i < all.length; i += 2) {
        try { list.push(formatSchoolRow(JSON.parse(all[i]))); } catch (_) {}
      }
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const store = readLocalStore();
  return Object.values(store.schools).map(formatSchoolRow).sort((a, b) => b.updatedAt - a.updatedAt);
}

// ============================================================================
// إدارة مفاتيح التفعيل السنوية (Activation Keys)
// ============================================================================

async function getActivationKey(rawKey) {
  const key = String(rawKey || "").trim().toUpperCase();
  if (!key) return null;

  const pool = await getPgPool();
  if (pool) {
    const { rows } = await pool.query("SELECT * FROM activation_keys WHERE license_key = $1 LIMIT 1", [key]);
    return rows[0] ? formatKeyRow(rows[0]) : null;
  }

  if (getKvConfig()) {
    const raw = await kvCommand("HGET", "nepras:keys", key);
    return raw ? formatKeyRow(JSON.parse(raw)) : null;
  }

  const store = readLocalStore();
  return store.keys[key] ? formatKeyRow(store.keys[key]) : null;
}

async function createActivationKeys({ count = 1, planDays = 365, boundSchoolCode = null, schoolNameHint = "", notes = "" } = {}) {
  const created = [];
  const total = Math.max(1, Math.min(100, Number(count) || 1));
  const now = Date.now();
  const normCode = boundSchoolCode ? normalizeSchoolCode(boundSchoolCode) : null;

  for (let i = 0; i < total; i++) {
    const license_key = generateLicenseKey();
    const record = {
      license_key,
      bound_school_code: normCode,
      school_name_hint: String(schoolNameHint || "").trim(),
      plan_days: Number(planDays || 365),
      status: "unused",
      notes: String(notes || "").trim(),
      created_at: now,
      used_at: null
    };

    const pool = await getPgPool();
    if (pool) {
      await pool.query(
        `INSERT INTO activation_keys (license_key, bound_school_code, school_name_hint, plan_days, status, notes, created_at, used_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [record.license_key, record.bound_school_code, record.school_name_hint, record.plan_days, record.status, record.notes, record.created_at, record.used_at]
      );
    } else if (getKvConfig()) {
      await kvCommand("HSET", "nepras:keys", license_key, JSON.stringify(record));
    } else {
      const store = readLocalStore();
      store.keys[license_key] = record;
      writeLocalStore(store);
    }
    created.push(formatKeyRow(record));
  }
  return created;
}

async function markActivationKeyUsed(rawKey, schoolCode) {
  const key = String(rawKey || "").trim().toUpperCase();
  const existing = await getActivationKey(key);
  if (!existing) return null;
  const now = Date.now();
  const updated = {
    license_key: key,
    bound_school_code: normalizeSchoolCode(schoolCode),
    school_name_hint: existing.schoolNameHint,
    plan_days: existing.planDays,
    status: "used",
    notes: existing.notes,
    created_at: existing.createdAt,
    used_at: now
  };

  const pool = await getPgPool();
  if (pool) {
    await pool.query(
      "UPDATE activation_keys SET bound_school_code = $2, status = 'used', used_at = $3 WHERE license_key = $1",
      [key, updated.bound_school_code, now]
    );
  } else if (getKvConfig()) {
    await kvCommand("HSET", "nepras:keys", key, JSON.stringify(updated));
  } else {
    const store = readLocalStore();
    store.keys[key] = updated;
    writeLocalStore(store);
  }
  return formatKeyRow(updated);
}

async function listActivationKeys() {
  const pool = await getPgPool();
  if (pool) {
    const { rows } = await pool.query("SELECT * FROM activation_keys ORDER BY created_at DESC");
    return rows.map(formatKeyRow);
  }

  if (getKvConfig()) {
    const all = await kvCommand("HGETALL", "nepras:keys");
    const list = [];
    if (Array.isArray(all)) {
      for (let i = 1; i < all.length; i += 2) {
        try { list.push(formatKeyRow(JSON.parse(all[i]))); } catch (_) {}
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  const store = readLocalStore();
  return Object.values(store.keys).map(formatKeyRow).sort((a, b) => b.createdAt - a.createdAt);
}

async function deleteActivationKey(rawKey) {
  const key = String(rawKey || "").trim().toUpperCase();
  if (!key) return false;
  const pool = await getPgPool();
  if (pool) {
    await pool.query("DELETE FROM activation_keys WHERE license_key = $1", [key]);
    return true;
  }
  if (getKvConfig()) {
    await kvCommand("HDEL", "nepras:keys", key);
    return true;
  }
  const store = readLocalStore();
  delete store.keys[key];
  writeLocalStore(store);
  return true;
}

module.exports = {
  DAY_MS,
  getStorageBackendName,
  getSchoolSubscription,
  upsertSchoolSubscription,
  recordSchoolCheck,
  renewSchoolSubscription,
  deleteSchoolSubscription,
  listSchoolSubscriptions,
  getActivationKey,
  createActivationKeys,
  markActivationKeyUsed,
  listActivationKeys,
  deleteActivationKey
};
