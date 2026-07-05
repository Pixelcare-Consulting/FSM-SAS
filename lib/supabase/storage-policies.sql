-- =============================================
-- STORAGE BUCKET ROW LEVEL SECURITY POLICIES
-- =============================================
-- Run this SQL in your Supabase SQL Editor to set up RLS policies for storage buckets

-- Enable RLS on storage.objects (if not already enabled)
-- Note: RLS is typically enabled by default on storage.objects

-- =============================================
-- COMPANY BUCKET POLICIES
-- =============================================
-- Note: If you're using custom authentication (not Supabase Auth),
-- you may need to use service role key for uploads or adjust these policies

-- Policy: Allow authenticated users to upload files to company bucket
-- If using custom auth, you may need to use service role or create an API route
CREATE POLICY IF NOT EXISTS "Allow authenticated users to upload company logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company'
);

-- Policy: Allow authenticated users to update files in company bucket
CREATE POLICY IF NOT EXISTS "Allow authenticated users to update company logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'company')
WITH CHECK (bucket_id = 'company');

-- Policy: Allow public read access to company bucket (for displaying logos)
CREATE POLICY IF NOT EXISTS "Allow public read access to company logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'company');

-- Policy: Allow authenticated users to delete files in company bucket
CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete company logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'company');

-- =============================================
-- AVATAR BUCKET POLICIES (if needed)
-- =============================================

-- Policy: Allow authenticated users to upload avatars
CREATE POLICY "Allow authenticated users to upload avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatar' AND
  auth.role() = 'authenticated'
);

-- Policy: Allow public read access to avatars
CREATE POLICY "Allow public read access to avatars"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'avatar'
);

-- Policy: Allow authenticated users to update avatars
CREATE POLICY "Allow authenticated users to update avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatar' AND
  auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'avatar' AND
  auth.role() = 'authenticated'
);

-- Policy: Allow authenticated users to delete avatars
CREATE POLICY "Allow authenticated users to delete avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatar' AND
  auth.role() = 'authenticated'
);

-- =============================================
-- JOB SERVICE MEDIA BUCKET POLICIES (if needed)
-- =============================================

-- Policy: Allow authenticated users to upload job service media
CREATE POLICY "Allow authenticated users to upload job service media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job_service_media' AND
  auth.role() = 'authenticated'
);

-- Policy: Allow public read access to job service media
CREATE POLICY "Allow public read access to job service media"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'job_service_media'
);

-- Policy: Allow authenticated users to update job service media
CREATE POLICY "Allow authenticated users to update job service media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'job_service_media' AND
  auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'job_service_media' AND
  auth.role() = 'authenticated'
);

-- Policy: Allow authenticated users to delete job service media
CREATE POLICY "Allow authenticated users to delete job service media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job_service_media' AND
  auth.role() = 'authenticated'
);

-- =============================================
-- JOB CUSTOMER SIGNATURES BUCKET POLICIES (if needed)
-- =============================================

-- Policy: Allow authenticated users to upload customer signatures
CREATE POLICY "Allow authenticated users to upload customer signatures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job_customer_signatures' AND
  auth.role() = 'authenticated'
);

-- Policy: Allow public read access to customer signatures
CREATE POLICY "Allow public read access to customer signatures"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'job_customer_signatures'
);

-- Policy: Allow authenticated users to update customer signatures
CREATE POLICY "Allow authenticated users to update customer signatures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'job_customer_signatures' AND
  auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'job_customer_signatures' AND
  auth.role() = 'authenticated'
);

-- Policy: Allow authenticated users to delete customer signatures
CREATE POLICY "Allow authenticated users to delete customer signatures"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job_customer_signatures' AND
  auth.role() = 'authenticated'
);

-- =============================================
-- ALTERNATIVE: USE API ROUTE WITH SERVICE ROLE
-- =============================================
-- If RLS policies don't work with your custom authentication,
-- create an API route that uses service role key:
--
-- Example: pages/api/upload-company-logo.js
-- ```javascript
-- import { getSupabaseAdmin } from '../../lib/supabase/server';
-- 
-- export default async function handler(req, res) {
--   if (req.method !== 'POST') {
--     return res.status(405).json({ message: 'Method not allowed' });
--   }
-- 
--   try {
--     const admin = getSupabaseAdmin();
--     const { bucket, path, file } = req.body;
--     
--     // Convert base64 or use FormData
--     const { data, error } = await admin.storage
--       .from(bucket)
--       .upload(path, file, { upsert: true });
--     
--     if (error) throw error;
--     
--     const { data: urlData } = admin.storage
--       .from(bucket)
--       .getPublicUrl(path);
--     
--     res.json({ url: urlData.publicUrl });
--   } catch (error) {
--     res.status(500).json({ error: error.message });
--   }
-- }
-- ```

-- =============================================
-- NOTES
-- =============================================
-- 
-- If you're using service role key for uploads (server-side), you may need
-- to adjust these policies or use the service role client which bypasses RLS.
--
-- To check existing policies:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
--
-- To drop a policy if needed:
-- DROP POLICY "policy_name" ON storage.objects;
--
-- For more restrictive access, you can add conditions like:
--   (storage.foldername(name))[1] = auth.uid()::text
-- This would restrict users to only access files in folders named with their user ID.
--
-- IMPORTANT: If you're using custom authentication (not Supabase Auth),
-- the authenticated role may not work. In that case:
-- 1. Use service role key in an API route (recommended for security)
-- 2. Or temporarily disable RLS on the bucket (NOT recommended for production)

