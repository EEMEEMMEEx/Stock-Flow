# Project Plan: Multi-Warehouse Requisition & SUPER Role Cancellations

> **File:** `multi-warehouse-withdrawal.md` (Project Root)  
> **Status:** Pending Review / Ready for Execution  
> **Full Implementation Plan:** [`docs/multi-warehouse-withdrawal-plan.md`](file:///d:/APP/Stock-Flow-app/docs/multi-warehouse-withdrawal-plan.md)

---

## 1. Scope & Objectives
1. **Multi-Warehouse Requisition ([`/withdrawals`](file:///d:/APP/Stock-Flow-app/src/pages/Withdrawals.jsx))**:
   - เลือกพัสดุจากหลายโครงการ/หลายคลังสินค้าในใบเบิกเดียวกัน ออกเลขที่เอกสาร 1 ใบ (`Single Order ID`)
   - ผู้อนุมัติศูนย์กลางคือ Administrator / Manager
2. **SUPER Role Privilege (System Administrator Master Controls)**:
   - ยกเลิกรายการขอเบิกได้ที่ [`/withdrawals?tab=orders`](file:///d:/APP/Stock-Flow-app/src/pages/Withdrawals.jsx) (พร้อมระบบคืนสต็อกอัตโนมัติหากเป็นรายการที่อนุมัติแล้ว)
   - ยกเลิกรายการขอยืม-คืนอุปกรณ์ได้ที่ [`/checkouts?tab=history`](file:///d:/APP/Stock-Flow-app/src/pages/Checkouts.jsx)

---

## 2. Architecture & Design Highlights
- **Database Schema**: เพิ่ม `project_id` ใน `withdrawal_items` สำหรับระบุคลังต้นทางต่อรายการ และเพิ่มคอลัมน์ `cancelled_by`, `cancelled_at`, `cancellation_reason` ใน `withdrawal_orders` และ `checkout_orders`
- **PostgreSQL RPCs**:
  - `approve_inventory_request`: ตัดสต็อก OUT แยกตามคลังต้นทางของแต่ละรายการ
  - `super_cancel_withdrawal_order`: ยกเลิกใบเบิกโดย SUPER หากเป็นใบที่อนุมัติแล้ว จะทำการคืนสต็อกกลับคลังต้นทางเดิมแบบ Atomic Transaction
  - `super_cancel_checkout_order`: ยกเลิกรายการยืม-คืนในประวัติโดย SUPER พร้อมคืนสถานะอุปกรณ์
- **Frontend UI & Guards**:
  - แสดงปุ่ม "ยกเลิกคำขอ / Cancel" เฉพาะผู้ใช้ที่มีสิทธิ์ `isSuperAdmin` พร้อม Modal ระบุเหตุผล
  - ปรับ POS Terminal และ Cart Panel ให้เลือกและเปลี่ยนคลังต้นทางได้อิสระ
  - ปรับเอกสาร PDF ทั้งใบเบิกและใบนำส่งให้แสดงคลังต้นทาง

---

## 3. Tasks Breakdown

### Phase 1: Database Schema & RPCs
- [ ] สร้าง SQL Migration `supabase/migrations/77_multi_warehouse_and_super_cancellations.sql`
- [ ] เพิ่มคอลัมน์ใน `withdrawal_items`, `withdrawal_orders`, `checkout_orders`
- [ ] Backfill ข้อมูลเก่าใน `withdrawal_items`
- [ ] สร้าง RPC `super_cancel_withdrawal_order` และ `super_cancel_checkout_order`
- [ ] ปรับปรุง RPC `approve_inventory_request`

### Phase 2: Multi-Warehouse Frontend (POS & Cart)
- [ ] อัปเดต `WithdrawalPosTerminal.jsx` รองรับ "ทุกคลังสินค้า (All Warehouses)"
- [ ] อัปเดต `WithdrawalCartPanel.jsx` ให้เลือกคลังต้นทางต่อรายการ พร้อมตรวจสอบยอดคงเหลือ
- [ ] อัปเดต `WithdrawalItemCard.jsx` แสดงสถานะคลังที่มีของ

### Phase 3: Withdrawal Tracking & SUPER Cancel Feature
- [ ] อัปเดต `WithdrawalOrdersList.jsx`: เพิ่มปุ่ม Cancel สำหรับ `isSuperAdmin` และฟิลเตอร์ `cancelled`
- [ ] สร้าง `WithdrawalCancelModal.jsx` สำหรับกรอกเหตุผลการยกเลิก
- [ ] อัปเดต `WithdrawalDetailModal.jsx` เพิ่มปุ่มยกเลิกสำหรับ SUPER
- [ ] อัปเดต `StatusBadge.jsx` แสดงสถานะ `cancelled`

### Phase 4: Checkout History SUPER Cancel Feature
- [ ] อัปเดต `CheckoutHistoryList.jsx`: เพิ่มปุ่ม Cancel สำหรับ `isSuperAdmin` ในแท็บ History
- [ ] สร้าง `CheckoutCancelModal.jsx` สำหรับกรอกเหตุผลการยกเลิก
- [ ] อัปเดต `CheckoutDetailModal.jsx` เพิ่มปุ่มยกเลิกสำหรับ SUPER

### Phase 5: PDF Templates & Email Dispatch
- [ ] ปรับปรุง `MaterialWithdrawalPDF.jsx` แสดงคลังต้นทาง
- [ ] ปรับปรุง `MaterialDispatchPDF.jsx` จัดกลุ่มรายการตามคลังต้นทาง

### Phase 6: Verification & QA
- [ ] ตรวจสอบ `npm run check:i18n` (Thai & English Parity)
- [ ] ตรวจสอบ `npm run lint` (ESLint)
- [ ] ตรวจสอบ `npm run build` (Vite Build)
- [ ] ทดสอบสร้างใบเบิกหลายคลัง, อนุมัติ, ทดสอบยกเลิกใบเบิกโดย SUPER (ตรวจการคืนสต็อก) และทดสอบยกเลิกประวัติยืม-คืนโดย SUPER
