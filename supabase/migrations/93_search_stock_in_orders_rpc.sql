-- ==============================================================================
-- MIGRATION 93: Search Stock-In Orders RPC with GIN Trigram Indexes
-- ==============================================================================
-- 1. Create B-Tree and GIN Trigram Indexes to accelerate Thai/English search:
--    - idx_stock_in_items_item_id on stock_in_items(item_id)
--    - idx_stock_in_orders_created_at on stock_in_orders(created_at DESC)
--    - idx_stock_in_orders_project_id on stock_in_orders(project_id)
--    - idx_items_search_trgm on items USING gin (name, sku, model)
--    - idx_profiles_name_trgm on profiles USING gin (full_name)
-- 2. Define public.search_stock_in_orders(TEXT, UUID, INT, INT)
--    - Matches SKU, item name, model, description, serial/part number in line items
--    - Matches receiver name, PO, supplier, warehouse name/code in header
--    - Guarantees 0 duplicate parent rows via EXISTS subqueries
--    - Returns matched_items_snippet to highlight matching items under warehouse
--    - Returns total_count for server-side pagination
--    - Strictly enforces SECURITY DEFINER and auth.uid() check
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ------------------------------------------------------------------------------
-- 1. INDEX OPTIMIZATIONS
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_stock_in_items_item_id ON public.stock_in_items(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_order_id ON public.stock_in_items(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_orders_created_at ON public.stock_in_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_in_orders_project_id ON public.stock_in_orders(project_id);

CREATE INDEX IF NOT EXISTS idx_items_search_trgm 
ON public.items USING gin (name extensions.gin_trgm_ops, sku extensions.gin_trgm_ops, model extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm 
ON public.profiles USING gin (full_name extensions.gin_trgm_ops);

-- ------------------------------------------------------------------------------
-- 2. SEARCH RPC DEFINITION
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.search_stock_in_orders(TEXT, UUID, INT, INT);

CREATE OR REPLACE FUNCTION public.search_stock_in_orders(
  p_search TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  project_name TEXT,
  project_code TEXT,
  project_location TEXT,
  project_description TEXT,
  supplier TEXT,
  po_number TEXT,
  notes TEXT,
  received_date DATE,
  created_by UUID,
  received_by_name TEXT,
  created_at TIMESTAMPTZ,
  matched_items_snippet TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_search TEXT := NULLIF(TRIM(p_search), '');
  v_tokens TEXT[];
  v_token_count INT := 0;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF v_search IS NOT NULL THEN
    SELECT ARRAY_AGG(tok)
    INTO v_tokens
    FROM (
      SELECT TRIM(tok) AS tok
      FROM unnest(string_to_array(v_search, ' ')) AS tok
      WHERE length(TRIM(tok)) > 0
    ) s;
    v_token_count := COALESCE(array_length(v_tokens, 1), 0);
  END IF;

  RETURN QUERY
  SELECT
    sio.id,
    sio.project_id,
    p.name::TEXT AS project_name,
    p.project_code::TEXT,
    p.location::TEXT AS project_location,
    p.description::TEXT AS project_description,
    sio.supplier::TEXT,
    sio.po_number::TEXT,
    sio.notes::TEXT,
    sio.received_date,
    sio.created_by,
    prof.full_name::TEXT AS received_by_name,
    sio.created_at,
    CASE 
      WHEN v_search IS NOT NULL THEN (
        SELECT string_agg(DISTINCT COALESCE(i.name, sii.model, i.sku, sii.part_number)::TEXT, ', ')
        FROM public.stock_in_items sii
        JOIN public.items i ON i.id = sii.item_id
        WHERE sii.order_id = sio.id
          AND (
            i.sku ILIKE ('%' || v_search || '%')
            OR i.name ILIKE ('%' || v_search || '%')
            OR i.model ILIKE ('%' || v_search || '%')
            OR i.description ILIKE ('%' || v_search || '%')
            OR sii.serial_number ILIKE ('%' || v_search || '%')
            OR sii.part_number ILIKE ('%' || v_search || '%')
            OR (
              v_token_count > 0 AND EXISTS (
                SELECT 1 FROM unnest(v_tokens) AS t(tok)
                WHERE i.sku ILIKE ('%' || t.tok || '%')
                   OR i.name ILIKE ('%' || t.tok || '%')
                   OR i.model ILIKE ('%' || t.tok || '%')
                   OR i.description ILIKE ('%' || t.tok || '%')
                   OR sii.serial_number ILIKE ('%' || t.tok || '%')
                   OR sii.part_number ILIKE ('%' || t.tok || '%')
              )
            )
          )
      )
      ELSE NULL
    END AS matched_items_snippet,
    COUNT(*) OVER() AS total_count
  FROM public.stock_in_orders sio
  LEFT JOIN public.projects p ON p.id = sio.project_id
  LEFT JOIN public.profiles prof ON prof.id = sio.created_by
  WHERE
    (p_project_id IS NULL OR sio.project_id = p_project_id)
    AND (
      v_search IS NULL
      OR prof.full_name ILIKE ('%' || v_search || '%')
      OR sio.po_number ILIKE ('%' || v_search || '%')
      OR sio.supplier ILIKE ('%' || v_search || '%')
      OR sio.notes ILIKE ('%' || v_search || '%')
      OR p.name ILIKE ('%' || v_search || '%')
      OR p.project_code ILIKE ('%' || v_search || '%')
      OR EXISTS (
        SELECT 1
        FROM public.stock_in_items sii
        JOIN public.items i ON i.id = sii.item_id
        WHERE sii.order_id = sio.id
          AND (
            i.sku ILIKE ('%' || v_search || '%')
            OR i.name ILIKE ('%' || v_search || '%')
            OR i.model ILIKE ('%' || v_search || '%')
            OR i.description ILIKE ('%' || v_search || '%')
            OR sii.serial_number ILIKE ('%' || v_search || '%')
            OR sii.part_number ILIKE ('%' || v_search || '%')
          )
      )
      OR (
        v_token_count > 1 AND NOT EXISTS (
          SELECT 1
          FROM unnest(v_tokens) AS t(tok)
          WHERE NOT (
            prof.full_name ILIKE ('%' || t.tok || '%')
            OR sio.po_number ILIKE ('%' || t.tok || '%')
            OR sio.supplier ILIKE ('%' || t.tok || '%')
            OR sio.notes ILIKE ('%' || t.tok || '%')
            OR p.name ILIKE ('%' || t.tok || '%')
            OR p.project_code ILIKE ('%' || t.tok || '%')
            OR EXISTS (
              SELECT 1 FROM public.stock_in_items sii2
              JOIN public.items i2 ON i2.id = sii2.item_id
              WHERE sii2.order_id = sio.id
                AND (
                  i2.sku ILIKE ('%' || t.tok || '%')
                  OR i2.name ILIKE ('%' || t.tok || '%')
                  OR i2.model ILIKE ('%' || t.tok || '%')
                  OR i2.description ILIKE ('%' || t.tok || '%')
                  OR sii2.serial_number ILIKE ('%' || t.tok || '%')
                  OR sii2.part_number ILIKE ('%' || t.tok || '%')
                )
            )
          )
        )
      )
    )
  ORDER BY sio.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_stock_in_orders(TEXT, UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_stock_in_orders(TEXT, UUID, INT, INT) TO service_role;

COMMIT;
