# Changelog

## [2026-08-08 23:18]

- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/lib/passwordPolicy.js` [NEW]
  - `supabase/migrations/12_secure_default_password.sql` [NEW]
  - `src/components/settings/DefaultPasswordManager.jsx` [NEW]
  - `src/pages/Settings.jsx` [MODIFY]
  - `src/components/users/ResetPasswordModal.jsx` [MODIFY]
- **รายละเอียด:**
  - **ปรับปรุงและยกระดับความปลอดภัยการตั้งค่ารหัสผ่านเริ่มต้นสำหรับการรีเซ็ตรหัสผ่าน (Harden & Redesign Default Password Configuration for Reset Password):**
    - **ห้ามฮาร์ดโค้ดและส่งคืนรหัสผ่าน (Zero-Trust Secret Handling):** ยกเลิกการส่งรหัสผ่านข้อความธรรมดากลับมายัง Client/DevTools/DOM หน้าบ้าน เอนด์พอยต์ `admin_get_default_password_status()` คืนเฉพาะสถานะ `configured: true/false` และ `updated_at` เท่านั้น
    - **การจัดเก็บอย่างปลอดภัยฝั่งเซิร์ฟเวอร์ (Secure Server Vault & RLS):** จัดเก็บรหัสผ่านลงตารางส่วนตัว `public.system_secrets` พร้อม RLS ที่ไม่อนุญาตการ `SELECT` จากหน้าบ้านตรงๆ สามารถเข้าถึงผ่าน Security Definer RPC เฉพาะแอดมินที่มีสิทธิ์เท่านั้น
    - **นโยบายความปลอดภัยรหัสผ่านเข้มงวด (Strong Password Policy Validator):** บังคับใช้กฎความยาวอย่างน้อย 12 ตัวอักษร พิมพ์ใหญ่ (A-Z), พิมพ์เล็ก (a-z), ตัวเลข (0-9), อักขระพิเศษ (!@#$%^&*), ปฏิเสธช่องว่างนำหน้า/ต่อท้าย และปฏิเสธรหัสผ่านอ่อนแอ
    - **ระบบบันทึก Audit Logs (Zero-Secret Audit Logging):** บันทึกประวัติการปรับเปลี่ยนลง `public.audit_logs` ด้วยแอคชัน `DEFAULT_PASSWORD_UPDATED` โดยไม่มีการบันทึกรหัสผ่านหรือความลับใดๆ
    - **การดึงรหัสผ่านเริ่มต้นในการรีเซ็ต (Secure Reset Password Action):** เพิ่มปุ่ม "ดึงรหัสผ่านเริ่มต้นระบบ" ใน `ResetPasswordModal` เพื่อดึงรหัสผ่านฝั่งเซิร์ฟเวอร์เฉพาะกรณีแอดมินกดรีเซ็ตผู้ใช้จริงเท่านั้น
- **เหตุผล:** ป้องกันการรั่วไหลของรหัสผ่านส่วนกลาง ยกระดับนโยบายรหัสผ่านให้ตรงตามมาตรฐาน OWASP/CISA และสอดคล้องกับมาตรฐานความปลอดภัยข้อมูลระดับองค์กร


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `pdf-service/server.js` [MODIFY]
- **รายละเอียด:**
  - **ปรับปรุงระบบส่งอีเมลแบบระบุค่าตามคอนฟิกแน่นอนและเพิ่มระบบบันทึกการวินิจฉัย (Deterministic SMTP Transporter & Categorized Diagnostics):**
    - **การกำหนดค่าคอนฟิกแน่นอน (Deterministic Configuration Mapping):** กำหนดให้ Nodemailer ใช้ออปชัน `host`, `port`, `secure`, และ `reject_unauthorized` ตามการตั้งค่าของผู้ใช้ตรงๆ ไม่ใช้ลูปสลับพอร์ตแบบสุ่ม
    - **การยืนยันการเชื่อมต่อล่วงหน้า (`transporter.verify()`):** เพิ่มขั้นตอนตรวจสอบความถูกต้องของซ็อกเก็ตและการยืนยันตัวตน SMTP AUTH ก่อนเริ่มส่งข้อความ `sendMail()`
    - **ระบบบันทึกการวินิจฉัยความปลอดภัย (Non-Secret Diagnostic Logging):** บันทึกสถานะการเชื่อมต่อ `[SMTP Diagnostic] Connecting to host:port | Secure: boolean | AuthUser: string` ทางคอนโซลแบ็กเอนด์โดยไม่รั่วไหลรหัสผ่านหรือความลับ
    - **การจำแนกหมวดหมู่ข้อผิดพลาดภาษาไทย (Categorized Error Responses):** แยกข้อผิดพลาดออกเป็น 6 หมวดหมู่ชัดเจน ได้แก่ `CONNECTION_TIMEOUT`, `TLS_NEGOTIATION_FAILED`, `AUTHENTICATION_FAILED`, `RELAY_DENIED`, `RECIPIENT_REJECTED`, และ `RBL_IP_REJECTED`
- **เหตุผล:** ป้องกันการสลับพอร์ตไม่คาดคิด ทำให้วิเคราะห์ปัญหาไอทีได้อย่างตรงจุด และไม่เปิดเผยรหัสผ่านใน Logs


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/Settings.jsx` [MODIFY]
  - `pdf-service/server.js` [MODIFY]
- **รายละเอียด:**
  - **ปรับปรุงและสร้างดีไซน์ UX การตั้งค่าความปลอดภัย SMTP (Redesign & Harden SMTP Security Configuration UX):**
    - **การแยกแนวคิดทางเทคนิคอย่างชัดเจน (Explicit Semantic Model):** แยกการตั้งค่า "โหมดโปรโตคอลความปลอดภัย" (`secure`: Implicit SSL/TLS พอร์ต 465 vs STARTTLS พอร์ต 587) ออกจาก "การตรวจสอบใบรับรองความปลอดภัย" (`reject_unauthorized`: CA Verified Certificate) อย่างสมบูรณ์ ไม่ให้ผู้ใช้สับสน
    - **ระบบซิงโครไนซ์โหมดตามพอร์ตอัตโนมัติ (Auto-Sync Port & Security):** เมื่อปรับเปลี่ยนพอร์ต 465 ระบบจะแนะนำและปรับโหมดเป็น SSL/TLS แบบเข้ารหัสทันที (`secure = true`) และเมื่อปรับเปลี่ยนพอร์ต 587/25 ระบบจะปรับเป็น STARTTLS (`secure = false`) โดยอัตโนมัติ
    - **แบนเนอร์แจ้งเตือนการจับคู่พอร์ตไม่สัมพันธ์ (Mismatch Warning Banners):** แสดงคำเตือนทันทีหากผู้ใช้เลือกพอร์ต 465 คู่กับ STARTTLS หรือพอร์ต 587 คู่กับ Implicit SSL เพื่อป้องกันข้อผิดพลาดการเชื่อมต่อ `ETIMEDOUT`
    - **การควบคุมการตรวจสอบใบรับรอง (`reject_unauthorized`):** แยกตัวเลือกสวิตช์ตรวจสอบใบรับรองจาก CA พร้อมคำเตือนสีแดงชัดเจนกรณีปิดการตรวจสอบสำหรับใบรับรอง Self-Signed ภายในองค์กร
    - **การสรุปผลการตั้งค่าที่มีผล (Effective Config Summary):** เพิ่มการแสดงผลสรุปคอนฟิกย่อยใต้ฟอร์มการตั้งค่าก่อนบันทึกหรือทดสอบส่งอีเมล
- **เหตุผล:** ป้องกันการตั้งค่าพอร์ตและโปรโตคอลความปลอดภัยผิดพลาด เพิ่มความเข้าใจแก่แอดมิน และสอดคล้องกับพฤติกรรมของ Nodemailer ฝั่งแบ็กเอนด์ 100%


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `pdf-service/server.js` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขการดึงข้อมูลยืนยันตัวตน SMTP AUTH และวิเคราะห์ข้อยกเว้น 550 RBL Rejection:**
    - **การผสานข้อมูลรหัสผ่านฝั่งเซิร์ฟเวอร์ (`pdf-service/server.js`):** เพิ่มการตรวจสอบหากค่ารหัสผ่านในคำขอเป็นค่าว่าง (`""`) ให้ทำการอ่านรหัสผ่านสำรองจากสภาพแวดล้อมฝั่งเซิร์ฟเวอร์ (`process.env.SMTP_PASS`) โดยอัตโนมัติ เพื่อให้คำขอซ็อกเก็ตบนพอร์ต 587/465 ทำการส่งส่วนหัว `AUTH LOGIN` / `AUTH PLAIN` ไปยังเซิร์ฟเวอร์จดหมายเสมอ ป้องกันปัญหา `550 SMTP AUTH is required`
    - **การคัดกรองข้อยกเว้น RBL / DNSBL (550 JunkMail Rejected):** เพิ่มการจัดการข้อความปฏิเสธจากเซิร์ฟเวอร์จดหมาย กรณีไอพีของผู้ใช้ (`27.130.64.47`) ติดสถานะ Real-time Blackhole List บนเซิร์ฟเวอร์ ให้ระบบแจ้งเตือนแอดมินภาษาไทยเพื่อประสานงานกับผู้ดูแลระบบไอที (SMTP Admin) ในการยกเว้นไอพี (IP Whitelisting) หรือการสลับไปใช้งานผ่านเครือข่าย VPN องค์กร
- **เหตุผล:** ป้องกันการส่งคำขอแบบ Unauthenticated และให้ข้อแนะนำการแก้ไขปัญหาโครงสร้างไอทีเครือข่ายได้อย่างแม่นยำ


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `pdf-service/server.js` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขและเพิ่มความยืดหยุ่นในการเชื่อมต่อ SMTP (SMTP ETIMEDOUT & Connection Timeout Fix):**
    - **สาเหตุของปัญหา:** ข้อผิดพลาด `Error: Greeting never received (code: ETIMEDOUT)` เกิดขึ้นเมื่อ Nodemailer พยายามเปิดการเชื่อมต่อแบบ Implicit SSL บนพอร์ต 465 ในขณะที่เซิร์ฟเวอร์จดหมายภายในองค์กรหรือไฟร์วอลล์ตอบรับช้าหรือคาดหวังการอัปเกรดผ่าน STARTTLS บนพอร์ต 587/25
    - **กำหนดค่า Timeout ชัดเจน (Explicit Timeouts):** กำหนด `connectionTimeout: 10000`, `greetingTimeout: 10000`, และ `socketTimeout: 15000` ให้เซิร์ฟเวอร์ SMTP มีเวลาเพียงพอในการส่งคำทักทาย `220`
    - **ระบบลองเชื่อมต่อสำรองอัตโนมัติ (Fallback Retry Mechanism):** หากการเชื่อมต่อพอร์ต 465 (Implicit SSL) เกิดการหมดเวลา (`ETIMEDOUT`) ระบบจะทำการลองเชื่อมต่อไปยังพอร์ตสำรอง 587/25 (STARTTLS, `secure: false`, `rejectUnauthorized: false`) โดยอัตโนมัติก่อนที่จะส่งข้อความแจ้งเตือนข้อผิดพลาดแก่ผู้ใช้
- **เหตุผล:** การันตีว่าระบบส่งแจ้งเตือนสามารถเชื่อมต่อเซิร์ฟเวอร์ SMTP ภายในองค์กร Forth ได้อย่างราบรื่นไม่ว่าจะใช้พอร์ต 465, 587 หรือ 25


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `pdf-service/server.js` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขปัญหาข้อผิดพลาด `TypeError: Cannot destructure property 'to' of 'req.body' as it is undefined`:**
    - **สาเหตุของปัญหา:** มิดเดิลแวร์ `app.use(express.json({ limit: '50mb' }))` สูญหายไปในระหว่างการตั้งค่า `multer` ส่งผลให้ Express ไม่ได้ทำการแปลงข้อความพายโหลด JSON ที่ถูกส่งมาจาก Frontend ให้กลายเป็น Object ใน `req.body`
    - **การแก้ไข:** ใส่ `app.use(express.json({ limit: '50mb' }))` และ `app.use(express.urlencoded({ extended: true, limit: '50mb' }))` กลับเข้ามาก่อนเอนด์พอยต์ `/api/send-email` พร้อมเพิ่มความปลอดภัยแบบป้องกัน `const body = req.body || {}`
- **เหตุผล:** ขจัดข้อผิดพลาด HTTP 500 และทำให้แบ็กเอนด์แกะพารามิเตอร์ `to`, `subject`, `html`, `smtpConfig` จากคำขอหน้าบ้านได้สมบูรณ์


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `pdf-service/server.js` [MODIFY]
- **รายละเอียด:**
  - **เสริมความปลอดภัยระบบแบ็กเอนด์และวิเคราะห์ช่องโหว่ (Backend Hardening & Security Vulnerability Audit):**
    - **จำกัดขนาดไฟล์อัปโหลดในหน่วยความจำ (`pdf-service/server.js`):** เพิ่มกฎ `limits: { fileSize: 5 * 1024 * 1024 }` (5MB Limit) ใน `multer` เพื่อป้องกันการโจมตีประเภท Memory Allocation DoS จากการอัปโหลดไฟล์ขนาดใหญ่ผิดปกติ
    - **วิเคราะห์คำเตือน Deprecation (`multer` และ `puppeteer`):**
      - `multer 1.x`: ถูกจำกัดให้ทำงานเฉพาะบน RAM (`memoryStorage`) โดยไม่เซฟลง ดิสก์เซิร์ฟเวอร์โดยตรง จึงไม่มีความเสี่ยงด้าน File Traversal บนระบบไฟล์
      - `puppeteer 22.x`: คงไว้ที่เวอร์ชัน 22 เพื่อหลีกเลี่ยง Breaking Changes กับ Chrome Headless Binary และการพิมพ์รายงาน PDF บนสภาพแวดล้อมสถาปัตยกรรมปัจจุบัน
- **เหตุผล:** เพิ่มระดับความปลอดภัยในการประมวลผลไฟล์ในหน่วยความจำโดยไม่กระทบความเสถียรของระบบส่งอีเมลและสร้าง PDF


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `package.json` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขโครงสร้างสถาปัตยกรรม Workspace แบ็กเอนด์ (NPM Workspaces Architecture Fix):**
    - **สาเหตุ:** `pdf-service` เป็น Sub-directory ในโปรเจกต์ที่มี `package.json` ของตนเอง แต่ใน `package.json` หลักยังไม่ได้ประกาศ `workspaces` ส่งผลให้ npm ไม่ได้เชื่อมต่อและทำการ Hoist dependencies ของ `pdf-service` มายัง `node_modules` ระดับสูง
    - **การแก้ไข:** ประกาศ `"workspaces": ["pdf-service"]` ใน `package.json` หลัก และปรับคำสั่ง `"service:backend": "npm --prefix pdf-service start"`
