-- ==============================================================================
-- BASELINE 02: Dynamic RBAC, Profiles, User Management & Admin RPCs
-- ==============================================================================

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'User',
  role TEXT NOT NULL DEFAULT 'operator',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  phone TEXT,
  department TEXT,
  "position" TEXT,
  avatar_url TEXT,
  all_projects BOOLEAN DEFAULT TRUE,
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IS NOT NULL AND length(trim(role)) > 0);

-- 2. RBAC Tables
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.user_project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (status);
CREATE INDEX IF NOT EXISTS idx_user_project_assignments_user ON public.user_project_assignments (user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_id, created_at DESC);

-- 4. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "User self update profile" ON public.profiles;
CREATE POLICY "User self update profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Roles read" ON public.roles;
CREATE POLICY "Roles read" ON public.roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permissions read" ON public.permissions;
CREATE POLICY "Permissions read" ON public.permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Role permissions read" ON public.role_permissions;
CREATE POLICY "Role permissions read" ON public.role_permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "User roles read" ON public.user_roles;
CREATE POLICY "User roles read" ON public.user_roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "User project assignments read" ON public.user_project_assignments;
CREATE POLICY "User project assignments read" ON public.user_project_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Audit logs admin read" ON public.audit_logs;
CREATE POLICY "Audit logs admin read" ON public.audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 6. Hardened Admin RPCs (SET search_path = public, auth, extensions, pg_temp)

-- admin_get_users
CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  phone TEXT,
  department TEXT,
  "position" TEXT,
  avatar_url TEXT,
  must_change_password BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  assigned_project_ids UUID[],
  all_projects BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(u.email::TEXT, '') AS email,
    COALESCE(p.full_name, 'User') AS full_name,
    COALESCE(p.role, 'operator') AS role,
    COALESCE(p.status, 'active') AS status,
    p.phone,
    p.department,
    p."position",
    p.avatar_url,
    COALESCE(p.must_change_password, FALSE) AS must_change_password,
    p.created_at,
    p.updated_at,
    COALESCE(ARRAY_AGG(upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL), ARRAY[]::UUID[]) AS assigned_project_ids,
    COALESCE(p.all_projects, p.role = 'admin', TRUE) AS all_projects
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_project_assignments upa ON upa.user_id = p.id
  GROUP BY p.id, u.email, p.full_name, p.role, p.status, p.phone, p.department, p."position", p.avatar_url, p.must_change_password, p.created_at, p.updated_at, p.all_projects
  ORDER BY p.created_at DESC;
END;
$$;

-- admin_create_user
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_phone TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_calling_role TEXT;
  v_new_id UUID;
  v_effective_pw TEXT;
  v_encrypted_pw TEXT;
  v_proj_id UUID;
  v_role_clean TEXT;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  SELECT LOWER(role) INTO v_calling_role
  FROM public.profiles
  WHERE id = v_calling_user_id;

  IF v_calling_role IS NULL OR v_calling_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. Admin role required.');
  END IF;

  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email is required.');
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Full name is required.');
  END IF;

  v_role_clean := LOWER(TRIM(COALESCE(p_role, 'operator')));
  IF v_role_clean = 'staff' THEN
    v_role_clean := 'operator';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email address is already in use.');
  END IF;

  IF p_password IS NOT NULL AND TRIM(p_password) != '' THEN
    v_effective_pw := TRIM(p_password);
  ELSE
    v_effective_pw := 'F0rth2026@dtrs';
  END IF;

  v_new_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(v_effective_pw, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, reauthentication_token, email_change,
    raw_app_meta_data, raw_user_meta_data, aud, role, is_sso_user, is_anonymous, created_at, updated_at
  ) VALUES (
    v_new_id, '00000000-0000-0000-0000-000000000000', LOWER(TRIM(p_email)), v_encrypted_pw, NOW(),
    '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', TRIM(p_full_name), 'role', v_role_clean),
    'authenticated', 'authenticated', false, false, NOW(), NOW()
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_new_id, v_new_id, jsonb_build_object('sub', v_new_id::text, 'email', LOWER(TRIM(p_email))),
    'email', v_new_id::text, NOW(), NOW(), NOW()
  );

  INSERT INTO public.profiles (
    id, full_name, role, phone, department, position, status, all_projects, must_change_password, created_at, updated_at
  ) VALUES (
    v_new_id, TRIM(p_full_name), v_role_clean, p_phone, p_department, p_position, 'active', COALESCE(p_all_projects, TRUE), TRUE, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    status = EXCLUDED.status,
    all_projects = EXCLUDED.all_projects,
    must_change_password = EXCLUDED.must_change_password,
    updated_at = NOW();

  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND array_length(p_project_ids, 1) > 0 THEN
    FOREACH v_proj_id IN ARRAY p_project_ids LOOP
      INSERT INTO public.user_project_assignments (user_id, project_id, created_by)
      VALUES (v_new_id, v_proj_id, v_calling_user_id)
      ON CONFLICT (user_id, project_id) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    v_calling_user_id, v_new_id, 'USER_CREATED',
    jsonb_build_object('email', LOWER(TRIM(p_email)), 'role', v_role_clean, 'full_name', TRIM(p_full_name))
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_new_id, 'message', 'User created successfully.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) TO authenticated, service_role;
