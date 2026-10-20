-- =============================================================================
-- Migration 96: Fix admin_delete_user RPC & Enforce Strict Audit/Integrity Guards
-- =============================================================================
-- Problem:
--   1. admin_delete_user in Migration 61/62 attempted to query `email` from
--      `public.profiles` (`SELECT email INTO v_target_email FROM public.profiles...`).
--      Because `public.profiles` has NO `email` column (authoritative email lives
--      exclusively in `auth.users`), PostgreSQL throws:
--        ERROR 42703 (undefined_column): column "email" does not exist
--      causing all delete user attempts via PostgREST RPC to fail with HTTP 400.
--   2. admin_delete_user lacked database-level hierarchy checks:
--      - Non-super admin with delete permission could delete SUPER admin.
--      - Could delete the last active administrator, bricking system admin access.
--   3. Hard deleting users with past transaction history (orders, checkouts, stock)
--      corrupts audit trails and breaks historical reports.
--   4. Foreign key on `user_project_assignments.created_by` lacked ON DELETE SET NULL,
--      causing ERROR 23503 if the user had assigned other users.
--
-- Solution:
--   1. Query target email from `auth.users` directly:
--        SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_id;
--   2. Enforce strict Database-level Guards (Defense-in-Depth):
--      - Self-deletion guard (SELF_DELETION_PROHIBITED)
--      - Super Admin hierarchy guard (CANNOT_DELETE_SUPER_ADMIN)
--      - Last active Administrator guard (CANNOT_DELETE_LAST_ADMIN)
--      - Historical audit & transaction integrity guard (USER_HAS_TRANSACTION_HISTORY)
--        -> Blocks hard delete; directs admin to deactivate account instead.
--   3. Ensure `user_project_assignments.created_by` has ON DELETE SET NULL.
--   4. Ensure `system_settings.updated_by` and `system_secrets.updated_by` have ON DELETE SET NULL.
--   5. Maintain atomic transaction, reload PostgREST schema cache.
-- =============================================================================

BEGIN;

-- 1. Fix Foreign Key constraints on user references to avoid orphan RESTRICT errors
DO $$
BEGIN
  -- user_project_assignments.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_project_assignments_created_by_fkey'
  ) THEN
    ALTER TABLE public.user_project_assignments 
      DROP CONSTRAINT user_project_assignments_created_by_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_project_assignments' 
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.user_project_assignments 
      ADD CONSTRAINT user_project_assignments_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- system_settings.updated_by
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'system_settings_updated_by_fkey'
  ) THEN
    ALTER TABLE public.system_settings 
      DROP CONSTRAINT system_settings_updated_by_fkey;
    ALTER TABLE public.system_settings 
      ADD CONSTRAINT system_settings_updated_by_fkey 
      FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- system_secrets.updated_by
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'system_secrets_updated_by_fkey'
  ) THEN
    ALTER TABLE public.system_secrets 
      DROP CONSTRAINT system_secrets_updated_by_fkey;
    ALTER TABLE public.system_secrets 
      ADD CONSTRAINT system_secrets_updated_by_fkey 
      FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Redefine admin_delete_user with email fix and complete safety guards
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_target_email TEXT;
  v_caller_is_super BOOLEAN := FALSE;
  v_target_is_super BOOLEAN := FALSE;
  v_target_role TEXT;
  v_target_role_id UUID;
  v_active_admins_count INT := 0;
  v_tx_count INT := 0;
  v_order_count INT := 0;
