# ยินดีต้อนรับสู่ Stock-Flow Wiki 📦⚡

**Stock-Flow** คือระบบปฏิบัติการบริหารจัดการคลังสินค้า พัสดุ และการจัดสรรอุปกรณ์ระดับองค์กร (Enterprise Inventory & Material Flow OS) พัฒนาขึ้นสำหรับ **บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน) (Forth Corporation Public Company Limited)** รองรับการเบิกจ่ายด่วนสไตล์ POS, การประกอบชุดติดตั้งไซต์งาน (Site Installation Kits / BOM), ระบบอนุมัติหลายระดับ, การจัดเก็บไฟล์ความเร็วสูงบน Cloudflare R2 (Zero Egress) และการจัดทำ Audit Trail แบบ Real-time

---

## 🌐 ลิงก์ระบบงานสำคัญ (Quick Links)

* 🖥️ **Live Web Application (Production):** [https://stockflowth.online](https://stockflowth.online)
* ✨ **Official Landing Page (GitHub Pages):** [https://eemeemmeex.github.io/Stock-Flow/](https://eemeemmeex.github.io/Stock-Flow/)
* 📂 **Source Repository:** [EEMEEMMEEx/Stock-Flow](https://github.com/EEMEEMMEEx/Stock-Flow)
* 📋 **Project Management Board:** [Stock-Flow Development Board](https://github.com/users/EEMEEMMEEx/projects/1)
* 🔒 **Security Advisories:** [Vulnerability Reporting](https://github.com/EEMEEMMEEx/Stock-Flow/security/advisories)
* 🔖 **Current System Version:** `v1.4.66`

---

## 🧭 สารบัญเอกสาร (Table of Contents)

1. [[Architecture|Architecture]] — สถาปัตยกรรมระบบโดยรวม (Frontend, Backend, Database, Cloud Storage)
2. [[Features|Features]] — ฟังก์ชันการทำงานหลักทั้ง 9 โมดูล
3. [[Setup-and-Installation|Setup-and-Installation]] — ขั้นตอนการติดตั้งและรันระบบบนเครื่อง Local
4. [[Database-and-Storage|Database-and-Storage]] — สกีมาฐานข้อมูล Supabase PostgreSQL, RLS และ Cloudflare R2
5. [[Security|Security]] — นโยบายความปลอดภัย, RBAC, Secret Governance, และการจัดการช่องโหว่
6. [[Deployment-and-Operations|Deployment-and-Operations]] — การนำระบบขึ้น Production (Vercel & GitHub Actions) และคู่มือบำรุงรักษา
7. [[Development-Workflow|Development-Workflow]] — ข้อกำหนดการพัฒนา, Branching, Rule 10 SemVer, และ DoD

---

## 🏗️ แผนภาพสถาปัตยกรรมระบบ (High-Level Architecture)

```
[ Browser / PWA Client ]
       │
       ├─── HTTP/Static ───> [ Cloudflare CDN / Vercel / GitHub Pages ]
       │
       ├─── Auth & RPC  ───> [ Supabase PostgreSQL (Row-Level Security) ]
       │                          ├── Items & Transactions
       │                          ├── Multi-stage Approvals
       │                          └── Atomic Inventory Deduction
       │
       ├─── Media S3    ───> [ Cloudflare R2 Object Storage (Zero Egress) ]
       │                          └── Presigned Direct Uploads
       │
       └─── Serverless  ───> [ Vercel Edge API Functions ]
                                  ├── /api/r2-upload-url (S3 Presigner)
                                  └── /api/send-email (SMTP Notifier)
```

---

*เอกสารได้รับการบำรุงรักษาอย่างต่อเนื่องโดยทีมพัฒนา Stock-Flow ตามมาตรฐาน DevSecOps*
