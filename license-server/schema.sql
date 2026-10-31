-- =============================================================================
-- قاعدة بيانات اشتراكات المدارس السنوية لتطبيق نبراس سطح المكتب (Nepras Desktop)
-- متوافقة مع: Vercel Postgres / Neon / Supabase (PostgreSQL)
-- ملاحظة: يقوم السيرفر بإنشاء هذه الجداول تلقائياً عند أول اتصال، وهذا الملف مرجعي.
-- =============================================================================

CREATE TABLE IF NOT EXISTS school_subscriptions (
  school_code VARCHAR(32) PRIMARY KEY,
  school_name TEXT NOT NULL DEFAULT '',
  directorate TEXT NOT NULL DEFAULT '',
  administration TEXT NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  license_key VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'active', -- 'active' | 'suspended' | 'expired'
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
  status VARCHAR(24) NOT NULL DEFAULT 'unused', -- 'unused' | 'used' | 'revoked'
  notes TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  used_at BIGINT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_school_subs_status ON school_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_school_subs_expires ON school_subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_activation_keys_school ON activation_keys(bound_school_code);
