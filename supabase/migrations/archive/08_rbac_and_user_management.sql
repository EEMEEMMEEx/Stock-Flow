-- Migration 08: Admin User Management & Role-Based Access Control (RBAC)
-- Extends profiles schema, adds user_project_assignments & audit_logs tables,
-- implements atomic SECURITY DEFINER RPCs for user management, and sets up RLS policies.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Upgrade public.profiles with additional metadata columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'position'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN "position" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 2. Create public.user_project_assignments for fine-grained project authorization
CREATE TABLE IF NOT EXISTS public.user_project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  CONSTRAINT user_project_unique UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_project_user_id ON public.user_project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_project_project_id ON public.user_project_assignments(project_id);

-- 3. Create public.audit_logs for security auditability
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Enable RLS on new tables
ALTER TABLE public.user_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. Helper Function: Check caller is Active Admin
CREATE OR REPLACE FUNCTION public.is_active_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id 
      AND role = 'admin' 
      AND status = 'active'
  );
END;
$$;

-- 5. RPC: admin_get_users
-- Returns sanitized users list with assigned project IDs and metadata
CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  phone TEXT,
  "position" TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  assigned_project_ids UUID[],
  all_projects BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can view user management list.';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    u.email::TEXT,
    p.full_name,
    p.role,
    p.status,
    p.phone,
    p."position",
    p.avatar_url,
    p.created_at,
    p.updated_at,
    COALESCE(
      ARRAY_AGG(upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL),
      ARRAY[]::UUID[]
    ) AS assigned_project_ids,
    (
      p.role = 'admin' OR 
      NOT EXISTS (SELECT 1 FROM public.user_project_assignments WHERE user_id = p.id)
    ) AS all_projects
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_project_assignments upa ON upa.user_id = p.id
  GROUP BY p.id, u.email, p.full_name, p.role, p.status, p.phone, p."position", p.avatar_url, p.created_at, p.updated_at
  ORDER BY p.created_at DESC;
END;
$$;

-- 6. RPC: admin_create_user
-- Atomic user creation: auth.users + profiles + user_project_assignments + audit_logs
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'staff',
  p_status TEXT DEFAULT 'active',
  p_phone TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_new_id UUID := gen_random_uuid();
  v_encrypted_pw TEXT;
  v_pid UUID;
BEGIN
  -- A. Authorization check
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can create users.';
  END IF;

  -- B. Input validation
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RAISE EXCEPTION 'Invalid Input: Email is required.';
  END IF;
  
  IF p_password IS NULL OR CHAR_LENGTH(p_password) < 6 THEN
    RAISE EXCEPTION 'Invalid Input: Password must be at least 6 characters.';
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RAISE EXCEPTION 'Invalid Input: Full name is required.';
  END IF;

  IF p_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Invalid Input: Role must be admin or staff.';
  END IF;

  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid Input: Status must be active or inactive.';
  END IF;

  -- C. Check for existing email in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
    RAISE EXCEPTION 'Duplicate Error: Email address % is already registered.', p_email;
  END IF;

  -- D. Encrypt password
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- E. Insert into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    '00000000-0000-0000-0000-000000000000',
    LOWER(TRIM(p_email)),
    v_encrypted_pw,
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'role', p_role),
    'authenticated',
    'authenticated',
    NOW(),
    NOW()
  );

  -- F. Update/Ensure Profile record
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    status,
    phone,
    "position",
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    TRIM(p_full_name),
    p_role,
    p_status,
    TRIM(p_phone),
    TRIM(p_position),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    phone = EXCLUDED.phone,
    "position" = EXCLUDED."position",
    updated_at = NOW();

  -- G. Assign projects if not all_projects
  IF NOT p_all_projects AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_project_ids LOOP
      INSERT INTO public.user_project_assignments (user_id, project_id, created_by)
      VALUES (v_new_id, v_pid, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- H. Audit log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    v_new_id,
    'USER_CREATED',
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'full_name', p_full_name,
      'role', p_role,
      'status', p_status,
      'all_projects', p_all_projects,
      'assigned_projects_count', COALESCE(ARRAY_LENGTH(p_project_ids, 1), 0)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_id,
    'message', 'User created successfully.'
  );
END;
$$;

