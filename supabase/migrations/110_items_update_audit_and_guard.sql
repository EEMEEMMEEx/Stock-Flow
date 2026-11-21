-- =============================================================================
-- Migration 110: Guard public.items against placeholder name/unit + Audit Log
-- =============================================================================
-- Why:
--   Prevent overwriting public.items.name / public.items.unit with empty or
--   placeholder values (e.g. "-"), ensure updated_at is always maintained, and
--   record an append-only ITEM_UPDATED entry in public.audit_logs on updates
--   (client-side direct inserts into audit_logs are denied by RLS).
--
-- Reversibility:
--   DROP TRIGGER IF EXISTS trg_items_audit_after_update ON public.items;
--   DROP TRIGGER IF EXISTS trg_items_guard_before_update ON public.items;
--   DROP FUNCTION IF EXISTS public.audit_items_after_update();
--   DROP FUNCTION IF EXISTS public.guard_items_before_update();
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_items_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_unit TEXT;
BEGIN
  v_name := BTRIM(COALESCE(NEW.name, ''));
  v_unit := BTRIM(COALESCE(NEW.unit, ''));

  IF v_name = '' OR v_name ~ '^[\s\-–—_./?]+$' THEN
    RAISE EXCEPTION 'Item name cannot be empty or a placeholder such as "-"'
      USING ERRCODE = '23514';
  END IF;

  IF v_unit = '' OR v_unit ~ '^[\s\-–—_./?]+$' THEN
    RAISE EXCEPTION 'Item unit cannot be empty or a placeholder such as "-"'
      USING ERRCODE = '23514';
  END IF;

  NEW.name := v_name;
  NEW.unit := v_unit;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_guard_before_update ON public.items;
CREATE TRIGGER trg_items_guard_before_update
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_items_before_update();

CREATE OR REPLACE FUNCTION public.audit_items_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
BEGIN
  IF OLD.name IS NOT DISTINCT FROM NEW.name
     AND OLD.unit IS NOT DISTINCT FROM NEW.unit
     AND OLD.sku IS NOT DISTINCT FROM NEW.sku
     AND OLD.model IS NOT DISTINCT FROM NEW.model
     AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id
     AND OLD.source IS NOT DISTINCT FROM NEW.source
     AND OLD.vendor IS NOT DISTINCT FROM NEW.vendor
     AND OLD.description IS NOT DISTINCT FROM NEW.description
     AND OLD.image_url IS NOT DISTINCT FROM NEW.image_url THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor_id := auth.uid();
  IF v_actor_id IS NOT NULL THEN
    SELECT p.role INTO v_actor_role
    FROM public.profiles p
    WHERE p.id = v_actor_id;
  END IF;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    action_type,
    target_table,
    target_id,
    details
  )
  VALUES (
    v_actor_id,
    v_actor_role,
    'ITEM_UPDATED',
    'ITEM_UPDATED',
    'items',
    NEW.id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'name', OLD.name,
        'unit', OLD.unit,
        'sku', OLD.sku,
        'model', OLD.model,
        'category_id', OLD.category_id,
        'source', OLD.source,
        'vendor', OLD.vendor,
        'description', OLD.description,
        'image_url', OLD.image_url
      ),
      'after', jsonb_build_object(
        'name', NEW.name,
        'unit', NEW.unit,
        'sku', NEW.sku,
        'model', NEW.model,
        'category_id', NEW.category_id,
        'source', NEW.source,
        'vendor', NEW.vendor,
        'description', NEW.description,
        'image_url', NEW.image_url
      )
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_audit_after_update ON public.items;
CREATE TRIGGER trg_items_audit_after_update
  AFTER UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_items_after_update();

COMMIT;
