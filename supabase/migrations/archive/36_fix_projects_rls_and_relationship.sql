-- =================================================================
-- MIGRATION 36: FIX PROJECTS RLS POLICIES & DISAMBIGUATE RELATIONSHIPS
-- =================================================================

-- 1. Enable RLS on public.projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing conflicting/incomplete policies on public.projects
DROP POLICY IF EXISTS "Projects are viewable by everyone." ON public.projects;
DROP POLICY IF EXISTS "Projects viewable by authorized users" ON public.projects;
DROP POLICY IF EXISTS "Only admins can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Only admins can update projects" ON public.projects;
DROP POLICY IF EXISTS "Only admins can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;

-- 3. Comprehensive SELECT policy for public.projects
CREATE POLICY "Projects viewable by authorized users" ON public.projects
FOR SELECT USING (
  public.is_active_admin(auth.uid()) OR
  NOT EXISTS (SELECT 1 FROM public.user_project_assignments WHERE user_id = auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.user_project_assignments
    WHERE user_id = auth.uid() AND project_id = projects.id
  )
);

-- 4. INSERT policy for public.projects
CREATE POLICY "Admins can insert projects" ON public.projects
FOR INSERT WITH CHECK (
  public.is_active_admin(auth.uid())
);

-- 5. UPDATE policy for public.projects
CREATE POLICY "Admins can update projects" ON public.projects
FOR UPDATE USING (
  public.is_active_admin(auth.uid()) OR
  auth.uid() = created_by OR
  auth.uid() = owner_id
);

-- 6. DELETE policy for public.projects
CREATE POLICY "Admins can delete projects" ON public.projects
FOR DELETE USING (
  public.is_active_admin(auth.uid())
);
