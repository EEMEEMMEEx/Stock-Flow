# Implementation Plan - Enhance `+ Add User` Flow & Integration with Existing Email Infrastructure

ปรับปรุงและยกระดับกระบวนการสร้างผู้ใช้งานใหม่ (`+ เพิ่มผู้ใช้งาน (Add User)`) บนหน้า `/users` โดยเชื่อมต่อกับระบบส่งอีเมลเดิมของแอปพลิเคชัน (`emailService.js` / `pdf-service`) นำ Email Infrastructure และ Branding เดิมกลับมาใช้ประโยชน์ 100% โดยไม่ต้องสร้างบริการส่งอีเมลใหม่หรือซ้ำซ้อน

---

## User Review Required

> [!IMPORTANT]
> **การใช้ประโยชน์จาก Email Infrastructure เดิม (No Duplicate Email Service):**
> - ใช้บริการส่งอีเมลที่มีอยู่เดิมใน `src/lib/emailService.js` ซึ่งเชื่อมต่อกับ Node.js Express backend (`pdf-service/server.js`) ผ่านโปรโตคอล SMTP / Nodemailer
> - ไม่มีการเพิ่ม Third-Party Email Provider หรือแก้สถาปัตยกรรมอีเมลเดิม
> - รักษาสิทธิประโยชน์และความน่าเชื่อถือของระบบ SMTP และระบบบันทึกประวัติ (Audit Log) เดิม

> [!NOTE]
> **ความปลอดภัยของข้อมูลและการแยกส่วนการทำงาน (Transaction Isolation):**
> - **การสร้างรหัสผ่าน:** อีเมลจะไม่ส่งรหัสผ่านแบบ Plain-text เด็ดขาด โดยผู้ใช้ใหม่จะเข้าใช้งานผ่านลิงก์ล็อกอินที่ปลอดภัยและตั้งรหัสผ่านใหม่เอง (First-Time Password Reset Flow)
> - **การแยกส่วนพฤติกรรมเมื่อเกิดข้อผิดพลาด:** 
>   1. หากสร้างผู้ใช้สำเร็จ แต่ส่งอีเมลไม่ผ่าน: ระบบจะ **คงบัญชีผู้ใช้ไว้** ไม่ลบข้อมูล และแสดงข้อความเตือนให้ผู้ดูแลระบบกดปุ่ม `Resend Invitation` ภายหลังได้
>   2. หากสร้างผู้ใช้ไม่สำเร็จ: ระบบจะไม่พยายามส่งอีเมลและแจ้งสาเหตุข้อผิดพลาดให้แอดมินทราบทันที

---

## Proposed Changes

### 1. Email Template & Service Enhancement

#### [MODIFY] [emailRenderer.js](file:///d:/APP/Stock-Flow-app/src/lib/emailRenderer.js)
- เพิ่มฟังก์ชัน `renderUserInvitationEmailHtml({ appName, userName, userEmail, roleName, projectAccessSummary, actionUrl, branding })`
- ออกแบบอีเมลแบบ Responsive HTML สอดคล้องตาม visual identity ของ StockFlow มีตราสัญลักษณ์ ข้อความต้อนรับ ตารางแสดงรายละเอียดบัญชี (ชื่อ, อีเมล, บทบาท, สิทธิ์โครงการ) และปุ่ม CTA `เข้าสู่ระบบ StockFlow (Sign In)`

#### [MODIFY] [emailService.js](file:///d:/APP/Stock-Flow-app/src/lib/emailService.js)
- เพิ่มฟังก์ชัน `sendUserInvitationEmail({ recipientEmail, userName, roleName, projectAccessSummary, actionUrl })`
- เชื่อมต่อและเรียกใช้ `sendStockFlowEmail` เพื่อส่งอีเมลต้อนรับด้วย HTML Template ล่าสุด

---

### 2. Add User Dialog Redesign & Email Options

#### [MODIFY] [AddUserModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/users/AddUserModal.jsx)
- เพิ่มฟิลด์ **Section D: การส่งอีเมลแจ้งเตือน (Email Notification)**:
  - เพิ่ม Checkbox `[✓] ส่งอีเมลเชิญและแจ้งเตือนเปิดใช้งานบัญชี (Send invitation email)` (เป็นค่าเริ่มต้น: Checked)
  - แสดงคำอธิบายคำชี้แจงชัดเจนเกี่ยวกับการส่งอีเมลต้อนรับ
- ส่งพารามิเตอร์ `send_invitation: boolean` ไปยังฟังก์ชันบันทึกข้อมูล

---

### 3. User Provisioning & Resend Invitation Flow

#### [MODIFY] [UserManagement.jsx](file:///d:/APP/Stock-Flow-app/src/pages/UserManagement.jsx)
- **ปรับปรุง `handleCreateUser`:**
  - ขั้นตอนที่ 1: ดำเนินการสร้างบัญชีผู้ใช้ใน Supabase Auth / Profiles ผ่าน `admin_create_user`
  - ขั้นตอนที่ 2: หากสร้างสำเร็จและ `send_invitation === true` ให้เรียกใช้ `sendUserInvitationEmail`
  - จัดการ Error แยกต่างหากอย่างถูกต้อง (ถ้ารายการส่งอีเมลล้มเหลว จะแสดง Toast เตือนแต่คงบัญชีผู้ใช้ไว้)
- **เพิ่มฟังก์ชัน `handleResendInvitation(user)`:**
  - สำหรับกดส่งอีเมลเชิญซ้ำจากตารางตารางจัดการผู้ใช้งาน
  - มีสถานะ Loading ประจำแถวผู้ใช้ ป้องกันการกดสแปมซ้ำ
  - แสดง Toast แจ้งเตือนความสำเร็จหรือล้มเหลวอย่างชัดเจน

---

## Verification Plan

### Automated / Build Verification
- รัน `npm run build` ตรวจสอบความถูกต้องของไวยากรณ์และการ Import
- รัน `npm run lint` ตรวจสอบโค้ดตามมาตรฐาน

### Manual Verification
1. **ทดสอบการสร้างผู้ใช้ใหม่พร้อมส่งอีเมล:**
   - กรอกข้อมูลสร้างผู้ใช้ใหม่ใน `/users` พร้อมติ๊กเลือก `[✓] ส่งอีเมลเชิญ`
   - ตรวจสอบว่าระบบสร้างบัญชีใน Supabase สำเร็จ และส่งอีเมลต้อนรับไปยังผู้รับ
2. **ทดสอบ Transaction Isolation เมื่อส่งอีเมลไม่ผ่าน:**
   - ทดสอบกรณีอีเมลผิดหรือเซิร์ฟเวอร์ SMTP ไม่ตอบสนอง: บัญชีผู้ใช้ต้องไม่ถูกลบ และแสดงเตือนพร้อมปุ่ม Resend
3. **ทดสอบปุ่ม Resend Invitation:**
   - กดปุ่ม `Resend Invitation` จากตาราง User Management
   - ตรวจสอบสถานะ Loading และการส่งอีเมลเชิญซ้ำสำเร็จ
4. **ความปลอดภัย:**
   - ตรวจสอบว่าไม่มี Plain-text Password ถูกส่งในเนื้อหาอีเมล
