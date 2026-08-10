# แก้ความสอดคล้องของสิทธิ์ Sidebar และ Route

## เป้าหมาย

ทำให้การแสดงเมนูและการเข้าถึง `/items` กับ `/stock-in` ใช้ permission จาก `AuthContext.can()` เดียวกัน โดยคงการป้องกัน direct URL และ backend ไว้

## งาน

- [x] ยืนยัน permission จริงของบทบาท Staff จาก `get_user_permissions` และเทียบกับ `items.view` / `stock_in.view` → ตรวจว่ารายการใน Sidebar สอดคล้องกับ permission ที่คืนมา
- [x] จัดระเบียบ `Sidebar.jsx` ให้ nav configuration ระบุ `permission` แล้ว filter ด้วย `can(item.permission)` โดยคง Manual เป็นเมนูสาธารณะ → ตรวจทั้ง desktop และ mobile แสดงรายการเดียวกันโดยไม่เกิด flash ระหว่าง `loading`
- [x] ปรับ `Items.jsx` และ `StockIn.jsx` ให้ไม่ใช้ `isAdmin` เป็น route gate ซ้ำ และพึ่ง `PermissionRoute`/`can()` ของ permission เดียวกัน → ผู้ที่มี `*.view` เปิดหน้าได้; direct URL ที่ไม่มีสิทธิ์ยังถูก redirect
- [x] ปรับ `PermissionRoute.jsx` ให้แสดงข้อความภาษาไทยและนำผู้ใช้ไปยังปลายทางที่เข้าถึงได้ โดยไม่เผยชื่อ role หรือ permission ภายใน → เปิด URL ที่ไม่มีสิทธิ์แล้วได้รับ toast ที่ควบคุมได้และไม่เห็นหน้าว่าง
- [x] ตรวจสิทธิ์สำหรับการกระทำระดับเขียนใน Items/Stock In แยกจากสิทธิ์ดู (`items.create`, `stock_in.create` เป็นต้น) และคง Supabase RLS/RPC เดิม → การซ่อนเมนูไม่แทนการตรวจสิทธิ์ข้อมูล
- [x] ทดสอบ Staff และ Admin สำหรับ Dashboard, Projects, Items, Stock In, Withdrawals, History, Manual รวมทั้ง direct URL และการอัปเดต permission ผ่าน `refreshProfile` → สถานะเมนูและ route ตรงกัน
- [x] รัน `npm.cmd run build`, lint/test ที่โปรเจกต์รองรับ และตรวจ Console → build ผ่านและไม่มี regression จากการแก้

## สำเร็จเมื่อ

- [x] เมนูทั้ง desktop และ mobile แสดงเฉพาะ route ที่ `can(permission)` อนุญาต
- [x] ไม่มี `isAdmin` ที่ใช้ขัดกับ RBAC สำหรับ `/items` และ `/stock-in`
- [x] ผู้ใช้ที่ไม่มีสิทธิ์ยังเข้าผ่าน URL โดยตรงไม่ได้ และ backend ยังคงบังคับใช้สิทธิ์

## หมายเหตุ

ผลการตรวจปัจจุบัน: `Sidebar` และ `PermissionRoute` ใช้ `can('items.view')`/`can('stock_in.view')` แล้ว แต่ `Items.jsx` และ `StockIn.jsx` มีการปฏิเสธด้วย `isAdmin` ซ้ำ ซึ่งเป็นต้นเหตุของ UX ที่ไม่สอดคล้องกัน. สิทธิ์จริงของ Staff ต้องเป็นตัวตัดสินว่าจะซ่อนเมนูหรืออนุญาตหน้า ไม่ใช่ชื่อ role.
