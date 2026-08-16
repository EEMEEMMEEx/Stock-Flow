-- Migration 43: Atomic Project Stock Transfer & Permanent Deletion RPC
-- Allows transferring remaining inventory from projects/locations before permanently deleting

CREATE OR REPLACE FUNCTION public.transfer_and_delete_project(
  p_source_project_ids UUID[],
  p_dest_project_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_id UUID;
  v_dest_name TEXT;
  v_dest_code TEXT;
  v_source_name TEXT;
  v_source_code TEXT;
  v_stock_record RECORD;
  v_transfer_order_id UUID;
  v_items_transferred INTEGER := 0;
  v_total_units_transferred NUMERIC := 0;
BEGIN
  -- 1. Validate destination project if provided
  IF p_dest_project_id IS NOT NULL THEN
    SELECT name, project_code INTO v_dest_name, v_dest_code
    FROM public.projects
    WHERE id = p_dest_project_id;

    IF v_dest_name IS NULL THEN
      RAISE EXCEPTION 'Destination project not found';
    END IF;
  END IF;

  -- 2. Loop through each source project to transfer stock and delete
  FOREACH v_source_id IN ARRAY p_source_project_ids LOOP
    SELECT name, project_code INTO v_source_name, v_source_code
    FROM public.projects
    WHERE id = v_source_id;

    -- Find all items with positive balance in source project
    FOR v_stock_record IN (
      SELECT item_id, balance, item_name
      FROM public.stock_balance
      WHERE project_id = v_source_id AND balance > 0
    ) LOOP
      IF p_dest_project_id IS NULL THEN
        RAISE EXCEPTION 'Project "%" still has % units of "%" in stock. Please select a destination project to transfer.',
          v_source_name, v_stock_record.balance, v_stock_record.item_name;
      END IF;

      -- If we haven't created a stock_in_order for this destination, create one
      IF v_transfer_order_id IS NULL THEN
        INSERT INTO public.stock_in_orders (
          project_id,
          created_by,
          received_date,
          notes
        ) VALUES (
          p_dest_project_id,
          p_actor_id,
          CURRENT_DATE,
          'รับโอนสต็อกอัตโนมัติจากการลบโครงการ: ' || COALESCE(v_source_name, '')
        ) RETURNING id INTO v_transfer_order_id;
      END IF;

      -- Insert into stock_in_items for destination project
      INSERT INTO public.stock_in_items (
        order_id,
        item_id,
        quantity,
        notes
      ) VALUES (
        v_transfer_order_id,
        v_stock_record.item_id,
        v_stock_record.balance,
        'โอนมาจากโครงการ: ' || COALESCE(v_source_name, '')
      );

      -- Record stock_out transaction on source project
      INSERT INTO public.stock_transactions (
        project_id,
        item_id,
        quantity,
        transaction_type,
        created_by
      ) VALUES (
        v_source_id,
        v_stock_record.item_id,
        v_stock_record.balance,
        'stock_out',
        p_actor_id
      );

      v_items_transferred := v_items_transferred + 1;
      v_total_units_transferred := v_total_units_transferred + v_stock_record.balance;
    END LOOP;

    -- 3. Clean up / Reassign all Foreign Key relationships pointing to this project
    IF p_dest_project_id IS NOT NULL THEN
      -- Reassign history to destination project
      UPDATE public.stock_in_orders SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      UPDATE public.withdrawal_orders SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      UPDATE public.stock_transactions SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_entries') THEN
        UPDATE public.stock_entries SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawals') THEN
        UPDATE public.withdrawals SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_notifications') THEN
        UPDATE public.user_notifications SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      END IF;
    ELSE
      -- If no destination project (0 stock), delete transaction/order references for this project
      DELETE FROM public.stock_transactions WHERE project_id = v_source_id;
      DELETE FROM public.withdrawal_orders WHERE project_id = v_source_id;
      DELETE FROM public.stock_in_orders WHERE project_id = v_source_id;
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_entries') THEN
        DELETE FROM public.stock_entries WHERE project_id = v_source_id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawals') THEN
        DELETE FROM public.withdrawals WHERE project_id = v_source_id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_notifications') THEN
        DELETE FROM public.user_notifications WHERE project_id = v_source_id;
      END IF;
    END IF;

    -- Clean up user project assignments
    DELETE FROM public.user_project_assignments WHERE project_id = v_source_id;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_projects') THEN
      DELETE FROM public.user_projects WHERE project_id = v_source_id;
    END IF;

    -- 4. Permanently Delete from projects table
    DELETE FROM public.projects WHERE id = v_source_id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'items_transferred', v_items_transferred,
    'units_transferred', v_total_units_transferred,
    'message', 'ลบโครงการและโอนย้ายสต็อกเรียบร้อยแล้ว'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_and_delete_project(UUID[], UUID, UUID) TO authenticated;
