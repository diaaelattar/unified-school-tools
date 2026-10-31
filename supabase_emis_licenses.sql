-- ==============================================================================
-- 🏛️ نظام إدارة تراخيص واشتراكات نبراس للحكومة الإلكترونية (Nepras EMIS Licensure)
-- ------------------------------------------------------------------------------
-- • مستقل 100% عن جداول برنامج الإدارة المدرسية الحالي (معزول ببادئة emis_).
-- • يدعم كروت / مفاتيح التفعيل السنوية مسبقة الدفع (NEPRAS-2027-XXXX-XXXX).
-- • يربط الترخيص تلقائياً بكود المدرسة (school_code) ليعمل على أي جهاز للمدرسة.
-- ==============================================================================

-- 1. جدول كروت / مفاتيح التفعيل السنوية (License Keys)
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

-- فهرس لتسريع البحث عن المفاتيح
CREATE INDEX IF NOT EXISTS idx_emis_keys_lookup ON public.emis_license_keys(license_key, status);
CREATE INDEX IF NOT EXISTS idx_emis_keys_school ON public.emis_license_keys(used_by_school_code);

-- 2. جدول اشتراكات المدارس السنوية (School Subscriptions)
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

-- تحديث قيد التحقق لدعم الفترة التجريبية (trial)
ALTER TABLE public.emis_school_subscriptions DROP CONSTRAINT IF EXISTS emis_school_subscriptions_status_check;
ALTER TABLE public.emis_school_subscriptions ADD CONSTRAINT emis_school_subscriptions_status_check CHECK (status IN ('active', 'trial', 'suspended', 'expired'));

-- فهرس لتسريع فحص اشتراك كود المدرسة
CREATE INDEX IF NOT EXISTS idx_emis_sub_status ON public.emis_school_subscriptions(status, expires_at);

