-- ============================================================================
-- Migration 63: Align Site Kit BOM authorization with the application RBAC model
--
-- The original BOM policies and RPC only recognized the legacy ADMIN role.
-- The application also authorizes active SUPER users and users with the
-- roles.manage_permissions or items.update permissions.
-- ============================================================================

-- Keep this helper bound to the authenticated caller. It intentionally does
-- not accept an arbitrary user id so it cannot be used to authorize another
-- account from a client session.
CREATE OR REPLACE FUNCTION public.can_manage_site_bom()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.is_super_admin(v_caller_id)
    OR public.has_permission(v_caller_id, 'roles.manage_permissions')
    OR public.has_permission(v_caller_id, 'items.update');
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_site_bom() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_site_bom() TO authenticated, service_role;

-- Direct table writes remain restricted to the same authorized application
-- users. The RPC below remains the normal atomic write path.
DROP POLICY IF EXISTS "Allow admin modify site_bom_templates" ON public.site_bom_templates;
DROP POLICY IF EXISTS "Allow admin insert site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin insert site_bom_templates"
  ON public.site_bom_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_site_bom());

DROP POLICY IF EXISTS "Allow admin update site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin update site_bom_templates"
  ON public.site_bom_templates FOR UPDATE
  TO authenticated
  USING (public.can_manage_site_bom())
  WITH CHECK (public.can_manage_site_bom());

DROP POLICY IF EXISTS "Allow admin delete site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin delete site_bom_templates"
  ON public.site_bom_templates FOR DELETE
  TO authenticated
  USING (public.can_manage_site_bom());

-- Keep the existing atomic replacement behavior, but use the same
-- authorization predicate as the table policies and the UI.
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
  v_caller_id UUID := auth.uid();
  v_item JSONB;
  v_count INT := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated';
  END IF;

  IF NOT public.can_manage_site_bom() THEN
    RAISE EXCEPTION 'Forbidden: Only authorized administrators can modify Site Kit BOM templates';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Category not found with ID: %', p_category_id;
  END IF;

  DELETE FROM public.site_bom_templates
  WHERE category_id = p_category_id;

  IF p_bom_items IS NOT NULL AND jsonb_typeof(p_bom_items) = 'array'
     AND jsonb_array_length(p_bom_items) > 0 THEN
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
        CASE
          WHEN NULLIF(v_item->>'item_id', '') IS NOT NULL
            THEN (v_item->>'item_id')::UUID
          ELSE NULL
        END,
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
  ELSIF p_bom_items IS NOT NULL AND jsonb_typeof(p_bom_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid BOM items: expected a JSON array';
  END IF;

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
    -- Audit logging must not make an authorized BOM replacement fail.
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'category_id', p_category_id,
    'inserted_count', v_count,
    'message', 'Category BOM updated successfully'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_category_bom(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_category_bom(UUID, JSONB) TO authenticated, service_role;
