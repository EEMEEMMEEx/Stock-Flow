-- ==============================================================================
-- Migration 88: Complete SUPER Permissions RBAC Audit, Automated Safeguards,
--               and Server-Side RLS / RPC Alignment
-- ==============================================================================
-- Summary:
--   1. Inserts 17 new granular permissions into public.permissions (catalog: 59 total).
--   2. Restores items.transfer + backfills all 17 new permissions into public.role_permissions
--      for the SUPER role (SUPER bound count: 59 / 59).
--   3. Installs DB triggers:
--      - trg_auto_grant_permission_to_super: Automatically binds any future inserted
--        permission in public.permissions to the SUPER role.
--      - trg_prevent_super_permission_removal: Blocks DELETE operations on SUPER's
--        role_permissions rows while the permission exists in public.permissions.
--   4. Hardens admin_save_role_permissions RPC:
--      - When saving for SUPER, automatically synchronizes and guarantees 100% of
--        catalog permissions without running DELETE (preventing accidental wipeout).
--      - When saving for other roles, strips SUPER-only permissions (system.revert_actions).
--   5. Updates operational RPCs:
--      - process_item_transfer: Aligns permission check to inventory.transfer OR
--        items.transfer OR inventory.manage.
--      - reject_checkout_order: Supports checkouts.reject OR checkouts.approve.
--      - super_cancel_checkout_order: Requires checkouts.cancel OR is_super_admin.
--      - super_cancel_withdrawal_order: Requires withdrawals.cancel OR is_super_admin.
--      - resolve_damaged_return_item: Supports checkouts.resolve_repair OR checkouts.return.
--      - is_checkout_delegate: Supports checkouts.update.
--      - get_site_installation_kits_availability: Enforces inventory.view OR items.view.
--   6. Hardens RLS policies:
--      - audit_logs: Allows SELECT to users with system.audit_log.view.
--      - stock_in_orders & stock_in_items: UPDATE requires stock_in.update OR stock_in.cancel;
--        DELETE requires stock_in.delete.
--      - checkout_orders & checkout_items: DELETE requires checkouts.delete.
--      - withdrawal_orders & withdrawal_items: DELETE requires withdrawals.delete.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. INSERT 17 NEW GRANULAR PERMISSIONS INTO public.permissions
-- ------------------------------------------------------------------------------

INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES
  -- 1. Users: Permanent Deletion (High Risk, SUPER only)
  (
    'users.delete',
    'ลบผู้ใช้งานถาวร',
    'ลบบัญชีผู้ใช้งานและข้อมูลที่เกี่ยวข้องออกจากระบบอย่างถาวร (เฉพาะ SUPER)',
    'users',
    'delete',
    'User Management'
  ),
  -- 2. Users: Comprehensive Management (High Risk, SUPER only)
  (
    'users.manage',
    'จัดการผู้ใช้งานทั้งหมด',
    'สิทธิ์รวมสำหรับการบริหารจัดการบัญชีผู้ใช้ สถานะ และการตั้งค่ารหัสผ่านเริ่มต้น',
    'users',
    'manage',
    'User Management'
  ),
  -- 3. Checkouts: Rejection (Medium Risk)
  (
    'checkouts.reject',
    'ปฏิเสธคำขอยืมพัสดุ',
    'ปฏิเสธคำขอยืมพัสดุที่รออนุมัติพร้อมระบุเหตุผล',
    'checkouts',
    'reject',
    'Checkouts & Returns'
  ),
  -- 4. Checkouts: Cancellation / Void (High Risk, SUPER only)
  (
    'checkouts.cancel',
    'ยกเลิกใบยืมพัสดุ (Void/Cancel)',
    'ยกเลิกใบยืมพัสดุและคืนยอดสต็อกที่ค้างยืมเข้าคลังอัตโนมัติพร้อมบันทึก Audit Log',
    'checkouts',
    'cancel',
    'Checkouts & Returns'
  ),
  -- 5. Checkouts: Update & Delegation (Medium Risk)
  (
    'checkouts.update',
    'แก้ไขรายการยืมและยืมแทนผู้อื่น',
    'แก้ไขข้อมูลการยืม ขยายวันส่งคืน และระบุชื่อผู้ยืมแทนพนักงานอื่นหรือบุคคลภายนอก',
    'checkouts',
    'update',
    'Checkouts & Returns'
  ),
  -- 6. Checkouts: Database Deletion (High Risk, SUPER only)
  (
    'checkouts.delete',
    'ลบข้อมูลการยืมพัสดุ',
    'ลบรายการใบยืมพัสดุในระดับฐานข้อมูล (สงวนไว้เฉพาะผู้ดูแลระบบสูงสุด)',
    'checkouts',
    'delete',
    'Checkouts & Returns'
  ),
  -- 7. Checkouts: Resolve Damaged / Scrapped Return (High Risk)
  (
    'checkouts.resolve_repair',
    'จัดการผลซ่อมและแทงจำหน่ายพัสดุชำรุด',
    'บันทึกผลการซ่อมพัสดุที่รับคืนสภาพชำรุด/สูญหาย (คืนเข้าคลัง แยกอะไหล่ หรือแทงจำหน่าย)',
    'checkouts',
    'resolve_repair',
    'Checkouts & Returns'
  ),
  -- 8. Withdrawals: Cancellation / Void (High Risk, SUPER only)
  (
    'withdrawals.cancel',
    'ยกเลิกใบเบิกวัสดุ (Void/Cancel)',
    'ยกเลิกใบเบิกวัสดุและคืนยอดสต็อกที่ตัดไปแล้วกลับเข้าคลังอัตโนมัติพร้อมบันทึก Audit Log',
    'withdrawals',
    'cancel',
    'Withdrawals'
  ),
  -- 9. Withdrawals: Update & View All Projects (Medium Risk)
  (
    'withdrawals.update',
    'แก้ไขรายการขอเบิกวัสดุ',
    'แก้ไขรายละเอียดคำขอเบิกวัสดุและดูรายการขอเบิกของทุกโครงการ/ผู้ใช้งาน',
    'withdrawals',
    'update',
    'Withdrawals'
  ),
  -- 10. Withdrawals: Database Deletion (High Risk, SUPER only)
  (
    'withdrawals.delete',
    'ลบข้อมูลใบเบิกวัสดุ',
    'ลบรายการใบเบิกวัสดุในระดับฐานข้อมูล (สงวนไว้เฉพาะผู้ดูแลระบบสูงสุด)',
    'withdrawals',
    'delete',
    'Withdrawals'
  ),
  -- 11. Stock In: Update Order / Items (Medium Risk)
  (
    'stock_in.update',
    'แก้ไขรายการรับเข้า Stock',
    'แก้ไขข้อมูลเอกสารรับวัสดุเข้าคลัง (stock_in_orders / stock_in_items)',
    'stock_in',
    'update',
    'Stock In'
  ),
  -- 12. Stock In: Cancel Order (High Risk, SUPER only)
  (
    'stock_in.cancel',
    'ยกเลิกรายการรับเข้า Stock',
    'ยกเลิกเอกสารรับวัสดุเข้าคลังและปรับปรุงยอดสต็อกย้อนกลับ',
    'stock_in',
    'cancel',
    'Stock In'
  ),
  -- 13. Stock In: Database Deletion (High Risk, SUPER only)
  (
    'stock_in.delete',
    'ลบรายการรับเข้า Stock',
    'ลบเอกสารรับวัสดุเข้าคลังในระดับฐานข้อมูล (สงวนไว้เฉพาะผู้ดูแลระบบสูงสุด)',
    'stock_in',
    'delete',
    'Stock In'
  ),
  -- 14. Inventory: Warehouse & Multi-Project Stock View (Low Risk)
  (
    'inventory.view',
    'ดูยอดสต็อกคงเหลือแยกตามคลัง/โครงการ',
    'ดูยอดสต็อกคงเหลือ (stock_balance) และความพร้อมใช้งานของชุดติดตั้ง (Site Kits) แยกตามคลังสินค้าและโครงการ',
    'inventory',
    'view',
    'Inventory Operations'
  ),
  -- 15. System: Audit Log View (High Risk, SUPER only)
  (
    'system.audit_log.view',
    'ดูบันทึกประวัติการตรวจสอบระบบ (Audit Log)',
    'เข้าถึงและตรวจสอบบันทึก Audit Log ของระบบและประวัติการย้อนสถานะธุรกรรม',
    'system',
    'audit_log.view',
    'Role Management'
  ),
  -- 16. System: Backup & Snapshot (High Risk, SUPER only)
  (
    'system.backup',
    'สำรองและกู้คืนข้อมูลการตั้งค่าระบบ',
    'สำรองข้อมูลและดาวน์โหลดข้อมูล snapshot การตั้งค่าระบบ (เฉพาะ SUPER)',
    'system',
    'backup',
    'Settings'
  ),
  -- 17. System: Bulk Import / Export (High Risk, SUPER only)
  (
    'system.import_export',
    'นำเข้าและส่งออกข้อมูลระบบ (CSV/Backup)',
    'นำเข้าข้อมูลแบบกลุ่ม (CSV Import) และส่งออกข้อมูลตารางหลักในระบบ',
    'system',
    'import_export',
    'Settings'
  )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    category = EXCLUDED.category;

-- ------------------------------------------------------------------------------
-- 2. BACKFILL ALL PERMISSIONS FOR THE SUPER ROLE (59 PERMISSIONS BOUND)
-- ------------------------------------------------------------------------------

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE UPPER(TRIM(r.code)) = 'SUPER'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. AUTOMATED DB SAFEGUARDS: TRIGGERS FOR SUPER ROLE PERMISSIONS
-- ------------------------------------------------------------------------------

