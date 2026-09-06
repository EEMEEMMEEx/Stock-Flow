# ⚙️ Setup & Installation Guide

เอกสารนี้อธิบายขั้นตอนการติดตั้ง ติดตั้งสภาพแวดล้อม (Environment) และการรันโปรเจกต์ **Stock-Flow** บนเครื่องคอมพิวเตอร์สำหรับการพัฒนา (Local Development)

---

## 1. ข้อกำหนดเบื้องต้น (Prerequisites)

ก่อนเริ่มติดตั้ง ตรวจสอบให้แน่ใจว่าเครื่องของคุณมีเครื่องมือดังต่อไปนี้:

* **Node.js:** เวอร์ชั่น `>= 22.0.0` (แนะนำ Node.js 22 LTS)
* **Package Manager:** `npm >= 10.0.0`
* **Git:** เวอร์ชั่นล่าสุด
* **Supabase Project:** บัญชีโครงการบน [Supabase](https://supabase.com)
* **Cloudflare Account:** สำหรับบริการ [Cloudflare R2](https://dash.cloudflare.com) (เปิดใช้งาน Bucket เรียบร้อย)

---

## 2. ขั้นตอนการโคลนและติดตั้งโปรเจกต์ (Clone & Install)

```bash
# 1. โคลนคลังโค้ดจาก GitHub
git clone https://github.com/EEMEEMMEEx/Stock-Flow.git
cd Stock-Flow

# 2. ติดตั้ง Dependencies ทั้งหมด
npm install
```

---

## 3. การกำหนดค่า Environment Variables (`.env`)

คัดลอกไฟล์ `.env.example` เป็น `.env` และกำหนดค่าตัวแปรตามจริง:

```bash
cp .env.example .env
```

### ตัวแปรที่จำเป็นในไฟล์ `.env`

```env
# ==========================================
# 1. Supabase Backend
# ==========================================
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# ==========================================
# 2. Cloudflare R2 Object Storage (Serverless & Client)
# ==========================================
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=stockflow-assets
VITE_R2_PUBLIC_URL=https://pub-your-id.r2.dev

# ==========================================
# 3. Enterprise SMTP Notification
# ==========================================
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=warehouse-alert@forth.co.th
SMTP_PASS=your-secure-app-password
SMTP_FROM_NAME="Stock-Flow System"
NOTIFICATION_EMAIL_TO=manager@forth.co.th
```

> [!CAUTION]
> **ความปลอดภัยของ Secrets:**
> ห้าม Commit ไฟล์ `.env` ขึ้น Git เป็นอันขาด ตรวจสอบให้แน่ใจว่า `.env` อยู่ในไฟล์ `.gitignore` เสมอ

---

## 4. คำสั่งสำหรับการพัฒนา (Development Scripts)

| คำสั่ง | คำอธิบายการทำงาน |
| :--- | :--- |
| `npm run dev` | รันเซิร์ฟเวอร์ Local Development ผ่าน Vite (พอร์ตปกติ `http://localhost:5173`) |
| `npm run build` | คอมไพล์และสร้าง Production Bundle ที่โฟลเดอร์ `dist/` |
| `npm run preview` | พรีวิวผลลัพธ์ของ Production Build บนเครื่อง Local |
| `npm run test:email` | ทดสอบการเชื่อมต่อและการส่งอีเมลผ่าน SMTP Configuration |
| `npm run db:backup` | รันสคริปต์สำรองข้อมูลและสกีมาฐานข้อมูล Supabase |
| `npm run migrate:r2` | รันสคริปต์ตรวจสอบหรือย้ายรูปภาพเก่าขึ้นสู่ Cloudflare R2 |

---

## 5. การทดสอบความถูกต้องของระบบ (Verification Steps)

หลังจากกำหนดค่าเสร็จสิ้น ให้รันการตรวจสอบเพื่อความมั่นใจ:

```bash
# ทดสอบระบบส่งอีเมล
npm run test:email

# ทดสอบการ Build Production Bundle
npm run build
```

หากผลการรันแสดงข้อความสำเร็จ แสดงว่าสภาพแวดล้อมของคุณพร้อมสำหรับการพัฒนาแล้ว

---

## 🧭 เอกสารที่เกี่ยวข้อง
* [[Database-and-Storage|Database-and-Storage]] — วิธีการ Setup Supabase Schema & Storage
* [[Deployment-and-Operations|Deployment-and-Operations]] — ขั้นตอน Deploy สู่ Production
