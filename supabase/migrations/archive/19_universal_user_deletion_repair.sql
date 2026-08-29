-- Migration 19: Universal User Deletion Repair (Storage & Schema Cascade Fix)
-- Enables clean user deletion both via Supabase Dashboard UI and admin_delete_user RPC.

-- 1. Universal Dynamic SQL Loop: Update ALL Foreign Keys in public schema referencing auth.users or public.profiles
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_schema, 
            tc.table_name, 
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS ref_table
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema = 'public'
          AND ccu.table_name IN ('users', 'profiles')
          AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
    ) LOOP
        IF r.column_name IN ('id', 'user_id', 'target_user_id') THEN
            EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I;', r.table_schema, r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE CASCADE;', r.table_schema, r.table_name, r.constraint_name, r.column_name);
        ELSE
            EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I;', r.table_schema, r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE SET NULL;', r.table_schema, r.table_name, r.constraint_name, r.column_name);
        END IF;
    END LOOP;
END $$;

-- 2. Safely Update Storage Objects Foreign Key to ON DELETE SET NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'storage' AND constraint_name = 'objects_owner_fkey'
    ) THEN
        ALTER TABLE storage.objects DROP CONSTRAINT objects_owner_fkey;
        ALTER TABLE storage.objects ADD CONSTRAINT objects_owner_fkey 
          FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if storage schema is managed directly by Supabase Cloud
    NULL;
END $$;

-- 3. Safely Dissociate Orphan Storage Objects (Set owner to NULL to avoid protect_delete error)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
        UPDATE storage.objects 
        SET owner = NULL 
        WHERE owner IS NOT NULL 
          AND owner::text NOT IN (SELECT id::text FROM auth.users);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 4. Atomic Master RPC: admin_delete_user
DROP FUNCTION IF EXISTS public.admin_delete_user(UUID);
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_target_email TEXT;
BEGIN
  -- A. Authorization check
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can delete users.';
  END IF;

  -- B. Prevent self-deletion
  IF auth.uid() = p_target_id THEN
    RAISE EXCEPTION 'Security Restriction: You cannot delete your own active administrator account.';
  END IF;

  -- C. Fetch target user email for audit log
  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_id;
  IF v_target_email IS NULL THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_id;
  END IF;

  -- D. Safely dissociate Storage files owned by target user (avoiding storage.protect_delete)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    BEGIN
      UPDATE storage.objects SET owner = NULL WHERE owner::text = p_target_id::text;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- E. Clean up user assignments & profile & auth user
  DELETE FROM public.user_project_assignments WHERE user_id = p_target_id OR created_by = p_target_id;
  DELETE FROM public.profiles WHERE id = p_target_id;
  DELETE FROM auth.users WHERE id = p_target_id;

  -- F. Record audit log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    NULL,
    'USER_DELETED',
    jsonb_build_object('target_user_id', p_target_id, 'email', v_target_email)
  );

  RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