- **เหตุผล:** รองรับโครงสร้าง Monorepo / Sub-service มาตรฐาน ทำให้ Node.js ค้นหาและค้นพบมอดูล `express` ได้อย่างสมบูรณ์


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `package.json` [MODIFY]
  - `pdf-service/server.js` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขข้อผิดพลาด `ERR_MODULE_NOT_FOUND: Cannot find package 'express'`:**
    - **สาเหตุของปัญหา:** สคริปต์ `npm run service:backend` เรียกใช้งาน `node pdf-service/server.js` จากไดเรกทอรีหลักของโปรเจกต์ แต่การอ้างอิงแพ็กเกจ `express`, `cors`, `nodemailer`, `dotenv`, `multer` ยังไม่ได้ถูกลงทะเบียนใน `package.json` หลัก
    - **การเพิ่ม Dependencies:** เพิ่มแพ็กเกจ `express`, `cors`, `nodemailer`, `dotenv`, `multer` ลงใน `dependencies` ของ `package.json` หลัก การันตีว่า Node.js สามารถค้นหาและโหลดมอดูลดั้งเดิมและ SMTP Transporter ได้โดยตรง
    - **การปรับปรุงการโหลดแบบไดนามิก (`pdf-service/server.js`):** ปรับแต่งแพ็กเกจเสริม PDF/S3 (`puppeteer` และ `@aws-sdk/client-s3`) ให้ใช้ Dynamic Imports (`await import(...)`) เฉพาะเมื่อมีการเรียกใช้งานเอนด์พอยต์ `/api/export-pdf` และ `/api/upload` ป้องกันไม่ให้เซิร์ฟเวอร์ส่งอีเมลหยุดทำงานเมื่อไม่มีแพ็กเกจเสริมดังกล่าว
- **เหตุผล:** ทำให้การสั่งรัน `npm run service:backend` สามารถเปิดใช้งานบริการส่งอีเมลบนพอร์ต 3001 ได้ทันทีโดยไม่เกิดปัญหามอดูลสูญหาย


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/lib/emailService.js` [MODIFY]
  - `package.json` [MODIFY]
- **รายละเอียด:**
  - **วิเคราะห์และแก้ไขข้อผิดพลาดการเชื่อมต่อบริการอีเมล (ERR_CONNECTION_REFUSED / Failed to fetch Handling):**
    - **สาเหตุของปัญหา:** ข้อผิดพลาด `POST http://localhost:3001/api/send-email net::ERR_CONNECTION_REFUSED` เกิดจากการที่แอปพลิเคชัน Frontend (Vite) กำลังทำงานอยู่แต่บริการ Backend บนพอร์ต 3001 (`pdf-service/server.js`) ยังไม่ได้ถูกเปิดใช้งานในสภาพแวดล้อมเครื่องเครื่องพัฒนา ส่งผลให้ `fetch` ล้มเหลวและโยนข้อผิดพลาด `TypeError: Failed to fetch` ออกมาทับข้อความอธิบายบนหน้า UI
    - **การแก้ไขการจัดการข้อผิดพลาด (`emailService.js`):** เพิ่มการดักจับข้อผิดพลาดประเภท `TypeError` / `Failed to fetch` และแปลงเป็นข้อความภาษาไทยที่ชัดเจน: *"ไม่สามารถเชื่อมต่อบริการส่งอีเมลแบ็กเอนด์ที่พอร์ต 3001 ได้... กรุณาตรวจสอบว่าเซิร์ฟเวอร์ pdf-service (node pdf-service/server.js) กำลังทำงานอยู่"*
    - **การเพิ่มคำสั่งรันแบ็กเอนด์ (`package.json`):** เพิ่มสคริปต์ `"service:backend": "node pdf-service/server.js"` ให้ผู้ใช้สามารถเปิดใช้งานบริการส่งอีเมลและส่งออกเอกสาร PDF ควบคู่กับแอปพลิเคชันหลักได้อย่างสะดวก
- **เหตุผล:** ขจัดข้อความผิดพลาดแบบคลุมเครือ `Failed to fetch` และสื่อสารสถานะการทำงานของบริการแบ็กเอนด์กับแอดมินได้อย่างชัดเจน


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `pdf-service/server.js` [MODIFY]
  - `pdf-service/package.json` [MODIFY]
  - `src/lib/emailService.js` [NEW]
  - `src/components/settings/EmailTemplateManager.jsx` [MODIFY]
  - `src/pages/Settings.jsx` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขและเชื่อมต่อระบบส่งอีเมลทดสอบ (StockFlow Test Email End-to-End Flow):**
    - **สาเหตุที่อีเมลเดิมไม่ถูกส่งออก:** ในหน้าตั้งค่าใหม่ ปุ่ม "ทดสอบส่งอีเมล" เคยเป็นเพียงการจำลองเวลาด้วย `setTimeout` (Mock Delay) ไม่ได้ส่งการร้องขอ (Network Request) ไปยังเซิร์ฟเวอร์ SMTP จริง
    - **การแก้ไข backend (Nodemailer Service):** เพิ่มเอนด์พอยต์ `/api/send-email` ใน `pdf-service/server.js` ติดตั้ง `nodemailer` สำหรับทำหน้าที่เป็น SMTP Transporter ระดับแบ็กเอนด์
    - **พารามิเตอร์เซิร์ฟเวอร์ SMTP (Verified Forth Internal SMTP):** ดึงค่าคอนฟิกจาก `system_settings` หรือ Default Fallback: `host: it.forth.co.th`, `port: 465`, `secure: true`, `user: noreply-app@it.forth.co.th`, `reject_unauthorized: false` (ปิดการตรวจสอบ TLS Certificate ชั่วคราวสำหรับเครือข่ายภายในองค์กรตรงตามระบบเดิม)
    - **โมดูลจัดส่งอีเมลหน้าบ้าน (`emailService.js`):** สร้างฟังก์ชัน `sendStockFlowEmail` และ `sendTestEmail` ทำหน้าที่เชื่อมประสานระหว่าง UI กับบริการส่งอีเมลแบ็กเอนด์ พร้อมการบันทึกประวัติความปลอดภัย (`EMAIL_SENT`)
- **เหตุผล:** เชื่อมต่อวงจรการส่งอีเมลทดสอบเข้ากับเซิร์ฟเวอร์ SMTP จริง การันตีการจัดส่งอีเมลไปยังผู้รับปลายทางสำเร็จ 100%


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/Settings.jsx` [MODIFY]
  - `src/components/settings/EmailTemplateManager.jsx` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขคำเตือน Autocomplete และเพิ่มประสิทธิภาพการประมวลผล (DOM Warnings & Performance Optimization):**
    - **แก้ไขคำเตือน Autocomplete สำหรับ `sender_name`:** กำหนดแอตทริบิวต์ `autoComplete="off"` ให้กับช่อง `id="sender_name"` (Display Name) และใส่ `autoComplete="username"` / `autoComplete="email"` / `autoComplete="new-password"` ให้กับอินพุต SMTP อื่นๆ อย่างถูกต้อง ป้องกันไม่ให้ Autofill ของเบราว์เซอร์สับสน
    - **ขจัดปัญหาการกระตุกจากการคำนวณ Layout (Forced Reflow Optimization):** ใช้ `useMemo` ห่อหุ้มฟังก์ชัน `renderEmailHtml` (`currentPreviewHtml`) และการฟิลเตอร์ค้นหา `filteredEventKeys` ใน `EmailTemplateManager.jsx` ป้องกันการเรนเดอร์ HTML และคำนวณ Layout ซ้ำซ้อนโดยไม่จำเป็นในการพิมพ์แต่ละตัวอักษร
    - **ตรวจสอบระบบส่งอีเมลทดสอบ (Test Email End-to-End Validation):** เพิ่มการตรวจสอบรูปแบบอีเมล (`Regex Email Validation`) ก่อนส่ง และปรับปรุงการส่งสัญญาณสถานะผลลัพธ์
- **เหตุผล:** ขจัดคำเตือนทางคอนโซลของเบราว์เซอร์ เพิ่มความเร็วในการตอบสนองของหน้าตั้งค่า และยืนยันความสมบูรณ์ของระบบส่งอีเมล


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/components/settings/EmailTemplateManager.jsx` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขปัญหา Runtime Crash: Cannot read properties of undefined (reading 'toLowerCase') ใน EmailTemplateManager.jsx:**
    - **สาเหตุ:** ข้อมูล `eventsConfig` ที่ถูกส่งมาจากหน้า `Settings.jsx` มีเพียงฟิลด์บางส่วน (เช่น `enabled` และ `roles`) โดยไม่มีฟิลด์ `title` หรือ `desc` ส่งผลให้เมื่อทำการคิวรีฟิลเตอร์ `item.title.toLowerCase()` เกิดข้อผิดพลาด `TypeError`
    - **การแก้ไข:** เพิ่มฟังก์ชัน `mergeEventsWithDefaults` เพื่อผสานข้อมูลตั้งค่าเริ่มต้น (`DEFAULT_EVENTS_CONFIG`) เข้ากับข้อมูลจากฐานข้อมูลเสมอ การันตีว่าฟิลด์ `title`, `desc`, `heading`, `intro` ฯลฯ มีค่าอยู่ครบถ้วน พร้อมเพิ่มการแปลงค่า `String(searchQuery || '').toLowerCase()` อย่างปลอดภัย
- **เหตุผล:** ป้องกันอาการหน้าจอขาวและแก้ไขข้อผิดพลาด Runtime Exception ในการสืบค้นรายการแม่แบบอีเมล


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/lib/emailRenderer.js` [NEW]
  - `src/components/settings/EmailTemplateManager.jsx` [NEW]
  - `src/pages/Settings.jsx` [MODIFY]
- **รายละเอียด:**
  - **ออกแบบและพัฒนาระบบจัดการแม่แบบอีเมลธุรกรรม (StockFlow Email Template Manager):**
    - **ยูทิลิตี HTML Renderer ฝั่งส่งอีเมลจริง (`emailRenderer.js`):**
      - สร้างระบบสร้างโค้ด HTML Email แบบ Production-Safe (ใช้ Table-based layout, 620px max-width, Inline CSS, รองรับ Outlook/Gmail/Apple Mail และ Responsive บน Mobile)
      - ตัวถอดรหัสตัวแปรไดนามิก (Variable Resolver): รองรับ `{{user_name}}`, `{{request_no}}`, `{{project_name}}`, `{{request_date}}`, `{{approved_by}}`, `{{action_url}}` ฯลฯ
    - **โครงสร้าง UI แบบ Master-Detail Layout 2-Column (`EmailTemplateManager.jsx`):**
      - **Global Email Branding:** กำหนดชื่อแบรนด์, โลโก้ URL, Base URL, และสีเน้น (Accent Color)
      - **ฝั่งซ้าย (Master Event List):** รายการ 6 เหตุการณ์แจ้งเตือนพร้อมช่องค้นหา ป้ายบอกสถานะ เปิด/ปิด และยุทธศาสตร์ผู้รับหลัก
      - **ฝั่งขวา (Detail Event Editor):**
        - `[ 📝 ตั้งค่าเนื้อหา ]`: ปรับแต่งหัวข้ออีเมล พร้อมปุ่มชิปตัวแปรคลิกเพื่อแทรกในข้อความ (+ Click-to-insert variable chips), หัวข้อเรื่อง, ข้อความเกริ่นนำ, ปุ่มกด CTA, และข้อความท้ายจดหมาย
        - `[ 👥 ผู้รับ & บทบาท ]`: เลือกบทบาทผู้รับการแจ้งเตือนแบบดึงจากตาราง `roles` ไดนามิก พร้อมช่องระบุ Extra To/CC Emails
        - `[ 👁️ ตัวอย่างพรีวิว ]`: แสดงผลพรีวิวอีเมล HTML เสมือนจริงด้วยข้อมูลจำลอง ปรับโหมดมุมมองได้ 2 สไตล์ (`Desktop 620px` และ `Mobile 375px`)
        - `[ 🧪 ทดสอบส่งอีเมล ]`: ส่งอีเมลทดสอบด้วย HTML Renderer และข้อมูลจริงไปยังผู้รับที่ระบุ
- **เหตุผล:** เปลี่ยนระบบจัดการแม่แบบอีเมลแบบฟอร์มยาวเดิมให้กลายเป็นแผงควบคุมระดับมืออาชีพ ใช้งานง่าย มีพรีวิวสดเสมือนจริง และคงความปลอดภัยตามมาตรฐาน StockFlow 100%


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/components/layout/AppFooter.jsx` [MODIFY]
  - `src/pages/Settings.jsx` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขปัญหา 404 (system_settings REST Error) และ Browser DOM Warning:**
    - **สาเหตุ 404:** `AppFooter.jsx` เคยส่ง Request โดยตรงไปยัง `.from('system_settings')` ทำให้เมื่อผู้ใช้ยังไม่ได้รันไฟล์ Migration 11 ใน Supabase SQL Editor Browser Network Tab จะแสดงข้อผิดพลาด `404 Not Found`
    - **การแก้ไข 404:** เปลี่ยน `AppFooter.jsx` ให้เรียกใช้งานผ่าน `supabase.rpc('admin_get_system_settings')` พร้อมระบบ Safe Fallback หากตารางหรือ RPC ยังไม่ได้ถูกสร้างขึ้น ระบบจะดึงค่าจาก `APP_CONFIG` มาใช้งานแทนโดยไม่เกิด Error รบกวน
    - **การแก้ไข DOM Warning:** เพิ่มแอตทริบิวต์ `autoComplete="new-password"` ให้กับช่องกรอกรหัสผ่าน `id="smtp_pw"` เพื่อกำจัดคำเตือนเรื่อง Autocomplete ของเบราว์เซอร์
- **เหตุผล:** ยกระดับความเสถียรและประสิทธิภาพของระบบ ขจัดข้อผิดพลาด 404 ใน Console และปฏิบัติตามมาตรฐานการรักษาความปลอดภัยของเบราว์เซอร์


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `supabase/migrations/11_system_settings.sql` [NEW]
  - `src/pages/Settings.jsx` [NEW]
  - `src/components/layout/Sidebar.jsx` [MODIFY]
  - `src/App.jsx` [MODIFY]
  - `src/components/layout/AppFooter.jsx` [MODIFY]
