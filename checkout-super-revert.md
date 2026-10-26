# Checkout SUPER Revert / Undo Plan (`checkout-super-revert.md`)

> **Mode:** PLANNING ONLY (ยังไม่มีการแก้ไขโค้ด)
> **Project Type:** WEB (Full-Stack React + Supabase PostgreSQL RPC + Vercel Serverless)
> **Scope:** `/checkouts?tab=history` และ `/roles` เฉพาะบทบาท `SUPER` (System Administrator)

---

## 1. Overview & Success Criteria

พัฒนาระบบ **"ย้อนกลับ / Revert (Undo)"** บนหน้า `/checkouts?tab=history` สำหรับผู้ใช้บทบาท **`SUPER` (System Administrator)** เพื่อย้อนกลับการดำเนินการที่เสร็จสิ้นแล้ว (เช่น การยืนยันรับคืนพัสดุ และการอนุมัติคำขอยืม) แบบ Soft Revert ภายใน Database Transaction เดียว พร้อมบันทึก Append-Only Audit Log และแสดงการตั้งค่าสิทธิ์ `revert_action` (`system.revert_actions`) บนหน้า `/roles`

### Success Criteria
- [ ] `SUPER` สามารถย้อนกลับ **Return Confirmation** (`completed`/`partial_returned` → `active`/`partial_returned`) และ **Request Approval** (`active`/`overdue` → `pending`) รวมถึง **Request Rejection** (`rejected` → `pending`) จากหน้า `/checkouts?tab=history` ได้สำเร็จ
- [ ] ผู้ใช้บทบาทอื่น (`ADMIN`, `SUPERVISOR`, `STAFF`) ไม่เห็นปุ่ม Revert ใน UI และถูกปฏิเสธด้วย `403 Forbidden` (`SQLSTATE 42501`) จาก Backend RPC ทุกครั้ง
- [ ] หน้า `/roles` แสดงสิทธิ์ `system.revert_actions` (`revert_action`) เป็นเปิดใช้งานสำหรับ `SUPER` และล็อก (`disabled`) พร้อมคำอธิบายสำหรับบทบาทอื่น
- [ ] ทุกการ Revert ถูกบันทึกลง `public.audit_logs` แบบ Append-only (ห้ามแก้ไข/ลบ) พร้อมแสดง Badge `"Reverted by <name> on <date>"` และเหตุผลบนรายการ
- [ ] รองรับทั้งใบยืมปกติ (เช่น `CHK-202610-2400`) และใบยืมระยะยาวไม่มีกำหนดคืน (`borrow_type = 'indefinite'`, `expected_return_date = null` เช่น `CHK-202609-8458`) โดยไม่เกิด Error และแสดงผลถูกต้องตั้งแต่หน้าจอขนาด `360px` ขึ้นไป

---

## 2. Step 1: Checkout Action & State Transition Table (Discovery Results)