-- 3.1 Trigger function: Auto-grant any new permission to SUPER role
CREATE OR REPLACE FUNCTION public.fn_auto_grant_permission_to_super()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_super_role_id UUID;
BEGIN
  SELECT id INTO v_super_role_id
  FROM public.roles
  WHERE UPPER(TRIM(code)) = 'SUPER';

  IF v_super_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (v_super_role_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_grant_permission_to_super ON public.permissions;
CREATE TRIGGER trg_auto_grant_permission_to_super
AFTER INSERT ON public.permissions
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_grant_permission_to_super();

-- 3.2 Trigger function: Prevent removing permissions from SUPER role
CREATE OR REPLACE FUNCTION public.fn_prevent_super_permission_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_super_role_id UUID;
BEGIN
  SELECT id INTO v_super_role_id
  FROM public.roles
  WHERE UPPER(TRIM(code)) = 'SUPER';

  IF OLD.role_id = v_super_role_id THEN
    -- If the permission still exists in the catalog, forbid deleting it from SUPER
    IF EXISTS (SELECT 1 FROM public.permissions WHERE id = OLD.permission_id) THEN
      RAISE EXCEPTION 'Restricted: Cannot remove permissions from the SUPER (System Administrator) role.';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_super_permission_removal ON public.role_permissions;
CREATE TRIGGER trg_prevent_super_permission_removal
BEFORE DELETE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_super_permission_removal();

-- ------------------------------------------------------------------------------
-- 4. HARDEN admin_save_role_permissions RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_save_role_permissions(
  p_role_id UUID,
  p_permission_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_permission_ids UUID[];
  v_pid UUID;
  v_role_code TEXT;
  v_revert_perm_id UUID;
  v_total_catalog_count INT;
  v_governed_ids UUID[] := ARRAY[]::UUID[];
  v_existing_governed_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.manage_permissions')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.manage_permissions permission.';
  END IF;

  SELECT UPPER(TRIM(code)) INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  -- Special handling for SUPER role:
  -- SUPER permanently retains 100% of all permissions. Do not execute DELETE!
  IF v_role_code = 'SUPER' THEN
    IF NOT public.is_super_admin(v_caller_id) THEN
      RAISE EXCEPTION 'Permission Denied: Only Super Admin can inspect or synchronize SUPER role permissions.';
    END IF;

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT p_role_id, p.id
    FROM public.permissions p
    ON CONFLICT DO NOTHING;

    SELECT COUNT(*) INTO v_total_catalog_count FROM public.permissions;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'SUPER role permissions are permanently locked and synchronized with catalog.',
      'permissions_count', v_total_catalog_count
    );
  END IF;

  -- For non-SUPER roles:
  v_permission_ids := COALESCE(p_permission_ids, ARRAY[]::UUID[]);
  v_permission_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(v_permission_ids) AS t(x) WHERE x IS NOT NULL
  );

  -- Always strip system.revert_actions from non-SUPER roles (strictly SUPER-only)
  SELECT id INTO v_revert_perm_id
  FROM public.permissions
  WHERE code = 'system.revert_actions';

  IF v_revert_perm_id IS NOT NULL THEN
    v_permission_ids := array_remove(v_permission_ids, v_revert_perm_id);
  END IF;

  -- Delegation Guard: The 17 newly audited SUPER permissions can ONLY be delegated/configured by SUPER.
  -- Non-SUPER callers cannot grant new governed permissions to any role, nor can they revoke
  -- governed permissions previously granted by a SUPER administrator.
  IF NOT public.is_super_admin(v_caller_id) THEN
    SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[]) INTO v_governed_ids
    FROM public.permissions
    WHERE code = ANY(ARRAY[
      'users.delete', 'users.manage',
      'checkouts.reject', 'checkouts.cancel', 'checkouts.update', 'checkouts.delete', 'checkouts.resolve_repair',
      'withdrawals.cancel', 'withdrawals.update', 'withdrawals.delete',
      'stock_in.update', 'stock_in.cancel', 'stock_in.delete',
      'inventory.view',
      'system.audit_log.view', 'system.backup', 'system.import_export'
    ]);

    SELECT COALESCE(ARRAY_AGG(permission_id), ARRAY[]::UUID[]) INTO v_existing_governed_ids
    FROM public.role_permissions
    WHERE role_id = p_role_id
      AND permission_id = ANY(v_governed_ids);

    -- Keep non-governed permissions submitted by caller + preserve existing governed permissions
    v_permission_ids := ARRAY(
      SELECT DISTINCT x FROM (
        SELECT x FROM unnest(v_permission_ids) AS t(x) WHERE NOT (x = ANY(v_governed_ids))
        UNION
        SELECT x FROM unnest(v_existing_governed_ids) AS t(x)
      ) u WHERE x IS NOT NULL
    );
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  IF ARRAY_LENGTH(v_permission_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY v_permission_ids LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (p_role_id, v_pid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_caller_id,
        'ROLE_PERMISSION_CHANGED',
        jsonb_build_object(
          'role_id', p_role_id,
          'role_code', v_role_code,
          'permissions_count', COALESCE(ARRAY_LENGTH(v_permission_ids, 1), 0)
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN jsonb_build_object('success', true, 'message', 'Role permissions updated successfully.');
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. OPERATIONAL RPC PERMISSION ALIGNMENT
-- ------------------------------------------------------------------------------

-- 5.1 process_item_transfer: Fix check to support inventory.transfer OR items.transfer OR inventory.manage
DROP FUNCTION IF EXISTS public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.process_item_transfer(
  p_source_project_id UUID,
  p_dest_project_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor AND NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Actor ID mismatch.';
  END IF;

  IF NOT (
    public.is_super_admin(v_actor)
    OR public.has_permission(v_actor, 'inventory.transfer')
    OR public.has_permission(v_actor, 'items.transfer')
    OR public.has_permission(v_actor, 'inventory.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.transfer, items.transfer, or inventory.manage permission.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid transfer quantity: %', p_quantity;
  END IF;

  INSERT INTO public.stock_transactions (
    item_id, project_id, transaction_type, quantity, notes, created_by, reference_type
  ) VALUES (
    p_item_id, p_source_project_id, 'TRANSFER', -p_quantity,
    COALESCE(p_notes, 'Transfer out to Project: ' || p_dest_project_id::text), v_actor, 'project_transfer'
  );

  INSERT INTO public.stock_transactions (
    item_id, project_id, transaction_type, quantity, notes, created_by, reference_type
  ) VALUES (
    p_item_id, p_dest_project_id, 'TRANSFER', p_quantity,
    COALESCE(p_notes, 'Transfer in from Project: ' || p_source_project_id::text), v_actor, 'project_transfer'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Item transferred successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;

-- 5.2 reject_checkout_order: Support checkouts.reject OR checkouts.approve
CREATE OR REPLACE FUNCTION public.reject_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_order RECORD;
  v_reason TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.reject')
    OR public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.reject or checkouts.approve permission.';
  END IF;

  v_order_id := NULLIF(p_payload->>'order_id', '')::UUID;
  v_reason := NULLIF(TRIM(COALESCE(p_payload->>'rejection_reason', '')), '');

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรหัสคำขอยืม (order_id is required)';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปฏิเสธคำขอยืม';
  END IF;

  SELECT * INTO v_order 
  FROM public.checkout_orders 
  WHERE id = v_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลคำขอยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  UPDATE public.checkout_orders
  SET 
    status = 'rejected',
    rejected_by = v_caller_id,
    rejected_at = NOW(),
    rejection_reason = v_reason,
    updated_at = NOW()
  WHERE id = v_order_id;

  UPDATE public.checkout_items
  SET status = 'rejected'
  WHERE checkout_order_id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ปฏิเสธคำขอยืมพัสดุเรียบร้อยแล้ว',
    'order_id', v_order_id
  );
END;
$$;

-- 5.3 super_cancel_checkout_order: Support checkouts.cancel OR is_super_admin
CREATE OR REPLACE FUNCTION public.super_cancel_checkout_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_checkout RECORD;
  v_ci RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.is_super_admin(v_user_id)
    OR public.has_permission(v_user_id, 'checkouts.cancel')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.cancel permission or SUPER role.';
  END IF;

  SELECT * INTO v_checkout
  FROM public.checkout_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout order not found: %', p_order_id;
  END IF;

  IF v_checkout.status = 'cancelled' THEN
    RAISE EXCEPTION 'Checkout order is already cancelled.';
  END IF;

  -- Revert unreturned quantities if checkout was active/approved/overdue/partial_returned
  IF v_checkout.status IN ('active', 'approved', 'overdue', 'partial_returned') THEN
    FOR v_ci IN
      SELECT ci.id,
             ci.item_id,
             COALESCE(ci.quantity_borrowed, 0) - (
               COALESCE(ci.quantity_returned, 0) +
               COALESCE(ci.quantity_consumed, 0) +
               COALESCE(ci.quantity_damaged, 0) +
               COALESCE(ci.quantity_lost, 0)
             ) AS unreturned_qty
      FROM public.checkout_items ci
      WHERE ci.checkout_order_id = p_order_id
      ORDER BY ci.id
    LOOP
      IF v_ci.unreturned_qty > 0 AND v_checkout.project_id IS NOT NULL THEN
        INSERT INTO public.stock_transactions (
          item_id,
          project_id,
          transaction_type,
          quantity,
          created_by,
          reference_type,
          reference_id,
          notes
        ) VALUES (
          v_ci.item_id,
          v_checkout.project_id,
          'RETURN',
          v_ci.unreturned_qty,
          v_user_id,
          'checkout_cancellation',
          p_order_id,
          COALESCE(p_reason, 'SUPER ยกเลิกรายการยืม #' || COALESCE(v_checkout.order_number, SUBSTRING(p_order_id::TEXT, 1, 8)))
        );
      END IF;
    END LOOP;
  END IF;

  -- Mark pending or borrowed checkout items as rejected
  UPDATE public.checkout_items
  SET status = 'rejected'
  WHERE checkout_order_id = p_order_id AND status IN ('pending', 'borrowed');

  -- Update checkout_orders status to cancelled
  UPDATE public.checkout_orders
  SET status = 'cancelled',
      cancelled_by = v_user_id,
      cancelled_at = NOW(),
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_order_id;

  -- Audit log entry
  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_user_id,
        'CHECKOUT_CANCELLED_BY_SUPER',
        jsonb_build_object(
          'order_id', p_order_id,
          'order_number', v_checkout.order_number,
          'previous_status', v_checkout.status,
          'reason', p_reason,
          'timestamp', NOW()
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ยกเลิกรายการยืม-คืนสำเร็จ',
    'order_id', p_order_id,
    'status', 'cancelled'
  );
END;
$$;

-- 5.4 super_cancel_withdrawal_order: Support withdrawals.cancel OR is_super_admin
CREATE OR REPLACE FUNCTION public.super_cancel_withdrawal_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.is_super_admin(v_user_id)
    OR public.has_permission(v_user_id, 'withdrawals.cancel')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.cancel permission or SUPER role.';
  END IF;

  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_order_id;
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Withdrawal request is already cancelled.';
  END IF;

  -- If request was already approved or completed, revert deducted stock
  IF v_order.status IN ('approved', 'completed') THEN
    FOR v_item IN
      SELECT wi.id,
             wi.item_id,
             COALESCE(wi.project_id, v_order.project_id) AS source_project_id,
             COALESCE(wi.deducted_quantity, wi.quantity, 0) AS return_qty
      FROM public.withdrawal_items wi
      WHERE wi.order_id = p_order_id
      ORDER BY wi.id
    LOOP
      IF v_item.return_qty > 0 AND v_item.source_project_id IS NOT NULL THEN
        INSERT INTO public.stock_transactions (
          item_id,
          project_id,
          transaction_type,
          quantity,
          created_by,
          reference_type,
          reference_id,
          notes
        ) VALUES (
          v_item.item_id,
          v_item.source_project_id,
          'RETURN',
          v_item.return_qty,
          v_user_id,
          'withdrawal_cancellation',
          p_order_id,
          COALESCE(p_reason, 'SUPER ยกเลิกคำขอเบิก #' || COALESCE(v_order.order_number, SUBSTRING(p_order_id::TEXT, 1, 8)))
        );
      END IF;
    END LOOP;
  END IF;

  -- Update withdrawal_orders status to cancelled
  UPDATE public.withdrawal_orders
  SET status = 'cancelled',
      cancelled_by = v_user_id,
      cancelled_at = NOW(),
      cancellation_reason = p_reason
  WHERE id = p_order_id;

  -- Audit log entry
  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_user_id,
        'WITHDRAWAL_CANCELLED_BY_SUPER',
        jsonb_build_object(
          'order_id', p_order_id,
          'order_number', v_order.order_number,
          'previous_status', v_order.status,
          'reason', p_reason,
          'timestamp', NOW()
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ยกเลิกคำขอเบิกเรียบร้อยแล้ว',
    'order_id', p_order_id,
    'status', 'cancelled'
  );
END;
$$;

-- 5.5 resolve_damaged_return_item: Support checkouts.resolve_repair OR checkouts.return
CREATE OR REPLACE FUNCTION public.resolve_damaged_return_item(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_return_log_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'return_log_id', '')), '')::UUID;
  v_resolution TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'resolution', '')), ''), 'restored_to_stock');
  v_project_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'project_id', '')), '')::UUID;
  v_storage_location_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'storage_location_id', '')), '')::UUID;
  v_repair_notes TEXT := NULLIF(TRIM(COALESCE(p_payload->>'repair_notes', '')), '');
  v_reference TEXT := NULLIF(TRIM(COALESCE(p_payload->>'reference_number', '')), '');
  v_serial TEXT := NULLIF(TRIM(COALESCE(p_payload->>'serial_number', '')), '');
  v_disposal_method TEXT := NULLIF(TRIM(COALESCE(p_payload->>'disposal_method', '')), '');
  v_spare_item_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'spare_part_item_id', '')), '')::UUID;
  v_spare_qty NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'spare_part_quantity', '')), '')::NUMERIC, 1);
  v_harvest_item_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'harvested_item_id', '')), '')::UUID;
  v_harvest_qty NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'harvested_quantity', '')), '')::NUMERIC, 1);
  v_quantity NUMERIC;
  v_log RECORD;
  v_item_id UUID;
  v_item_serial TEXT;
  v_order_number TEXT;
  v_order_project_id UUID;
  v_available NUMERIC;
  v_stock_in_order UUID;
  v_harvest_order UUID;
  v_scrap_id UUID;
  v_lock RECORD;
  v_lock_ids UUID[];