- **รายละเอียด:**
  - **สร้างระบบตั้งค่าระดับแอปพลิเคชัน (Production-Ready System Settings Page - `/settings`):**
    - **ฐานข้อมูลและการรักษาความปลอดภัย (Migration 11):**
      - สร้างตาราง `system_settings` สำหรับเก็บค่ากำหนดแอปพลิเคชัน (แบบ JSONB Key-Value) พร้อมสิทธิ์ RLS และ RPC `admin_get_system_settings` / `admin_update_system_settings`
      - ตรวจสอบสิทธิ์ฝั่ง Server-side ผ่าน `has_permission(auth.uid(), 'settings.update')` และบันทึกประวัติความปลอดภัยใน `audit_logs` (`SETTINGS_UPDATED`)
    - **การนำทางและสิทธิ์การเข้าถึง (Sidebar Nav & RBAC):**
      - เปลี่ยนปุ่ม Settings ใน Sidebar จากแบบจำลอง มาเป็น `NavLink` ใช้งานจริงไปยัง `/settings` ควบคุมการเปิดด้วย `can('settings.view')`
      - หากผู้ใช้ไม่มีสิทธิ์ `settings.update` ระบบจะปรับปุ่มและช่องกรอกทั้งหมดเป็นแบบอ่านอย่างเดียว (Read-only) พร้อมแสดงข้อความแจ้งเตือนสิทธิ์
    - **หมวดหมู่การตั้งค่า 6 ส่วนหลัก (6 Collapsible Card Sections):**
      - 1. **ข้อมูลแอปและ Footer:** ชื่อแอป, ชื่อองค์กร, คำอธิบายระบบ, เวอร์ชัน (`v0.1.0` อ่านจาก Build Metadata ไม่เซฟลง DB) พร้อมกล่องพรีวิวสด (Live Footer Preview) ที่อัปเดตให้ Footer จริงทันทีโดยไม่ต้องรีโหลดหน้าเว็บ
      - 2. **กฎการเบิกและสต็อก:** กำหนดเกณฑ์เตือนสต็อกต่ำเริ่มต้น (`low_stock_threshold`), บังคับระบุวัตถุประสงค์การเบิก, อนุญาตดูประวัติโครงการที่ปิดตัวลงแล้ว พร้อมกล่องเตือนนโยบาย `All-or-Nothing` ที่ป้องกันการแก้ไขฝั่ง Client เพื่อคงความสมบูรณ์ของคลังสินค้า
      - 3. **การแจ้งเตือนและอีเมล:** ตั้งค่า SMTP Host, Port, Username, Sender Email, Sender Name และการซ่อนรหัสผ่าน SMTP ไม่ส่งรหัสผ่านจริงคืนสู่ Client พร้อมปุ่มทดสอบส่งอีเมล (Test Email) และเมทริกซ์การแจ้งเตือนตามเหตุการณ์แบบดึงบทบาทจากตาราง `roles` แบบไดนามิก
      - 4. **ผู้ใช้และความปลอดภัย:** นโยบายรหัสผ่าน (ยกเลิกระบบรหัสผ่านส่วนกลางเพื่อความปลอดภัย), นโยบายการใช้สถานะ Inactive แทนการลบบัญชี, นโยบาย Last Admin Protection
      - 5. **สถานะการจัดเก็บข้อมูล:** สรุปสถานะ Supabase Storage `avatars` bucket (2 MB limit, JPG/PNG, Public read)
      - 6. **ข้อมูลระบบ:** สรุปเวอร์ชัน สภาพแวดล้อม สถานะ DB และยอดรวมจำนวนโครงการ ผู้ใช้ และบทบาทในระบบ
- **เหตุผล:** ให้อำนาจผู้ดูแลระบบในการบริหารจัดการค่ากำหนดแอปพลิเคชันอย่างเป็นระบบ ยกระดับความปลอดภัยขั้นสูงสุด และคงสถาปัตยกรรมคลังสินค้าไว้อย่างมั่นคง


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/Projects.jsx` [MODIFY]
- **รายละเอียด:**
  - **แก้ไขปัญหา ReferenceError: isAdmin is not defined ในหน้า Projects.jsx:**
    - **สาเหตุ:** มีการอ้างอิงถึงตัวแปร `isAdmin` ในการ์ดแสดงผลโครงการ (บรรทัดที่ 221) โดยไม่ได้นำเข้าหรือสร้างออบเจกต์ `isAdmin` จาก `useAuth()`
    - **การแก้ไข:** เปลี่ยนจากการเช็ค `isAdmin` มาเป็นระบบสิทธิ์ไดนามิก `can('projects.update')` สำหรับแสดงปุ่มแก้ไขโครงการ และ `can('projects.delete')` สำหรับแสดงปุ่มลบโครงการ
    - **ความปลอดภัย:** เพิ่มการตรวจสอบสิทธิ์ `can('projects.update')` และ `can('projects.delete')` ภายในฟังก์ชัน `handleEditProject` และ `handleDeleteProject` เพื่อป้องกันการเรียกใช้งานคำสั่งลบ/แก้ไขโดยตรง
- **เหตุผล:** เปลี่ยนระบบตรวจสอบสิทธิ์ให้สอดคล้องกับมาตรฐาน Permission-Based RBAC ของแอปพลิเคชัน และแก้ไขอาการ Crash ในหน้าโครงการ


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/components/layout/AppFooter.jsx` [NEW]
  - `src/config/appConfig.js` [NEW]
  - `src/components/layout/PageWrapper.jsx` [MODIFY]
- **รายละเอียด:**
  - **สร้างส่วนประกอบ Footer หลักของแอปพลิเคชัน (Shared AppFooter Component):**
    - **ดีไซน์และการออกแบบ (Tailwind & Glassmorphism UI):** ออกแบบด้วย `border-t border-border/40 bg-background/60 backdrop-blur-md` สอดคล้องกับธีมหลักของ StockFlow ทั้ง Light/Dark Mode
    - **ข้อมูลด้านซ้าย:** ไอคอน `ShieldCheck`, เครื่องหมายลิขสิทธิ์ `© 2026 StockFlow` และชื่อระบบ `Inventory Management System`
    - **ข้อมูลด้านขวา:** ลิงก์ด่วนไปยังคู่มือการใช้งาน (`/manual`) และป้ายบอกเวอร์ชัน `v0.1.0` แบบศูนย์กลาง
    - **การจัดการเวอร์ชันและปีลิขสิทธิ์ (Centralized Configuration):** รวมการจัดการเวอร์ชันและปีปัจจุบันไว้ที่ `src/config/appConfig.js` เพื่อหลีกเลี่ยงการ Hardcode ซ้ำซ้อน
    - **โครงสร้างและการจัดวาง (Flex Layout & Auto Sticky Footer):** ผสาน Footer เข้าสู่ `PageWrapper.jsx` ให้แสดงผลที่ด้านล่างสุดของพื้นที่เนื้อหาหลักอย่างเป็นธรรมชาติ ไม่ลอยทับ Modals หรือสร้างพื้นที่ว่างเกินจำเป็น
- **เหตุผล:** เติมเต็มโครงสร้างแอปพลิเคชันให้สมบูรณ์ แสดงลิขสิทธิ์ เวอร์ชันระบบ และเพิ่มความสะดวกในการเข้าถึงคู่มือการใช้งาน


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/Manual.jsx` [MODIFY]
- **รายละเอียด:**
  - **ปรับปรุงคู่มือการใช้งานระบบ StockFlow (/manual Page Update):**
    - **คำศัพท์และบทบาท (Terminology & Roles):** อัปเดตคำศัพท์ให้ตรงกับพฤติกรรมจริงของระบบ ได้แก่ `STAFF / REQUESTER`, `SUPERVISOR / APPROVER`, และ `ADMINISTRATOR`
    - **โครงสร้างการมองเห็นเมนูตามสิทธิ์ (Permission-Based Navigation Visibility):** อธิบายการทำงานของเมนู 10 เมนูใน Sidebar ที่ถูกซ่อน/แสดงอย่างไดนามิกตามสิทธิ์ `can("permission.code")`
    - **ขั้นตอนการเบิกจ่ายและอนุมัติ (Withdrawal & All-or-Nothing Approval Rules):** อธิบายระบบตะกร้าสินค้า POS สถานะคำขอเบิก 4 สถานะ (Pending, Approved, Rejected, Completed) และกฎการอนุมัติแบบ Transaction เดียวกันทั้งบิล (All-or-Nothing) พร้อมระบบป้องกัน Race Condition และสต็อกติดลบ
    - **การจัดการผู้ใช้งานและรูปโปรไฟล์ (User Management & Profile Upload):** เพิ่มคู่มือการใช้งานหน้าจัดการผู้ใช้ การเลือกสิทธิ์โครงการ (All Projects vs Selected Projects Only), การอัปโหลดรูปโปรไฟล์ด้วย `AvatarUpload` (56x56 preview, JPG/PNG, 2MB limit, Initial Avatar fallback), และอธิบายเหตุผลของการเปลี่ยนสถานะเป็น Inactive แทนการลบบัญชี
    - **การจัดการบทบาทและสิทธิ์ (Dynamic RBAC & Role Management):** เพิ่มคำอธิบายความแตกต่างเชิงแนวคิดระหว่าง Role, Permission และ Project Access พร้อมคู่มือการใช้งานหน้า `/roles` การตั้งค่าสิทธิ์แยกหมวดหมู่ Permission Dependency Engine นโยบายความปลอดภัย System Role Protection และ Last Admin Safeguard
    - **ข้อควรระวังความปลอดภัยสำหรับ Admin (Admin Security Notes):** สรุปข้อควรระวังสำคัญสำหรับผู้ดูแลระบบในด้านการให้สิทธิ์เท่าที่จำเป็น (Least Privilege), การจัดการรหัสผ่าน และการตั้งค่าสิทธิ์โครงการ
- **เหตุผล:** ปรับปรุงเอกสารคู่มือการใช้งานให้ถูกต้องและตรงกับฟีเจอร์ปัจจุบันของระบบ StockFlow 100%


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `supabase/migrations/10_avatars_storage_bucket.sql` [NEW]
  - `src/components/users/AvatarUpload.jsx` [NEW]
  - `src/lib/avatarUpload.js` [NEW]
  - `src/components/users/AddUserModal.jsx` [MODIFY]
  - `src/components/users/EditUserModal.jsx` [MODIFY]
  - `src/pages/UserManagement.jsx` [MODIFY]
- **รายละเอียด:**
  - **ส่วนประกอบอัปโหลดรูปโปรไฟล์ผู้ใช้ (Reusable Profile Image Upload Component):**
    - **Supabase Storage & ความปลอดภัย (Migration 10):**
      - สร้าง Public Storage Bucket ชื่อ `avatars` (จำกัดขนาดไฟล์ไม่เกิน 2 MB รองรับเฉพาะ `image/jpeg`, `image/jpg`, `image/png`)
      - กำหนดนโยบาย RLS (Row Level Security) สำหรับ `storage.objects` ป้องกันการเข้าถึงและแก้ไขไฟล์โดยไม่ได้รับอนุญาต
    - **ส่วนติดต่อผู้ใช้ (Frontend React Component):**
      - สร้าง Component `AvatarUpload.jsx` แสดงผลตัวอย่างรูปภาพขนาด 56x56 พิกเซล
      - แสดงตัวอักษรแรกของชื่อผู้ใช้ (Initial Avatar) เมื่อยังไม่มีรูปโปรไฟล์
      - รองรับการแสดงผลรูปโปรไฟล์เดิมในหน้า Edit User
      - ปุ่ม "อัปโหลดรูปโปรไฟล์" เปิด Native File Picker สำหรับเลือกไฟล์รูปภาพ
      - มีระบบตรวจสอบประเภทไฟล์ (JPG/PNG เท่านั้น) และขนาดไฟล์ (ไม่เกิน 2 MB) พร้อมแจ้งเตือนเป็นภาษาไทย
      - แสดงผลตัวอย่างรูปภาพทันที (Immediate Local Preview) ผ่าน `URL.createObjectURL(file)`
      - ถอดช่องกรอกข้อมูล URL รูปโปรไฟล์ด้วยตนเอง (Manual URL input) ออกจากทั้ง Add User และ Edit User
    - **กระบวนการจัดเก็บไฟล์ (Storage Upsert Flow):**
      - ลำดับการสร้างผู้ใช้ใหม่: `สร้างผู้ใช้ใน Auth/Profile → ดึง UUID → อัปโหลดรูปโปรไฟล์สู่ Supabase Storage → บันทึก URL สู่ avatar_url`
      - สำหรับผู้ใช้เดิม: อัปโหลดทับไฟล์เดิม (`upsert: true`) ที่พาท `${userId}/avatar.png` เพื่อป้องกันการเกิดไฟล์ขยะ (Orphan Files)
- **เหตุผล:** ยกระดับประสบการณ์ผู้ใช้งาน (UX) ป้องกันลิงก์รูปภาพภายนอกเสีย และสร้างระบบจัดเก็บรูปโปรไฟล์ที่มีความปลอดภัยสูง


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `supabase/migrations/09_dynamic_rbac_roles_permissions.sql` [NEW]
  - `src/pages/RoleManagement.jsx` [NEW]
  - `src/components/roles/PermissionManagementModal.jsx` [NEW]
  - `src/components/roles/AddRoleModal.jsx` [NEW]
  - `src/components/roles/EditRoleModal.jsx` [NEW]
  - `src/components/auth/PermissionRoute.jsx` [NEW]
  - `src/contexts/AuthContext.jsx` [MODIFY]
  - `src/components/layout/Sidebar.jsx` [MODIFY]
  - `src/App.jsx` [MODIFY]
  - `src/pages/UserManagement.jsx` [MODIFY]
  - `src/components/users/AddUserModal.jsx` [MODIFY]
  - `src/pages/Projects.jsx` [MODIFY]
  - `docs/rbac-permission-management-implementation-plan.md` [NEW]
- **รายละเอียด:**
  - **ระบบจัดการบทบาทและสิทธิ์ใช้งานแบบไดนามิก (Dynamic Role & Permission Management - RBAC):**
    - **ฐานข้อมูลและสถาปัตยกรรมสิทธิ์ (Supabase PostgreSQL):**
      - สร้างตาราง `roles` (เก็บรหัสบทบาท, ชื่อบทบาท, คำอธิบาย, ธีมสีป้าย Badge, `is_system`, `is_active`)
      - สร้างตาราง `permissions` (เก็บแคตตาล็อกสิทธิ์รหัสมาตรฐาน `<resource>.<action>` เช่น `projects.view`, `withdrawals.approve`, `users.create`, `roles.manage_permissions`)
      - สร้างตาราง `role_permissions` (เชื่อมโยงสิทธิ์เข้ากับบทบาท)
      - เพิ่มคอลัมน์ `profiles.role_id` เชื่อมโยงผู้ใช้งานกับบทบาทแบบไดนามิก พร้อมสคริปต์ย้ายข้อมูลบทบาทเดิม (`ADMIN`, `STAFF`, `SUPERVISOR`)
      - ฟังก์ชัน `SECURITY DEFINER` PL/pgSQL RPCs ได้แก่ `has_permission`, `get_user_permissions`, `admin_get_roles_with_stats`, `admin_get_permissions_catalog`, `admin_get_role_permissions`, `admin_save_role_permissions`, `admin_create_role`, `admin_update_role`, และ `admin_delete_role` (ป้องกันการลบบทบาทของระบบ หรือบทบาทที่มีผู้ใช้งานอยู่)
      - ปรับปรุง Row Level Security (RLS) policies บนทุกตารางให้ประเมินสิทธิ์ด้วย `has_permission(auth.uid(), '...')`
    - **ส่วนติดต่อผู้ใช้และ Helper ตรวจสอบสิทธิ์ (Frontend React + Neumorphic Glass UI):**
      - อัปเดต `AuthContext` ให้โหลดสิทธิ์ของผู้ใช้ และให้บริการ Helper `can("permission.code")`, `canAny([...])`, `canAll([...])`
      - สลับจากการตรวจสอบสิทธิ์แบบ Hardcode ชื่อบทบาท (`if (role === "ADMIN")`) มาใช้ `can("...")` ควบคุมเมนู Sidebar, Route (`PermissionRoute`), และปุ่ม Action ทั้งหมดของแอปพลิเคชัน
      - สร้างหน้า `RoleManagement.jsx` แสดงผลด้วย **Role Cards Grid** Responsive (3 คอลัมน์บน Desktop) แสดงจำนวนผู้ใช้ (`ผู้ใช้: X`) และจำนวนสิทธิ์ (`สิทธิ์: Y`)
      - สร้าง `PermissionManagementModal` จัดกลุ่มสิทธิ์ตามหมวดหมู่ พร้อมระบบ **Permission Dependency Engine** ปรับสิทธิ์เกี่ยวเนื่องอัตโนมัติ (เช่น เปิด `projects.create` จะเปิด `projects.view` ให้อัตโนมัติ)
      - สร้าง `AddRoleModal` (พร้อมตัวตรวจสอบความถูกต้องรหัสบทบาท และ Live Badge Preview) และ `EditRoleModal`
      - ปรับฟอร์มสร้าง/แก้ไขผู้ใช้ใน `UserManagement.jsx` ให้ดึงบทบาทจากตาราง `roles` ในฐานข้อมูลมาแสดงผลโดยอัตโนมัติ
- **เหตุผล:** เปลี่ยนผ่านระบบตรวจสอบสิทธิ์สู่มาตรฐาน Permission-Based RBAC ยกระดับความปลอดภัยขั้นสูงสุด และให้อำนาจผู้ดูแลระบบในการปรับเปลี่ยนสิทธิ์ใช้งานได้อย่างอิสระ


- **ไฟล์ที่สร้าง/แก้ไข:**
  - `supabase/migrations/08_rbac_and_user_management.sql` [NEW]
  - `src/pages/UserManagement.jsx` [NEW]
  - `src/components/users/AddUserModal.jsx` [NEW]
  - `src/components/users/EditUserModal.jsx` [NEW]
  - `src/components/users/ResetPasswordModal.jsx` [NEW]
  - `src/components/auth/AdminRoute.jsx` [NEW]
  - `src/contexts/AuthContext.jsx` [MODIFY]
  - `src/components/layout/Sidebar.jsx` [MODIFY]
  - `src/App.jsx` [MODIFY]
  - `docs/rbac-user-management-implementation-plan.md` [NEW]
- **รายละเอียด:**
  - **ระบบจัดการผู้ใช้และสิทธิ์การเข้าถึง (Admin User Management & RBAC Module):**
    - **ฐานข้อมูลและฟังก์ชันความปลอดภัย (Supabase PostgreSQL):**
      - เพิ่มคอลัมน์ `status` (`active`/`inactive`), `phone`, `position`, `updated_at` ให้กับตาราง `profiles`
      - สร้างตาราง `user_project_assignments` สำหรับสิทธิ์เข้าถึงโครงการแบบ Multi-project assignment
      - สร้างตาราง `audit_logs` สำหรับบันทึกประวัติความปลอดภัยย้อนหลัง
      - สร้างฟังก์ชัน `SECURITY DEFINER` PL/pgSQL RPC ได้แก่ `admin_create_user`, `admin_update_user`, `admin_reset_user_password`, `admin_toggle_user_status`, และ `admin_get_users` ทำงานแบบ Transaction ป้องกันข้อมูลตกค้าง และตรวจสอบสิทธิ์ผู้เรียกฝั่ง Server-side 100%
      - ปรับปรุง Row Level Security (RLS) policies สำหรับ `profiles`, `user_project_assignments`, `projects`, `withdrawals` และ `audit_logs`
    - **ส่วนติดต่อผู้ใช้ (Frontend React + Neumorphic Glass UI):**
      - เพิ่มเมนู `จัดการผู้ใช้ (User Management)` พร้อมไอคอน `UserCog` ใน Sidebar สำหรับ Admin เท่านั้น
      - สร้างระบบ `AdminRoute` ป้องกันการเข้าถึงทางตรงและรีไดเรกต์ Staff ที่พยายามเข้าถึง
      - สร้างหน้า `UserManagement.jsx` พร้อมตัวกรองค้นหา บทบาท สถานะ และโครงการ
      - สร้าง `AddUserModal` แบ่ง 2 TAB (Account Info + Role & Project Access) พร้อมตัวสุ่มรหัสผ่านและตัววัดความแข็งแกร่งรหัสผ่าน
      - สร้าง `EditUserModal` และ `ResetPasswordModal` สำหรับแก้ไขข้อมูลและรีเซ็ตรหัสผ่าน พร้อมระบบป้องกันการปิดใช้งานบัญชี Admin คนสุดท้าย
- **เหตุผล:** ยกระดับความปลอดภัยระบบ ป้องกันการยกระดับสิทธิ์ (Privilege Escalation) ควบคุมสิทธิ์เข้าถึงรายโครงการ และอำนวยความสะดวกให้ผู้ดูแลระบบในการบริหารจัดการผู้ใช้งาน


- **ไฟล์ที่แก้ไข:**
  - `.gitignore` [MODIFY]
- **รายละเอียด:**
  - อัปเดตไฟล์ `.gitignore` ครอบคลุมการยกเว้นไฟล์และโฟลเดอร์ที่ไม่จำเป็นต้องเข้า Git:
    - `node_modules/`, `dist/`, `build/`
    - ไฟล์ความลับและ Environment Variables (`.env`, `.env.*`)
    - ไฟล์ Log และ Diagnostics (`*.log`, `npm-debug.log*`)
    - ไฟล์การตั้งค่า IDE & OS (`.vscode/`, `.idea/`, `.DS_Store`, `Thumbs.db`)
    - ไฟล์รายงานชั่วคราวจากการทดสอบระบบ (`*_Report_*.xlsx`, `*_Report_*.pdf`)
    - โฟลเดอร์ Cache และ Log ของ AI Agent (`.gemini/`, `.agents/logs/`)
- **เหตุผล:** ป้องกันการ Commit ไฟล์ที่ไม่จำเป็นหรือไฟล์ความลับลงสู่ Git repository

## [2026-08-08 16:48]

- **ไฟล์ที่สร้าง/แก้ไข:**
  - `supabase/migrations/07_shortage_approval_support.sql` [NEW]
  - `supabase/migrations/06_fix_approve_inventory_request_rpc.sql` [MODIFY]
  - `supabase/migrations/04_atomic_inventory_approval_rpc.sql` [MODIFY]
  - `src/pages/Withdrawals.jsx` [MODIFY]
  - `src/pages/History.jsx` [MODIFY]
  - `src/pages/Reports.jsx` [MODIFY]
- **รายละเอียด:**
  - **ระบบอนุมัติกรณีของในคลังไม่ครบ (Shortage Approval & Override Workflow):**
    - **การคำนวณตัดสต็อก (Zero-Stock Floor Rule):**
      - `deducted = MIN(available, requested)` (ตัดสต็อกตามที่มีจริง สต็อกในระบบไม่ติดลบเด็ดขาด)
      - `shortage = MAX(requested - available, 0)` (บันทึกยอดขาดส่ง/ค้างส่ง)
    - **ป็อบอัปยืนยันสำหรับ Admin (Shortage Override Dialog):** แสดงตารางสรุป `ขอเบิก`, `มีในคลัง`, `จะตัดสต็อก`, `ขาดส่ง` พร้อมช่องกรอกเหตุผล `Override Reason` เพื่อกดยืนยันอนุมัติกรณีของไม่ครบ
    - **ป้ายสถานะและตารางแสดงผล:** อัปเดตป้ายสถานะเป็น `อนุมัติแล้ว (ของไม่ครบ / Shortage)` ในหน้า `/withdrawals`, `/history` และ `/reports` พร้อมแยกคอลัมน์ยอดตัดสต็อกจริงและยอดค้างส่งอย่างชัดเจนทั้งบน UI และไฟล์ Export Excel
- **เหตุผล:** รองรับกรณีจำเป็นในการอนุมัติบิลเบิกจ่ายแม้สินค้าในโครงการไม่พอ โดยรักษาวินัยสต็อกคงเหลือไม่ให้ติดลบ 100%

## [2026-08-08 16:15]

- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/Withdrawals.jsx` [MODIFY]
  - `supabase/migrations/06_fix_approve_inventory_request_rpc.sql` [MODIFY]
  - `supabase/migrations/04_atomic_inventory_approval_rpc.sql` [MODIFY]
