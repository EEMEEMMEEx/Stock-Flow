-- ==============================================================================
-- Migration 53: Editable BOM Selection with RBAC & Backend Security Enforcement
-- Description:
--   1. Ensures public.site_bom_templates exists with item_id foreign key, category_id,
--      po_seq, part_number, item_name, qty_per_site, unit, is_mandatory, notes, and updated_at.
--   2. Strict Row-Level Security (RLS):
--      - SELECT: Available for all authenticated and anon users (read-only for non-admin).
--      - INSERT, UPDATE, DELETE: Strictly restricted to users with role = 'admin' in profiles table.
--   3. Atomic Admin RPC admin_save_category_bom for secure single-transaction replacement.
-- ==============================================================================

-- 1. Create or alter site_bom_templates table
CREATE TABLE IF NOT EXISTS public.site_bom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  po_seq INT DEFAULT 1,
  part_number VARCHAR(100),
  item_name VARCHAR(255) NOT NULL,
  qty_per_site NUMERIC NOT NULL DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'ชิ้น',
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure item_id column exists if table was created previously without it
ALTER TABLE public.site_bom_templates ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.items(id) ON DELETE SET NULL;
ALTER TABLE public.site_bom_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for high-performance category queries
CREATE INDEX IF NOT EXISTS idx_site_bom_templates_cat ON public.site_bom_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_site_bom_templates_item ON public.site_bom_templates(item_id);

-- 2. Row Level Security (RLS) Configuration
ALTER TABLE public.site_bom_templates ENABLE ROW LEVEL SECURITY;

-- 2.1 SELECT Policy: Public/Read access for everyone (non-admins get read-only)
DROP POLICY IF EXISTS "Allow read access to site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow read access to site_bom_templates"
  ON public.site_bom_templates FOR SELECT
  TO authenticated, anon
  USING (true);

-- 2.2 INSERT Policy: Admins only
DROP POLICY IF EXISTS "Allow admin insert site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin insert site_bom_templates"
  ON public.site_bom_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
        AND (LOWER(role) = 'admin' OR role_id IN (SELECT id FROM public.roles WHERE code = 'ADMIN' OR LOWER(name) = 'admin'))
    )
  );

-- 2.3 UPDATE Policy: Admins only
DROP POLICY IF EXISTS "Allow admin update site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin update site_bom_templates"
  ON public.site_bom_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
        AND (LOWER(role) = 'admin' OR role_id IN (SELECT id FROM public.roles WHERE code = 'ADMIN' OR LOWER(name) = 'admin'))
    )
  );

-- 2.4 DELETE Policy: Admins only
DROP POLICY IF EXISTS "Allow admin delete site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin delete site_bom_templates"
  ON public.site_bom_templates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
        AND (LOWER(role) = 'admin' OR role_id IN (SELECT id FROM public.roles WHERE code = 'ADMIN' OR LOWER(name) = 'admin'))
    )
  );

-- 3. Atomic Database RPC: admin_save_category_bom
-- Performs permission check and atomically updates the BOM items for a category
CREATE OR REPLACE FUNCTION public.admin_save_category_bom(
  p_category_id UUID,
  p_bom_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN := FALSE;
  v_item JSONB;
  v_count INT := 0;
BEGIN
  -- Verify calling user authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated';
  END IF;

  -- Verify Admin Role via profiles / roles table
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id
      AND (LOWER(role) = 'admin' OR role_id IN (SELECT id FROM public.roles WHERE code = 'ADMIN' OR LOWER(name) = 'admin'))
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can modify Site Kit BOM templates';
  END IF;

  -- Ensure target category exists
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Category not found with ID: %', p_category_id;
  END IF;

  -- Delete existing BOM rows for this category
  DELETE FROM public.site_bom_templates WHERE category_id = p_category_id;

  -- Insert new BOM rows if provided
  IF p_bom_items IS NOT NULL AND jsonb_array_length(p_bom_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_bom_items)
    LOOP
      INSERT INTO public.site_bom_templates (
        category_id,
        item_id,
        po_seq,
        part_number,
        item_name,
        qty_per_site,
        unit,
        is_mandatory,
        notes,
        created_at,
        updated_at
      ) VALUES (
        p_category_id,
        CASE WHEN (v_item->>'item_id') IS NOT NULL AND (v_item->>'item_id') <> '' THEN (v_item->>'item_id')::UUID ELSE NULL END,
        COALESCE((v_item->>'po_seq')::INT, v_count + 1),
        NULLIF(TRIM(v_item->>'part_number'), ''),
        COALESCE(NULLIF(TRIM(v_item->>'item_name'), ''), 'Unnamed BOM Item'),
        COALESCE((v_item->>'qty_per_site')::NUMERIC, 1),
        COALESCE(NULLIF(TRIM(v_item->>'unit'), ''), 'ชิ้น'),
        COALESCE((v_item->>'is_mandatory')::BOOLEAN, TRUE),
        NULLIF(TRIM(v_item->>'notes'), ''),
        NOW(),
        NOW()
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  -- Record audit log if audit_logs table exists
  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_caller_id,
        'update_category_bom',
        jsonb_build_object(
          'category_id', p_category_id,
          'item_count', v_count,
          'timestamp', NOW()
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Silently ignore audit log failure so main operation succeeds
  END;

  RETURN jsonb_build_object(
    'success', true,
    'category_id', p_category_id,
    'inserted_count', v_count,
    'message', 'Category BOM updated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_category_bom(UUID, JSONB) TO authenticated;