-- ------------------------------------------------------------------------------
-- 3. دالة التحقق التلقائي والمهلة التجريبية (check_school_subscription)
-- • تمنح أسبوعاً (7 أيام) تجريبية مجانية تلقائياً عند أول تشغيل للمدرسة.
-- • غير قابلة للاختراق لأن تاريخ البداية والنهاية مسجل سحابياً ومحمي من تلاعب الساعة.
-- • بعد 7 أيام تقفل تلقائياً لحين تفعيل كرت الاشتراك السنوي بـ 30 جنيهاً.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_school_subscription(p_school_code TEXT, p_school_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_code TEXT;
    v_sub RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_days_left INTEGER;
    v_is_active BOOLEAN;
    v_trial_end TIMESTAMPTZ;
BEGIN
    v_clean_code := trim(regexp_replace(coalesce(p_school_code, ''), '[^0-9A-Za-z_-]', '', 'g'));
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'code', 'INVALID_CODE',
            'message', 'كود المدرسة غير صالح أو فارغ.'
        );
    END IF;

    SELECT * INTO v_sub
    FROM public.emis_school_subscriptions
    WHERE school_code = v_clean_code;

    -- إذا كانت المدرسة غير مسجلة إطلاقاً: منح مهلة أسبوع (7 أيام) تجريبية فورية تبدأ من الآن
    IF NOT FOUND THEN
        v_trial_end := v_now + interval '7 days';
        INSERT INTO public.emis_school_subscriptions (
            school_code, school_name, status, starts_at, expires_at, last_checked_at, created_at, updated_at
        ) VALUES (
            v_clean_code,
            coalesce(nullif(trim(p_school_name), ''), 'مدرسة ' || v_clean_code),
            'trial',
            v_now,
            v_trial_end,
            v_now,
            v_now,
            v_now
        )
        RETURNING * INTO v_sub;

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
            'message', 'أهلاً بك! تم تفعيل مهلة تجريبية مجانية لمدة 7 أيام لتجربة كافة مميزات البرنامج لكود المدرسة (' || v_clean_code || ') حتى ' || to_char(v_trial_end AT TIME ZONE 'Africa/Cairo', 'YYYY/MM/DD') || '.'
        );
    END IF;

    -- تحديث وقت آخر فحص واسم المدرسة
    UPDATE public.emis_school_subscriptions
    SET last_checked_at = v_now,
        school_name = coalesce(nullif(trim(p_school_name), ''), school_name)
    WHERE school_code = v_clean_code;

    -- إذا كان الاشتراك موقوفاً يدوياً من الإدارة
    IF v_sub.status = 'suspended' THEN
        RETURN jsonb_build_object(
            'ok', true,
            'subscribed', false,
            'status', 'SUSPENDED',
            'school_code', v_clean_code,
            'school_name', v_sub.school_name,
            'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
            'message', 'اشتراك المدرسة موقوف حالياً من قِبل الإدارة.'
        );
    END IF;

    -- فحص حالة التجربة (Trial)
    IF v_sub.status = 'trial' THEN
        v_days_left := greatest(0, ceil(extract(epoch from (v_sub.expires_at - v_now)) / 86400)::integer);
        IF v_now < v_sub.expires_at THEN
            RETURN jsonb_build_object(
                'ok', true,
                'subscribed', true,
                'status', 'TRIAL',
                'school_code', v_clean_code,
                'school_name', v_sub.school_name,
                'starts_at', v_sub.starts_at,
                'expires_at', v_sub.expires_at,
                'days_remaining', v_days_left,
                'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
                'message', 'فترة تجريبية مجانية نشطة — متبقي ' || v_days_left || ' ' || (CASE WHEN v_days_left <= 2 THEN 'يوم' ELSE 'أيام' END) || ' حتى ' || to_char(v_sub.expires_at AT TIME ZONE 'Africa/Cairo', 'YYYY/MM/DD') || '. يمكنك التفعيل السنوي بـ 30 جنيهاً في أي وقت.'
            );
        ELSE
            RETURN jsonb_build_object(
                'ok', true,
                'subscribed', false,
                'status', 'EXPIRED_TRIAL',
                'school_code', v_clean_code,
                'school_name', v_sub.school_name,
                'expires_at', v_sub.expires_at,
                'days_remaining', 0,
                'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
                'message', 'انتهت المهلة التجريبية المجانية (7 أيام) لكود المدرسة (' || v_clean_code || '). للاستمرار في الاستخدام يرجى الاشتراك وتفعيل الكرت بـ 30 جنيهاً.'
            );
        END IF;
    END IF;

    -- حساب الأيام المتبقية للاشتراك العادي
    v_days_left := greatest(0, floor(extract(epoch from (v_sub.expires_at - v_now)) / 86400)::integer);
    v_is_active := (v_sub.status = 'active') AND (v_sub.expires_at > v_now);

    IF NOT v_is_active THEN
        RETURN jsonb_build_object(
            'ok', true,
            'subscribed', false,
            'status', 'EXPIRED',
            'school_code', v_clean_code,
            'school_name', v_sub.school_name,
            'expires_at', v_sub.expires_at,
            'days_remaining', 0,
            'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
            'message', 'انتهت فترة الاشتراك السنوي لهذه المدرسة. يرجى التجديد بـ 30 جنيهاً للمتابعة.'
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'subscribed', true,
        'status', CASE WHEN v_days_left <= 10 THEN 'WARNING' ELSE 'ACTIVE' END,
        'school_code', v_clean_code,
        'school_name', v_sub.school_name,
        'starts_at', v_sub.starts_at,
        'expires_at', v_sub.expires_at,
        'days_remaining', v_days_left,
        'server_time', floor(extract(epoch from v_now) * 1000)::bigint,
        'message', CASE 
            WHEN v_days_left <= 10 THEN 'تنبيه: أوشك الاشتراك السنوي على الانتهاء خلال ' || v_days_left || ' يوم.'
            ELSE 'الاشتراك السنوي ساري ونشط حتى ' || to_char(v_sub.expires_at AT TIME ZONE 'Africa/Cairo', 'YYYY/MM/DD') || '.'
        END
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. دالة التفعيل الآلي بمفتاح التفعيل (activate_license_key)
-- تُنفذ ذرياً (Atomic): تتحقق من المفتاح وتربطه بكود المدرسة لمدة 365 يوماً
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
AS $$
DECLARE
    v_clean_code TEXT;
    v_clean_key TEXT;
    v_key RECORD;
    v_sub RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_start TIMESTAMPTZ;
    v_expires TIMESTAMPTZ;
    v_days_left INTEGER;
BEGIN
    v_clean_code := trim(regexp_replace(coalesce(p_school_code, ''), '[^0-9A-Za-z_-]', '', 'g'));
    v_clean_key := upper(trim(coalesce(p_license_key, '')));

    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SCHOOL_CODE', 'message', 'كود المدرسة مطلوب.');
    END IF;
    IF v_clean_key = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_KEY', 'message', 'مفتاح التفعيل مطلوب.');
    END IF;

    -- قفل وفحص مفتاح التفعيل
    SELECT * INTO v_key
    FROM public.emis_license_keys
    WHERE license_key = v_clean_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'KEY_NOT_FOUND', 'message', 'مفتاح التفعيل غير صحيح، يرجى التأكد من كتابة الكود بدقة.');
    END IF;

    IF v_key.status = 'used' AND v_key.used_by_school_code <> v_clean_code THEN
        RETURN jsonb_build_object('ok', false, 'code', 'KEY_ALREADY_USED', 'message', 'هذا المفتاح تم استخدامه مسبقاً لمدرسة أخرى.');
    END IF;

    IF v_key.status = 'cancelled' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'KEY_CANCELLED', 'message', 'تم إلغاء هذا المفتاح من قِبل الإدارة.');
    END IF;

    -- فحص إذا كانت المدرسة لها اشتراك قائم بالفعل لتمديده
    SELECT * INTO v_sub
    FROM public.emis_school_subscriptions
    WHERE school_code = v_clean_code
    FOR UPDATE;

    -- تحديد موعد انتهاء العام الدراسي الحالي: 31 أغسطس 2027
    v_start := coalesce(v_sub.starts_at, v_now);
    v_expires := '2027-08-31 23:59:59+00'::timestamptz;

    -- إذا كان التاريخ الحالي قد تجاوز 31/8/2027، يُضاف عام دراسي تالي
    IF v_now >= v_expires THEN
        v_expires := v_expires + interval '1 year';
    END IF;

    -- تحديث حالة المفتاح
    UPDATE public.emis_license_keys
    SET status = 'used',
        used_at = v_now,
        used_by_school_code = v_clean_code
    WHERE id = v_key.id;

    -- إدراج أو تحديث اشتراك المدرسة
    INSERT INTO public.emis_school_subscriptions (
        school_code, school_name, status, starts_at, expires_at,
        last_license_key, last_device_info, last_checked_at, updated_at
    ) VALUES (
        v_clean_code,
        coalesce(nullif(p_school_name, ''), v_sub.school_name, 'مدرسة ' || v_clean_code),
        'active',
        v_start,
        v_expires,
        v_clean_key,
        p_device_info,
        v_now,
        v_now
    )
    ON CONFLICT (school_code) DO UPDATE SET
        school_name = coalesce(nullif(EXCLUDED.school_name, ''), public.emis_school_subscriptions.school_name),
        status = 'active',
        expires_at = EXCLUDED.expires_at,
        last_license_key = EXCLUDED.last_license_key,
        last_device_info = EXCLUDED.last_device_info,
        last_checked_at = EXCLUDED.last_checked_at,
        updated_at = EXCLUDED.updated_at;

    v_days_left := floor(extract(epoch from (v_expires - v_now)) / 86400)::integer;

    RETURN jsonb_build_object(
        'ok', true,
        'code', 'ACTIVATED_SUCCESSFULLY',
        'message', 'تم تفعيل الاشتراك السنوي بنجاح لمدة ' || v_days_left || ' يوماً.',
        'school_code', v_clean_code,
        'school_name', coalesce(p_school_name, v_sub.school_name, 'مدرسة ' || v_clean_code),
        'status', 'ACTIVE',
        'starts_at', v_start,
        'expires_at', v_expires,
        'days_remaining', v_days_left
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. دالة توليد دفعة كروت تفعيل جديدة للإدارة (generate_batch_keys)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_emis_license_keys(
    p_count INTEGER DEFAULT 10,
    p_plan_days INTEGER DEFAULT 365,
    p_batch_name TEXT DEFAULT '2026/2027 Annual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_generated JSONB := '[]'::jsonb;
    v_key TEXT;
    i INTEGER;
    v_seg1 TEXT;
    v_seg2 TEXT;
BEGIN
    FOR i IN 1..least(greatest(1, p_count), 200) LOOP
        v_seg1 := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
        v_seg2 := upper(substr(md5(random()::text || clock_timestamp()::text), 5, 4));
        v_key := 'NEPRAS-2027-' || v_seg1 || '-' || v_seg2;

        INSERT INTO public.emis_license_keys (license_key, plan_days, batch_name)
        VALUES (v_key, p_plan_days, p_batch_name)
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

-- منح صلاحيات الاستدعاء الآمن عبر Supabase Anon API
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_school_subscription(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_license_key(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
