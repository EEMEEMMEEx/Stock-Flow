-- ==============================================================================
-- BASELINE 04: Site Installation Kits BOM & Reporting RPCs
-- ==============================================================================

-- 1. Site BOM Templates Table
CREATE TABLE IF NOT EXISTS public.site_bom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  po_seq INT,
  part_number VARCHAR(100),
  item_name VARCHAR(255) NOT NULL,
  qty_per_site NUMERIC NOT NULL DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'ชิ้น',
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_bom_templates_cat ON public.site_bom_templates(category_id);

-- 2. RLS Policies
ALTER TABLE public.site_bom_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow read access to site_bom_templates"
  ON public.site_bom_templates FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow admin modify site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin modify site_bom_templates"
  ON public.site_bom_templates FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. High-Performance Site Installation Kits RPC (SET search_path = public, pg_temp)
CREATE OR REPLACE FUNCTION public.get_site_installation_kits_availability(p_project_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_categories RECORD;
    v_category_list JSONB := '[]'::JSONB;
    v_cat_obj JSONB;
    v_items JSONB;
    v_min_sets INT;
    v_bottlenecks JSONB;
    v_bottleneck_details JSONB;
    v_bom_row RECORD;
    v_stock NUMERIC;
    v_possible INT;
BEGIN
    FOR v_categories IN 
        SELECT c.id, c.name, c.description
        FROM public.categories c
        WHERE c.id IN (
            '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', -- MW
            '793d55c3-4750-42e1-a82e-438e7be131c8', -- BS
            '3fb47021-6c65-4a4f-bca4-595280d9ba97', -- AGW
            '823af00d-99b0-4d9a-943b-0ae29bc83ff0'  -- Fixed Radio
        )
        ORDER BY 
            CASE c.id
                WHEN '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba' THEN 1
                WHEN '793d55c3-4750-42e1-a82e-438e7be131c8' THEN 2
                WHEN '3fb47021-6c65-4a4f-bca4-595280d9ba97' THEN 3
                WHEN '823af00d-99b0-4d9a-943b-0ae29bc83ff0' THEN 4
                ELSE 5
            END
    LOOP
        v_min_sets := 999999;
        v_items := '[]'::JSONB;
        v_bottlenecks := '[]'::JSONB;
        v_bottleneck_details := '[]'::JSONB;

        FOR v_bom_row IN 
            SELECT b.*,
                   i.id AS matched_item_id,
                   i.name AS matched_item_name
            FROM public.site_bom_templates b
            LEFT JOIN LATERAL (
                SELECT id, name
                FROM public.items it
                WHERE it.category_id = v_categories.id
                  AND (
                      LOWER(it.name) LIKE '%' || LOWER(b.item_name) || '%'
                      OR LOWER(b.item_name) LIKE '%' || LOWER(it.name) || '%'
                      OR (b.part_number IS NOT NULL AND it.name LIKE '%' || b.part_number || '%')
                      OR (b.item_name ILIKE '%Yagi%' AND it.name ILIKE '%406-SF1SNF%')
                      OR (b.item_name ILIKE '%MT680%' AND it.name ILIKE '%MT680%')
                      OR (b.item_name ILIKE '%SC459%' AND it.name ILIKE '%SC459%')
                      OR (b.item_name ILIKE '%SC266%' AND it.name ILIKE '%SC266%')
                  )
                LIMIT 1
            ) i ON true
            WHERE b.category_id = v_categories.id
            ORDER BY b.po_seq
        LOOP
            IF v_bom_row.matched_item_id IS NOT NULL THEN
                IF p_project_id IS NOT NULL THEN
                    SELECT COALESCE(SUM(quantity), 0)
                    INTO v_stock
                    FROM public.stock_transactions
                    WHERE item_id = v_bom_row.matched_item_id
                      AND project_id = p_project_id;
                ELSE
                    SELECT COALESCE(SUM(quantity), 0)
                    INTO v_stock
                    FROM public.stock_transactions
                    WHERE item_id = v_bom_row.matched_item_id;
                END IF;
            ELSE
                v_stock := 0;
            END IF;

            v_possible := FLOOR(COALESCE(v_stock, 0) / v_bom_row.qty_per_site);
            IF v_bom_row.is_mandatory AND v_possible < v_min_sets THEN
                v_min_sets := v_possible;
            END IF;

            v_items := v_items || jsonb_build_object(
                'po_seq', v_bom_row.po_seq,
                'part_number', v_bom_row.part_number,
                'bom_name', v_bom_row.item_name,
                'db_matched_name', COALESCE(v_bom_row.matched_item_name, '(ยังไม่พบในระบบ)'),
                'qty_per_site', v_bom_row.qty_per_site,
                'unit', v_bom_row.unit,
                'total_stock', v_stock,
                'sets_possible', v_possible,
                'is_mandatory', v_bom_row.is_mandatory
            );
        END LOOP;

        IF v_min_sets = 999999 THEN
            v_min_sets := 0;
        END IF;

        SELECT 
            jsonb_agg(elem->>'bom_name'),
            jsonb_agg(
                (elem->>'bom_name') || ' (คงเหลือ: ' || (elem->>'total_stock') || ', ใช้: ' || (elem->>'qty_per_site') || ' ' || (elem->>'unit') || '/ไซต์)'
            )
        INTO v_bottlenecks, v_bottleneck_details
        FROM jsonb_array_elements(v_items) elem
        WHERE (elem->>'sets_possible')::INT = v_min_sets
          AND (elem->>'is_mandatory')::BOOLEAN = true;

        v_cat_obj := jsonb_build_object(
            'category_id', v_categories.id,
            'category_name', 
                CASE v_categories.id
                    WHEN '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba' THEN 'MW (Microwave)'
                    WHEN '793d55c3-4750-42e1-a82e-438e7be131c8' THEN 'BS (Base Station)'
                    WHEN '3fb47021-6c65-4a4f-bca4-595280d9ba97' THEN 'AGW (Analog Gateway)'
                    WHEN '823af00d-99b0-4d9a-943b-0ae29bc83ff0' THEN 'Fixed Radio (ลูกข่ายประจำที่)'
                    ELSE v_categories.name
                END,
            'complete_sets', v_min_sets,
            'bottlenecks', COALESCE(v_bottlenecks, '[]'::JSONB),
            'bottleneck_details', COALESCE(v_bottleneck_details, '[]'::JSONB),
            'total_items_in_bom', jsonb_array_length(v_items),
            'items', v_items
        );

        v_category_list := v_category_list || v_cat_obj;
    END LOOP;

    RETURN jsonb_build_object('summary_kpi', v_category_list);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_installation_kits_availability(UUID) TO authenticated, anon, service_role;