| Action | From → To | Reversible? | Side Effects (Stock, Due Date, Approver/Receiver, Timestamps, Notifications, Logs, Counters) |
| :--- | :--- | :-: | :--- |
| **1. Submit Checkout Request**<br>(`process_checkout_order` — Staff) | `(new)` → `pending`<br>(`items`: `'pending'`) | ❌ ไม่ใช้ Revert<br>*(ใช้ Cancel ปกติ)* | • **Stock**: ยังไม่ตัดสต็อก<br>• **Fields**: สร้าง `checkout_orders` (`status='pending'`, `expected_return_date` เป็น `DATE` หรือ `NULL` กรณี `indefinite`) |
| **2. Approve Checkout Request**<br>(`approve_checkout_order` / Direct POS) | `pending` → `active` (หรือ `overdue`)<br>(`items`: `'pending'` → `'borrowed'`) | ✅ **Reversible**<br>(`active`/`overdue` → `pending`) | • **Stock**: บันทึก `stock_transactions` (`'checkout_out'`) หัก `stock_balance` ลงตาม `quantity_borrowed`<br>• **Fields**: บันทึก `approved_by`, `approved_at`, เปลี่ยน `checkout_items.status = 'borrowed'`<br>• **Counters**: เพิ่ม `activeOrdersCount`, ลด `pendingOrdersCount` |
| **3. Reject Checkout Request**<br>(`reject_checkout_order`) | `pending` → `rejected`<br>(`items`: `'pending'` → `'rejected'`) | ✅ **Reversible**<br>(`rejected` → `pending`) | • **Stock**: ไม่เปลี่ยนสต็อก<br>• **Fields**: บันทึก `rejected_by`, `rejected_at`, `rejection_reason`, เปลี่ยน `checkout_items.status = 'rejected'` |
| **4. Confirm Equipment Return**<br>(`process_return_order`) | `active` / `overdue` / `partial_returned` → `partial_returned` หรือ `completed`<br>(`items`: `'borrowed'` → `'returned'`) | ✅ **Reversible**<br>(`completed`/`partial_returned` → `active`/`partial_returned`) | • **Stock**: กรณี `normal` คืนโครงการเดิม บันทึก `'return_in'` (`+N`); กรณีข้ามโครงการ สร้าง `stock_in_orders` + `stock_in_items` + `'stock_in'` (`+N`); กรณี `damaged`/`needs_repair`/`lost`/`consumed` ไม่บวกสต็อก<br>• **Fields & Counters**: เพิ่มยอด `quantity_returned`/`damaged`/`lost`/`consumed`; ตั้ง `actual_returned_date = now()` เมื่อครบ<br>• **Logs**: เพิ่มแถว `checkout_return_logs` |
| **5. Resolve Damaged Return**<br>(`resolve_damaged_return_item`) | `repair_resolution_status`:<br>`'unresolved'` → `'restored_to_stock'` \| `'parts_harvested'` \| `'scrapped'` | ✅ **Reversible**<br>(ย้อนกลับเป็น `'unresolved'`) | • **Stock**: กรณี `restored_to_stock` บวกสต็อกตัวหลัก (`+N`) และตัดสต็อกอะไหล่ย่อย (`-M`); กรณี `parts_harvested`/`scrapped` บันทึก `scrap_disposal_items`<br>• **Fields**: อัปเดต `repair_resolution_status`, `repair_resolved_at`, `repair_resolved_by` |
| **6. Extend Return Due Date**<br>(`extend_checkout_due_date`) | `active`/`overdue` → `active` (อัปเดต `expected_return_date`) | ✅ **Reversible**<br>(คืนค่า `previous_due_date`) | • **Fields & Logs**: อัปเดต `expected_return_date`, เพิ่มแถวใน `checkout_extension_logs` |
| **7. CAIM Inbound Webhook**<br>(`process_caim_webhook_event`) | `caim_sync_status`: `'synced'` → `'closed'` | ❌ **Not Safely Reversible** | • **เหตุผล**: ซิงก์ข้อมูลจากระบบเคลมภายนอก (CAIM) หากย้อนสถานะฝั่งเดียวจะทำให้ข้อมูลระหว่าง 2 ระบบขัดแย้งกัน จึงต้องบล็อกเมื่อ `caim_inbound_processed_at IS NOT NULL` |
| **8. SUPER Hard Cancel**<br>(`super_cancel_checkout_order`) | `any` → `cancelled` | ❌ **Not Reversible** | • **เหตุผล**: เป็นคำสั่งยกเลิกใบงานถาวรและคืนสต็อกส่วนที่ค้างทั้งหมดไปแล้ว |

---

## 3. File Structure & Impacted Files

```text
Stock-Flow-app/
├── supabase/migrations/
│   └── 83_super_revert_actions_and_audit.sql       # [NEW] Schema extensions, append-only audit trigger, RBAC permission, Atomic Revert RPCs
├── src/
│   ├── contexts/
│   │   └── AuthProvider.jsx                        # [MODIFY] Centralized canRevertAction helper
│   ├── lib/
│   │   ├── superRevert.js                          # [NEW] Client RPC wrapper & HTTP status/error code mapper (400/401/403/409/422/500)
│   │   ├── superRevert.test.js                     # [NEW] Unit tests for revert error mapping & state guards
│   ├── components/
│   │   ├── common/
│   │   │   ├── SuperRevertActionModal.jsx          # [NEW] Confirmation dialog with side-effects preview & required reason
│   │   │   └── RevertAuditLogModal.jsx             # [NEW] Read-only append-only audit log viewer for SUPER
│   │   ├── roles/
│   │   │   └── PermissionManagementModal.jsx       # [MODIFY] Show revert_action enabled for SUPER and locked/disabled for other roles
│   │   └── checkouts/
│   │       ├── CheckoutHistoryList.jsx             # [MODIFY] Show Revert button, Reverted badge, status filter, 360px responsive nowrap layout
│   │       └── CheckoutDetailModal.jsx             # [MODIFY] Per-return-log revert button, order revert button, revert timeline entries
│   ├── pages/
│   │   ├── Checkouts.jsx                           # [MODIFY] Wire SuperRevertActionModal, notifications, and live counter refresh
│   │   └── RoleManagement.jsx                      # [MODIFY] Add Revert Audit Log viewer trigger on SUPER role card
│   └── i18n/locales/
│       ├── th.js                                   # [MODIFY] Thai translations for revert UI, errors, and role lock descriptions
│       └── en.js                                   # [MODIFY] English translations (100% parity)
└── scripts/
    ├── verify-super-revert-sql-sandbox.mjs         # [NEW] PGlite SQL integration & concurrency/guard test suite
    └── verify-super-revert-ui.mjs                  # [NEW] UI/static guard verification script
```

