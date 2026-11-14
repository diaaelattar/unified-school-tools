/**
 * Nepras Unified License Supabase Edge Function (T17)
 * Supports: health | check-school | activate-key
 * Enforces:
 * - Ed25519 signed tickets (kid=2) using LICENSE_PRIVATE_KEY from Supabase secrets
 * - 5-device cap per school (D3) on activate-key
 * - Atomic key consumption in license_keys + subscriptions tables
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

const MAX_DEVICES_PER_SCHOOL = 5;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function normalizeSchoolCode(raw: unknown): string {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const str = String(raw ?? "")
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/\D/g, "");
  return str.length >= 4 && str.length <= 15 ? str : "";
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8Bytes(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function signLicenseTicket(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const pkcs8 = pemToPkcs8Bytes(privateKeyPem);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  const body = { ...payload, kid: 2, iat: Date.now() };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const privKeyPem = Deno.env.get("LICENSE_PRIVATE_KEY") || "";

    if (!supabaseUrl || !serviceKey || !privKeyPem) {
      return json({ ok: false, code: "SERVER_MISCONFIGURED", message: "إعدادات الخادم غير مكتملة." }, 500);
    }

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(url.searchParams.get("action") || body.action || "").trim();

    if (action === "health" || req.method === "GET") {
      return json({ ok: true, service: "nepras-supabase-license", backend: "supabase-edge", serverTime: Date.now() });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (action === "check-school") {
      const schoolCode = normalizeSchoolCode(body.schoolCode || body.school_code);
      if (!schoolCode) {
        return json({ ok: false, code: "SCHOOL_CODE_REQUIRED", message: "يرجى إدخال كود المدرسة." }, 400);
      }

      const { data: sub, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("school_code", schoolCode)
        .maybeSingle();

      if (error) return json({ ok: false, message: "تعذر التحقق من الاشتراك." }, 500);
      if (!sub) {
        return json({
          ok: false,
          subscribed: false,
          status: "UNSUBSCRIBED",
          schoolCode,
          serverTime: Date.now(),
          message: `المدرسة ذات الكود (${schoolCode}) غير مسجلة في الاشتراك السنوي.`
        });
      }

      if (sub.status === "suspended") {
        return json({ ok: false, subscribed: false, status: "SUSPENDED", schoolCode, serverTime: Date.now() });
      }

      const expiresAt = new Date(sub.expires_at).getTime();
      if (sub.status === "expired" || Date.now() >= expiresAt) {
        return json({ ok: false, subscribed: false, status: "EXPIRED", schoolCode, expiresAt, serverTime: Date.now() });
      }

      return json({
        ok: true,
        subscribed: true,
        status: "ACTIVE",
        schoolCode,
        schoolName: sub.school_name || "",
        expiresAt,
        serverTime: Date.now()
      });
    }

    if (action === "activate-key") {
      const schoolCode = normalizeSchoolCode(body.schoolCode || body.school_code);
      const activationKey = String(body.key || body.activationKey || "").trim();
      const deviceId = String(body.deviceId || body.machineHash || "").trim().slice(0, 128);

      if (!schoolCode || !activationKey) {
        return json({ ok: false, code: "INVALID_INPUT", message: "كود المدرسة ومفتاح التفعيل مطلوبان." }, 400);
      }

      const { data: keyRow } = await supabase
        .from("license_keys")
        .select("*")
        .eq("key_code", activationKey)
        .eq("status", "unused")
        .maybeSingle();

      if (!keyRow) {
        return json({ ok: false, code: "INVALID_OR_USED_KEY", message: "مفتاح التفعيل غير صالح أو مستخدم مسبقًا." }, 400);
      }

      // Enforce 5-device cap per school (D3)
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("devices")
        .eq("school_code", schoolCode)
        .maybeSingle();

      const devices: string[] = Array.isArray(existingSub?.devices) ? existingSub.devices : [];
      if (deviceId && !devices.includes(deviceId) && devices.length >= MAX_DEVICES_PER_SCHOOL) {
        return json({
          ok: false,
          code: "DEVICE_LIMIT_REACHED",
          message: `تم بلوغ الحد الأقصى للأجهزة (${MAX_DEVICES_PER_SCHOOL} أجهزة) لهذه المدرسة.`
        }, 403);
      }

      const updatedDevices = (deviceId && !devices.includes(deviceId)) ? [...devices, deviceId] : devices;
      const days = Number(keyRow.duration_days) || 365;
      const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

      // Atomic key mark-used
      const { data: consumed } = await supabase
        .from("license_keys")
        .update({ status: "used", used_by_school: schoolCode, used_at: new Date().toISOString() })
        .eq("key_code", activationKey)
        .eq("status", "unused")
        .select()
        .maybeSingle();

      if (!consumed) {
        return json({ ok: false, code: "KEY_RACE_CONFLICT", message: "تم استخدام المفتاح للتو." }, 409);
      }

      await supabase.from("subscriptions").upsert({
        school_code: schoolCode,
        school_name: String(body.schoolName || "").trim(),
        status: "active",
        expires_at: new Date(expiresAt).toISOString(),
        devices: updatedDevices,
        updated_at: new Date().toISOString()
      });

      const ticket = await signLicenseTicket({ schoolCode, expiresAt, type: "ANNUAL" }, privKeyPem);
      return json({ ok: true, subscribed: true, status: "ACTIVE", schoolCode, expiresAt, ticket, serverTime: Date.now() });
    }

    return json({ ok: false, code: "UNKNOWN_ACTION", message: "إجراء غير مدعوم." }, 400);
  } catch (_err) {
    return json({ ok: false, code: "INTERNAL_ERROR", message: "حدث خطأ داخلي." }, 500);
  }
});