BEGIN
  -- 3.1 Authorization
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.resolve_repair')
    OR public.has_permission(v_caller_id, 'checkouts.return')
    OR public.has_permission(v_caller_id, 'stock_in.create')
    OR public.is_super_admin(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.resolve_repair, checkouts.return, or stock_in.create permission.';
  END IF;

  IF v_return_log_id IS NULL THEN
    RAISE EXCEPTION 'return_log_id is required';
  END IF;

  IF v_resolution NOT IN ('restored_to_stock', 'parts_harvested', 'scrapped') THEN
    RAISE EXCEPTION 'Unsupported resolution: %', v_resolution;
  END IF;

  -- 3.2 ล็อกแถวรายการรับคืน + กันการกดซ้ำ
  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = v_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการรับคืน ID: %', v_return_log_id;
  END IF;

  IF v_log.item_condition NOT IN ('damaged', 'needs_repair') THEN
    RAISE EXCEPTION 'จัดการซ่อมได้เฉพาะรายการที่รับคืนสภาพชำรุด/ส่งซ่อมเท่านั้น (สภาพปัจจุบัน: %)', v_log.item_condition;
  END IF;

  IF v_log.repair_resolution_status <> 'unresolved' THEN
    RAISE EXCEPTION 'รายการนี้ถูกบันทึกผลการซ่อมไปแล้ว (สถานะ: %)', v_log.repair_resolution_status;
  END IF;

  IF v_log.caim_stock_in_order_id IS NOT NULL OR v_log.caim_inbound_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกรับเข้าคลังผ่านงานเคลม CAIM แล้ว ไม่สามารถคืนสต็อกซ้ำได้';
  END IF;

  -- 3.3 อุปกรณ์หลักของรายการนี้
  SELECT ci.item_id, ci.serial_number, co.project_id, co.order_number
  INTO v_item_id, v_item_serial, v_order_project_id, v_order_number
  FROM public.checkout_items ci
  JOIN public.checkout_orders co ON co.id = ci.checkout_order_id
  WHERE ci.id = v_log.checkout_item_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ต้นทางของ return log %', v_return_log_id;
  END IF;

  -- 3.4 ปลายทาง (ค่าเริ่มต้น: คลังที่รับคืน → โครงการของใบยืม)
  v_project_id := COALESCE(v_project_id, v_log.destination_project_id, v_order_project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลัง/โครงการปลายทางที่รับอุปกรณ์กลับเข้าสต็อก';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    RAISE EXCEPTION 'ไม่พบโครงการ/คลัง ID: %', v_project_id;
  END IF;

  IF v_storage_location_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.storage_locations WHERE id = v_storage_location_id) THEN
    RAISE EXCEPTION 'ไม่พบสถานที่จัดเก็บ ID: %', v_storage_location_id;
  END IF;

  -- 3.5 จำนวน (ต้องเป็นจำนวนเต็ม ไม่เกินยอดที่รับคืนไว้)
  v_quantity := COALESCE(
    NULLIF(TRIM(COALESCE(p_payload->>'quantity', '')), '')::NUMERIC,
    v_log.returned_quantity,
    1
  );

  IF v_quantity <= 0 THEN
    RAISE EXCEPTION 'จำนวนต้องมากกว่า 0';
  END IF;

  IF v_quantity <> TRUNC(v_quantity) THEN
    RAISE EXCEPTION 'จำนวนต้องเป็นจำนวนเต็ม (รับมา: %)', v_quantity;
  END IF;

  IF v_log.returned_quantity IS NOT NULL AND v_quantity > v_log.returned_quantity THEN
    RAISE EXCEPTION 'จำนวนที่จัดการ (%) เกินจำนวนที่รับคืนไว้ (%)', v_quantity, v_log.returned_quantity;
  END IF;

  IF v_repair_notes IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรายละเอียดการซ่อม/เหตุผลการจำหน่าย';
  END IF;

  v_serial := COALESCE(v_serial, v_item_serial, v_log.replaced_serial_number);

  -- อะไหล่ย่อยใช้ได้เฉพาะกรณีซ่อมเสร็จคืนคลังเท่านั้น
  IF v_resolution <> 'restored_to_stock' THEN
    v_spare_item_id := NULL;
  END IF;

  -- 3.6 ตรวจ payload ของอะไหล่/ชิ้นส่วนที่เกี่ยวข้อง
  IF v_spare_item_id IS NOT NULL THEN
    IF v_spare_item_id = v_item_id THEN
      RAISE EXCEPTION 'อะไหล่ที่ตัดสต็อกต้องไม่ใช่ตัวอุปกรณ์หลัก';
    END IF;
    IF v_spare_qty <= 0 OR v_spare_qty <> TRUNC(v_spare_qty) THEN
      RAISE EXCEPTION 'จำนวนอะไหล่ต้องเป็นจำนวนเต็มมากกว่า 0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = v_spare_item_id) THEN
      RAISE EXCEPTION 'ไม่พบอะไหล่ ID: %', v_spare_item_id;
    END IF;
  END IF;

  IF v_harvest_item_id IS NOT NULL THEN
    IF v_harvest_item_id = v_item_id THEN
      RAISE EXCEPTION 'ชิ้นส่วนที่รับเข้าต้องไม่ใช่ตัวอุปกรณ์หลัก';
    END IF;
    IF v_harvest_qty <= 0 OR v_harvest_qty <> TRUNC(v_harvest_qty) THEN
      RAISE EXCEPTION 'จำนวนชิ้นส่วนที่รับเข้าต้องเป็นจำนวนเต็มมากกว่า 0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = v_harvest_item_id) THEN
      RAISE EXCEPTION 'ไม่พบชิ้นส่วน ID: %', v_harvest_item_id;
    END IF;
  END IF;

  -- 3.7 ล็อกแถว items ที่จะถูกแตะ เรียงตาม id (mutex ต่อ item — ลำดับเดียวกับ RPC อื่น)
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_lock_ids
  FROM unnest(ARRAY[v_item_id, v_spare_item_id, v_harvest_item_id]) AS t(x)
  WHERE x IS NOT NULL;

  IF v_lock_ids IS NOT NULL THEN
    FOR v_lock IN SELECT id FROM public.items WHERE id = ANY(v_lock_ids) ORDER BY id FOR UPDATE
    LOOP
      NULL; -- เพียงล็อกเพื่อรักษาลำดับ mutex เดียวกับ approve_inventory_request / approve_checkout_order
    END LOOP;
  END IF;

  -- 3.8 ตรวจสต็อกอะไหล่ย่อยก่อนตัดจริง (stock_balance เป็น VIEW: GROUP BY project_id, item_id)
  IF v_resolution = 'restored_to_stock' AND v_spare_item_id IS NOT NULL THEN
    SELECT COALESCE(balance, 0) INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_project_id AND item_id = v_spare_item_id;

    IF COALESCE(v_available, 0) < v_spare_qty THEN
      RAISE EXCEPTION 'สต็อกอะไหล่ไม่เพียงพอ (คงเหลือ % ต้องการ %)', COALESCE(v_available, 0), v_spare_qty;
    END IF;
  END IF;

  -- 3.9 ดำเนินการตามแนวทางที่เลือก
  IF v_resolution = 'restored_to_stock' THEN
    INSERT INTO public.stock_in_orders (
      project_id, storage_location_id, supplier, po_number, notes, received_date, created_by
    ) VALUES (
      v_project_id,
      v_storage_location_id,
      'Repair & Restore',
      v_reference,
      'ซ่อมเสร็จ/คืนสภาพเข้าคลัง — อ้างอิงใบยืม ' || COALESCE(v_order_number, '-')
        || ' | ' || v_repair_notes,
      CURRENT_DATE,
      v_caller_id
    ) RETURNING id INTO v_stock_in_order;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, serial_number, notes
    ) VALUES (
      v_stock_in_order,
      v_item_id,
      v_quantity::INTEGER,
      v_serial,
      'รับคืนหลังซ่อมจากรายการรับคืน ' || v_return_log_id::TEXT
    );

    INSERT INTO public.stock_transactions (
      project_id, storage_location_id, item_id, quantity, transaction_type,
      reference_type, reference_id, created_by, notes
    ) VALUES (
      v_project_id,
      v_storage_location_id,
      v_item_id,
      v_quantity::INTEGER,
      'stock_in',
      'repair_restored',
      v_return_log_id,
      v_caller_id,
      'ซ่อมเสร็จคืนเข้าคลัง: ' || v_repair_notes
        || ' (ใบยืม ' || COALESCE(v_order_number, '-') || ')'
    );

    IF v_spare_item_id IS NOT NULL THEN
      INSERT INTO public.stock_transactions (
        project_id, storage_location_id, item_id, quantity, transaction_type,
        reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id,
        v_storage_location_id,
        v_spare_item_id,
        v_spare_qty::INTEGER,
        'stock_out',
        'repair_spare_part',
        v_return_log_id,
        v_caller_id,
        'ตัดสต็อกอะไหล่ย่อยเพื่อซ่อมอุปกรณ์' || COALESCE(' (ใบยืม ' || v_order_number || ')', '')
      );
    END IF;
  ELSE
    -- parts_harvested / scrapped : ลงทะเบียนของเสีย (ไม่คืนสต็อกตัวหลัก)
    INSERT INTO public.scrap_disposal_items (
      checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
      serial_number, reason, disposal_method, notes
    ) VALUES (
      v_return_log_id,
      v_log.checkout_order_id,
      v_project_id,
      v_item_id,
      v_quantity::INTEGER,
      v_serial,
      v_repair_notes,
      COALESCE(
        v_disposal_method,
        CASE WHEN v_resolution = 'parts_harvested' THEN 'parts_harvest' ELSE 'electronic_waste' END
      ),
      'อ้างอิงใบยืม ' || COALESCE(v_order_number, '-')
    ) RETURNING id INTO v_scrap_id;

    -- รับเข้าชิ้นส่วนที่ยังใช้งานได้เป็นอะไหล่สำรอง (ถ้าระบุ)
    IF v_harvest_item_id IS NOT NULL THEN
      INSERT INTO public.stock_in_orders (
        project_id, storage_location_id, supplier, po_number, notes, received_date, created_by
      ) VALUES (
        v_project_id,
        v_storage_location_id,
        'Parts Harvest',
        v_reference,
        'รับเข้าชิ้นส่วนจากการแยกอะไหล่ — อ้างอิงใบยืม ' || COALESCE(v_order_number, '-')
          || ' | ' || v_repair_notes,
        CURRENT_DATE,
        v_caller_id
      ) RETURNING id INTO v_harvest_order;

      INSERT INTO public.stock_in_items (
        order_id, item_id, quantity, notes
      ) VALUES (
        v_harvest_order,
        v_harvest_item_id,
        v_harvest_qty::INTEGER,
        'ชิ้นส่วนที่ยังใช้งานได้จากรายการรับคืน ' || v_return_log_id::TEXT
      );

      INSERT INTO public.stock_transactions (
        project_id, storage_location_id, item_id, quantity, transaction_type,
        reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id,
        v_storage_location_id,
        v_harvest_item_id,
        v_harvest_qty::INTEGER,
        'stock_in',
        'parts_harvest',
        v_return_log_id,
        v_caller_id,
        'รับเข้าชิ้นส่วนที่ยังใช้งานได้จากการแยกอะไหล่'
          || COALESCE(' (ใบยืม ' || v_order_number || ')', '')
      );
    END IF;
  END IF;

  -- 3.10 ปิดสถานะรายการ (กันการกดซ้ำ)
  UPDATE public.checkout_return_logs
  SET repair_resolution_status = v_resolution,
      repair_notes = v_repair_notes,
      repair_resolved_at = now(),
      repair_resolved_by = v_caller_id,
      restored_stock_in_order_id = CASE
        WHEN v_resolution = 'restored_to_stock' THEN v_stock_in_order
        ELSE v_harvest_order
      END,
      repair_scrap_disposal_id = v_scrap_id,
      spare_part_item_id = v_spare_item_id,
      spare_part_quantity = CASE WHEN v_spare_item_id IS NULL THEN NULL ELSE v_spare_qty END
  WHERE id = v_return_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_log_id', v_return_log_id,
    'resolution', v_resolution,
    'project_id', v_project_id,
    'quantity', v_quantity,
    'stock_in_order_id', CASE
      WHEN v_resolution = 'restored_to_stock' THEN v_stock_in_order
      ELSE v_harvest_order
    END,
    'scrap_disposal_id', v_scrap_id,
    'spare_part_item_id', v_spare_item_id,
    'spare_part_quantity', CASE WHEN v_spare_item_id IS NULL THEN NULL ELSE v_spare_qty END,
    'message', CASE v_resolution
      WHEN 'restored_to_stock' THEN 'บันทึกซ่อมเสร็จและคืนอุปกรณ์เข้าคลังเรียบร้อย (+' || v_quantity::TEXT || ')'
      WHEN 'parts_harvested' THEN 'บันทึกการแยกอะไหล่เรียบร้อย (ไม่ได้คืนสต็อกตัวหลัก)'
      ELSE 'บันทึกการแทงจำหน่ายของเสียเรียบร้อย (ไม่ได้คืนสต็อก)'
    END
  );