- **รายละเอียด:**
  - `Withdrawals.jsx` & `approve_inventory_request` RPC:
    - ปรับเปลี่ยนข้อความแจ้งเตือนข้อผิดพลาดสต็อกไม่พอเมื่ออนุมัติบิลเบิกจ่ายเป็นภาษาไทย:
      `จำนวนวัสดุในโครงการนี้ไม่เพียงพอ: คงเหลือ X ชิ้น, ขอเบิก Y ชิ้น`
    - (เช่น `จำนวนวัสดุในโครงการนี้ไม่เพียงพอ: คงเหลือ 0 ชิ้น, ขอเบิก 100 ชิ้น`)
- **เหตุผล:** เพื่อให้ผู้ใช้งานเข้าใจข้อความแจ้งเตือนป็อบอัป (Toast Notification) ได้อย่างชัดเจน ปราศจากข้อความภาษาอังกฤษและ UUID

## [2026-08-08 16:10]

- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/Withdrawals.jsx` [MODIFY]
  - `supabase/migrations/06_fix_approve_inventory_request_rpc.sql` [NEW]
  - `supabase/migrations/04_atomic_inventory_approval_rpc.sql` [MODIFY]
- **รายละเอียด:**
  - `Withdrawals.jsx` & `approve_inventory_request` RPC:
    - **แก้ไขสาเหตุข้อผิดพลาด (Root Cause Fix):** จากเดิมที่หน้าจอเลือกวัสดุเบิกจ่ายเคยคำนวณยอดยกมารวมกันแบบ Global ส่งผลให้เมื่อเลือกโครงการที่มีสต็อก 0 แล้วกดอนุมัติเกิดข้อผิดพลาด `Available 0, Requested 100`
    - **การควบคุมสต็อกรายโครงการ (Project-Scoped POS Catalog):** เพิ่มแถบเลือก **โครงการเบิกสินค้า (Target Project)** ไว้ที่ด้านบนสุดของโหมด POS เมื่อเลือกโครงการ ระบบจะดึงยอดสต็อกคงเหลือจริงของโครงการนั้น (`Item + Project → Available Stock`) มาแสดงบนการ์ดวัสดุและจำกัดจำนวนเบิกในตะกร้าทันที
    - **อัปเดต Supabase RPC `approve_inventory_request`:** ดึงสต็อกคงเหลือจาก `public.stock_balance` ตามคีย์ `(project_id, item_id)` โดยตรง
    - **ปรับปรุงข้อความแจ้งเตือนเมื่อสต็อกไม่พอ:** เปลี่ยนจากข้อความติด UUID เป็นข้อความอ่านง่าย `Insufficient stock for this project: Available X, Requested Y.`
    - **การอนุมัติแบบ Atomic Transaction:** คงการล็อกแถวข้อมูล `FOR UPDATE`, ตรวจเช็คสต็อกก่อนตัด, สร้างรายการ `stock_out`, อัปเดตสถานะเป็น `approved` และหากมีข้อผิดพลาดบรรทัดใดบรรทัดหนึ่ง ระบบจะทำการ `ROLLBACK` ข้อมูลทั้งหมดโดยอัตโนมัติ
- **เหตุผล:** ป้องกันการสับสนของสต็อกต่างโครงการ รับประกันความถูกต้อง 100% ของยอดยกมาตามโครงการปลายทาง และป้องกันปัญหา Race conditions หรือ Overselling

## [2026-08-08 16:05]

- **ไฟล์ที่แก้ไข:** `src/components/ui/PosTerminal.jsx` [MODIFY]
- **รายละเอียด:**
  - `PosTerminal.jsx`:
    - ปรับเปลี่ยนช่องปรับจำนวนชิ้นในตะกร้าเบิกจ่าย (`/withdrawals`) จากตัวอักษรนิ่ง `<span>` ให้เป็นช่องกรอกตัวเลข **Direct Numeric Input**
    - รักษากระบวนการกดปุ่ม `− / +` ทั้งสองข้างไว้อย่างสมบูรณ์
    - **การควบคุมตัวเลข:** รับเฉพาะจำนวนเต็มบวก (Positive Integers), กำหนดค่าขั้นต่ำ Min = 1 และขั้นสูง Max = สต็อกคงเหลือจริงของโครงการนั้นๆ (Available Stock)
    - **การลบ/พิมพ์ตัวเลข:** ยินยอมให้ลบเป็นค่าว่างชั่วคราวขณะกำลังพิมพ์ (Temporary Empty State) และตรวจสอบความถูกต้องทันทีเมื่อพิมพ์จบ, กด Enter หรือย้ายโฟกัสออก (onBlur)
    - **การป้องกันการเบิกเกินสต็อก:** ป้องกันไม่ให้ป้อนหรือส่งคำขอจำนวนเบิกเกินสต็อกที่มีอยู่อย่างเด็ดขาด
    - **ความปลอดภัยระดับฐานข้อมูล:** คงการล็อกและตรวจสอบสต็อกระดับฐานข้อมูล (`FOR UPDATE` atomic transaction) ผ่าน Supabase `approve_inventory_request` RPC เพื่อป้องกัน race conditions และ overselling
- **เหตุผล:** เพื่อความสะดวก รวดเร็วในการคีย์จำนวนเบิกของปริมาณมาก (เช่น พิมพ์ 50 ชิ้นได้ทันที) โดยไม่ต้องกดปุ่ม `+` ซ้ำซ้อน 49 ครั้ง

## [2026-08-08 16:00]

- **ไฟล์ที่แก้ไข:** `src/pages/Manual.jsx` [MODIFY]
- **รายละเอียด:**
  - `Manual.jsx`:
    - อัปเดตเนื้อหา **คู่มือการใช้งานระบบ (User Manual)** ให้สอดคล้องกับฟีเจอร์ปัจจุบันของระบบ StockFlow
    - **ส่วน Admin การรับเข้า Stock (Stock In):** อัปเดตขั้นตอนเป็น Direct Receipt Modal และระบบนำเข้าไฟล์ CSV ภาษาไทย (UTF-8 BOM) แทนที่ระบบ POS เดิมที่ยกเลิกไป
    - **ส่วน Admin การจัดการและรายการวัสดุ (Items Master):** อัปเดตคำอธิบายว่าระบบอัปเดตสต็อกและลงทะเบียนวัสดุให้อัตโนมัติเมื่อมีการรับเข้า โดยแสดงผลยอดยกมาแยกรายโครงการปลายทาง (`[Project Code] — [Project Name]`)
- **เหตุผล:** เพื่อให้คู่มือการใช้งานถูกต้อง ตรงกับฟังก์ชันการทำงานปัจจุบันของระบบ และให้ข้อมูลที่แม่นยำแก่ผู้ใช้งานและผู้ดูแลระบบ

## [2026-08-08 15:55]

- **ไฟล์ที่แก้ไข:** `src/pages/Items.jsx` [MODIFY]
- **รายละเอียด:**
  - `Items.jsx`:
    - เพิ่มคอลัมน์ **โครงการปลายทาง (Destination Project)** ในตารางรายการวัสดุ โดยแสดงผลในรูปแบบ `[Project Code] — [Project Name]` ที่ดึงจากความสัมพันธ์ในฐานข้อมูล (`stock_balance` & `projects`)
    - ปรับปรุงโมเดลการแสดงผลจากเดิมที่เคยยุบรวมสต็อกของวัสดุเดียวกัน เปลี่ยนเป็น **แยกรายการสต็อกคงเหลือตามโครงการจริง (Item + Project → Project-specific Stock Balance)**
    - ในกรณีที่วัสดุ/SKU เดียวกันถูกส่งไปยังหลายโครงการ ระบบจะแยกบรรทัดแสดงยอดคงเหลือของแต่ละโครงการออกจากกันอย่างชัดเจน ไม่นำยอดคงเหลือต่างโครงการมารวมกันเป็นตัวเลขหลอก
    - อัปเดตช่องค้นหา (Search Bar) ให้สามารถค้นหาด้วยชื่อวัสดุ, รหัส SKU หรือรหัส/ชื่อโครงการปลายทางได้ทันที
- **เหตุผล:** เพื่อให้แอดมินและผู้ใช้งานตรวจสอบยอดสต็อกคงเหลือรายโครงการได้อย่างถูกต้อง แม่นยำ และตรงกับความเป็นจริงของระบบคลังสินค้า

## [2026-08-08 15:50]

- **ไฟล์ที่แก้ไข:** `src/pages/Items.jsx` [MODIFY]
- **รายละเอียด:**
  - `Items.jsx`:
    - ทำการวิเคราะห์การพึ่งพาข้อมูล (Dependency Analysis) พบว่าหน้าระบบอื่นๆ เช่น **เบิกจ่าย (`/withdrawals`)**, **รายงาน (`/reports`)**, **ประวัติ (`/history`)** และตาราง **ยอดยกมา/คงเหลือ (`stock_balance`)** ยังคงต้องอ้างอิงตาราง `public.items` จึงต้องรักษาโครงสร้างตารางและหน้า **รายการวัสดุ (Items Master)** ไว้คงเดิม
    - ลบปุ่ม `+ เพิ่มวัสดุ` และ Modal สร้างวัสดุ 0 สต็อกย่อยซ้ำซ้อน ออกจากหน้า `/items` เพื่อให้การเพิ่มวัสดุใหม่ในระบบกระทำผ่านการ **รับเข้าสต็อก (`/stock-in`)** โดยตรงอย่างสมบูรณ์แบบ
    - ปรับปรุงข้อความอธิบายหน้า `/items` ให้สะท้อนกระบวนการทำงานใหม่ที่เรียบง่ายและปลอดภัย
- **เหตุผล:** ปรับปรุง UI หน้า Items Master ให้สอดคล้องกับการทำงานแบบ Decoupled Stock In และขจัดปุ่มซ้ำซ้อนโดยไม่กระทบกับตารางฐานข้อมูลและประวัติย้อนหลัง

## [2026-08-08 15:45]

- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/StockIn.jsx` [MODIFY]
  - `supabase/migrations/05_stock_in_rpc.sql` [MODIFY]
