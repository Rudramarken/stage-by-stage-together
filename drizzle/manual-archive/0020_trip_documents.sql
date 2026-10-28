-- 0020: Optional documents for a TRIP (metadata table + PRIVATE storage bucket 'trip-documents').
-- Same pattern and limits as the LR documents added in 0017: PDF/JPEG/PNG/WebP, max 10 MB, members of the business only,
-- files are opened only through short-lived signed links (the bucket is NOT public).
--
-- Safe: creates one new table, one new bucket and policies for them. No existing table, row, policy or file is changed.
-- Prerequisite: 0001 (trips) and 0017 (the helper functions already exist from 0000). Run AFTER 0019 (order does not matter technically).
-- Run in the Supabase SQL editor of the live project. Until it is run, the Trip page shows "Documents are not available yet" and everything else works.
-- NOT executed by the author (no database/storage access was available) - verify with the queries at the bottom.

CREATE TABLE IF NOT EXISTS public.trip_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_documents_trip ON public.trip_documents(trip_id);
GRANT SELECT, INSERT, DELETE ON public.trip_documents TO authenticated;
GRANT ALL ON public.trip_documents TO service_role;
ALTER TABLE public.trip_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members select" ON public.trip_documents;
CREATE POLICY "members select" ON public.trip_documents FOR SELECT TO authenticated USING (public.is_business_member(business_id));
DROP POLICY IF EXISTS "members insert" ON public.trip_documents;
-- The trip must be visible to the caller (RLS on trips applies inside this sub-select), so a document cannot be attached to another business's trip.
CREATE POLICY "members insert" ON public.trip_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_business_member(business_id) AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.business_id = trip_documents.business_id));
DROP POLICY IF EXISTS "members delete" ON public.trip_documents;
CREATE POLICY "members delete" ON public.trip_documents FOR DELETE TO authenticated USING (public.is_business_member(business_id));
DROP TRIGGER IF EXISTS a_stamp_business ON public.trip_documents;
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.trip_documents FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();
DROP TRIGGER IF EXISTS z_audit ON public.trip_documents;
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.trip_documents FOR EACH ROW EXECUTE FUNCTION public.write_audit();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('trip-documents', 'trip-documents', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp'];

-- Object path convention: <business_id>/<trip_id>/<uuid>-<file name>. Only members of that business can touch it.
DROP POLICY IF EXISTS "trip docs select" ON storage.objects;
CREATE POLICY "trip docs select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trip-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "trip docs insert" ON storage.objects;
CREATE POLICY "trip docs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trip-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "trip docs delete" ON storage.objects;
CREATE POLICY "trip docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'trip-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));

-- Verify after running (read-only):
--   SELECT to_regclass('public.trip_documents') IS NOT NULL AS table_ok;
--   SELECT id, public FROM storage.buckets WHERE id = 'trip-documents';   -- expect public = false
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trip_documents'::regclass;   -- expect true