END;
$$;

-- 5.6 is_checkout_delegate: Support checkouts.update permission
CREATE OR REPLACE FUNCTION public.is_checkout_delegate(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_delegate BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id
      AND p.status = 'active'
      AND (
        UPPER(TRIM(COALESCE(p.role, ''))) IN ('ADMIN', 'SUPER')
        OR UPPER(TRIM(COALESCE(r.code, ''))) IN ('ADMIN', 'SUPER')
        OR public.has_permission(p_user_id, 'checkouts.update')
      )
  ) OR public.is_super_admin(p_user_id)
  INTO v_is_delegate;

  RETURN COALESCE(v_is_delegate, FALSE);
END;
$$;

-- 5.7 get_site_installation_kits_availability: Enforce inventory.view OR items.view
CREATE OR REPLACE FUNCTION public.get_site_installation_kits_availability(p_project_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_caller_id IS NOT NULL THEN
    IF NOT (
      public.is_super_admin(v_caller_id)
      OR public.has_permission(v_caller_id, 'inventory.view')
      OR public.has_permission(v_caller_id, 'items.view')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Requires inventory.view or items.view permission.';
    END IF;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'category_id', c.id,
      'category_name', c.name,
      'category_code', c.code,
      'templates_count', (SELECT COUNT(*) FROM public.site_bom_templates t WHERE t.category_id = c.id)
    )
  ) INTO v_result
  FROM public.categories c;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. HARDEN RLS POLICIES FOR NEW PERMISSIONS
