-- ==============================================================================
-- 🏛️ ترحيل أمني موحد: نظام تراخيص نبراس (Nepras Unified Security Migration)
-- تاريخ الترحيل: 12 نوفمبر 2026
-- المعالجات المضمنة: SEC-02, SEC-03, SEC-05, SEC-06, SEC-07, SEC-08
-- ==============================================================================

-- 1. التأكد من وجود الملحق pgcrypto لتوليد العشوائية المشفرة
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. إعداد جداول التراخيص مع تثبيت RLS وسحب الصلاحيات المفتوحة
CREATE TABLE IF NOT EXISTS public.emis_license_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT UNIQUE NOT NULL,
    plan_days INTEGER NOT NULL DEFAULT 365,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used', 'cancelled', 'expired')),
    batch_name TEXT DEFAULT '2026/2027 Batch',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    used_at TIMESTAMPTZ,
    used_by_school_code TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.emis_school_subscriptions (
    school_code TEXT PRIMARY KEY,
    school_name TEXT,
    directorate TEXT,
    administration TEXT,
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active', 'trial', 'suspended', 'expired')),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    last_license_key TEXT REFERENCES public.emis_license_keys(license_key) ON DELETE SET NULL,
    last_device_info JSONB DEFAULT '{}'::jsonb,
    last_checked_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- فهرسة الجداول
CREATE INDEX IF NOT EXISTS idx_emis_keys_lookup ON public.emis_license_keys(license_key, status);
CREATE INDEX IF NOT EXISTS idx_emis_keys_school ON public.emis_license_keys(used_by_school_code);
CREATE INDEX IF NOT EXISTS idx_emis_sub_status ON public.emis_school_subscriptions(status, expires_at);

-- ------------------------------------------------------------------------------
-- SEC-02: تفعيل RLS وسحب الصلاحيات المباشرة من anon و authenticated
-- ------------------------------------------------------------------------------
ALTER TABLE public.emis_license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emis_school_subscriptions ENABLE ROW LEVEL SECURITY;

-- سحب أي وصول مباشر للجداول من anon/authenticated (الوصول محصور عبر RPC المعرفة فقط)
REVOKE ALL ON TABLE public.emis_license_keys FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.emis_school_subscriptions FROM anon, authenticated, PUBLIC;

-- منح الوصول لخدمة service_role فقط لإدارة الجداول
GRANT ALL ON TABLE public.emis_license_keys TO service_role;
GRANT ALL ON TABLE public.emis_school_subscriptions TO service_role;

-- ------------------------------------------------------------------------------
-- SEC-03: جدول أسرار الإدارة الداخلي ودالة التحقق من سر الإدارة (دون قيم افتراضية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nepras_internal_secrets (
    key_name TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.nepras_internal_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nepras_internal_secrets FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.nepras_internal_secrets TO service_role;

CREATE OR REPLACE FUNCTION public.check_admin_secret(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_admin_key TEXT;
    v_secret_hash TEXT;
    v_pin TEXT := trim(coalesce(p_pin, ''));
BEGIN
    IF length(v_pin) < 16 THEN
        RETURN false;
    END IF;

    -- 1. قراءة كلمة السر من إعدادات بيئة السيرفر إن كانت متاحة (Self-hosted Postgres)
    v_admin_key := current_setting('app.settings.admin_secret', true);
    IF v_admin_key IS NOT NULL AND length(trim(v_admin_key)) >= 16 THEN
        RETURN v_pin = trim(v_admin_key);
    END IF;

    -- 2. قراءة بصمة SHA-256 من الجدول الداخلي المغلق (متوافق مع Supabase SQL Editor)
    SELECT secret_hash INTO v_secret_hash
    FROM public.nepras_internal_secrets
    WHERE key_name = 'admin_secret'
    LIMIT 1;

    IF v_secret_hash IS NULL OR length(trim(v_secret_hash)) <> 64 THEN
        RETURN false;
    END IF;

    RETURN encode(digest(v_pin, 'sha256'), 'hex') = lower(trim(v_secret_hash));
END;
$$;

-- سحب استدعاء دالة فحص السر من العامة
REVOKE EXECUTE ON FUNCTION public.check_admin_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_admin_secret(TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- SEC-05: دالة فحص الاشتراك (فصل القراءة التام عن الإنشاء لمنع تضخم الجداول)
-- SEC-06: ديناميكية التواريخ وتثبيت search_path
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_school_subscription(p_school_code TEXT, p_school_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_clean_code TEXT;
    v_sub RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_days_left INTEGER;
    v_is_active BOOLEAN;
BEGIN
    v_clean_code := trim(regexp_replace(coalesce(p_school_code, ''), '[^0-9A-Za-z_-]', '', 'g'));
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CODE', 'message', 'كود المدرسة غير صالح أو فارغ.');
    END IF;

    SELECT * INTO v_sub FROM public.emis_school_subscriptions WHERE school_code = v_clean_code;

    -- SEC-05: إذا لم تكن المدرسة مسجلة، نرجع حالة غير مشترك دون إجراء أي INSERT
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'subscribed', false,
            'status', 'UNSUBSCRIBED',
            'school_code', v_clean_code,
            'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
            'message', 'المدرسة ذات الكود (' || v_clean_code || ') غير مسجلة في الاشتراك السنوي. يرجى تفعيل كرت الاشتراك أو بدء الفترة التجريبية.'
        );
    END IF;

    -- تحديث وقت آخر فحص دون تعديل البيانات الأساسية
    UPDATE public.emis_school_subscriptions
    SET last_checked_at = v_now,
        school_name = coalesce(nullif(trim(p_school_name), ''), school_name)
    WHERE school_code = v_clean_code;

    v_days_left := greatest(0, floor(extract(epoch from (v_sub.expires_at - v_now)) / 86400)::integer);
    v_is_active := (v_sub.status IN ('active', 'trial')) AND (v_sub.expires_at > v_now);

    RETURN jsonb_build_object(
        'ok', true,
        'subscribed', v_is_active,
        'status', upper(v_sub.status),
        'school_code', v_sub.school_code,
        'school_name', coalesce(v_sub.school_name, 'مدرسة ' || v_clean_code),
        'directorate', coalesce(v_sub.directorate, ''),
        'administration', coalesce(v_sub.administration, ''),
        'starts_at', v_sub.starts_at,
        'expires_at', v_sub.expires_at,
        'days_remaining', v_days_left,
        'is_expiring_soon', (v_is_active AND v_days_left <= 10),
        'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
        'message', CASE
            WHEN NOT v_is_active THEN 'انتهى اشتراك المدرسة في ' || to_char(v_sub.expires_at AT TIME ZONE 'Africa/Cairo', 'YYYY/MM/DD') || '. يرجى التجديد بكود تفعيل جديد.'
            WHEN v_sub.status = 'trial' THEN 'المهلة التجريبية مفعلة لمدرسة (' || coalesce(v_sub.school_name, v_clean_code) || ') ومتبقي عليها ' || v_days_left || ' يوم.'
            WHEN v_days_left <= 10 THEN 'تنبيه: سينتهي الاشتراك السنوي للمدرسة خلال ' || v_days_left || ' يوم (في ' || to_char(v_sub.expires_at AT TIME ZONE 'Africa/Cairo', 'YYYY/MM/DD') || ').'
            ELSE 'الاشتراك السنوي لمدرسة (' || coalesce(v_sub.school_name, v_clean_code) || ') نشط وساري حتى ' || to_char(v_sub.expires_at AT TIME ZONE 'Africa/Cairo', 'YYYY/MM/DD') || '.'
        END
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- SEC-05: دالة صريحة لطلب المهلة التجريبية (Explicit Trial Request)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_school_trial(p_school_code TEXT, p_school_name TEXT DEFAULT NULL, p_device_info JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_clean_code TEXT;
    v_sub RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_trial_end TIMESTAMPTZ;
BEGIN
    v_clean_code := trim(regexp_replace(coalesce(p_school_code, ''), '[^0-9A-Za-z_-]', '', 'g'));
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CODE', 'message', 'كود المدرسة غير صالح.');
    END IF;

    SELECT * INTO v_sub FROM public.emis_school_subscriptions WHERE school_code = v_clean_code;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_ALREADY_EXISTS', 'message', 'المدرسة مسجلة بالفعل ولا يمكن إعادة طلب مهلة تجريبية جديدة.');
    END IF;

    v_trial_end := v_now + interval '7 days';
    INSERT INTO public.emis_school_subscriptions (
        school_code, school_name, status, starts_at, expires_at, last_device_info, last_checked_at, created_at, updated_at
    ) VALUES (
        v_clean_code,
        coalesce(nullif(trim(p_school_name), ''), 'مدرسة ' || v_clean_code),
        'trial',
        v_now,
        v_trial_end,
        coalesce(p_device_info, '{}'::jsonb),
        v_now,
        v_now,
        v_now
    ) RETURNING * INTO v_sub;

    RETURN jsonb_build_object(
        'ok', true,
        'subscribed', true,
        'status', 'TRIAL',
        'school_code', v_clean_code,
        'school_name', v_sub.school_name,
        'starts_at', v_sub.starts_at,
        'expires_at', v_sub.expires_at,
        'days_remaining', 7,
        'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
        'message', 'تم تفعيل المهلة التجريبية المجانية بنجاح لمدة 7 أيام لمدرسة (' || v_sub.school_name || ').'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- SEC-08: استهلاك ذري للمفتاح يمنع السباق (Atomic Key Consumption)
-- SEC-06: احتساب تاريخ الانتهاء بناءً على plan_days المحددة في الكرت
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_license_key(
    p_school_code TEXT,
    p_license_key TEXT,
    p_school_name TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_clean_code TEXT;
    v_clean_key TEXT;
    v_key RECORD;
    v_sub RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_start TIMESTAMPTZ;
    v_expires TIMESTAMPTZ;
    v_days_to_add INTEGER;
BEGIN
    v_clean_code := trim(regexp_replace(coalesce(p_school_code, ''), '[^0-9A-Za-z_-]', '', 'g'));
    v_clean_key := upper(trim(coalesce(p_license_key, '')));

    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CODE', 'message', 'كود المدرسة فارغ أو غير صالح.');
    END IF;
    IF v_clean_key = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_KEY', 'message', 'يرجى إدخال مفتاح التفعيل.');
    END IF;

    -- SEC-08: استهلاك ذري يمنع السباق المتزامن (UPDATE ... WHERE status = 'available' RETURNING *)
    UPDATE public.emis_license_keys
    SET status = 'used',
        used_at = v_now,
        used_by_school_code = v_clean_code
    WHERE license_key = v_clean_key
      AND status = 'available'
    RETURNING * INTO v_key;

    -- إذا لم يتم تحديث أي صف، نتحقق من سبب الرفض
    IF NOT FOUND THEN
        SELECT * INTO v_key FROM public.emis_license_keys WHERE license_key = v_clean_key;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'code', 'KEY_NOT_FOUND', 'message', 'مفتاح التفعيل المدخل غير صحيح.');
        ELSIF v_key.status = 'used' THEN
            IF v_key.used_by_school_code = v_clean_code THEN
                RETURN jsonb_build_object('ok', true, 'code', 'KEY_ALREADY_APPLIED', 'message', 'هذا المفتاح مفعل بالفعل لهذه المدرسة.');
            ELSE
                RETURN jsonb_build_object('ok', false, 'code', 'KEY_ALREADY_USED', 'message', 'هذا المفتاح تم استخدامه مسبقاً لمدرسة أخرى.');
            END IF;
        ELSE
            RETURN jsonb_build_object('ok', false, 'code', 'KEY_INACTIVE', 'message', 'مفتاح التفعيل غير متاح أو تم إلغاؤه.');
        END IF;
    END IF;

    -- حساب فترة الصلاحية بناءً على أيام الخطة المقررة للكارت (افتراضياً 365 يوماً)
    v_days_to_add := greatest(30, coalesce(v_key.plan_days, 365));

    SELECT * INTO v_sub FROM public.emis_school_subscriptions WHERE school_code = v_clean_code FOR UPDATE;

    IF FOUND AND v_sub.status = 'active' AND v_sub.expires_at > v_now THEN
        -- تمديد الاشتراك الساري من تاريخ انتهائه الحالي
        v_start := v_sub.starts_at;
        v_expires := v_sub.expires_at + (v_days_to_add || ' days')::interval;
    ELSE
        -- اشتراك جديد أو تجديد بعد انتهاء
        v_start := v_now;
        v_expires := v_now + (v_days_to_add || ' days')::interval;
    END IF;

    -- إدراج أو تحديث اشتراك المدرسة
    INSERT INTO public.emis_school_subscriptions (
        school_code, school_name, status, starts_at, expires_at,
        last_license_key, last_device_info, last_checked_at, updated_at
    ) VALUES (
        v_clean_code,
        coalesce(nullif(trim(p_school_name), ''), v_sub.school_name, 'مدرسة ' || v_clean_code),
        'active',
        v_start,
        v_expires,
        v_clean_key,
        p_device_info,
        v_now,
        v_now
    )
    ON CONFLICT (school_code) DO UPDATE SET
        school_name = coalesce(nullif(trim(p_school_name), ''), EXCLUDED.school_name, public.emis_school_subscriptions.school_name),
        status = 'active',
        starts_at = EXCLUDED.starts_at,
        expires_at = EXCLUDED.expires_at,
        last_license_key = EXCLUDED.last_license_key,
        last_device_info = EXCLUDED.last_device_info,
        last_checked_at = EXCLUDED.last_checked_at,
        updated_at = EXCLUDED.updated_at;

    RETURN jsonb_build_object(
        'ok', true,
        'subscribed', true,
        'status', 'ACTIVE',
        'school_code', v_clean_code,
        'school_name', coalesce(nullif(trim(p_school_name), ''), v_sub.school_name, 'مدرسة ' || v_clean_code),
        'starts_at', v_start,
        'expires_at', v_expires,
        'days_remaining', floor(extract(epoch from (v_expires - v_now)) / 86400)::integer,
        'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
        'message', 'تم تفعيل الاشتراك السنوي بنجاح حتى ' || to_char(v_expires AT TIME ZONE 'Africa/Cairo', 'YYYY/MM/DD') || '.'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- SEC-07: توليد مفاتيح بعشوائية تشفيرية قوية (≥ 80 بت) وحجب الدالة عن العامة
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_emis_license_keys(
    p_admin_pin TEXT,
    p_count INTEGER DEFAULT 10,
    p_plan_days INTEGER DEFAULT 365,
    p_batch_name TEXT DEFAULT '2026/2027 Annual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_generated JSONB := '[]'::jsonb;
    v_key TEXT;
    i INTEGER;
    v_seg1 TEXT;
    v_seg2 TEXT;
    v_raw BYTEA;
    v_current_year TEXT;
BEGIN
    -- التحقق الإلزامي من صلاحية المسؤول
    IF NOT public.check_admin_secret(p_admin_pin) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'message', 'غير مصرح: رمز الإدارة غير صحيح.');
    END IF;

    v_current_year := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY');

    FOR i IN 1..least(greatest(1, p_count), 500) LOOP
        -- توليد 10 بايتات عشوائية تشفيرية آمنة (80 بت) عبر gen_random_bytes
        v_raw := gen_random_bytes(10);
        v_seg1 := upper(encode(substring(v_raw from 1 for 5), 'hex'));
        v_seg2 := upper(encode(substring(v_raw from 6 for 5), 'hex'));
        v_key := 'NEPRAS-' || v_current_year || '-' || v_seg1 || '-' || v_seg2;

        INSERT INTO public.emis_license_keys (license_key, plan_days, batch_name, status)
        VALUES (v_key, p_plan_days, p_batch_name, 'available')
        ON CONFLICT (license_key) DO NOTHING;

        v_generated := v_generated || jsonb_build_object('license_key', v_key, 'plan_days', p_plan_days);
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'count', jsonb_array_length(v_generated),
        'keys', v_generated
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- ضبط صلاحيات الاستدعاء الدقيقة (RPC Grants)
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.generate_emis_license_keys(TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_emis_license_keys(TEXT, INTEGER, INTEGER, TEXT) TO service_role;

-- إتاحة دوال الاستعلام والتفعيل للعميل مع ضبط search_path الآمن
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_school_subscription(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_school_trial(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_license_key(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- إغلاق التوقيع القديم ذي 3 معاملات ودوال الإدارة الموروثة إن وُجدت
REVOKE ALL ON FUNCTION public.generate_emis_license_keys(INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_overview(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_direct_activate_school(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
