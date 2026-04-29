-- ============================================================================
-- youtube-to-build-it :: initial schema
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date  DATE NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS public.analytics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_email             ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date   ON public.daily_usage (user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type    ON public.analytics (event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at    ON public.analytics (created_at);

-- ----------------------------------------------------------------------------
-- AUTO-CREATE public.users ROW WHEN auth.users ROW IS CREATED
-- This is what lets RLS work cleanly: public.users.id == auth.users.id always.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics    ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before re-creating (idempotent re-run support)
DROP POLICY IF EXISTS "users_select_own"           ON public.users;
DROP POLICY IF EXISTS "daily_usage_select_own"     ON public.daily_usage;
DROP POLICY IF EXISTS "analytics_no_client_access" ON public.analytics;

-- users: a user can read ONLY their own row
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- daily_usage: a user can read ONLY their own usage rows
CREATE POLICY "daily_usage_select_own"
  ON public.daily_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- analytics: zero client access. Service role bypasses RLS automatically,
-- so this empty-policy table is read/write blocked for clients while the
-- server-side service role can still INSERT freely.
CREATE POLICY "analytics_no_client_access"
  ON public.analytics
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- DONE
-- ----------------------------------------------------------------------------
-- Verify with:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
--   SELECT policyname, tablename FROM pg_policies WHERE schemaname='public';
