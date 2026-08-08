-- Migration 18: Cascade User Deletion Foreign Keys & Safe Delete RPC
-- Fixes "Failed to delete user" errors in Supabase Dashboard caused by restrictive foreign keys.

-- 1. Fix user_project_assignments created_by foreign key constraint
ALTER TABLE public.user_project_assignments 
  DROP CONSTRAINT IF EXISTS user_project_assignments_created_by_fkey;

ALTER TABLE public.user_project_assignments
  ADD CONSTRAINT user_project_assignments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Fix projects created_by foreign key constraint if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'projects_created_by_fkey'
  ) THEN
    ALTER TABLE public.projects DROP CONSTRAINT projects_created_by_fkey;
    ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Fix stock_ins created_by foreign key constraint if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'stock_ins_created_by_fkey'
  ) THEN
    ALTER TABLE public.stock_ins DROP CONSTRAINT stock_ins_created_by_fkey;
    ALTER TABLE public.stock_ins ADD CONSTRAINT stock_ins_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Fix withdrawals created_by / approved_by foreign key constraints if exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'withdrawals_created_by_fkey'
  ) THEN
    ALTER TABLE public.withdrawals DROP CONSTRAINT withdrawals_created_by_fkey;
    ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'withdrawals_approved_by_fkey'
  ) THEN
    ALTER TABLE public.withdrawals DROP CONSTRAINT withdrawals_approved_by_fkey;
    ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_approved_by_fkey 
      FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Fix system_secrets updated_by foreign key constraint if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'system_secrets_updated_by_fkey'
  ) THEN
    ALTER TABLE public.system_secrets DROP CONSTRAINT system_secrets_updated_by_fkey;
    ALTER TABLE public.system_secrets ADD CONSTRAINT system_secrets_updated_by_fkey 
      FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. RPC: admin_delete_user
-- Atomic deletion of a user from auth.users + profiles + user_project_assignments
DROP FUNCTION IF EXISTS public.admin_delete_user(UUID);
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_target_email TEXT;
BEGIN
  -- Authorization check
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can delete users.';
  END IF;

  -- Prevent self-deletion
  IF auth.uid() = p_target_id THEN
    RAISE EXCEPTION 'Security Restriction: You cannot delete your own active administrator account.';
  END IF;

  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_id;

  IF v_target_email IS NULL THEN
    -- Fallback check in profiles
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_id;
  END IF;

  -- Clean up child records
  DELETE FROM public.user_project_assignments WHERE user_id = p_target_id;
  DELETE FROM public.profiles WHERE id = p_target_id;
  DELETE FROM auth.users WHERE id = p_target_id;

  -- Record audit log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    p_target_id,
    'USER_DELETED',
    jsonb_build_object('target_user_id', p_target_id, 'email', v_target_email)
  );

  RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
