-- 0023: Per-user favourite (starred) sidebar items.
-- ADDITIVE ONLY: creates one new table + its RLS policies. No existing table, row, function or policy is changed or dropped.
-- Run once in the Supabase SQL editor (whole file) AFTER 0001-0022. Safe to re-run.
-- NOT executed by the author (no database access was available). Verify with the queries at the bottom.
-- Until it is run the app works normally; the star controls are simply hidden.
--
-- A favourite is only a bookmark (a menu key such as '/trips'). It never grants access: the sidebar shows a
-- favourite only if the page is already in the user's allowed menu, and every page/table keeps its own RLS.

CREATE TABLE IF NOT EXISTS public.user_nav_favourites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nav_key text NOT NULL CHECK (nav_key ~ '^/[a-z0-9-]+$' AND length(nav_key) <= 64),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nav_key)
);
CREATE INDEX IF NOT EXISTS user_nav_favourites_user ON public.user_nav_favourites(user_id);

GRANT SELECT, INSERT, DELETE ON public.user_nav_favourites TO authenticated;
GRANT ALL ON public.user_nav_favourites TO service_role;
ALTER TABLE public.user_nav_favourites ENABLE ROW LEVEL SECURITY;

-- Each user can only see / add / remove THEIR OWN rows, and only inside their own business.
DROP POLICY IF EXISTS "own select" ON public.user_nav_favourites;
CREATE POLICY "own select" ON public.user_nav_favourites FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_business_member(business_id));
DROP POLICY IF EXISTS "own insert" ON public.user_nav_favourites;
CREATE POLICY "own insert" ON public.user_nav_favourites FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_business_member(business_id));
DROP POLICY IF EXISTS "own delete" ON public.user_nav_favourites;
CREATE POLICY "own delete" ON public.user_nav_favourites FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_business_member(business_id));

-- business_id is stamped from the caller's membership (same trigger as every other business table).
DROP TRIGGER IF EXISTS a_stamp_business ON public.user_nav_favourites;
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.user_nav_favourites
  FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();

-- Verification (run manually after applying):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_nav_favourites'::regclass;   -- expect true
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_nav_favourites';          -- expect own select/insert/delete
