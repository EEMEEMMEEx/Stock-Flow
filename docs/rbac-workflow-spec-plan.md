# Implementation Plan: อัปเดตผังและตารางสิทธิ์ Dynamic RBAC v2.5 (rbac-workflow.html)

แผนการดำเนินงานและสเปกระบบฉบับสมบูรณ์ สำหรับการปรับปรุงผังกระบวนการทำงาน ตารางสิทธิ์การใช้งาน (31 Dynamic Permissions) เครื่องมือจำลองสิทธิ์ (Role Simulator) และวงจรชีวิตการออกเอกสาร PDF (PDF Template Engine) ในไฟล์ [rbac-workflow.html](file:///d:/APP/Stock-Flow-app/rbac-workflow.html)

---

## 1. เป้าหมาย (Goal)

ยกระดับเอกสารสเปกและผังกระบวนการทำงานใน `rbac-workflow.html` ให้สอดคล้องกับโครงสร้างระบบจริงของ **Stock-Flow** ตาม Supabase Migration 09 (`09_dynamic_rbac_roles_permissions.sql`) โดยครอบคลุม:
1. การรองรับบทบาทผู้ใช้งานหลัก 4 บทบาท (`ADMIN`, `SUPERVISOR`, `STAFF`, `VIEWER`)
2. การระบุ Permission Codes แบบ Granular ทั้ง 31 สิทธิ์ อ้างอิงตรงกับฟังก์ชัน `AuthContext.can(permission_code)`
3. การแสดงวงจรชีวิตของเอกสาร PDF (PDF Template Engine) ตั้งแต่ขั้นตอนสร้างคำขอขอเบิก (`Draft PDF`) จนถึงเอกสารนำส่งอุปกรณ์ฉบับสมบูรณ์ (`Final Delivery Note PDF`)
4. การให้ตัวอย่าง PL/pgSQL Function `has_permission()` และ RPC `get_user_permissions()` ล่าสุด

---

## 2. ขอบเขตการเปลี่ยนแปลง (Scope & Proposed Changes)

### [HTML Spec & Interactive Visualizer]

#### 1. Header & Version Badge
- **Version Tag**: ปรับเป็น `v2.5 Dynamic RBAC Spec`
- **Description**: ระบุการรองรับ 31 Dynamic Permission Codes และ Supabase RLS/RPC Integration

#### 2. Tab 1: Visual Workflow Diagrams & Node Inspector
- **Diagram 1: Swimlane Flowchart**:
  - แสดงการทำงานแบ่งตาม 3 เลนหลัก: `Staff / Requester`, `Supabase Database & RLS Engine`, `Approver / Admin / Supervisor`
  - เพิ่มโหนด `📄 2.5 สร้างร่างเอกสารใบขอเบิก (PDF Template)` หลังการ Checkout ของ Staff เพื่อส่งแนบให้ Admin/Supervisor ตรวจสอบ
  - เพิ่มโหนด `📄 5. ออกใบเบิก & นำส่งอุปกรณ์ฉบับสมบูรณ์ (PDF Delivery Note)` หลังการอนุมัติบิล ก่อนส่งมอบอุปกรณ์จริง
- **Diagram 2: Detailed Database Transaction & Approval Atomic Workflow**:
  - *Phase 1 (Staff Flow & Draft PDF)*: Checkout -> `INSERT Request (status = pending)` -> `สร้างร่างเอกสารใบขอเบิก (Draft PDF)`
  - *Phase 2 (Review & Decision)*: Admin / Supervisor ตรวจสอบคำขอ & ตรวจเอกสารใบขอเบิก PDF
  - *Phase 3 (Atomic Transaction)*: Supabase RPC Single Transaction (`FOR UPDATE`, Stock Check, Deduct Stock, `COMMIT All-or-Nothing`)
  - *Phase 4 (Final PDF Delivery Note)*: Render เอกสารฉบับสมบูรณ์อ้างอิง `pdf-templates.jsx` / `PDF Template`
  - *Phase 5 (Fulfillment & Confirmation)*: รับอุปกรณ์จริง และกด "ยืนยันการรับของแล้ว" (`status = completed`)
- **Node Inspector (#1 ถึง #9)**:
  - ระบุ Permission Code สำหรับทุก Node (เช่น `items.view`, `withdrawals.create`, `withdrawals.approve`, `withdrawals.complete`, `stock_in.create`, `roles.manage_permissions`)

#### 3. Tab 2: Comprehensive Permission Matrix
- **คอลัมน์สิทธิ์**: เพิ่มคอลัมน์ `Supervisor` และคอลัมน์ `Permission Code`
- **31 Permissions (9 Categories)**:
  1. 📊 Dashboard: `dashboard.view`
  2. 📁 Projects: `projects.view`, `projects.create`, `projects.update`, `projects.delete`
  3. 📦 Items Master: `items.view`, `items.create`, `items.update`, `items.delete`
  4. 🏭 Stock In: `stock_in.view`, `stock_in.create`
  5. 🛒 Withdrawals: `withdrawals.view`, `withdrawals.create`, `withdrawals.approve`, `withdrawals.reject`, `withdrawals.complete`
  6. 📜 History & Reports: `history.view`, `reports.view`, `reports.export`
  7. 👥 Users: `users.view`, `users.create`, `users.update`, `users.deactivate`, `users.reset_password`
  8. 🛡️ Dynamic RBAC Roles: `roles.view`, `roles.create`, `roles.update`, `roles.delete`, `roles.manage_permissions`
  9. ⚙️ Settings: `settings.view`, `settings.update`
- **Filter Buttons**: รองรับการกรองตามบทบาท `All Roles`, `Admin`, `Supervisor`, `Staff`, `Viewer`

#### 4. Tab 3: Interactive Role Simulator
- เพิ่มตัวเลือกบทบาท `SUPERVISOR` ใน `<select id="sim-role">`
- อัปเดต JavaScript Evaluation Engine (`runSimulation()`) ให้ประเมินผลสิทธิ์ RLS และ UI Preview สำหรับ Supervisor และปุ่มเบิกจ่าย/อนุมัติได้อย่างถูกต้อง

#### 5. Tab 4: SQL RLS & RPC Scripts
- แสดงโค้ด PL/pgSQL `has_permission()` และ RPC `get_user_permissions()`
- แสดง RLS Policies ล่าสุดสำหรับ `withdrawal_orders`, `items`, `projects`, `roles`, `role_permissions`

---

## 3. รายการไฟล์ที่เกี่ยวข้อง (Files Modified)

- [rbac-workflow.html](file:///d:/APP/Stock-Flow-app/rbac-workflow.html)
- [docs/rbac-workflow-spec-plan.md](file:///d:/APP/Stock-Flow-app/docs/rbac-workflow-spec-plan.md)
- [CHANGELOG.md](file:///d:/APP/Stock-Flow-app/CHANGELOG.md)

---

## 4. แผนการตรวจสอบความถูกต้อง (Verification Plan)

### Manual Verification Checklist
- [x] ตรวจสอบการเปิดไฟล์ `rbac-workflow.html` ในเบราว์เซอร์
- [x] ตรวจสอบผัง Mermaid Flowchart ทั้ง 2 ผังว่าแสดงขั้นตอนสร้าง PDF Draft และ Final Delivery Note ได้ถูกต้องสวยงาม
- [x] ตรวจสอบตาราง Permission Matrix ว่ามี 6 คอลัมน์ ครอบคลุม 31 Permission Codes
- [x] ตรวจสอบปุ่ม Filter บทบาท (Admin, Supervisor, Staff, Viewer) ในตาราง Matrix
- [x] ตรวจสอบการทดสอบบทบาท Supervisor ใน Role Simulator
- [x] ตรวจสอบฟังก์ชันคัดลอก SQL Script ใน Tab 4