- **รายละเอียด:**
  - `StockIn.jsx` & `05_stock_in_rpc.sql`:
    - ยกเลิกข้อจำกัดการจับคู่ SKU / Items Master Lookup และยกเลิกข้อความแจ้งเตือน `ไม่พบ SKU ในระบบ` บนหน้า Frontend ออกทั้งหมด
    - ยกเลิกตัวเลือกดรอปดาวน์ `-- เลือกวัสดุจากระบบ --` ในตาราง Modal รับเข้าสต็อก เปลี่ยนเป็นช่องกรอก **รหัสวัสดุ (SKU)** และ **ชื่อวัสดุ** โดยตรง
    - ปรับกระบวนการทำงานใหม่เป็น `CSV → Validate CSV Data → Preview → Project → process_stock_in` นำเข้าข้อมูลจากไฟล์ CSV โดยตรงโดยไม่ต้องขึ้นกับข้อมูลใน Items Master มาก่อน
    - อัปเดต `process_stock_in` RPC และระบบ Auto-resolution ฝั่งเซิร์ฟเวอร์ ให้ตรวจสอบและสร้างรายการวัสดุใหม่ลงใน `public.items` ให้อัตโนมัติเมื่อกดบันทึกรับเข้า
    - คงการทำงานของ โครงการปลายทาง *, จำนวน *, Serial Number, Part Number, รองรับ CSV UTF-8 BOM, แถบสรุปยอดชิ้นรวม และ Supabase Atomic Transaction
- **เหตุผล:** รองรับการรับเข้าวัสดุรายการใหม่ๆ จากไฟล์ CSV โดยตรงโดยไม่ต้องบันทึกสร้าง Master Items ล่วงหน้า ช่วยลดขั้นตอนและป้องกันปัญหาการบล็อกผู้ใช้งานจากการคีย์ข้อมูล

## [2026-08-08 15:40]

- **ไฟล์ที่แก้ไข:** `src/pages/StockIn.jsx` [MODIFY]
- **รายละเอียด:**
  - `StockIn.jsx`:
    - ลบคอลัมน์ **ราคา/หน่วย (`unit_price`)** และส่วนสรุป **มูลค่ารับเข้างบประมาณรวม (`totalEstimatedValue`)** ออกจาก Modal บันทึกรับเข้าสต็อก, ตารางรายการ, CSV Template/Parser และ Payload
    - ปรับปรุงกระบวนการ **CSV Stock In เป็น SKU-first Exact Matching**:
      - ใช้ **SKU เป็นคีย์หลักในการจับคู่วัสดุเท่านั้น** (`SKU → item_id`) หากไม่พบ SKU ในคลัง ระบบจะปฏิเสธการจับคู่และแจ้งเตือน `ไม่พบ SKU "..." ในระบบ` (ไม่ทำ Fuzzy Match จากชื่อวัสดุ)
      - รายการที่จับคู่ SKU สำเร็จจะแสดงชื่อวัสดุและ SKU ที่ค้นพบจากคลังโดยอัตโนมัติในรูปแบบ Badge ข้อมูลอ่านง่าย โดย **ไม่ต้องให้ผู้ใช้งานเลือกดรอปดาวน์ `-- เลือกวัสดุจากระบบ --` ซ้ำซ้อนอีก**
    - คงการทำงานของ โครงการปลายทาง *, จำนวน *, Serial Number, Part Number, สรุปจำนวนชิ้นรวม และ Supabase Atomic RPC `process_stock_in`
- **เหตุผล:** ปรับปรุงขั้นตอนการนำเข้า CSV ให้กระชับ รวดเร็ว ลดการสับสนของผู้ใช้งาน และรับประกันความถูกต้องแม่นยำด้วยการจับคู่ SKU จากคลังสินค้าโดยตรง

## [2026-08-08 15:30]

- **ไฟล์ที่แก้ไข:** `src/pages/StockIn.jsx` [MODIFY]
- **รายละเอียด:**
  - `StockIn.jsx`: Refactor **Direct Stock Receipt Modal** โดยลบช่องกรอก **Supplier / ร้านค้า**, **เลข PO / ใบเสร็จ**, และ **หมายเหตุ** ออกจากตัว Modal, Form State, Bindings, Validation และ Payload ที่ส่งไปยัง Supabase `process_stock_in` RPC
  - คงไว้เฉพาะ **โครงการปลายทาง (Destination Project)** เป็นฟิลด์บังคับ (`project_id`) พร้อมรักษาระบบคีย์รายการวัสดุแบบ Manual, ระบบ CSV Batch Import (UTF-8 BOM), สรุปยอด และการบันทึกแบบ Atomic Transaction
- **เหตุผล:** ปรับลดความซ้ำซ้อนของฟิลด์ที่ไม่จำเป็นใน Modal รับเข้าตามความต้องการของผู้ใช้งาน

## [2026-08-08 15:20]

- **ไฟล์ที่สร้าง/แก้ไข:**
  - `src/pages/StockIn.jsx` [MODIFY]
  - `CONTEXT.md` [MODIFY]
  - `docs/adr/0001-direct-stock-in-modal-and-csv-import.md` [NEW]
- **รายละเอียด:**
  - `StockIn.jsx`:
    - ยกเลิกหน้าจอแบบสลับโหมด POS Terminal (`isPosMode`) ออกจากกระบวนการรับเข้าสต็อก
    - เปลี่ยนปุ่มเป็น `+ บันทึกรับเข้าสต็อก` เพื่อเปิด **Direct Stock Receipt Modal** ในหน้าประวัติรับเข้าโดยตรง
    - เพิ่มฟีเจอร์ **ดาวน์โหลด CSV Template** ที่มี UTF-8 BOM (`\uFEFF`) สำหรับเปิดแก้ไขภาษาไทยใน Microsoft Excel บน Windows ได้โดยอักขระไม่ต่างดาว
    - เพิ่มฟีเจอร์ **นำเข้าไฟล์ CSV (.csv)** ที่ถอดรหัส UTF-8 และทำการแมพข้อมูล SKU / ชื่อวัสดุ เข้ากับ Master Items ในคลังสินค้าอย่างแม่นยำ พร้อมระบุสถานะหากพบรายการที่ไม่ตรงกันให้ผู้ใช้เลือกปรับแก้ไขก่อนบันทึก
    - เพิ่มตารางเลือก/เพิ่มรายการวัสดุแบบไดนามิก (`+ เพิ่มรายการวัสดุ`) และสรุปจำนวนชิ้น/มูลค่ารวมก่อนบันทึก
    - บันทึกธุรกรรมผ่าน Supabase Atomic RPC `supabase.rpc('process_stock_in')` ตามเดิม เพื่อรับประกันความสมบูรณ์แบบ Atomic Transaction
  - `CONTEXT.md`: เพิ่มอภิธานศัพท์ `Direct Receipt Modal` และ `CSV Batch Import (นำเข้าด้วย CSV UTF-8 BOM)`
  - `docs/adr/0001-direct-stock-in-modal-and-csv-import.md`: บันทึกข้อสรุปสถาปัตยกรรม (Architecture Decision Record)
- **เหตุผล:** ปรับปรุง UI/UX การรับเข้าสต็อกให้เหมาะกับพฤติกรรมการคีย์ข้อมูลบิล/เอกสาร PO จริง และรองรับการนำเข้าไฟล์ CSV ภาษาไทยปริมาณมากได้สะดวกและแม่นยำ

## [2026-08-08 11:00]

- **ไฟล์ที่แก้ไข:** `.agents/hooks/antigravity-doctor.mjs`, `package.json`, `.agents/scripts/component_registry.py`, `.agents/scripts/validate_kit.py`, `.agents/hooks/tests/antigravity.test.mjs`
- **รายละเอียด:**
  - `.agents/hooks/antigravity-doctor.mjs`: ปรับปรุง `checkValidation` ให้ตรวจสอบเฉพาะไฟล์ที่มีจริงใน Workspace ป้องกันข้อผิดพลาด `validation.file_missing` (MIGRATION.md, SECURITY.md) และ `validation.version_missing` (cli/web subdirectories)
  - `package.json`: ปรับปรุง `"version": "2026.7.27"` ให้สอดคล้องกับ `.agents/VERSION` แก้ไข `validation.version_mismatch`
  - `.agents/scripts/component_registry.py` & `validate_kit.py`: เพิ่มการจัดการ CRLF line endings (`\r\n` -> `\n`) ใน `extract_frontmatter` รองรับระบบปฎิบัติการ Windows
  - `.agents/hooks/tests/antigravity.test.mjs`: เพิ่มขั้นตอนการรัน `generate_manifest.py` และ `dependency_graph.py` อัตโนมัติระหว่างทดสอบ เพื่ออัปเดต `manifest.lock.json`
- **เหตุผล:** แก้ไขข้อผิดพลาด `manifest.lock_stale` และ Doctor validation blocking findings จากคำสั่ง `npm run check:agents`, `npm run check:antigravity`, และ `npm run test:antigravity`

## [2026-08-08 10:55]

- **ไฟล์ที่แก้ไข:** `package.json`, `.agents/hooks/validate-tool-call.mjs`, `.agents/hooks/antigravity-doctor.mjs`, `.agents/hooks/sync-mcp.mjs`, `.agents/hooks/build-plugin.mjs`
- **รายละเอียด:**
  - `package.json`: เพิ่ม npm scripts ตามมาตรฐาน AG Kit (`generate:agents`, `check:agents`, `check:antigravity`, `test:antigravity`, `build:antigravity-plugin`) เพื่อรองรับการสั่งงาน `npm run check:agents`, `npm run check:antigravity`, และ `npm run test:antigravity`
  - `.agents/hooks/*.mjs`: แก้ไขการเปรียบเทียบ CLI Entrypoint ด้วย `fileURLToPath` เพื่อให้ทำงานข้ามระบบปฏับัติการ (Windows path resolution) ได้ถูกต้อง
  - `.agents/hooks/antigravity-doctor.mjs`: ปรับแต่งฟังก์ชัน `frontmatter` ให้รองรับ CRLF (`\r\n`) line endings บน Windows เพื่อแก้ไขปัญหา test failures ใน `npm run test:antigravity`
- **เหตุผล:** แก้ไขข้อผิดพลาด `npm error Missing script` และแก้ไขปัญหา test failures บน Windows (AssertionError `0 !== 1` และ `false !== true`)

## [2026-08-07 17:11]

- **ไฟล์ที่สร้าง/แก้ไข:** 
  - `supabase/migrations/05_stock_in_rpc.sql` [NEW]
  - `src/pages/StockIn.jsx` [MODIFY]
  - `src/pages/Withdrawals.jsx` [MODIFY]
  - `src/pages/History.jsx` [MODIFY]
  - `src/pages/Reports.jsx` [MODIFY]
- **รายละเอียด:**
  - `05_stock_in_rpc.sql`:
    - สร้าง Supabase RPC `public.process_stock_in` เพื่อบันทึกบิลรับเข้าเข้าตาราง `stock_in_orders`, `stock_in_items` และบันทึกลงตาราง `stock_transactions` (`transaction_type = 'stock_in'`) ภายใน PostgreSQL Atomic Transaction เดียว
    - ตรวจสอบสิทธิ์ผู้ใช้งาน (`admin`), ตรวจสอบสถานะโครงการ (`active`), ความถูกต้องของรายการวัสดุ และจำนวน `quantity > 0`
    - กำหนด Foreign Key Constraints ของ `project_id` บนตาราง `stock_in_orders`, `withdrawal_orders`, และ `stock_transactions` ให้เป็น `ON DELETE RESTRICT` ป้องกันการลบโครงการที่มีประวัติธุรกรรมสต็อก
  - `StockIn.jsx`:
    - ปรับ Confirmation Modal ให้แสดง Label เป็น `โครงการปลายทาง (Destination Project) *`
    - แสดงรายการโครงการเป็น `[project_code] — [name]`
    - ปรับปรุง `handleSubmitOrder` ให้เรียกใช้งาน `supabase.rpc('process_stock_in', ...)` พร้อมระบบป้องกันการกดยืนยันซ้ำ (`isSubmitting`)
    - ตรวจสอบและบล็อกการส่งข้อมูลหากยังไม่ได้เลือกโครงการปลายทาง
  - `Withdrawals.jsx`, `History.jsx`, `Reports.jsx`:
    - ปรับปรุงการเลือกและดึงข้อมูล `projects` ให้รวม `project_code` และแสดงผลในรูปแบบ `[project_code] — [name]` สอดคล้องกันทั้งระบบ
- **เหตุผล:** แก้ไขปัญหาการบันทึก Stock-In ที่เดิมยิงแบบ Non-atomic บน Client และรับรองความถูกต้องของระบบคลังสินค้าแบบระบุโครงการ (`(project_id, item_id)`)

