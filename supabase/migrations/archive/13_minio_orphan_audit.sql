-- Migration 13: MinIO Orphan Files Reference Collection & RPC
-- Creates helper RPC admin_collect_database_file_references to query all stored file URLs/keys across application tables

CREATE OR REPLACE FUNCTION public.admin_collect_database_file_references()
RETURNS TABLE (
  table_name TEXT,
  column_name TEXT,
  file_reference TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Check Administrator / Staff Permission
  IF NOT (public.has_permission(auth.uid(), 'settings.view') OR public.has_permission(auth.uid(), 'settings.update')) THEN
    RAISE EXCEPTION 'Permission denied to collect database file references.';
  END IF;

  -- 2. Collect references from profiles (User.image / avatar_url)
  RETURN QUERY
  SELECT 'profiles'::TEXT, 'avatar_url'::TEXT, avatar_url::TEXT
  FROM public.profiles
  WHERE avatar_url IS NOT NULL AND avatar_url != '';

  -- 3. Collect references from items (Item image_url)
  RETURN QUERY
  SELECT 'items'::TEXT, 'image_url'::TEXT, image_url::TEXT
  FROM public.items
  WHERE image_url IS NOT NULL AND image_url != '';

  -- 4. Check if jobs table exists and collect images & fixImages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    RETURN QUERY
    EXECUTE '
      SELECT ''jobs''::TEXT, ''images''::TEXT, unnest(images)::TEXT
      FROM public.jobs
      WHERE images IS NOT NULL AND array_length(images, 1) > 0
      UNION ALL
      SELECT ''jobs''::TEXT, ''fix_images''::TEXT, unnest(fix_images)::TEXT
      FROM public.jobs
      WHERE fix_images IS NOT NULL AND array_length(fix_images, 1) > 0;
    ';
  END IF;

  -- 5. Check if users table exists and collect image
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    RETURN QUERY
    EXECUTE '
      SELECT ''users''::TEXT, ''image''::TEXT, image::TEXT
      FROM public.users
      WHERE image IS NOT NULL AND image != '''';
    ';
  END IF;

  -- 6. Check system_settings table if any custom branding/logo images exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_settings') THEN
    RETURN QUERY
    SELECT 'system_settings'::TEXT, 'value'::TEXT, (value->>'logo')::TEXT
    FROM public.system_settings
    WHERE value->>'logo' IS NOT NULL AND value->>'logo' != '';
  END IF;

END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_collect_database_file_references() TO authenticated;