-- 7. RPC: admin_update_user
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_target_id UUID,
  p_full_name TEXT,
  p_role TEXT,
  p_status TEXT,
  p_phone TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_count INTEGER;
  v_old_role TEXT;
  v_old_status TEXT;
  v_pid UUID;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can update users.';
  END IF;

  SELECT role, status INTO v_old_role, v_old_status
  FROM public.profiles
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target user profile does not exist.';
  END IF;

  -- Protection: Prevent demoting or deactivating the last remaining active admin
  IF (v_old_role = 'admin' AND (p_role != 'admin' OR p_status != 'active')) THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.profiles
    WHERE role = 'admin' AND status = 'active';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Security Protection: Cannot demote or deactivate the last remaining active Administrator account.';
    END IF;
  END IF;

  -- Update profiles
  UPDATE public.profiles
  SET 
    full_name = TRIM(p_full_name),
    role = p_role,
    status = p_status,
    phone = TRIM(p_phone),
    "position" = TRIM(p_position),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = NOW()
  WHERE id = p_target_id;

  -- Sync project assignments
  DELETE FROM public.user_project_assignments WHERE user_id = p_target_id;

  IF NOT p_all_projects AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_project_ids LOOP
      INSERT INTO public.user_project_assignments (user_id, project_id, created_by)
      VALUES (p_target_id, v_pid, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    p_target_id,
    'USER_UPDATED',
    jsonb_build_object(
      'full_name', p_full_name,
      'old_role', v_old_role,
      'new_role', p_role,
      'old_status', v_old_status,
      'new_status', p_status,
      'all_projects', p_all_projects
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'User profile updated successfully.');
END;
$$;

-- 8. RPC: admin_reset_user_password
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_target_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_encrypted_pw TEXT;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can reset user passwords.';
  END IF;

  IF p_new_password IS NULL OR CHAR_LENGTH(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Invalid Input: Password must be at least 6 characters long.';
  END IF;

  v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

  UPDATE auth.users
  SET 
    encrypted_password = v_encrypted_pw,
    updated_at = NOW()
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Auth user account not found.';
  END IF;

  -- Audit Log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    p_target_id,
    'PASSWORD_RESET_REQUESTED',
    jsonb_build_object('reset_by', auth.uid(), 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Password reset successfully.');
END;
$$;

-- 9. RPC: admin_toggle_user_status
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(
  p_target_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_count INTEGER;
  v_current_role TEXT;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can change account status.';
  END IF;

  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid Input: Status must be active or inactive.';
  END IF;

  SELECT role INTO v_current_role
  FROM public.profiles
  WHERE id = p_target_id;

  IF v_current_role = 'admin' AND p_status = 'inactive' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.profiles
    WHERE role = 'admin' AND status = 'active';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Security Protection: Cannot deactivate the last remaining active Administrator.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET status = p_status, updated_at = NOW()
  WHERE id = p_target_id;

  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    p_target_id,
    CASE WHEN p_status = 'active' THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    jsonb_build_object('new_status', p_status)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Account status updated successfully.');
END;
$$;

-- 10. ROW LEVEL SECURITY POLICIES

-- PROFILES
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Active profiles viewable by authenticated users" ON public.profiles;
CREATE POLICY "Active profiles viewable by authenticated users" ON public.profiles 
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Admins or self profile insert" ON public.profiles;
CREATE POLICY "Admins or self profile insert" ON public.profiles 
FOR INSERT WITH CHECK (auth.uid() = id OR public.is_active_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Admins or self profile update" ON public.profiles;
CREATE POLICY "Admins or self profile update" ON public.profiles 
FOR UPDATE USING (auth.uid() = id OR public.is_active_admin(auth.uid()));

-- USER_PROJECT_ASSIGNMENTS
DROP POLICY IF EXISTS "View user project assignments" ON public.user_project_assignments;
CREATE POLICY "View user project assignments" ON public.user_project_assignments 
FOR SELECT USING (
  user_id = auth.uid() OR public.is_active_admin(auth.uid())
);

DROP POLICY IF EXISTS "Manage user project assignments" ON public.user_project_assignments;
CREATE POLICY "Manage user project assignments" ON public.user_project_assignments 
FOR ALL USING (public.is_active_admin(auth.uid()));

-- AUDIT LOGS
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs 
FOR SELECT USING (public.is_active_admin(auth.uid()));

-- PROJECTS
DROP POLICY IF EXISTS "Projects are viewable by everyone." ON public.projects;
DROP POLICY IF EXISTS "Projects viewable by authorized users" ON public.projects;
CREATE POLICY "Projects viewable by authorized users" ON public.projects 
FOR SELECT USING (
  public.is_active_admin(auth.uid()) OR
  NOT EXISTS (SELECT 1 FROM public.user_project_assignments WHERE user_id = auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.user_project_assignments 
    WHERE user_id = auth.uid() AND project_id = projects.id
  )
);
