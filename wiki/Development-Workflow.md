# 💻 Development Workflow & Standards

เอกสารนี้ระบุมาตรฐานและระเบียบปฏิบัติการพัฒนาซอฟต์แวร์สำหรับโปรเจกต์ **Stock-Flow** เพื่อให้การทำงานร่วมกันมีระเบียบ มีคุณภาพสูง และตรวจสอบย้อนกลับได้เสมอ

---

## 1. การจัดการสาขาของโค้ด (Branching Model)

ระบบใช้รูปแบบ **Trunk-Based / Feature Branching**:

* **`main` (Protected Branch):** สาขาหลักที่พร้อมปล่อยขึ้น Production เสมอ ห้าม Force Push หรือ Commit ตรงโดยไม่มีการตรวจสอบ
* **`feature/<name>`:** สำหรับการพัฒนาฟังก์ชันการทำงานใหม่ เช่น `feature/pos-barcode-enhancement`
* **`fix/<issue-id>-<name>`:** สำหรับการแก้บักหรือช่องโหว่ เช่น `fix/r2-presign-expiry`
* **`docs/<name>`:** สำหรับการปรับปรุงเอกสารและคู่มือ เช่น `docs/update-wiki`
* **`refactor/<name>`:** สำหรับการปรับโครงสร้างโค้ดโดยไม่เปลี่ยน Behavior

---

## 2. กฎเหล็กการจัดการเวอร์ชันระบบ (Rule 10: Mandatory SemVer)

> [!IMPORTANT]
> **ทุกการแก้ไขโค้ดหรือระบบการทำงาน จะต้องมีการปรับเลขเวอร์ชันแอปพลิเคชันเสมอ (Changed Code + Unchanged Version = INCOMPLETE)**

### แหล่งอ้างอิงเวอร์ชันเดียว (Single Source of Truth)
* ไฟล์ `package.json` (`"version": "MAJOR.MINOR.PATCH"`) คือแหล่งอ้างอิงเวอร์ชันหลักของระบบเพียงแห่งเดียว
* ทุกหน้า UI และ API ที่แสดงเลขเวอร์ชันจะต้องดึงค่าจากแหล่งนี้เท่านั้น ห้ามฮาร์ดโค้ดเลขเวอร์ชันแยกต่างหาก

### เกณฑ์การปรับระดับเวอร์ชัน (Semantic Versioning 2.0)
* **PATCH (`+0.0.1`):** การแก้บัก, การปรับแต่งสไตล์ UI เล็กน้อย, การแก้คอนฟิก, การอัปเดต Dependency, หรือการ Refactor ภายใน
* **MINOR (`+0.1.0`):** การเพิ่มฟังก์ชันใหม่ที่เข้ากันได้กับโค้ดเดิม (Backward-compatible), การเพิ่มหน้าจอใหม่, รีเซ็ต PATCH เป็น `0`
* **MAJOR (`+1.0.0`):** การเปลี่ยนแปลงโครงสร้างหลัก, การเปลี่ยน Architecture หรือ Database Schema ที่ไม่เข้ากันกับของเดิม

---

## 3. รูปแบบข้อความคอมมิต (Commit Message Conventions)

ใช้มาตรฐาน **Conventional Commits**:

```bash
feat(pos): add audio beep feedback upon successful barcode scan
fix(storage): extend presigned URL expiration to 15 minutes
docs(wiki): add architecture and operational runbooks
chore(deps): bump nodemailer to 10.0.0 to fix security alert
refactor(auth): simplify role verification guard clauses
```

---

## 4. กระบวนการบริหารจัดการงาน (Project Management & Issues)

* ทุกงานต้องถูกติดตามบน [Stock-Flow Project Board](https://github.com/users/EEMEEMMEEx/projects/1)
* ใช้ **Issue Templates** ให้ตรงกับประเภทงาน:
  1. `feature_request.yml` — สำหรับฟีเจอร์ใหม่
  2. `bug_report.yml` — สำหรับแจ้งและแก้บัก
  3. `ui_ux_improvement.yml` — สำหรับปรับแต่ง UI/UX
  4. `security_task.yml` — สำหรับงานด้านความปลอดภัย
  5. `documentation_task.yml` — สำหรับงานเอกสาร
  6. `refactoring_task.yml` — สำหรับงาน Clean Code & Refactor

---

## 5. มาตรฐานการตรวจรับงาน (Definition of Done: DoD)

ก่อนรวมโค้ด (Merge PR) หรือปิดงาน จะต้องผ่านเกณฑ์ DoD ดังนี้:

- [ ] **Build Check:** รัน `npm run build` สำเร็จโดยไม่มีคำเตือนหรือข้อผิดพลาดร้ายแรง
- [ ] **Testing:** รันชุดทดสอบที่เกี่ยวข้อง (เช่น `npm run test:email`) ผ่าน 100%
- [ ] **Version Bump:** ปรับเวอร์ชันใน `package.json` ตามระดับการเปลี่ยนแปลง
- [ ] **Changelog Updated:** บันทึกสรุปการแก้ไขลงในไฟล์ `CHANGELOG.md`
- [ ] **UI Icon Policy Check:** ตรวจสอบว่าไม่มีการใช้ Unicode Emoji เป็นไอคอนใน UI ซอร์สโค้ด (ให้ใช้ Lucide SVG หรือ ReactBits SVG เสมอ)
- [ ] **Security Review:** ตรวจสอบว่าไม่มี Secret หรือ API Key รั่วไหลลงในคอมมิต
- [ ] **Docs Synchronized:** อัปเดต `README.md` หรือ Wiki หากมีการเปลี่ยนแปลงขั้นตอนการใช้งาน

---

## 🧭 เอกสารที่เกี่ยวข้อง
* [[Architecture|Architecture]] — สถาปัตยกรรมระบบ
* [[Security|Security]] — นโยบายความปลอดภัย