BEGIN
  -- 1. Check Authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Check Caller Authorization (Super Admin or users.delete permission)
  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'users.delete')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.delete permission.';
  END IF;

  -- 3. Self-deletion guard
  IF v_caller_id = p_target_id THEN
    RAISE EXCEPTION 'Self-deletion is prohibited.';
  END IF;

  -- 4. Verify target exists and fetch role & email
  SELECT role, role_id INTO v_target_role, v_target_role_id
  FROM public.profiles
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  -- Correct source of email: auth.users (NOT public.profiles)
  SELECT email INTO v_target_email 
  FROM auth.users 
  WHERE id = p_target_id;

  -- 5. Hierarchy Guard: Non-super admin cannot delete SUPER accounts
  v_caller_is_super := public.is_super_admin(v_caller_id);
  v_target_is_super := (
    UPPER(COALESCE(v_target_role, '')) IN ('SUPER', 'SUPERADMIN', 'SUPER_ADMIN') 
    OR LOWER(COALESCE(v_target_email, '')) = 'admin@stockflow.com'
  );
  IF NOT v_target_is_super AND v_target_role_id IS NOT NULL THEN
    SELECT (code = 'SUPER') INTO v_target_is_super 
    FROM public.roles 
    WHERE id = v_target_role_id;
  END IF;

  IF v_target_is_super AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can delete Super Admin accounts.';
  END IF;

  -- 6. Last Active Administrator & Super Admin Guard
  IF v_target_is_super THEN
    SELECT COUNT(*) INTO v_active_admins_count
    FROM public.profiles p
    LEFT JOIN public.roles r ON (r.id = p.role_id)
    WHERE p.status = 'active'
      AND (
        UPPER(COALESCE(p.role, '')) IN ('SUPER', 'SUPERADMIN', 'SUPER_ADMIN') 
        OR COALESCE(r.code, '') = 'SUPER'
      );
    
    IF v_active_admins_count <= 1 THEN
      RAISE EXCEPTION 'Cannot delete the last active Super Administrator account in the system.';
    END IF;
  END IF;

  IF UPPER(COALESCE(v_target_role, '')) IN ('ADMIN', 'ADMINISTRATOR') THEN
    SELECT COUNT(*) INTO v_active_admins_count
    FROM public.profiles p
    LEFT JOIN public.roles r ON (r.id = p.role_id)
    WHERE p.status = 'active'
      AND (
        UPPER(COALESCE(p.role, '')) IN ('ADMIN', 'ADMINISTRATOR') 
        OR COALESCE(r.code, '') = 'ADMIN'
      );
    
    IF v_active_admins_count <= 1 THEN
      RAISE EXCEPTION 'Cannot delete the last active Administrator account in the system.';
    END IF;
  END IF;

  -- 7. Audit History Guard: Prevent hard-deleting users with past transaction records
  --    (Users with history must be deactivated instead to maintain audit integrity)
  SELECT COUNT(*) INTO v_tx_count
  FROM public.stock_transactions
  WHERE created_by = p_target_id;

  IF v_tx_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete user with transaction history. Deactivate account instead.';
  END IF;

  SELECT (
    COALESCE((SELECT COUNT(*) FROM public.withdrawal_orders WHERE requested_by = p_target_id OR approved_by = p_target_id OR rejected_by = p_target_id OR completed_by = p_target_id), 0) +
    COALESCE((SELECT COUNT(*) FROM public.checkout_orders WHERE borrower_id = p_target_id OR created_by = p_target_id OR approved_by = p_target_id OR rejected_by = p_target_id), 0) +
    COALESCE((SELECT COUNT(*) FROM public.stock_in_orders WHERE created_by = p_target_id), 0)
  ) INTO v_order_count;

  IF v_order_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete user with order history. Deactivate account instead.';
  END IF;

  -- 8. Clean relationships and delete user atomically
  DELETE FROM public.user_notifications WHERE user_id = p_target_id;
  DELETE FROM public.notifications WHERE user_id = p_target_id;
  DELETE FROM public.user_project_assignments WHERE user_id = p_target_id;

  -- Clear any legacy storage object ownership
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    UPDATE storage.objects SET owner = NULL WHERE owner = p_target_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    DELETE FROM auth.identities WHERE user_id = p_target_id;
  END IF;
  DELETE FROM public.profiles WHERE id = p_target_id;
  DELETE FROM auth.users WHERE id = p_target_id;

  -- 9. Insert Audit Log
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_caller_id,
    'USER_DELETED',
    jsonb_build_object(
      'target_user_id', p_target_id,
      'target_email', v_target_email,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User deleted successfully.',
    'target_email', v_target_email
  );
END;
$$;

-- 3. Grants & Schema Cache Reload
REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
