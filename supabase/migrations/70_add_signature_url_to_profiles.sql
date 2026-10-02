-- ==============================================================================
-- 70_add_signature_url_to_profiles.sql
-- Digital Signature support for user profiles in Stock-Flow-app
-- ==============================================================================

-- 1. Add signature_url column to public.profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS signature_url TEXT;

COMMENT ON COLUMN public.profiles.signature_url IS 'Digital signature image URL or base64 data URI of the user';

-- 2. Ensure authenticated users can view and update their own signature_url
-- Note: Policy "Users can update own profile" on public.profiles already permits 
-- auth.uid() = id updates without restriction on signature_url.
