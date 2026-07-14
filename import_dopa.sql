
-- =================================================================
-- AUTO-GENERATED IMPORT SCRIPT FOR DOPA PROJECT
-- =================================================================

-- 1. Create the Project
DO $$
DECLARE
    v_project_id UUID;
    v_item_id UUID;
BEGIN
    -- Create Project
    INSERT INTO public.projects (name, description, location)
    VALUES ('DOPA (USO SHF)', 'ID คือ 25310-9999', 'คลัง Forth')
    RETURNING id INTO v_project_id;
    

    -- Item: สายอากาศ SC-488-SF1LDF(D00)
    INSERT INTO public.items (name, description, unit)
    VALUES ('สายอากาศ SC-488-SF1LDF(D00)', 'Sinclar | หมายเหตุ: USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: สายอากาศ SC-45A-SF1LDF(D00)
    INSERT INTO public.items (name, description, unit)
    VALUES ('สายอากาศ SC-45A-SF1LDF(D00)', 'Sinclar | หมายเหตุ: USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: สายอากาศ SC-489-SF1LNF(D00)
    INSERT INTO public.items (name, description, unit)
    VALUES ('สายอากาศ SC-489-SF1LNF(D00)', 'Sinclar', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 4, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: สายอากาศ Yagi 406-SF1SNF (ABK)
    INSERT INTO public.items (name, description, unit)
    VALUES ('สายอากาศ Yagi 406-SF1SNF (ABK)', 'Sinclar', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 12, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: ขารองตู้ประเภทติดตั้งภายใน
    INSERT INTO public.items (name, description, unit)
    VALUES ('ขารองตู้ประเภทติดตั้งภายใน', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 12, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: ขาวางสายอากาศ
    INSERT INTO public.items (name, description, unit)
    VALUES ('ขาวางสายอากาศ', 'หมายเหตุ: ใช้สำหรับเก็บสายอากาศในคลัง', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 22, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: ตู้ชุดDMO-GW+ขาตั้ง (ตั้งนอกอาคาร)
    INSERT INTO public.items (name, description, unit)
    VALUES ('ตู้ชุดDMO-GW+ขาตั้ง (ตั้งนอกอาคาร)', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 7, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: - Support ขายึด SC-489 (2ชุด/1ตู้)
    INSERT INTO public.items (name, description, unit)
    VALUES ('- Support ขายึด SC-489 (2ชุด/1ตู้)', 'หมายเหตุ: ประกอบอยู่ในตู้แล้ว', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 3, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: DC Power (1,000m.)
    INSERT INTO public.items (name, description, unit)
    VALUES ('DC Power (1,000m.)', 'หมายเหตุ: เหลือ 1,545 เมตร (เก็บไว้ที่คลังโรงสี)', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: CellFlex cable 1/2"* (500m.)
    INSERT INTO public.items (name, description, unit)
    VALUES ('CellFlex cable 1/2"* (500m.)', 'หมายเหตุ: เหลือ 3,330 เมตร  (เก็บไว้ที่คลังโรงสี)  USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 7, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Auxiliary materials BS (อุปกรณ์เสริม BS )
    INSERT INTO public.items (name, description, unit)
    VALUES ('Auxiliary materials BS (อุปกรณ์เสริม BS )', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 22, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: mounting Myset 50cm.+pipe 60cm.
    INSERT INTO public.items (name, description, unit)
    VALUES ('mounting Myset 50cm.+pipe 60cm.', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Pipeกลม 2 1/2" 60 CM. ลูกข่าย
    INSERT INTO public.items (name, description, unit)
    VALUES ('Pipeกลม 2 1/2" 60 CM. ลูกข่าย', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 5, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: X-Clamp
    INSERT INTO public.items (name, description, unit)
    VALUES ('X-Clamp', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 4, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: HE-3KS S/N 2207320369A0001
    INSERT INTO public.items (name, description, unit)
    VALUES ('HE-3KS S/N 2207320369A0001', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Batterry Bank HE-3KS S/N 2207320369A001
    INSERT INTO public.items (name, description, unit)
    VALUES ('Batterry Bank HE-3KS S/N 2207320369A001', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: 3K UPS Support
    INSERT INTO public.items (name, description, unit)
    VALUES ('3K UPS Support', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: PT580 Plus F5
    INSERT INTO public.items (name, description, unit)
    VALUES ('PT580 Plus F5', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    -- Item: - Battery (BL1806) สำรอง
    INSERT INTO public.items (name, description, unit)
    VALUES ('- Battery (BL1806) สำรอง', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 12, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: - Charger(CH10A07)
    INSERT INTO public.items (name, description, unit)
    VALUES ('- Charger(CH10A07)', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    -- Item: MT680 Plus (S) F5
    INSERT INTO public.items (name, description, unit)
    VALUES ('MT680 Plus (S) F5', 'Hytera | หมายเหตุ: (การ์ดเสียซ่อมไม่ได้)', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 6, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: - SM09D2 External Speaker (5m Cabl)
    INSERT INTO public.items (name, description, unit)
    VALUES ('- SM09D2 External Speaker (5m Cabl)', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 6, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: - SM10A1 Desktop Microphone
    INSERT INTO public.items (name, description, unit)
    VALUES ('- SM10A1 Desktop Microphone', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 6, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: PC90 สายโปรแกรมเครื่องลูกข่ายมือถือ
    INSERT INTO public.items (name, description, unit)
    VALUES ('PC90 สายโปรแกรมเครื่องลูกข่ายมือถือ', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 34, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: PC64 สายโปรแกรมเครื่องลูกข่ายมือถือ
    INSERT INTO public.items (name, description, unit)
    VALUES ('PC64 สายโปรแกรมเครื่องลูกข่ายมือถือ', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: PC35 สายโปรแกรมหน้าเครื่องลูกข่าย Fixed
    INSERT INTO public.items (name, description, unit)
    VALUES ('PC35 สายโปรแกรมหน้าเครื่องลูกข่าย Fixed', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 33, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: PC47 สายโปรแกรมหลังเครื่องลูกข่าย Fixed
    INSERT INTO public.items (name, description, unit)
    VALUES ('PC47 สายโปรแกรมหลังเครื่องลูกข่าย Fixed', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 6, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: PUS Cable for VPUC
    INSERT INTO public.items (name, description, unit)
    VALUES ('PUS Cable for VPUC', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Lightning Arrestors Ground Bar 1 ช่อง
    INSERT INTO public.items (name, description, unit)
    VALUES ('Lightning Arrestors Ground Bar 1 ช่อง', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 28, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Lightning Arrestors Ground Bar 4 ช่อง
    INSERT INTO public.items (name, description, unit)
    VALUES ('Lightning Arrestors Ground Bar 4 ช่อง', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Ligthning Arrester NM-NF
    INSERT INTO public.items (name, description, unit)
    VALUES ('Ligthning Arrester NM-NF', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 10, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Lightning_arrestor,NF-NF
    INSERT INTO public.items (name, description, unit)
    VALUES ('Lightning_arrestor,NF-NF', 'หมายเหตุ: เก็บอยู่ในตู้ DMO 5 เส้น USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 5, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Grounding_kit_for_1/2"_cable
    INSERT INTO public.items (name, description, unit)
    VALUES ('Grounding_kit_for_1/2"_cable', 'Comsolution', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 6, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Grounding_kit_for_7/8"_cable
    INSERT INTO public.items (name, description, unit)
    VALUES ('Grounding_kit_for_7/8"_cable', 'Comsolution | หมายเหตุ: เก็บอยู่ในตู้ DMO 6 เส้น USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 22, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Connector_N_male_for_LCF12
    INSERT INTO public.items (name, description, unit)
    VALUES ('Connector_N_male_for_LCF12', 'Comsolution | หมายเหตุ: เก็บอยู่ในตู้ DMO 5 เส้น USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 5, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Arrester ZGTT8-18N-20M
    INSERT INTO public.items (name, description, unit)
    VALUES ('Arrester ZGTT8-18N-20M', 'Comsolution', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 13, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_N_male-N_male,L=3m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_N_male-N_male,L=3m*', 'Comsolution | หมายเหตุ: เก็บอยู่ในตู้ DMO 5 เส้น USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 18, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_N_male-N_female,L=3m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_N_male-N_female,L=3m*', 'Comsolution | หมายเหตุ: เก็บอยู่ในตู้ DMO 5 เส้น USO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 53, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_N_male-N_male,L=5m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_N_male-N_male,L=5m*', 'Comsolution', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 13, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_N_male-N_male,L=7m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_N_male-N_male,L=7m*', 'Comsolution | หมายเหตุ: Sub con 1', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 3, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_N_male-N_male,L=10m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_N_male-N_male,L=10m*', 'Comsolution', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 11, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_N_male-N_male,L=15m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_N_male-N_male,L=15m*', 'Comsolution', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_7/16 _male-N_male, L=5m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_7/16 _male-N_male, L=5m*', 'Comsolution', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 10, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Jumper_7/16 _male-N_male, L=10m*
    INSERT INTO public.items (name, description, unit)
    VALUES ('Jumper_7/16 _male-N_male, L=10m*', 'Comsolution | หมายเหตุ: Sub con 2', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 3, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: ขายึดลูกถ้วยแดง
    INSERT INTO public.items (name, description, unit)
    VALUES ('ขายึดลูกถ้วยแดง', 'หมายเหตุ: ไฟฟ้า 196', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    -- Item: จุกแบตเตอรี่ (ดำแดง)
    INSERT INTO public.items (name, description, unit)
    VALUES ('จุกแบตเตอรี่ (ดำแดง)', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 26, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Surge Protector Stabil AC 1P (MODEL:TC1D25FH)
    INSERT INTO public.items (name, description, unit)
    VALUES ('Surge Protector Stabil AC 1P (MODEL:TC1D25FH)', 'Stabil | หมายเหตุ: (SP USO 23 รง.) ไฟฟ้า 240', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 23, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Surge Protector Stabil (MODEL:A2P1L8M1) (3 รูปคลื่น)
    INSERT INTO public.items (name, description, unit)
    VALUES ('Surge Protector Stabil (MODEL:A2P1L8M1) (3 รูปคลื่น)', 'Stabil', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 13, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker 16A1P H7-16A1P
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker 16A1P H7-16A1P', 'HACO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 20, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker NDM1-63 C10
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker NDM1-63 C10', 'NADER', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 29, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker H7-32A/2C2P
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker H7-32A/2C2P', 'HACO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker ABB SH201 C201P
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker ABB SH201 C201P', 'ABB', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 144, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker 20A2P
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker 20A2P', 'HACO', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 4, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker C20A 1p
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker C20A 1p', 'Schneider', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker C60a 1p
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker C60a 1p', 'Schneider', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 4, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Breaker C60N 2p
    INSERT INTO public.items (name, description, unit)
    VALUES ('Breaker C60N 2p', 'Schneider', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Router H3C (Router AC ไม่ตรงสเปค)
    INSERT INTO public.items (name, description, unit)
    VALUES ('Router H3C (Router AC ไม่ตรงสเปค)', 'H3C', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 5, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Router H3C
    INSERT INTO public.items (name, description, unit)
    VALUES ('Router H3C', 'H3C', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Netsure
    INSERT INTO public.items (name, description, unit)
    VALUES ('Netsure', 'Vertiv', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Controller
    INSERT INTO public.items (name, description, unit)
    VALUES ('Controller', 'Vertiv', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Module Rectifier 1
    INSERT INTO public.items (name, description, unit)
    VALUES ('Module Rectifier 1', 'Vertiv', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: SFP1.25G DDMI 1310nm 10km(sm)
    INSERT INTO public.items (name, description, unit)
    VALUES ('SFP1.25G DDMI 1310nm 10km(sm)', 'Interlink', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 11, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Patch Cord - LC - LC  2m.
    INSERT INTO public.items (name, description, unit)
    VALUES ('Patch Cord - LC - LC  2m.', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 6, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Patch Cord - FC - LC 5m.
    INSERT INTO public.items (name, description, unit)
    VALUES ('Patch Cord - FC - LC 5m.', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 56, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Patch Cord - LC - LC Connector
    INSERT INTO public.items (name, description, unit)
    VALUES ('Patch Cord - LC - LC Connector', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 3, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: MMBC-5M-NC (Jumper+ขาตั้ง Ant ติดรถยนต์)
    INSERT INTO public.items (name, description, unit)
    VALUES ('MMBC-5M-NC (Jumper+ขาตั้ง Ant ติดรถยนต์)', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Car Smart Invertor 200W
    INSERT INTO public.items (name, description, unit)
    VALUES ('Car Smart Invertor 200W', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 13, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: เสาอากาศติดรถยรต์ย่าน 800 model TQC-900BII
    INSERT INTO public.items (name, description, unit)
    VALUES ('เสาอากาศติดรถยรต์ย่าน 800 model TQC-900BII', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 8, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Antenna UHF + Magnetic สำหรับติดหลังคารถ
    INSERT INTO public.items (name, description, unit)
    VALUES ('Antenna UHF + Magnetic สำหรับติดหลังคารถ', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 3, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Car Kits CK02
    INSERT INTO public.items (name, description, unit)
    VALUES ('Car Kits CK02', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 18, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Body Camera
    INSERT INTO public.items (name, description, unit)
    VALUES ('Body Camera', 'Hytera', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 12, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: FORTH Meter
    INSERT INTO public.items (name, description, unit)
    VALUES ('FORTH Meter', 'FORTH', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 12, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: H3C PSR65OALSQM1AC650
    INSERT INTO public.items (name, description, unit)
    VALUES ('H3C PSR65OALSQM1AC650', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Switch H3CS7503e-m 24 portGE 4*10 GE
    INSERT INTO public.items (name, description, unit)
    VALUES ('Switch H3CS7503e-m 24 portGE 4*10 GE', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Chassis L3Switch (H3C 57503E-M)
    INSERT INTO public.items (name, description, unit)
    VALUES ('Chassis L3Switch (H3C 57503E-M)', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: IPPBX-X6(2.1)
    INSERT INTO public.items (name, description, unit)
    VALUES ('IPPBX-X6(2.1)', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Tetra Sw PV
    INSERT INTO public.items (name, description, unit)
    VALUES ('Tetra Sw PV', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: RoseReplicator for Hytera (window)
    INSERT INTO public.items (name, description, unit)
    VALUES ('RoseReplicator for Hytera (window)', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: TETRA DVRS BASIC package+disc DVD
    INSERT INTO public.items (name, description, unit)
    VALUES ('TETRA DVRS BASIC package+disc DVD', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Hytera Solution Series CD
    INSERT INTO public.items (name, description, unit)
    VALUES ('Hytera Solution Series CD', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: EOL Multi-media Speaker DELL AX210 20 1.2W Black
    INSERT INTO public.items (name, description, unit)
    VALUES ('EOL Multi-media Speaker DELL AX210 20 1.2W Black', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Headset USB Adapter
    INSERT INTO public.items (name, description, unit)
    VALUES ('Headset USB Adapter', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 15, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: เครื่องมือวัด BIRD
    INSERT INTO public.items (name, description, unit)
    VALUES ('เครื่องมือวัด BIRD', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Dummy Load Bird 100 Watts
    INSERT INTO public.items (name, description, unit)
    VALUES ('Dummy Load Bird 100 Watts', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Dummy Load Bird 75 Watts
    INSERT INTO public.items (name, description, unit)
    VALUES ('Dummy Load Bird 75 Watts', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Dummy Load Bird 5 Watts
    INSERT INTO public.items (name, description, unit)
    VALUES ('Dummy Load Bird 5 Watts', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Adapter + Optical Mouse
    INSERT INTO public.items (name, description, unit)
    VALUES ('Adapter + Optical Mouse', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: PT580 + Charger (เสีย)
    INSERT INTO public.items (name, description, unit)
    VALUES ('PT580 + Charger (เสีย)', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Switching Adapter 19 V. 3.42 A.
    INSERT INTO public.items (name, description, unit)
    VALUES ('Switching Adapter 19 V. 3.42 A.', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Antenna RFI CD 29-14817400
    INSERT INTO public.items (name, description, unit)
    VALUES ('Antenna RFI CD 29-14817400', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Magnetic Mounting M110 BNC
    INSERT INTO public.items (name, description, unit)
    VALUES ('Magnetic Mounting M110 BNC', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 17, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Magnetic Mounting MMBC-5M-NC
    INSERT INTO public.items (name, description, unit)
    VALUES ('Magnetic Mounting MMBC-5M-NC', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 1, 'ยอดยกมาจากการ Import CSV');
    
    -- Item: Link Clampling BNC
    INSERT INTO public.items (name, description, unit)
    VALUES ('Link Clampling BNC', '', 'ชิ้น')
    RETURNING id INTO v_item_id;
    
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, 2, 'ยอดยกมาจากการ Import CSV');
    
END $$;
