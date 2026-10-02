-- ==============================================================================
-- Script: Clean Legacy Base64 Images & Audit Storage
-- Purpose: 
--   1. Audit and safely clear any legacy Base64 image data strings stored in items.image_url
--      (which previously bloated database backup size and PostgREST API egress).
--   2. Keep clean Cloudflare R2 URLs (https://pub-... or https://cdn-...) untouched.
-- ==============================================================================

-- 1. Inspect count of legacy Base64 strings in items table
DO $$
DECLARE
  v_base64_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_base64_count
  FROM public.items
  WHERE image_url LIKE 'data:image/%';

  RAISE NOTICE 'Found % items with legacy Base64 image strings.', v_base64_count;
END $$;

-- 2. Clean Base64 strings in items.image_url to NULL (Users can re-upload to Cloudflare R2)
UPDATE public.items
SET image_url = NULL
WHERE image_url LIKE 'data:image/%';

-- 3. Ensure vacuum analyze to reclaim storage on PostgreSQL
VACUUM ANALYZE public.items;
