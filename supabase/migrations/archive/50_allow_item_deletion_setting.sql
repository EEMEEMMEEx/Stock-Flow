-- =================================================================
-- MIGRATION 50: ITEM DELETION TOGGLE SYSTEM SETTING
-- =================================================================
-- Purpose:
-- Seeds 'allow_item_deletion' into public.system_settings table under 'inventory' category.
-- Allows system administrators to toggle whether the "Delete Item" action button is enabled/visible.

INSERT INTO public.system_settings (key, value, category, description)
VALUES (
  'allow_item_deletion',
  'true'::jsonb,
  'inventory',
  'อนุญาตให้แสดงปุ่มและดำเนินการลบรายการวัสดุ (Enable Item Deletion Button)'
)
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;