-- ------------------------------------------------------------------------------

-- 6.1 audit_logs: Allow SELECT to users with system.audit_log.view
DROP POLICY IF EXISTS "Audit logs admin read" ON public.audit_logs;
CREATE POLICY "Audit logs admin read"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'system.audit_log.view')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND LOWER(COALESCE(p.role, '')) = 'admin'
    )
  );

-- 6.2 stock_in_orders: Tighten UPDATE & DELETE
DROP POLICY IF EXISTS "stock_in_orders_auth_update" ON public.stock_in_orders;
CREATE POLICY "stock_in_orders_auth_update" ON public.stock_in_orders
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'stock_in.update')
    OR public.has_permission(auth.uid(), 'stock_in.cancel')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'stock_in.update')
    OR public.has_permission(auth.uid(), 'stock_in.cancel')
  );

DROP POLICY IF EXISTS "stock_in_orders_auth_delete" ON public.stock_in_orders;
CREATE POLICY "stock_in_orders_auth_delete" ON public.stock_in_orders
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'stock_in.delete')
  );

-- 6.3 stock_in_items: Tighten UPDATE & DELETE
DROP POLICY IF EXISTS "stock_in_items_auth_update" ON public.stock_in_items;
CREATE POLICY "stock_in_items_auth_update" ON public.stock_in_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_in_orders o
      WHERE o.id = stock_in_items.order_id
        AND (
          public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'stock_in.update')
          OR public.has_permission(auth.uid(), 'stock_in.cancel')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stock_in_orders o
      WHERE o.id = stock_in_items.order_id
        AND (
          public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'stock_in.update')
          OR public.has_permission(auth.uid(), 'stock_in.cancel')
        )
    )
  );

