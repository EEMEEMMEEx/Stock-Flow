# 🚀 Deployment & Operations Runbook

เอกสารนี้รวบรวมคู่มือการนำระบบ **Stock-Flow** ขึ้นสู่ Production (Deployment Architecture) ตลอดจนขั้นตอนการบำรุงรักษา สำรองข้อมูล และการกู้คืนระบบ (Operations & Disaster Recovery)

---

## 1. กลยุทธ์การ Deploy สองระบบ (Dual Deployment Architecture)

ระบบ Stock-Flow ถูกออกแบบให้แยกการทำงานออกเป็น 2 สภาพแวดล้อมเพื่อประสิทธิภาพและความเสถียรสูงสุด:

```
[ Git Repository: main branch ]
        │
        ├─── Push ───> [ GitHub Actions CI/CD (Node 22) ]
        │                       │
        │                       └── Deploy ──> [ GitHub Pages (Landing Page Showcase) ]
        │                                      URL: https://eemeemmeex.github.io/Stock-Flow/
        │
        └─── Webhook ──> [ Vercel Production Platform ]
                                │
                                ├── Build Single Page App (SPA)
                                └── Edge Functions (/api/send-email, /api/r2-upload-url)
                                URL: https://stockflowth.online
```

---

## 2. การกำหนดค่า Environment Variables บน Production

| ตัวแปร | Vercel (Production) | GitHub Actions Secrets | คำอธิบาย |
| :--- | :---: | :---: | :--- |
| `VITE_SUPABASE_URL` | ✅ Required | - | URL ของ Supabase Project |
| `VITE_SUPABASE_ANON_KEY` | ✅ Required | - | Public Anonymous API Key |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ Required | - | Account ID สำหรับ R2 API |
| `R2_ACCESS_KEY_ID` | ✅ Required | - | S3 Access Key สำหรับ Presigned Upload |
| `R2_SECRET_ACCESS_KEY` | ✅ Required | - | S3 Secret Key สำหรับ Presigned Upload |
| `R2_BUCKET_NAME` | ✅ Required | - | ชื่อ Bucket ใน Cloudflare R2 |
| `VITE_R2_PUBLIC_URL` | ✅ Required | - | Public CDN Domain สำหรับโหลดรูปภาพ |
| `SMTP_HOST` | ✅ Required | - | โฮสต์เซิร์ฟเวอร์ SMTP ของ Forth Corp |
| `SMTP_PORT` | ✅ Required | - | พอร์ต SMTP (ปกติ 587) |
| `SMTP_USER` | ✅ Required | - | บัญชีผู้ส่งอีเมลแจ้งเตือน |
| `SMTP_PASS` | ✅ Required | - | รหัสผ่าน App Password |
| `NOTIFICATION_EMAIL_TO` | ✅ Required | - | อีเมลผู้จัดการคลังสินค้า/ผู้อนุมัติหลัก |

---

## 3. GitHub Actions CI/CD Workflow (`deploy-pages.yml`)

การ Deploy ขึ้น GitHub Pages จัดการโดยอัตโนมัติผ่านไฟล์ `.github/workflows/deploy-pages.yml`:

* **Runtime:** Node.js 22 (LTS)
* **Actions Versions:**
  * `actions/checkout@v4`
  * `actions/setup-node@v4`
  * `actions/configure-pages@v5`
  * `actions/upload-pages-artifact@v3`
  * `actions/deploy-pages@v4`
* **Trigger:** อัตโนมัติเมื่อมีการ Push ไปยัง Branch `main` หรือสั่งรันด้วยมือผ่าน `workflow_dispatch`

---

## 4. คู่มือการปฏิบัติการ (Operational Runbooks)

### 4.1 การสำรองข้อมูลฐานข้อมูล (Database Backup Runbook)
ระบบมีคำสั่งเตรียมพร้อมสำหรับการสำรองข้อมูลสกีมาและเรคคอร์ดสำคัญ:

```bash
# รันสคริปต์สำรองข้อมูล
npm run db:backup
```
* สคริปต์จะดึงข้อมูลตาราง `items`, `transactions`, `kits`, และ `borrow_records` จัดเก็บเป็นไฟล์ JSON/SQL ในโฟลเดอร์สำรองข้อมูลที่มีการประทับเวลา (Timestamp)
* แนะนำให้ตั้งตารางเวลาสำรองข้อมูลอย่างน้อยสัปดาห์ละ 1 ครั้ง หรือก่อนการทำ Major Migration

### 4.2 การกู้คืนหรือย้ายรูปภาพขึ้น Cloudflare R2 (R2 Migration Runbook)
หากมีการเพิ่มรูปภาพใหม่หรือต้องการตรวจสอบความสมบูรณ์ของรูปภาพใน Cloudflare R2:

```bash
# ตรวจสอบและย้ายข้อมูลรูปภาพ
npm run migrate:r2
```
* สคริปต์จะตรวจสอบเรคคอร์ดในฐานข้อมูล `items.image_url` และตรวจสอบความมีอยู่จริงบน Cloudflare R2 Bucket หากพบรูปภาพตกค้างใน Local หรือ External CDN สคริปต์จะอัปโหลดและอัปเดต URL อัตโนมัติ

---

## 🧭 เอกสารที่เกี่ยวข้อง
* [[Setup-and-Installation|Setup-and-Installation]] — การติดตั้งสำหรับเครื่อง Local
* [[Security|Security]] — การจัดการ Secret และความปลอดภัย