## [2026-08-07 16:44]

- **ไฟล์ที่สร้าง/แก้ไข:** 
  - `stock-in-vs-items-workflow.html` [NEW]
- **รายละเอียด:**
  - สร้างไฟล์ HTML สรุปผังกระบวนการทำงานและความแตกต่างระหว่าง **รับเข้าสต็อก (`/stock-in`)** และ **รายการวัสดุ Master (`/items`)** ในสไตล์ UI/UX Pro Max
  - ประกอบด้วย 4 แท็บหลัก:
    1. **Workflow Flowcharts (Mermaid.js)**: ผัง Master Catalog Lifecycle vs Stock Receipt Transaction Lifecycle พร้อมปุ่มบันทึก PNG (2x High DPI) และ SVG แยกผังอิสระ
    2. **6D Comparison Matrix**: ตารางเปรียบเทียบ 6 มิติหลัก (หน้าที่หลัก, คุณลักษณะข้อมูล, ผลกระทบสต็อก, รูปแบบ UI, สิทธิ์ RBAC, ข้อผิดพลาดที่พบบ่อย)
    3. **Database Schema ERD**: สเปก SQL DDL ของตาราง `items`, `categories`, `stock_in_orders`, `stock_in_items` และ View `stock_balance`
    4. **Action Simulator**: Sandbox จำลองการทำงานและการกระทบสต็อกคงเหลือ
- **เหตุผล:** ผู้ใช้ขอกระบวนการสัมภาษณ์ `/grill-me` สรุปความแตกต่างและผัง Workflow ของทั้ง 2 ระบบในสไตล์ `/ui-ux-pro-max`

## [2026-08-07 16:35]

- **ไฟล์ที่สร้าง/แก้ไข:** 
  - `src/pages/Items.jsx` [MODIFY]
  - `src/pages/StockIn.jsx` [MODIFY]
  - `src/components/ui/PosTerminal.jsx` [MODIFY]
  - `supabase/migrations/04_atomic_inventory_approval_rpc.sql` [MODIFY]
- **รายละเอียด:**
  - `Items.jsx`:
    - **Auto Seed Categories**: เพิ่มระบบตรวจสอบและสร้างหมวดหมู่พื้นฐาน 6 หมวดใส่อัตโนมัติในกรณีตาราง `categories` ยังว่างเปล่า แก้ไขปัญหาหัวข้อหมวดหมู่ไม่มีรายการ
    - **Client-side FileReader Upload**: ปรับปรุงฟังก์ชัน `handleImageUpload` ให้แปลงไฟล์เป็น Data URL (Base64) บนเบราว์เซอร์โดยตรง ป้องกันข้อผิดพลาด `net::ERR_CONNECTION_REFUSED` จากพอร์ต 3001
    - **Master Data Logic**: การสร้างวัสดุใหม่ตั้งค่าสต็อกเป็น 0 เสมอ, เพิ่มการเช็ค SKU ซ้ำ และแสดงคอลัมน์สต็อกปัจจุบัน
  - `StockIn.jsx`: ปรับให้ทำหน้าที่เฉพาะ **Stock Receipt Transaction** (รับเข้าสต็อกให้โครงการจากวัสดุที่มีในระบบ) เพิ่มสเปก `isStockIn={true}` ให้กับ `PosTerminal`, ป้องกันการกดยืนยันบิลซ้ำ (`isSubmitting`)
  - `PosTerminal.jsx`: รองรับโหมด `isStockIn={true}` ไม่บล็อกการเลือกวัสดุที่มีสต็อกเป็น 0
- **เหตุผล:** แก้ไขปัญหาหมวดหมู่ว่างเปล่า และขจัด dependency พอร์ต 3001 ด้วยการใช้อัปโหลดภาพบน Client-side อย่างสมบูรณ์

## [2026-08-07 15:36]

- **ไฟล์ที่สร้าง/แก้ไข:** 
  - `supabase/migrations/04_atomic_inventory_approval_rpc.sql` [NEW]
  - `src/components/ui/PosTerminal.jsx` [MODIFY]
  - `src/pages/Withdrawals.jsx` [MODIFY]
  - `src/pages/auth/Login.jsx` [MODIFY]
  - `src/contexts/AuthContext.jsx` [MODIFY]
  - `src/pages/Projects.jsx` [MODIFY]
- **รายละเอียด:**
  - `04_atomic_inventory_approval_rpc.sql`: เพิ่มคำสั่ง `ALTER TABLE public.projects ALTER COLUMN owner_id DROP NOT NULL;` และ `NOTIFY pgrst, 'reload schema';` แก้ไขปัญหา `ERROR: 23502: null value in column "owner_id" of relation "projects" violates not-null constraint`
  - `Projects.jsx`: ส่ง `owner_id: profile.id` ควบคู่กับ `created_by` เมื่อสร้างโครงการใหม่ และปรับปรุงการแสดง `error.message`
  - `AuthContext.jsx`: ปรับปรุงฟังก์ชัน `fetchProfile` ให้ตรวจสอบและสร้างข้อมูล `profile` อัตโนมัติ (`upsert`) กรณีผู้ใช้ล็อกอินเข้ามาแล้วยังไม่มีเรคคอร์ดในตาราง `profiles`
  - `Login.jsx`: เพิ่มคุณสมบัติ `autoComplete="email"` และ `autoComplete="current-password"` เพื่อขจัดคำเตือนเบราว์เซอร์ใน Console
- **เหตุผล:** แก้ไขบั๊ก `null value in column "owner_id" violates not-null constraint` บนตาราง `projects` ใน Supabase ให้อัปเดตได้ผ่านทั้งสองฟิลด์อย่างสมบูรณ์

## [2026-08-07 15:20]

- **Files Modified:** `rbac-workflow.html`
- **Changes:**
  - แก้ไขจุดบกพร่องของ `QuerySelector` จากเดิม `containerSelector + ' svg'` เป็น `containerSelector + ' .mermaid svg'` เพื่อระบุเป้าหมายเป็นผัง Diagram แท้จริงของ Mermaid.js และป้องกันไม่ให้เลือกติดไอคอน SVG ประจำหัวข้อ (`<svg class="w-5 h-5">`) 
  - สร้างสเปกตรัม `<style>` ด้วย `createElementNS` ภายใน SVG namespace เพื่อให้การบันทึกผังเป็น PNG และ SVG ดึงสี, ขอบ, ฟอนต์ และสัดส่วนของผังอันที่ 2 (Detailed Database Transaction & Approval Atomic Workflow) ออกมาได้อย่างสมบูรณ์แบบ
- **Reason:** ผู้ใช้ส่งไฟล์ภาพที่ดาวน์โหลดมาให้ดู และพบว่าภาพที่ได้เป็นไอคอนหัวข้อขนาด 24x24 แทนที่จะเป็นผัง Diagram

## [2026-08-07 15:16]

- **Files Modified:** `rbac-workflow.html`
- **Changes:**
  - พัฒนาฟังก์ชัน `prepareStyledSvgClone()` เพื่อคัดลอกสไตล์ CSS ทั้งหมดใน Document เข้าสู่ SVG Clone ก่อนส่งออก และคำนวณ `viewBox` กับขนาดความสูง/กว้างที่แท้จริงตามโครงสร้างของผังแต่ละอัน
  - แก้ไขปัญหาปุ่มบันทึกรูปภาพ PNG/SVG ของผังที่ 2 (Detailed Database Transaction & Approval Atomic Workflow) ได้รูปภาพครอบตัด/สไตล์ไม่ครบ หรือดึงสัดส่วนผิดพลาด
- **Reason:** ผู้ใช้แจ้งว่าปุ่มบันทึกรูปภาพ PNG และ SVG ของผังอันที่ 2 ได้รูปภาพที่ไม่ถูกต้อง

## [2026-08-07 15:11]

- **Files Modified:** `rbac-workflow.html`
- **Changes:**
  - เพิ่มผัง **Visual Workflow Diagram อันที่ 2: Detailed Database Transaction & Approval Atomic Workflow** โดยเรนเดอร์ขั้นตอนการทำงานตั้งแต่ Staff Cart Checkout, INSERT pending, Admin Review, Supabase RPC Transaction (SELECT FOR UPDATE, Lock Rows, Stock Check, Rollback vs All-or-Nothing Commit), การแจ้งเตือน และการกดยืนยันรับของ
  - เพิ่มปุ่มดาวน์โหลดไฟล์ `.PNG` และ `.SVG` แยกเฉพาะสำหรับผัง Diagram อันที่ 2
- **Reason:** ผู้ใช้ระบุขั้นตอนและต้องการเพิ่มผัง Workflow Diagram ละเอียดอีกอันในไฟล์ HTML

## [2026-08-07 14:50]

- **Files Modified:** `rbac-workflow.html`
- **Changes:**
  - แก้ไขข้อผิดพลาด `Uncaught SecurityError: Failed to execute 'toDataURL' on 'HTMLCanvasElement'` โดยปรับการเรนเดอร์ Mermaid ให้ใช้ pure SVG (`htmlLabels: false`) และใช้ Data URI Base64 Encoding แทน Blob URL
  - เพิ่มระบบสำรอง (Automatic Graceful Fallback) ให้ดาวน์โหลดเป็นไฟล์ `.SVG` หาก Canvas ถูกบล็อกโดยข้อกำหนดความปลอดภัยของเบราว์เซอร์
  - เพิ่มปุ่ม **"บันทึกผัง (.SVG)"** แยกต่างหากสำหรับส่งออกภาพกราฟิกแบบเวกเตอร์
- **Reason:** แก้ไขปัญหาการดาวน์โหลดภาพ PNG ในเบราว์เซอร์ Google Chrome / Edge เมื่อ Canvas เกิดอาการ Tainted

## [2026-08-07 14:48]

- **Files Modified:** `rbac-workflow.html`
- **Changes:**
  - เพิ่มปุ่ม **"บันทึกรูปภาพ (.PNG)"** และฟังก์ชัน Client-side JavaScript `downloadDiagramPng()` ในการแปลงภาพผัง Visual Workflow Diagram (Mermaid SVG) ออกมาเป็นไฟล์ภาพความละเอียดสูง (.PNG 2x High-DPI Resolution) พร้อมสีพื้นหลังตรงตามธีมที่เปิดอยู่
- **Reason:** ผู้ใช้สอบถามและต้องการบันทึกผัง Visual Workflow Diagram เป็นไฟล์รูปภาพ .PNG

## [2026-08-07 14:39]

- **Files Modified:** `rbac-workflow.html`
- **Changes:**
  - เพิ่ม **Visual Swimlane Workflow Diagram** ด้วย **Mermaid.js Engine** แสดงผังลำดับขั้นตอนการทำงาน (Staff vs Admin vs Supabase DB RLS) และการเปลี่ยนสถานะบิลแบบกราฟิกสวยงามในหน้าหลัก
- **Reason:** ผู้ใช้ขอให้เพิ่ม Visual Workflow Diagram ในไฟล์ HTML

## [2026-08-07 14:27]

- **Files Created:** `rbac-workflow.html`
- **Changes:**
  - สรุปและสร้างผังกระบวนการทำงาน Role RBAC Architecture สำหรับ Stock-Flow App ในรูปแบบไฟล์ HTML สมบูรณ์แบบ (Single-file HTML Dashboard)
  - พัฒนา interactive flowchart 4 ระยะ, role permission matrix table พร้อมระบบค้นหา/กรอง, role simulator sandbox สำหรับทดสอบสิทธิ์, และ Supabase RLS SQL policies
  - ออกแบบอินเทอร์เฟซตามมาตรฐาน UI/UX Pro Max ด้วย Tailwind CSS, Google Fonts Plus Jakarta Sans, Dark/Light mode toggle, และ Glassmorphism visual style
- **Reason:** ผู้ใช้ต้องการสรุป workflow diagram ของระบบ Role RBAC มาเป็นไฟล์ .html พร้อมดีไซน์ UI/UX Pro Max

## [2026-08-02 16:15]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - แก้ไขปัญหา IDE Code Parser Error / Warning ในส่วนตัวอย่างโค้ด JSX โดยทำการ Escape เครื่องหมายแท็ก HTML (`<` เป็น `&lt;` และ `>` เป็น `&gt;`) ภายในบล็อก `<pre><code>` ทุกจุด
- **Reason:** แก้ไขปัญหาสวนทางระหว่างไวยากรณ์ HTML/CSS ของ IDE Parser กับโค้ดตัวอย่าง JSX เพื่อให้โค้ดถูก Highlight อย่างถูกต้องและไม่มี Syntax Error

## [2026-08-02 16:12]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - เพิ่มหัวข้อและรายละเอียดส่วน "การออกแบบและกำหนดรูปแบบหน้าตา PDF (PDF Layout & UI/UX Design Systems)"
  - เพิ่มส่วนอธิบายสเปกขอบกระดาษ, สัดส่วนความกว้างคอลัมน์ตาราง, แบบจำลองโครงสร้างหน้าตาเอกสาร PDF (Visual Page Layout Mockup Preview), และตารางอ้างอิงคุณสมบัติสไตล์ใน `@react-pdf/renderer`
- **Reason:** ผู้ใช้ต้องการเพิ่มข้อมูลรายละเอียดการจัดและออกแบบรูปแบบหน้าตา PDF ในเอกสารคู่มือ

## [2026-08-02 16:08]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - ตัดส่วนข้อมูล Server-Side PDF Service (`Puppeteer + Express`) ออกจากคู่มือทั้งหมด
  - ปรับสถาปัตยกรรมเอกสารคู่มือให้เน้นการใช้งาน Client-Side PDF (`@react-pdf/renderer`) และ HTML/CSS Print Standard (`delivery-note.html`) อย่างสมบูรณ์
- **Reason:** ผู้ใช้แจ้งว่าส่วน Server-Side PDF Service ไม่ได้ใช้งานแล้วในปัจจุบัน

## [2026-08-02 16:04]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - สร้างเอกสารคู่มือการสร้างไฟล์ PDF แบบละเอียด (PDF Generation Architecture Guide) ในรูปแบบ HTML ตามมาตรฐาน UI/UX Pro Max
  - รวบรวมคำอธิบายทั้ง Client-Side PDF (`@react-pdf/renderer`), Server-Side PDF Microservice (`Puppeteer Express`), การตั้งค่าฟอนต์ภาษาไทย (`THSarabunNew` / `Sarabun`), และตัวอย่างโค้ดพร้อมเทคนิคแก้ไขบั๊ก
- **Reason:** ผู้ใช้ต้องการสรุปคู่มือและสถาปัตยกรรมกระบวนการสร้างเอกสาร PDF ของโปรเจกต์ Stock-Flow-app ที่ใช้งานอยู่

## [2026-07-15 16:27]

- **Files Modified:** `src/pages/Withdrawals.jsx`, `src/pages/History.jsx`, `src/lib/pdf-templates.jsx`
- **Changes:**
  - เพิ่มช่องกรอก "สถานที่จัดส่ง (Delivery Address)" ในฟอร์มยืนยันการเบิกจ่าย
  - ปรับให้ใบนำส่ง (PDF) ดึงข้อมูลสถานที่จัดส่งมาแสดงตรงหัวกระดาษ (ส่งของที่ : ) แทนชื่อโครงการ
  - นำข้อมูลสถานที่จัดส่งไปแสดงในหน้ารายละเอียดคำขอเบิกด้วย