DROP POLICY IF EXISTS "stock_in_items_auth_delete" ON public.stock_in_items;
CREATE POLICY "stock_in_items_auth_delete" ON public.stock_in_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_in_orders o
      WHERE o.id = stock_in_items.order_id
        AND (
          public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'stock_in.delete')
        )
    )
  );

-- 6.4 checkout_orders: Explicit DELETE policy requiring checkouts.delete
DROP POLICY IF EXISTS "checkout_orders_auth_delete" ON public.checkout_orders;
CREATE POLICY "checkout_orders_auth_delete" ON public.checkout_orders
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'checkouts.delete')
  );

-- 6.5 checkout_items: Explicit DELETE policy requiring checkouts.delete
DROP POLICY IF EXISTS "checkout_items_auth_delete" ON public.checkout_items;
CREATE POLICY "checkout_items_auth_delete" ON public.checkout_items
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'checkouts.delete')
  );

-- 6.6 withdrawal_orders: Explicit DELETE policy requiring withdrawals.delete
DROP POLICY IF EXISTS "withdrawal_orders_auth_delete" ON public.withdrawal_orders;
CREATE POLICY "withdrawal_orders_auth_delete" ON public.withdrawal_orders
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'withdrawals.delete')
  );

-- 6.7 withdrawal_items: Explicit DELETE policy requiring withdrawals.delete
DROP POLICY IF EXISTS "withdrawal_items_auth_delete" ON public.withdrawal_items;
CREATE POLICY "withdrawal_items_auth_delete" ON public.withdrawal_items
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'withdrawals.delete')
  );

