# Agent Operating Manual (1 หน้า)

เอกสารนี้เป็น “คู่มืออ้างอิงเร็วเฉพาะโปรเจกต์” สำหรับ AI Agent และผู้พัฒนาใน **Stock-Flow (stock-flow-app)** กำหนดสแต็ก, เวิร์กโฟลว์ และมาตรฐานทางวิศวกรรมเฉพาะ repo ควบคู่กับ Global Rules

## CRITICAL SAFETY RULES (Repo-Specific)

### ขอบเขตงาน (Workspace Path Restriction)
- ทำงาน **เฉพาะภายใน workspace ของ repo นี้** (`Stock-Flow-app/`) เท่านั้น
- **ห้าม** อ่าน/เขียน/ลบ/รันคำสั่งที่กระทบ path **นอก repo** (เช่น drive root `C:\`, `D:\`, `/home/`, หรือโปรเจกต์อื่น) เว้นแต่ผู้ใช้สั่งชัดเจน
- ใช้ absolute path ได้ **เมื่อชี้ไปที่ไฟล์ภายใน workspace เท่านั้น**

### โปรโตคอลก่อนลบไฟล์ (Deletion Protocol)
ก่อนลบไฟล์หรือโฟลเดอร์ **ใดๆ** ภายใน repo ต้องได้รับยืนยันชัดเจน:
1. แสดง **path ที่แน่นอน** ที่จะลบ
2. อธิบาย **สิ่งที่จะหายไป** และ **เหตุผล**
3. รอการยืนยันจากผู้ใช้ (เช่น `YES, DELETE <path>`) — หากไม่ชัดเจนให้ยกเลิกทันที

### Git & Destructive Actions
- ปฏิบัติตาม Global Rules §2/§8: ห้าม force push ไปยัง `main`/`master`, ห้าม `git reset --hard`, `git clean -fdx`, หรือ `--amend` commit ที่ push แล้ว
- คำสั่งล้างฐานข้อมูลหรือคำสั่งทำลายโครงสร้าง ต้องได้รับการยืนยันอย่างชัดเจนก่อนรันเสมอ

---

## MUST READ (Project Skills & Knowledge Base)
- **Codebase Standards**: `.agents/skills/clean-code/SKILL.md` (clean, direct, pragmatic code)
- **Database & Supabase Concurrency**: `.agents/skills/database-design/SKILL.md` (Atomic RPCs, `SELECT ... FOR UPDATE`, RLS)
- **Frontend Design & UI/UX**: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/tailwind-patterns/SKILL.md`
- **Verification & Validation**: `.agents/skills/verify-changes/SKILL.md`, `.agents/skills/lint-and-validate/SKILL.md`
- **Systematic Debugging**: `.agents/skills/systematic-debugging/SKILL.md` (Evidence-first, reproducible trace)
- **Email & SMTP**: `.agents/skills/gmail-smtp/SKILL.md` (HTML email templates, deliverability, Nodemailer)

---

## Security Gate (Repo Credentials & RPC Security)
- **Project Named Secrets**: ห้าม hardcode หรือเปิดเผย `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, Database Connection String, หรือ SMTP Password ใช้ `.env` เท่านั้น (ในเอกสาร/คอมเมนต์ให้ใส่ `***`)
- **Supabase RPC Security**: ทุกฟังก์ชัน PL/pgSQL ต้องกำหนด `SECURITY DEFINER`, `SET search_path = public, auth, pg_temp` และตรวจสอบสิทธิ์ผู้เรียกผ่าน `auth.uid()` หรือ `has_permission()` เสมอ

---

## Definition of Done — Frontend (UI/UX)
- **Component Primitives**:
  - ใช้ component จาก `@/components/ui/*` (Radix UI + Tailwind CSS v4 ตาม `components.json`) ก่อน custom markup เสมอ
  - โมดอลและไดอะล็อกใช้ `Dialog` / `AlertDialog` ของ `@/components/ui/*` พร้อม backdrop overlay ที่ถูกต้อง
- **Styling Standard**:
  - Tailwind CSS v4 (`src/App.css`) รองรับทั้ง Dark Mode และ Light Mode
  - หน้า Landing Page ใช้ kinetic components จาก Reactbits (`Squares`, `SpotlightCard`, `DecryptedText`) ควบคู่กับ Framer Motion
- **Iconography**:
  - ใช้ Vector SVG ผ่าน `lucide-react` เท่านั้น
- **Accessibility & Interaction**:
  - Focus states ชัดเจน, Color contrast ≥ 4.5:1
  - ฟอร์มทุกตัวต้องมี Label, Icon-only buttons ต้องมี `aria-label`
  - Touch targets ≥ 44x44px, clickable elements มี `cursor-pointer`
  - ปุ่มและฟอร์มต้อง disable สถานะระหว่าง async/submitting เพื่อป้องกัน double-click
  - Error feedback แสดงใกล้จุดที่ผิดพลาด และมี toast แจ้งเตือน (`react-hot-toast`)
- **Responsive**: รองรับ Mobile (375px), Tablet (768px), Desktop (1024px/1440px) ห้ามมี horizontal overflow
- **Internationalization (i18n)**:
  - ทุกข้อความบน UI ต้องผ่าน `useTranslation()` จาก `src/i18n` รองรับทั้งไทย (`th`) และอังกฤษ (`en`)
  - ตรวจสอบความสอดคล้องของคำแปลด้วย `npm run check:i18n` เมื่อเพิ่มคีย์ภาษาใหม่

---

## Definition of Done — Backend & Database (Supabase / RPC)
- **Inventory Concurrency & Atomicity**:
  - การเคลื่อนย้ายสต็อกทุกประเภท (Withdrawal, Checkout, Return, Stock In, Transfer, Adjustment) **ต้องทำงานผ่าน PostgreSQL RPC ภายใน Database Transaction เดียวกัน**
  - บังคับใช้ `SELECT ... FOR UPDATE` ล็อกแถวข้อมูลใน `stock_balance` เพื่อป้องกัน Concurrency Race Condition ก่อนตรวจสอบและตัดสต็อกจริง
- **Data Integrity & Migrations**:
  - จัดการโครงสร้างข้อมูลผ่านไฟล์ migration ใน `supabase/migrations/` ตามลำดับตัวเลข/timestamp
  - ทุกตารางใน `public` schema ต้องเปิดใช้งาน RLS (`ENABLE ROW LEVEL SECURITY`) พร้อมกำหนด Policies ให้รัดกุม
- **Object Storage (Cloudflare R2)**:
  - การอัปโหลดไฟล์/รูปภาพต้องอัปโหลดตรงไปยัง Cloudflare R2 ผ่าน S3 Presigned URLs (`/api/r2-upload-url`)
  - ห้ามจัดเก็บไฟล์ Binary หรือ Base64 ขนาดใหญ่ลงในตาราง PostgreSQL

---

## Changelog & Version Management
- **Authoritative Version**: อ้างอิงจาก `package.json` (`version`) ช่องทางเดียว ทุกหน้าจอและส่วนแสดงผลต้องอ่านค่าจากนี้ (ปฏิบัติตาม SemVer ใน Global Rules §10)
- **Changelog Entry**: บันทึกรายละเอียดลงบนสุดของ [`CHANGELOG.md`](CHANGELOG.md) ตามฟอร์แมต:
  ```markdown
  ## [YYYY-MM-DD HH:mm] - vX.Y.Z
  - **Files Modified:** `file1.jsx`, `file2.sql`
  - **Changes:**
    - สรุปรายละเอียดการแก้ไขและเหตุผล
  ```

---

## ข้อมูลระบบ เอกสาร และคำสั่งสำคัญ
- **Production URL**: [https://stockflowth.online](https://stockflowth.online)
- **Landing Page**: [https://eemeemmeex.github.io/Stock-Flow/](https://eemeemmeex.github.io/Stock-Flow/)
- **Project Wiki**: [https://github.com/EEMEEMMEEx/Stock-Flow/wiki](https://github.com/EEMEEMMEEx/Stock-Flow/wiki)
- **เอกสารสำคัญในโปรเจกต์**:
  - สถาปัตยกรรมและคำศัพท์: [`README.md`](README.md), [`CONTEXT.md`](CONTEXT.md)
  - แผนงานและข้อกำหนด: โฟลเดอร์ [`docs/`](docs/)
  - นโยบายความปลอดภัย: [`SECURITY.md`](SECURITY.md)
  - UI Primitives Config: [`components.json`](components.json)
- **คำสั่งสำคัญ (Verification Commands)**:
  - `npm run dev`: รัน Local Development Server (Vite)
  - `npm run build`: ทดสอบ Build และตรวจจับ Syntax/Bundle Error
  - `npm run lint`: ตรวจสอบ Code Quality ด้วย ESLint
  - `npm run check:i18n`: ตรวจสอบความครบถ้วนของคีย์ภาษา (Thai & English Parity)
  - `npm run test:email`: ทดสอบการ Render เทมเพลตอีเมลและ Nodemailer
  - `npm run db:backup`: สำรองข้อมูลฐานข้อมูล Supabase ทั้งหมด

