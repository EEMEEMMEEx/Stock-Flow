# 🔒 Security Policy & Governance

ความปลอดภัยของระบบ **Stock-Flow** ถือเป็นหัวใจสำคัญสูงสุดในการปกป้องข้อมูลสินทรัพย์และคลังพัสดุขององค์กร เอกสารนี้รวบรวมนโยบาย มาตรการ และแนวทางการปฏิบัติด้านความมั่นคงปลอดภัยสารสนเทศ (Cybersecurity & Governance)

---

## 1. หลักการความปลอดภัยพื้นฐาน (Core Security Principles)

1. **Defense in Depth (การป้องกันหลายชั้น):** ไม่พึ่งพาการตรวจสอบที่ Frontend เพียงอย่างเดียว แต่ใช้ Row-Level Security (RLS), Stored Procedures และ API Authentication ควบคุมอย่างเข้มงวด
2. **Principle of Least Privilege (หลักการกำหนดสิทธิ์เท่าที่จำเป็น):** บัญชีผู้ใช้งานและ Service Key จะได้รับสิทธิ์เฉพาะงานที่ต้องทำเท่านั้น
3. **Zero Secrets in Code (ห้ามเก็บความลับในโค้ด):** ห้ามฮาร์ดโค้ด API Key, Password, Private Token หรือ Service Role Key ใน Git Repository โดยเด็ดขาด

---

## 2. การจัดการความลับและการระบุตัวตน (Secret Governance)

* **Environment Variables:** ความลับทั้งหมดต้องถูกโหลดผ่านตัวแปรสภาพแวดล้อม (`.env`) สำหรับ Local Development และ Environment Secrets บน Platform สำหรับ Production (Vercel / GitHub Actions)
* **Secret Scanning & Pre-commit Checks:** ระบบเปิดใช้งาน GitHub Secret Scanning เพื่อดักจับและแจ้งเตือนทันทีหากพบรูปแบบความลับหลุด
* **กรณีศึกษาการแก้ไข Secret รั่วไหลในอดีต (Incident Remediation):**
  * เคยมีการตรวจพบ Google API Key ในประวัติคอมมิตแรก (`src/lib/firebase.js`)
  * ทีมพัฒนาได้ทำการเพิกถอน Key, ลบ Fallback key ทั้งหมดออกจากซอร์สโค้ด, แยกไฟล์ Config ให้เรียกจาก `import.meta.env` และตั้งกฎ `.gitignore` ครอบคลุมไฟล์ Credential ทุกรูปแบบ

---

## 3. การควบคุมสิทธิ์การเข้าถึง (Authentication & RBAC)

ระบบใช้ **Supabase Auth** ขับเคลื่อนด้วย JWT (JSON Web Tokens) ที่ลงนามด้วยมาตรฐานสากล:

| ระดับสิทธิ์ (Role) | สิทธิ์การเข้าถึงข้อมูลและฟังก์ชัน |
| :--- | :--- |
| **`admin`** | สิทธิ์สูงสุดในระบบ: จัดการผู้ใช้งาน, เปลี่ยนแปลงการตั้งค่าคลัง, กู้คืนข้อมูล, และจัดการโครงสร้างหลัก |
| **`manager`** | ดูรายงานภาพรวมองค์กร, อนุมัติใบเบิกพัสดุมูลค่าสูง, และตรวจสอบ Audit Trail |
| **`staff`** | เจ้าหน้าที่คลังสินค้า: รับเข้าพัสดุ, จ่ายพัสดุหน้า POS, ตรวจนับสต็อก, และพิมพ์สลิปส่งของ |
| **`user` / `technician`** | ผู้ขอเบิก / ช่างติดตั้ง: สร้างคำขอเบิก, สแกนดูรายละเอียดพัสดุ, และติดตามสถานะคำขอตนเอง |

---

## 4. ความปลอดภัยระดับฐานข้อมูล (Database Hardening)

* **Row-Level Security (RLS):** เปิดใช้งานบนทุกตาราง ป้องกันผู้ใช้งานเข้าถึงข้อมูลข้ามสิทธิ์ แม้จะพยายามยิงคำสั่งผ่าน Supabase Client โดยตรง
* **Search Path Hijacking Protection:** ทุก Stored Procedure กำหนด `SET search_path = public` อย่างเข้มงวด เพื่อป้องกันช่องโหว่จากการเรียกฟังก์ชันแปลกปลอม
* **Atomic Concurrency:** ใช้ `FOR UPDATE` ใน RPC ตัดสต็อก เพื่อกำจัดการเกิด Race Condition และสต็อกติดลบ

---

## 5. การจัดการช่องโหว่ของ Dependencies (Supply Chain Security)

* **Automated Scans:** ใช้งาน **GitHub Dependabot** สแกนตรวจจับช่องโหว่ประจำสัปดาห์ (Weekly Cadence) ทั้งฝั่ง `npm` และ `github-actions`
* **Dependency Hygiene:**
  * ถอนแพ็กเกจที่มีช่องโหว่และไม่ได้ถูกเรียกใช้งานออกทันที (เช่น `jspdf`, `express`, `cors`, `multer`)
  * อัปเกรดแพ็กเกจที่มีช่องโหว่สู่อัปเดตปลอดภัยล่าสุด (เช่น `nodemailer` เป็น `^10.0.0`)
  * สลับแพ็กเกจ `xlsx` สู่ Official Verified Release ของ SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) เพื่อปิดช่องโหว่ ReDoS / Prototype Pollution

---

## 6. การรายงานช่องโหว่และการรับมือ (Incident Response & SLA)

หากพบช่องโหว่ด้านความปลอดภัย โปรดอย่าเปิดเป็น Public Issue ทั่วไป ให้ดำเนินการแจ้งผ่าน:
* 🛡️ **GitHub Private Security Advisory:** [รายงานช่องโหว่ที่นี่](https://github.com/EEMEEMMEEx/Stock-Flow/security/advisories/new)

### Service Level Agreement (SLA) ในการแก้ไข

| ระดับความรุนแรง (Severity) | เวลาในการตอบรับครั้งแรก (Triage) | เวลาในการออกแพตช์แก้ไข (Fix Released) |
| :--- | :--- | :--- |
| **Critical** | ภายใน 12 ชั่วโมง | ภายใน 24 - 48 ชั่วโมง |
| **High** | ภายใน 24 ชั่วโมง | ภายใน 72 ชั่วโมง |
| **Moderate / Low** | ภายใน 48 ชั่วโมง | รวมในรอบ Release ถัดไป |

---

## 🧭 เอกสารที่เกี่ยวข้อง
* [[Architecture|Architecture]] — การเชื่อมต่อระบบอย่างปลอดภัย
* [[Database-and-Storage|Database-and-Storage]] — RLS และ Stored Procedure Security