-- ------------------------------------------------------------------------------
-- 7. PERMISSION INTEGRITY ASSERTION CHECK
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  v_perm_count INT;
  v_super_perm_count INT;
BEGIN
  SELECT COUNT(*) INTO v_perm_count FROM public.permissions;
  SELECT COUNT(*) INTO v_super_perm_count
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE UPPER(TRIM(r.code)) = 'SUPER';

  IF v_perm_count < 59 THEN
    RAISE EXCEPTION 'Integrity check failed: Expected at least 59 catalog permissions, found %', v_perm_count;
  END IF;

  IF v_super_perm_count < v_perm_count THEN
    RAISE EXCEPTION 'Integrity check failed: SUPER role has fewer permissions (%) than catalog (%)',
      v_super_perm_count, v_perm_count;
  END IF;
END;
$$;

COMMIT;

-- ==============================================================================
-- ROLLBACK SCRIPT (Run only if reversing Migration 88)
-- ==============================================================================
/*
BEGIN;

-- 1. Drop trigger safeguards
DROP TRIGGER IF EXISTS trg_prevent_super_permission_removal ON public.role_permissions;
DROP FUNCTION IF EXISTS public.fn_prevent_super_permission_removal();

DROP TRIGGER IF EXISTS trg_auto_grant_permission_to_super ON public.permissions;
DROP FUNCTION IF EXISTS public.fn_auto_grant_permission_to_super();

-- 2. Drop explicit DELETE policies added in Migration 88
DROP POLICY IF EXISTS "stock_in_orders_auth_delete" ON public.stock_in_orders;
DROP POLICY IF EXISTS "stock_in_items_auth_delete" ON public.stock_in_items;
DROP POLICY IF EXISTS "checkout_orders_auth_delete" ON public.checkout_orders;
DROP POLICY IF EXISTS "checkout_items_auth_delete" ON public.checkout_items;
DROP POLICY IF EXISTS "withdrawal_orders_auth_delete" ON public.withdrawal_orders;
DROP POLICY IF EXISTS "withdrawal_items_auth_delete" ON public.withdrawal_items;

-- 3. Remove 17 newly created permissions (cascades to role_permissions)
DELETE FROM public.permissions
WHERE code IN (
  'users.delete',
  'users.manage',
  'checkouts.reject',
  'checkouts.cancel',
  'checkouts.update',
  'checkouts.delete',
  'checkouts.resolve_repair',
  'withdrawals.cancel',
  'withdrawals.update',
  'withdrawals.delete',
  'stock_in.update',
  'stock_in.cancel',
  'stock_in.delete',
  'inventory.view',
  'system.audit_log.view',
  'system.backup',
  'system.import_export'
);

COMMIT;
*/
