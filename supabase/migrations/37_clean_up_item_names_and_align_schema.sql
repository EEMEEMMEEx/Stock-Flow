-- =================================================================
-- MIGRATION 37: CLEAN UP ITEM NAMES & FIX CANONICAL FIELD MAPPING
-- =================================================================

-- 1. Ensure description, notes, and model exist on items table
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Move any remarks/notes that were mistakenly stored in name into description & notes columns
UPDATE public.items
SET 
  description = COALESCE(NULLIF(description, ''), NULLIF(name, '')),
  notes = COALESCE(NULLIF(notes, ''), NULLIF(name, ''))
WHERE name IN ('PARENT', 'CHILD') 
   OR (description IS NULL AND (
        name LIKE '%เก็บอยู่%' OR 
        name LIKE '%ใช้สำหรับ%' OR 
        name LIKE '%เหลือ%' OR 
        name LIKE '%ประกอบอยู่%' OR 
        name LIKE '%USO%'
      ));

-- 3. Restore canonical item name (name must be Item Name, NOT remark/note!)
UPDATE public.items
SET name = COALESCE(
  NULLIF(sku, ''),
  'รายการวัสดุ'
)
WHERE name IN ('PARENT', 'CHILD') 
   OR name LIKE '%เก็บอยู่%' 
   OR name LIKE '%ใช้สำหรับ%' 
   OR name LIKE '%เหลือ%' 
   OR name LIKE '%ประกอบอยู่%' 
   OR name LIKE '%USO%';