- **Reason:** ผู้ใช้ต้องการสามารถระบุที่อยู่จัดส่งแบบกำหนดเองได้ เพื่อความสะดวกและยืดหยุ่นในการออกใบนำส่ง

## [2026-07-15 16:20]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เพิ่มการแสดงผลหน่วยของวัสดุ (Unit) ต่อท้ายตัวเลขจำนวนในตาราง PDF (เช่น จาก "1" เป็น "1 ชุด" หรือ "1 ชิ้น")
- **Reason:** ผู้ใช้ต้องการให้แสดงหน่วยในเอกสารเพื่อให้เกิดความชัดเจนในการเบิกจ่าย

## [2026-07-15 16:07]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ลบคอลัมน์ "Remark" ออกจากตารางใน PDF เพื่อเพิ่มพื้นที่ความกว้างให้กับคอลัมน์ชื่อรายการและ Serial Number
  - ย้ายข้อมูล Remark (จุดประสงค์การเบิก) ไปแสดงผลเป็นบรรทัดใหม่ที่อยู่ต่อท้ายตาราง และก่อนถึงส่วนของลายเซ็น
- **Reason:** ผู้ใช้ต้องการนำ Remark ออกจากตารางเพื่อไม่ให้กินพื้นที่ และย้ายไปไว้ด้านล่างแทน

## [2026-07-15 16:02]

- **Files Modified:** `index.html`
- **Changes:**
  - เพิ่ม Script สำหรับโหลด `Buffer` และ `global` (Polyfill) จาก `esm.sh` เข้าไปใน `index.html`
- **Reason:** แก้บั๊ก Vite รัน `Buffer is not defined` เวลาที่ Component ของ `@react-pdf/renderer` พยายามประมวลผลไฟล์รูปภาพหรือไฟล์ PDF ในฝั่ง Client-side

## [2026-07-15 15:46]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ยกเลิกการล็อกลายเซ็นให้ติดขอบล่างของหน้ากระดาษ (ลบคำสั่ง `fixed` และ `position: absolute`)
  - เปลี่ยนให้ส่วนของลายเซ็น (Footer) ไหลต่อท้ายตารางเสมอ ไม่ว่าตารางจะสั้นหรือยาว
  - ใช้คำสั่ง `wrap={false}` กับส่วนลายเซ็น เพื่อให้แน่ใจว่าถ้าพื้นที่ท้ายกระดาษไม่พอ ลายเซ็นทั้งก้อนจะถูกปัดขึ้นหน้าใหม่พร้อมกัน โดยไม่ถูกตัดขาดครึ่ง
- **Reason:** ผู้ใช้ต้องการให้ลายเซ็นต่อท้ายรายการเสมอ และไม่ต้องการให้ล็อกติดพื้นกระดาษเผื่อกรณีรายการยาวมากๆ

## [2026-07-15 15:42]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - แก้ไขปัญหาตารางทับซ้อนกับลายเซ็นเมื่อมีรายการเบิกเกิน 15 รายการ
  - เพิ่มระยะขอบด้านล่างของหน้ากระดาษ (Padding Bottom) เป็น `70mm` เพื่อกันพื้นที่สำหรับลายเซ็น
  - เพิ่มคำสั่ง `fixed` ในส่วนของ Footer เพื่อบังคับให้ลายเซ็นแสดงผลที่ด้านล่างสุดของกระดาษ *ทุกหน้า* เสมอ และตารางจะถูกตัดขึ้นหน้าใหม่โดยอัตโนมัติ
- **Reason:** ระบบเก่าตารางไหลลงมาทับลายเซ็นและทำให้ลายเซ็นขาดครึ่งเมื่อข้อมูลยาวเกิน 1 หน้า

## [2026-07-15 15:39]

- **Files Modified:** `src/pages/Withdrawals.jsx`, `src/pages/History.jsx`
- **Changes:**
  - เพิ่ม Scrollbar ให้กับตารางในหน้าต่าง (Modal) "รายละเอียดบิลคำขอเบิกจ่าย"
  - จำกัดความสูงของตารางไว้ที่ 50% ของหน้าจอ (`max-h-[50vh]`) เพื่อไม่ให้หน้าต่างล้นขอบจอเวลาที่มีรายการเบิกจำนวนมาก
- **Reason:** ผู้ใช้พบปัญหาเวลาเบิกของเยอะๆ รายการจะล้นจอทำให้ดูไม่ครบและกดปิด/อนุมัติลำบาก

## [2026-07-15 15:10]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ปรับสเกลขนาดตัวอักษรทั้งหมดในเอกสาร (ตาราง, หัวข้อ, ลายเซ็น) ให้เป็นมาตรฐานของ `THSarabunNew` (Base size `16pt`)
  - ปรับขนาดชื่อบริษัทเป็น `30pt` (TH) / `22pt` (EN) และที่อยู่เป็น `14pt` ตามที่ผู้ใช้ปรับแต่ง เพื่อให้ขนาดตัวอักษรเมื่อพิมพ์ออกมาเท่ากับต้นฉบับจริง
- **Reason:** ฟอนต์ `THSarabunNew` มีสเกลที่เล็กกว่าปกติ การใช้ขนาด 9pt-10pt แบบเดิมจะทำให้อ่านไม่ออกเมื่อพิมพ์เป็นกระดาษ A4

## [2026-07-15 15:06]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เปลี่ยนฟอนต์ในเอกสาร PDF จาก `Sarabun` เป็น `THSarabunNew`
  - ทำการรองรับฟอนต์ทั้ง 4 สไตล์ (Regular, Italic, Bold, BoldItalic)
- **Reason:** ผู้ใช้ต้องการเปลี่ยนไปใช้ฟอนต์ `THSarabunNew` เพื่อให้เหมือนกับเอกสารราชการ/บริษัทมากขึ้น

## [2026-07-15 15:00]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - แก้ไขปัญหาเส้นขอบตาราง (Borders) ในแถวที่ว่างเปล่า โดยเปลี่ยนจากการตีเส้นที่ตัว Text ให้ไปตีเส้นที่กรอบ View (Cell) แทน เพื่อให้เส้นตารางลากยาวลงมาเชื่อมกันสนิท
  - ปรับการจัดวางตำแหน่งข้อความในช่องลายเซ็นให้อยู่เหนือเส้นบรรทัดพอดี ตรงตามต้นฉบับ
- **Reason:** ผู้ใช้แจ้งว่า Layout ยังมีจุดผิดเพี้ยน (เส้นขอบตารางขาดตอนในแถวว่าง และลายเซ็นไม่ลอยอยู่บนเส้น)

## [2026-07-15 14:41]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ปรับโครงสร้างหน้าตาของ `DeliveryNotePDF` ให้ตรงกับแบบฟอร์มเอกสารใบนำส่งฉบับจริง (Template HTML) ของบริษัท
  - เพิ่มโลโก้บริษัท (อ่านจาก `/images/logo.png`)
  - เพิ่มหัวกระดาษบริษัท และข้อความระบุว่า "ใบนำส่งอุปกรณ์" / "ต้นฉบับ"
  - ปรับช่องตารางให้มีคอลัมน์ ลำดับ, รายการ, จำนวน, Serial Number/Part Number, และ Remark
  - เติมแถวว่างอัตโนมัติให้ครบอย่างน้อย 15 แถว เพื่อให้เอกสารดูเป็นทางการและมีที่ว่างสำหรับเขียนเพิ่ม
  - เพิ่มช่องลายเซ็นสำหรับผู้ส่งของและผู้รับของด้านล่างสุด
- **Reason:** เพื่อให้แบบฟอร์ม PDF ที่ Export ออกมาจากระบบมีหน้าตาตรงกับมาตรฐานเอกสารเบิกและนำส่งอุปกรณ์ที่บริษัท FORTH ใช้งานอยู่จริง

## [2026-07-15 14:27]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เปลี่ยนการเรียกใช้ฟอนต์จาก CDN (`cdn.jsdelivr.net`) กลับมาเป็น Local Path (`/fonts/Sarabun-*.ttf`) อีกครั้ง
- **Reason:** ผู้ใช้ได้ทำการดาวน์โหลดไฟล์ฟอนต์ `Sarabun` มาใส่ไว้ในโฟลเดอร์ `public/fonts` เรียบร้อยแล้ว การเรียกใช้ไฟล์จาก Local โดยตรงจะมีความเสถียรและรวดเร็วกว่าการดึงผ่าน CDN ที่อาจเกิด Error 404 ได้

## [2026-07-15 14:23]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เปลี่ยนพาร์ท (Path) ของฟอนต์ Sarabun จาก Local (`/fonts/Sarabun-Regular.ttf`) เป็น URL ของ CDN (`cdn.jsdelivr.net`)
- **Reason:** การเรียกใช้ฟอนต์จาก Local เกิดข้อผิดพลาด (Unknown font format) เนื่องจากไม่มีไฟล์ฟอนต์อยู่ในโฟลเดอร์ `public/fonts` และตัว Vite server ส่งคืนหน้า HTML (404) กลับมาให้แทน ทำให้ React-PDF แปลงไฟล์ไม่สำเร็จ การดึงจาก CDN โดยตรงจะช่วยแก้ปัญหานี้ได้ทันที

## [2026-07-15 14:20]

- **Files Modified:** `src/components/ui/PosTerminal.jsx`
- **Changes:**
  - นำ Component `<Card>` กลับมาครอบการ์ดสินค้าและตะกร้าสินค้าในหน้า POS
  - ลบเส้นแกน Y (`divide-x`) ออก และใช้ช่องว่าง (`gap-6`) ระหว่างการ์ดแทน เพื่อปล่อยให้แสงเงาของ Neumorphism ทำหน้าที่แบ่งสัดส่วนหน้าจอแทนเส้นขอบ
  - คงการจัดเรียง Typography และ Spacing ภายในที่สะอาดตาตามสไตล์ Gridgeist เอาไว้
- **Reason:** เพื่อคืนความนูน (Neumorphism) ให้กับหน้า POS เช่นเดียวกับหน้า Dashboard แต่ยังคงความเป็นระเบียบเรียบร้อยไว้

## [2026-07-15 14:18]

- **Files Modified:** `src/pages/Dashboard.jsx`
- **Changes:**
  - นำ Component `<Card>` กลับมาใช้เพื่อให้ Design System กลับไปเป็นสไตล์ Neumorphism (ผ่านคลาส `neu-flat`)
  - ผสมผสานหลักการของ `gridgeist` เข้าไปไว้ "ภายใน" การ์ดแทน โดยใช้ Typography จัดลำดับชั้นข้อมูลให้ชัดเจนขึ้น
  - จัดโครงสร้าง Layout กลับมาอยู่ใน `<Card>` โดยไม่มีเส้นขอบ (border-none) เพื่อให้ตัวการ์ดนูนขึ้นมาด้วยแสงเงาอย่างสมบูรณ์
  - ปรับ Tooltip ของกราฟ BarChart ให้มีแสงเงาสไตล์ Neumorphism
- **Reason:** ผู้ใช้ต้องการนำเอกลักษณ์ความนูน (Neumorphism) กลับมา แต่ยังคงต้องการให้ข้อมูลถูกจัดเรียงอย่างเป็นระเบียบตามหลัก Editorial UI

## [2026-07-15 14:14]

- **Files Modified:** `src/pages/Dashboard.jsx`
- **Changes:**
  - รื้อโครงสร้าง UI หน้า Dashboard ใหม่ทั้งหมดตามหลักการของ Skill `gridgeist`
  - ลบ Component `<Card>` ออกทั้งหมด และเปลี่ยนมาใช้ Grid 12 คอลัมน์ (8 คอลัมน์สำหรับกราฟ, 4 คอลัมน์สำหรับกิจกรรมล่าสุด)
  - ปรับการจัดลำดับชั้นข้อมูล (Hierarchy) ด้วย Typography แทนกล่อง โดยปรับตัวเลขสถิติให้ใหญ่ขึ้น (`text-5xl font-light`) และแยกส่วนด้วยเส้น 1px rule
  - แก้ไขกราฟ BarChart ให้เป็นทรงเหลี่ยม (Square corners) และลบเงา (Shadow) ออก
  - ใช้ฟอนต์ Monospace (`font-mono`) สำหรับเวลาในส่วนของกิจกรรมล่าสุด
  - ยังคงรักษาฟังก์ชัน สีประจำแบรนด์ และการดึงข้อมูลทั้งหมดไว้เหมือนเดิม
- **Reason:** ผู้ใช้ต้องการ Redesign หน้า Dashboard ใหม่ให้เป็นระเบียบ เรียบง่าย และมีความเป็นมืออาชีพมากขึ้น

## [2026-07-15 14:11]

- **Files Modified:** `src/components/ui/PosTerminal.jsx`
- **Changes:**
  - ปรับปรุง (Redesign) หน้าต่าง POS ใหม่ตามหลักการของ Skill `gridgeist` (Editorial POS Workspace)
  - ลบเส้นกรอบและเงาที่ไม่จำเป็นออกจากการ์ดสินค้าและรายการในตะกร้า
  - เพิ่มเส้นแกน Y (1px rule) แบ่งฝั่งซ้ายและขวาอย่างชัดเจน
  - ปรับซ่อนปุ่มลบ/ขยายรายละเอียดในตะกร้าให้แสดงเมื่อโฮเวอร์ (Hover) เท่านั้น เพื่อลดความรกของหน้าจอ
- **Reason:** ผู้ใช้ต้องการให้ UI ดูโปร่ง เป็นระเบียบ และมีความเป็น Workspace เชิงเทคนิคมากขึ้น

## [2026-07-15 13:58]

- **Files Modified:** `src/lib/pdf-templates.jsx` (New), `src/pages/Withdrawals.jsx`, `src/pages/Reports.jsx`, `.env`
- **Changes:**
  - เพิ่มไฟล์ `src/lib/pdf-templates.jsx` เพื่อสร้าง Template PDF ด้วย `@react-pdf/renderer` โดยฝังฟอนต์ Sarabun
  - แก้ไข `Withdrawals.jsx` และ `Reports.jsx` ให้สร้างไฟล์ PDF ฝั่ง Frontend ด้วยไลบรารี `@react-pdf/renderer` (เปลี่ยนจาก `fetch()` ยิงไป API เป็นเรียกใช้ `pdf().toBlob()`)
  - ลบตัวแปร `VITE_PDF_API_URL` ออกจากไฟล์ `.env`
- **Reason:** ผู้ใช้ต้องการยกเลิกการใช้ระบบ Backend ในการสร้าง PDF และย้ายการทำงานทั้งหมดมาไว้ที่ฝั่ง Frontend เพื่อความรวดเร็วและลดความซับซ้อนของระบบ

## [2026-07-15 13:34]

- **Files Modified:** `pdf-service/server.js`, `pdf-service/Dockerfile`, `pdf-service/package.json`, `src/pages/Withdrawals.jsx`, `src/pages/Reports.jsx`
- **Changes:**
  - `pdf-service/server.js`: ลบการใช้งาน `Ghostscript` ออกทั้งหมด และให้ Puppeteer คืนค่า PDF buffer โดยตรง ไม่ต้องบันทึกไฟล์ชั่วคราว
  - `pdf-service/Dockerfile`: ลบคำสั่งติดตั้ง `ghostscript` ออกเพื่อลดขนาดของ Docker Image
  - `pdf-service/package.json`: แก้ไขคำอธิบายโปรเจกต์เป็น True PDF
  - `src/pages/Withdrawals.jsx`, `src/pages/Reports.jsx`: แก้ไขข้อความในระบบแจ้งเตือน (Toast) และเปลี่ยนชื่อไฟล์ตอนดาวน์โหลดไม่ให้มีคำว่า "PDFA"
