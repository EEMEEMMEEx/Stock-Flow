-- ==============================================================================
-- 51_site_installation_kits_rpc.sql
-- Description: Master Site Installation BOM Templates & Real-Time Kit Availability RPC
-- Categories:
--   1. MW (Microwave): '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba'
--   2. BS (Base Station): '793d55c3-4750-42e1-a82e-438e7be131c8'
--   3. AGW (Analog Gateway): '3fb47021-6c65-4a4f-bca4-595280d9ba97'
--   4. Fixed Radio (ลูกข่ายประจำที่): '823af00d-99b0-4d9a-943b-0ae29bc83ff0'
-- ==============================================================================

-- 1. Create site_bom_templates table if not exists
CREATE TABLE IF NOT EXISTS public.site_bom_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    po_seq INT,
    part_number VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    qty_per_site NUMERIC NOT NULL DEFAULT 1,
    unit VARCHAR(50) DEFAULT 'ชิ้น',
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_bom_templates_cat ON public.site_bom_templates(category_id);

-- Enable RLS
ALTER TABLE public.site_bom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to site_bom_templates"
    ON public.site_bom_templates
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- 2. Seed Official BOM Templates
DELETE FROM public.site_bom_templates;

-- 2.1 MW (Microwave)
INSERT INTO public.site_bom_templates (category_id, po_seq, part_number, item_name, qty_per_site, unit, is_mandatory) VALUES
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 1, '30207-0024-04484', 'Optix RTN 320F OAU 2F DC ,SLGMSITE05', 1, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 2, '30207-0024-04485', 'SFP+ Optical Transceiver 9.8G 1310nm LC SM 1.4km', 1, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 3, '30207-0024-04486', 'OptiX RTN,PI-AC B22,power injector', 1, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 4, '30207-0024-04488', 'Microwave ODU,RTN XMC,7G,-3E, High', 2, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 5, '30207-0024-04487', 'Microwave ODU,RTN XMC,7G,-3E, Low', 2, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 6, '30207-0024-04490', 'Microwave Antenna, A7WD09MAC-3NX', 1, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 7, '30207-0024-04489', 'Microwave Antenna, A7WD06MAC-3NX', 1, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 8, '30207-0024-04497', 'Optical cable assembly  DLC/UPC-DLC/UPC , FDLCUPC10', 1, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 9, '30207-0024-04498', 'Coaxial Cable ,Copper-clad Aluminium Wire, RF', 3, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 10, '30207-0024-04499', 'Symmetry Twist Cable,100ohm,SFTP CAT5E,', 60, 'เมตร', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 11, '30207-0024-04500', 'Power Cable,600V/1000V,ROV-K, C6025BK01', 60, 'เมตร', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 12, '30207-0024-04501', 'Power Cable,300V/500V,60227 IEC 53, C25ELECBK', 60, 'เมตร', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 13, '30207-0024-04502', 'IF/ODU Installation Accessories(5D). IFODU-5D01', 2, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 14, '30207-0024-04503', 'RF Coaxial Connector At The Cable End,50ohm', 2, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 15, '30207-0024-04504', 'Cable Fixing Clip Set for GPS/Microwave', 1, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 16, '30207-0024-04505', 'Cable Fixing Clamp, 6 Runs, C-Type Bracket, Fixing', 50, 'ชิ้น', true),
('1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', 17, '30207-0024-04506', 'Ground Clip ,FEEDERCLB03, Huawei', 2, 'ชิ้น', true);