---

## 4. Task Breakdown (Agent + Skill Assignments)

| Task ID | Name | Agent | Skills | Priority | Dependencies | INPUT → OUTPUT → VERIFY |
| :-: | :--- | :--- | :--- | :-: | :-: | :--- |
| **T1** | **Database Schema, Append-Only Audit & RBAC Permission** | `database-architect` | `@database-design` | **P0** | None | **IN**: `audit_logs`, `checkout_orders`, `checkout_return_logs`, `permissions`<br>**OUT**: `83_super_revert_actions_and_audit.sql` (DDL + `trg_audit_logs_immutable` + `system.revert_actions` locked to `SUPER`)<br>**VERIFY**: รันใน PGlite sandbox ตรวจว่าคอลัมน์ครบ และ `UPDATE`/`DELETE` บน `audit_logs` ถูกบล็อก |
| **T2** | **Authoritative Revert RPCs & Concurrency/Stock Guards** | `backend-specialist` | `@database-design`, `@clean-code` | **P0** | T1 | **IN**: Checkout state machine & `stock_balance` formula<br>**OUT**: RPCs `assert_super_revert_authorized`, `super_revert_checkout_return`, `super_revert_checkout_order_returns`, `super_revert_checkout_approval`, `super_revert_checkout_rejection`<br>**VERIFY**: `node scripts/verify-super-revert-sql-sandbox.mjs` ผ่านครบทุกเคส (401, 403, 400, 409 S/N reloaned, 409 stock shortage, double submit, indefinite loan `CHK-202609-8458`) |
| **T3** | **Centralized Permission Helper & Revert Client Service** | `frontend-specialist` | `@clean-code` | **P1** | T2 | **IN**: `AuthProvider.jsx`<br>**OUT**: `canRevertAction` ใน `useAuth()` และ `src/lib/superRevert.js` + `src/lib/superRevert.test.js`<br>**VERIFY**: `node --test src/lib/superRevert.test.js` ผ่าน 100% |
| **T4** | **`/roles` Page Permission Lock & Audit Viewer** | `frontend-specialist` | `@frontend-design`, `@tailwind-patterns` | **P1** | T3 | **IN**: `RoleManagement.jsx`, `PermissionManagementModal.jsx`<br>**OUT**: แสดง `system.revert_actions` เปิดให้ `SUPER` และ `disabled` พร้อมคำอธิบายสำหรับบทบาทอื่น + `RevertAuditLogModal.jsx`<br>**VERIFY**: ตรวจสอบว่าบทบาทอื่นไม่สามารถติ๊กเลือก `system.revert_actions` ได้ทั้งใน UI และ RPC |
| **T5** | **`/checkouts?tab=history` Revert UI, Modal & Timeline** | `frontend-specialist` | `@frontend-design`, `@tailwind-patterns` | **P2** | T3 | **IN**: `Checkouts.jsx`, `CheckoutHistoryList.jsx`, `CheckoutDetailModal.jsx`<br>**OUT**: `SuperRevertActionModal.jsx`, ปุ่ม `"ย้อนกลับ / Revert"` เฉพาะ `SUPER`, Badge `"Reverted by <name> on <date>"`, รองรับ `360px` และ `indefinite` loan<br>**VERIFY**: `node scripts/verify-super-revert-ui.mjs` ผ่าน 100% |
| **T6** | **Notifications, i18n Parity & Final Verification** | `test-engineer` | `@verify-changes`, `@lint-and-validate` | **P3** | T4, T5 | **IN**: `th.js`, `en.js`<br>**OUT**: คำแปลไทย/อังกฤษครบทุกคีย์<br>**VERIFY**: `npm run check:i18n && npm run lint && npm run build` ผ่านทั้งหมด |

---

## 5. Phase X: Final Verification Checklist

- [ ] `node scripts/verify-super-revert-sql-sandbox.mjs` — พิสูจน์การทำงานของ RPC, การคืนค่าสต็อก, การป้องกัน S/N ถูกยืมซ้ำ, การบล็อกบทบาทอื่น (`403`), และ Append-only Audit Log
- [ ] `node --test src/lib/superRevert.test.js` — พิสูจน์การแปลงรหัสข้อผิดพลาด (`400`, `401`, `403`, `409`, `422`, `500`) และ State Guards
- [ ] `node scripts/verify-super-revert-ui.mjs` — พิสูจน์เงื่อนไขการซ่อนปุ่มสำหรับ non-SUPER, การล็อกสิทธิ์ใน `/roles`, และ Layout `360px` (`whitespace-nowrap`)
- [ ] `npm run check:i18n` — Thai & English i18n key parity 100%
- [ ] `npm run lint` — ESLint 0 errors
- [ ] `npm run build` — Vite production bundle build สำเร็จ