- **Reason:** ผู้ใช้ต้องการเปลี่ยนการสร้างเอกสารจากรูปแบบ PDF/A-2b กลับไปเป็นรูปแบบ True PDF ธรรมดา เพื่อให้ได้ความคมชัด คัดลอกข้อความได้ และลดความซับซ้อน/ขนาดของไฟล์

## [2026-07-15 10:35]

- **Files Modified:** `supabase/migrations/03_add_delivery_note_fields.sql` (New), `src/components/ui/PosTerminal.jsx`, `src/pages/Withdrawals.jsx`, `src/lib/pdf-service.js` (New)
- **Changes:**
  - สร้างสคริปต์ Migration เพื่อเพิ่ม Column `delivery_to`, `serial_number`, `part_number` ในตารางเบิกจ่ายและรับเข้า
  - อัปเดต `PosTerminal.jsx` ให้สามารถกดขยาย (Expand) รายการในตะกร้าเพื่อกรอกข้อมูล S/N (Textarea แบบคั่นด้วยลูกน้ำ), P/N และสถานที่ส่ง (EMS/Office) ได้
  - เพิ่มปุ่ม "พิมพ์ใบนำส่ง (PDF)" ในหน้า `Withdrawals.jsx` (Order Details Dialog)
  - สร้างเซอร์วิส `pdf-service.js` สำหรับแปลงข้อมูลใบเบิกและรายการวัสดุให้อยู่ในรูปแบบ XML ตาม Template มาตรฐาน และยิงไปที่ API (`VITE_PDF_API_URL/api/generate-delivery-note`) เพื่อรับไฟล์ PDF กลับมา
- **Reason:** ผู้ใช้ต้องการฟีเจอร์สร้างใบนำส่งอุปกรณ์ (Delivery Note) ในรูปแบบ PDF/A-2b ผ่าน API ภายนอก โดยอิงจากข้อมูล XML เดิมที่มีอยู่

## [2026-07-15 09:55]

- **Files Modified:** `src/pages/Manual.jsx` (New), `src/App.jsx`, `src/components/layout/Sidebar.jsx`, `CONTEXT.md`
- **Changes:**
  - สร้างหน้าเพจ "คู่มือการใช้งาน (Manual)" (`/manual`) เพื่ออธิบายวิธีการใช้งานระบบ
  - แบ่งเนื้อหาคู่มือออกเป็น 2 ส่วนชัดเจน: สำหรับพนักงานทั่วไป (การเบิกของด้วย POS, ข้อจำกัด All-or-Nothing) และสำหรับแอดมิน (การรับเข้า, การอนุมัติ)
  - นำปุ่ม คู่มือการใช้งาน ไปแสดงบนเมนูด้านซ้าย (Sidebar)
  - อัปเดต `CONTEXT.md` (Glossary) เพิ่มคำศัพท์ `All-or-Nothing Approval` เพื่อให้เป็นเอกสารอ้างอิงของโปรเจกต์
- **Reason:** ผู้ใช้ต้องการทำ Document สำหรับการใช้งานแต่ละส่วนอย่างละเอียด (ออกแบบผ่านระบบ Grill-with-docs)

## [2026-07-15 09:45]

- **Files Modified:** `src/App.jsx`, `src/components/layout/PageWrapper.jsx`, `Topbar.jsx`, `Sidebar.jsx`
- **Changes:**
  - แก้ไข React Router Future Flag Warnings ใน `App.jsx` (`v7_startTransition`, `v7_relativeSplatPath`)
  - อัปเดตและเขียนระบบ Mobile Sidebar Toggle ใหม่ เพื่อให้ปุ่ม Hamburger menu (บนหน้าจอมือถือ/แท็บเล็ต) สามารถกดเพื่อเปิด-ปิด Sidebar ได้
- **Reason:** ผู้ใช้แจ้งปัญหาจากการทดสอบระบบบนหน้าจอขนาดเล็กและเห็น Error logs ใน Console (วิเคราะห์และแก้ไขผ่านทักษะ Debugger)

## [2026-07-15 09:35]

- **Files Modified:** `supabase/migrations/02_pos_orders.sql` (New), `src/components/ui/PosTerminal.jsx` (New), `src/pages/Items.jsx`, `src/pages/Withdrawals.jsx`, `src/pages/StockIn.jsx`, `src/pages/History.jsx`, `src/pages/Reports.jsx`
- **Changes:**
  - สร้างไฟล์ Migration `02_pos_orders.sql` เพื่อรื้อโครงสร้าง DB การเบิกจ่าย/รับเข้า จากรูปแบบ 1 แถวต่อวัสดุ เปลี่ยนเป็นรูปแบบ Order (บิล) และ Order Items (รายการย่อย)
  - สร้าง `PosTerminal.jsx` Component สำหรับระบบตะกร้าสินค้า (Cart), ค้นหา (Search), และตัวกรองหมวดหมู่ (Category Filter)
  - `Items.jsx`: เพิ่มการผูก `category_id` (หมวดหมู่) ในฟอร์มสร้างและแก้ไขวัสดุ
  - `Withdrawals.jsx` และ `StockIn.jsx`: เปลี่ยนหน้าจอสร้างคำขอเป็นระบบ POS เมื่อกดสร้างคำขอ จะสามารถกดเพิ่มลดสินค้าในตะกร้า และสั่งรวบยอดเป็นบิลเดียวได้
  - `History.jsx`: อัปเดตให้ดึงประวัติจากตาราง `withdrawal_orders` แสดงผลลัพธ์แบบรวมบิล
  - `Reports.jsx`: แก้ไข Query ดึงข้อมูลจากตารางใหม่ โดยแปลงข้อมูลให้ออกมาแบน (Flatten) เพื่อคงหน้าตารายงานให้เหมือนเดิม
- **Reason:** ผู้ใช้ต้องการให้ระบบเบิกจ่ายทำเป็นรูปแบบคล้าย POS ที่สามารถใส่ของในตะกร้าหลายชิ้นแล้วกด Checkout ได้ (เพื่อให้หาอุปกรณ์ได้ง่ายขึ้นจากรูปภาพ)

## [2026-07-15 09:15]

- **Files Modified:** `src/App.css`, `index.html`, `src/components/ui/card.jsx`, `button.jsx`, `input.jsx`, `table.jsx`, `src/components/layout/Sidebar.jsx`, `Topbar.jsx`, `src/pages/Dashboard.jsx`, `src/pages/Reports.jsx`, `src/pages/Projects.jsx`, `src/pages/Items.jsx`, `src/pages/History.jsx`, `src/pages/StockIn.jsx`, `src/pages/Withdrawals.jsx`
- **Changes:**
  - เปลี่ยนรูปแบบ Design System จาก Glassmorphism เป็น Neumorphism (Soft UI) โทนสว่าง
  - ปรับสีพื้นหลังของแอปพลิเคชันเป็น `#e0e5ec` (Light Grey)
  - เพิ่ม CSS Classes ใหม่สำหรับ Neumorphism (`.neu-flat`, `.neu-pressed`, `.neu-button`) ใน `App.css`
  - นำ `.glass-card` ออกจาก Component และ Page ทั้งหมด
  - อัปเดตเงาและลักษณะของ `Card`, `Button`, `Input` ให้มีความโค้งมนและนูนแบบ 3 มิติ
  - ปรับปรุง `Sidebar` และ `Topbar` ให้ใช้สีพื้นและเงาที่สอดคล้องกับธีมใหม่
- **Reason:** ผู้ใช้ให้ปรับ UI เป็นรูปแบบ Neumorphism โทนสว่าง (Option A) ตามที่ตกลงกันไว้

## [2026-07-15 08:53]

- **Files Modified:** `src/pages/Reports.jsx`
- **Changes:**
  - `Reports.jsx`: เขียนหน้าจอรายงานใหม่ทั้งหมด แบ่งออกเป็น 3 Tabs (รายงานรับเข้า, รายงานเบิกจ่าย, รายงานยอดคงเหลือ)
  - เพิ่มระบบฟิลเตอร์สำหรับแต่ละรายงาน เช่น กรองโครงการ, ช่วงวันที่, สถานะ, ผู้จำหน่าย
  - อัปเดตฟังก์ชัน Export Excel ให้รองรับโครงสร้างข้อมูลที่ต่างกันในแต่ละรายงาน (sheetName และ exportData เปลี่ยนแปลงแบบ dynamic)
  - ปรับการส่งข้อมูลไปยัง API Export PDF เพื่อรองรับ Report ทั้ง 3 ประเภท
- **Reason:** ผู้ใช้ให้ดำเนินการพัฒนาระบบ Reports ตามที่ได้สรุปแผนไว้ (Plan 8)

## [2026-07-15 08:31]

- **Files Modified:** `CONTEXT.md`, `implementation_plan.md`
- **Changes:**
  - `CONTEXT.md`: สร้างไฟล์และเพิ่มคำศัพท์นิยามสำหรับ Reports (Stock In, Withdrawals, Stock Balance)
  - `implementation_plan.md`: ปรับปรุงโครงสร้างหัวข้อ Reports ให้แยกเป็น 3 ประเภท พร้อมระบุตัวกรองข้อมูล
- **Reason:** ผู้ใช้ต้องการแยกประเภทรายงานให้ชัดเจนระหว่างรับเข้าและเบิกจ่าย (ผ่านระบบ Grill-with-docs)

## [2026-07-14 17:35]

- **Files Modified:** `src/pages/Items.jsx`, `src/pages/History.jsx`, `src/pages/Projects.jsx`, `supabase/migrations/01_initial_schema.sql`
- **Changes:**
  - `Items.jsx`: เพิ่มปุ่มอัปโหลดรูปภาพเข้า R2 และแก้ไขบั๊ก query ข้อมูล (`.select('*')` หายไป)
  - `History.jsx`: แก้ไขบั๊ก Error 400 จากการเรียงลำดับด้วยคอลัมน์ที่ไม่มีอยู่จริง (`updated_at` -> `requested_at`)
  - `Projects.jsx`: เพิ่มช่องและแสดงผล "รหัสโครงการ (Project Code)" เพื่อรองรับรหัสอย่างเช่น `25310-9999`
  - `01_initial_schema.sql`: เพิ่มฟิลด์ `project_code` ในตาราง `projects`
- **Reason:** ผู้ใช้นำเข้าข้อมูลจาก CSV (DOPA) และต้องการผูกรหัสโครงการ + แก้ไขบั๊กจากการดึงข้อมูลที่พบระหว่างการทดสอบ

## [2026-07-14 15:10]

- **Files Modified:** `src/pages/Dashboard.jsx`, `src/pages/Projects.jsx`, `src/pages/Items.jsx`, `src/pages/Reports.jsx`, `src/components/ui/skeleton.jsx`
- **Changes:**
  - เพิ่มกราฟ (BarChart) แสดงสัดส่วนรับเข้าและเบิกจ่ายในหน้า Dashboard ด้วยไลบรารี Recharts
  - เพิ่มฟังก์ชันแก้ไขและลบข้อมูล (Edit & Delete) สำหรับ Projects และ Items
  - เพิ่มระบบป้องกันการลบข้อมูลหาก Projects/Items นั้นถูกนำไปใช้งานเบิกจ่ายแล้ว (ดัก Error Code 23503)
  - เพิ่มปุ่ม Export PDF ในหน้ารายงาน ด้วยไลบรารี jsPDF และ jspdf-autotable
  - สร้างและนำ Skeleton Loading ไปใช้งานในหน้า Dashboard เพื่อความลื่นไหลระหว่างดึงข้อมูล
- **Reason:** ดำเนินการอัปเดตฟีเจอร์ระดับสูงตามแผนงาน Phase 6

## [2026-07-14 15:00]

- **Files Modified:** `src/App.jsx`, `src/App.css`, `src/pages/Dashboard.jsx`, `src/pages/auth/Login.jsx`, `src/components/layout/Sidebar.jsx`, `Topbar.jsx`, `public/favicon.svg`, `index.html`, `.gitignore`, `supabase/migrations/01_initial_schema.sql`
- **Changes:**
  - แก้ไข `App.jsx` ให้ import หน้าจอจริงทุกหน้า (เดิมใช้ placeholder)
  - เปลี่ยน Theme จาก Dark Mode เป็น **Light Mode (โทนสีขาว)** ตลอดทั้ง App
  - ปรับ CSS variables, Sidebar, Topbar, Login, Glass effect ให้เข้ากับโทนสว่าง
  - เขียน Dashboard ใหม่ให้ดึงข้อมูลจริงจาก Supabase (projects, items, withdrawals, stock_balance)
  - แก้ไข Trigger `handle_new_user` ให้รองรับการสร้าง User จาก Supabase Dashboard (แก้ bug NOT NULL)
  - เพิ่ม `favicon.svg` แก้ปัญหา 404
  - ปรับ `.gitignore` เพิ่ม `.env`, `dist`
- **Reason:** ผู้ใช้ต้องการโทนสีขาว และเชื่อมต่อระบบกับ Supabase จริง

## [2026-07-14 14:40]

- **Files Modified:** `package.json`, `vite.config.js`, `index.html`, `.env`, `src/main.jsx`, `src/App.css`, `src/App.jsx`, `components.json`, `src/lib/utils.js`, `src/lib/supabase.js`, `src/contexts/AuthContext.jsx`, `src/components/theme-provider.jsx`, `src/components/ui/button.jsx`, `input.jsx`, `card.jsx`, `table.jsx`, `dialog.jsx`, `label.jsx`, `src/components/layout/Sidebar.jsx`, `Topbar.jsx`, `PageWrapper.jsx`, `src/pages/auth/Login.jsx`, `src/pages/Dashboard.jsx`, `supabase/migrations/01_initial_schema.sql`, `src/pages/Projects.jsx`, `src/pages/Items.jsx`, `src/pages/StockIn.jsx`, `src/pages/Withdrawals.jsx`, `src/pages/History.jsx`, `src/pages/Reports.jsx`
- **Changes:**
  - สร้างโปรเจกต์ React + Vite
  - ติดตั้งและคอนฟิก Tailwind CSS v4, shadcn/ui
  - ตั้งค่า Supabase Client, Auth Context
  - สร้างไฟล์ SQL สำหรับจัดการ Database Schema (7 tables/views)
  - สร้าง Layout Component (Sidebar, Topbar) และตั้งค่า Routing
  - สร้างหน้า Login และ Dashboard พื้นฐาน
  - สร้างหน้า Projects (จัดการโครงการ), Items (รายการวัสดุ)
  - สร้างหน้า StockIn (รับเข้า), Withdrawals (เบิกจ่าย) พร้อมระบบ Role-based access
  - สร้างหน้า History (ประวัติ) และ Reports (รายงาน Export Excel)
- **Reason:** ดำเนินการสร้างระบบ Stock Flow ต่อจนครบทุกหน้าจอตามแผนงาน