-- 2.2 BS (Base Station)
INSERT INTO public.site_bom_templates (category_id, po_seq, part_number, item_name, qty_per_site, unit, is_mandatory) VALUES
('793d55c3-4750-42e1-a82e-438e7be131c8', 1, '30207-0024-01718', 'TETRA DIB-R5 outdoor, 1 carrier', 1, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 2, '30207-0024-01720', 'Outdoor SPD /DC Lightning ZGZD40-18-48YM4', 1, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 3, '30207-0024-04413', 'TCT-GPS-SS3801  Portable Antenna B1+GPS', 1, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 4, '30207-0024-01725', 'Lightning arrester for feed line of GPS antenna, MHT-N5-2', 1, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 5, '30207-0024-04412', 'สายอากาศ SC-488-HF1LDF(D00)', 2, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 6, '30207-0024-01850', 'Jumper_7/16 _male-N_male, L=5m*', 2, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 7, '30207-0024-03155', 'Netsure 2100 A31-S1 (SFA)', 1, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 8, '30207-0024-03156', 'MODULE48VDC1000watt,R48-1000e3', 2, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 9, '30207-0024-04377', 'HEAT EXCHANGER 65W/K DC HEX', 2, 'ชิ้น', true),
('793d55c3-4750-42e1-a82e-438e7be131c8', 10, '30207-0024-04302', 'VISION_Lithium_Battery_48V_100AH', 1, 'ชิ้น', true);

-- 2.3 AGW (Analog Gateway)
INSERT INTO public.site_bom_templates (category_id, po_seq, part_number, item_name, qty_per_site, unit, is_mandatory) VALUES
('3fb47021-6c65-4a4f-bca4-595280d9ba97', 6, '30207-0024-04415', 'SC266-HF4LDF(D00)', 2, 'ชิ้น', true),
('3fb47021-6c65-4a4f-bca4-595280d9ba97', 1, '30207-0024-01848', 'Connector_N_male_for_LCF12', 4, 'ชิ้น', true),
('3fb47021-6c65-4a4f-bca4-595280d9ba97', 2, '30207-0024-01849', 'Lightning_arrestor,NF-NF', 2, 'ชิ้น', true),
('3fb47021-6c65-4a4f-bca4-595280d9ba97', 5, '30207-0024-01907', 'Jumper_7/16_male-N_female,L=3m', 2, 'ชิ้น', true),
('3fb47021-6c65-4a4f-bca4-595280d9ba97', 6, '30207-0024-01908', 'Grounding_kit_for_1/2"_cable', 2, 'ชิ้น', true);

-- 2.4 Fixed Radio (ลูกข่ายประจำที่)
INSERT INTO public.site_bom_templates (category_id, po_seq, part_number, item_name, qty_per_site, unit, is_mandatory) VALUES
('823af00d-99b0-4d9a-943b-0ae29bc83ff0', 1, '30207-0024-01774', 'MT680 Plus (S)', 1, 'ชิ้น', true),
('823af00d-99b0-4d9a-943b-0ae29bc83ff0', 2, '30207-0024-01779', 'SY406-SF1SNF(ABK)', 1, 'ชิ้น', true),
('823af00d-99b0-4d9a-943b-0ae29bc83ff0', 3, '30207-0024-04358', 'TDB_Series_12V_50Ah_(LWH:230x138x213)mm.', 1, 'ชิ้น', true),
('823af00d-99b0-4d9a-943b-0ae29bc83ff0', 4, '30207-0024-01848', 'Connector_N_male_for_LCF12', 2, 'ชิ้น', true),
('823af00d-99b0-4d9a-943b-0ae29bc83ff0', 5, '30207-0024-01849', 'Lightning_arrestor,NF-NF', 1, 'ชิ้น', true),
('823af00d-99b0-4d9a-943b-0ae29bc83ff0', 7, '30207-0024-01908', 'Grounding_kit_for_1/2"_cable', 1, 'ชิ้น', true),
('823af00d-99b0-4d9a-943b-0ae29bc83ff0', 8, '30207-0024-04417', 'SC459-SF1LNF(D00)', 2, 'ชิ้น', true);

-- 3. Stored Procedure / RPC Function
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
    v_missing INT;
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
                    SELECT COALESCE(SUM(balance), 0)
                    INTO v_stock
                    FROM public.stock_balance
                    WHERE item_id = v_bom_row.matched_item_id
                      AND project_id = p_project_id;
                ELSE
                    SELECT COALESCE(SUM(balance), 0)
                    INTO v_stock
                    FROM public.stock_balance
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

        -- Extract Bottlenecks
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
