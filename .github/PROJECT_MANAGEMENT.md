# Stock-Flow — GitHub Project Management & Workflow Guide

เอกสารคู่มือการบริหารจัดการโปรเจกต์ **Stock-Flow** ด้วย **GitHub Projects (v2)**, ระบบ **Issue Templates**, และมาตรฐานกระบวนการพัฒนาซอฟต์แวร์ระดับองค์กร

---

## 1. Project Purpose (วัตถุประสงค์ของบอร์ดบริหารโครงการ)

GitHub Project Board ของ Stock-Flow ถูกออกแบบเพื่อ:
1. **Single Source of Truth**: รวมศูนย์การติดตามงานฟีเจอร์ (Feature), บั๊ก (Bug Fix), การปรับแต่ง UI/UX, งานความปลอดภัย (Security), และงานรีแฟกเตอร์ (Refactoring) ไว้ในจุดเดียว
2. **End-to-End Visibility**: เชื่อมโยง Issue, Pull Request, และรอบการ Deploy ตั้งแต่สถานะ Backlog จนถึง Production
3. **Controlled Quality Gate**: ควบคุมคุณภาพโค้ดก่อน Merge ผ่านกระบวนการ Review, Testing, และ SemVer Version Management ตามกฎเกณฑ์ของโปรเจกต์

---

## 2. Board Workflow & Views (โครงสร้างกระดานและมุมมอง)

### 2.1 Kanban Workflow States

| State | Status | คำอธิบาย & เงื่อนไขการเปลี่ยนสถานะ |
| :--- | :--- | :--- |
| 📥 **Backlog** | `Backlog` | รายการฟีเจอร์ แนวคิด หรือข้อเสนอแนะที่รวบรวมไว้ แต่ยังไม่ได้จัดสรรเข้าสู่รอบการพัฒนาปัจจุบัน |
| 📋 **Todo** | `Todo` | งานที่ผ่านการ Triage, กำหนด Priority, และพร้อมสำหรับการเริ่มพัฒนาใน Sprint / Milestone ปัจจุบัน |
| ⚡ **In Progress** | `In Progress` | งานที่กำลังอยู่ระหว่างการพัฒนา โดยมี Developer รับผิดชอบ (Assignee) และเปิด Feature Branch ทำงาน |
| 👀 **Review** | `Review` | เปิด Pull Request เรียบร้อยแล้ว อยู่ระหว่างการทำ Code Review และตรวจสอบความปลอดภัย |
| 🧪 **Testing** | `Testing` | ผ่านการ Review เบื้องต้น อยู่ในขั้นตอนการทดสอบ Automated Tests (`npm run test:email`, `npm run build`) และการทดสอบ UAT ใน Staging |
| ✅ **Done** | `Done` | ผ่านเกณฑ์ Definition of Done (DoD), โค้ดถูก Merge สู่กิ่ง `main`, เวอร์ชันของระบบถูกอัปเดต และ Deploy สำเร็จ |

---

### 2.2 Recommended Views (มุมมองแนะนำบน GitHub Projects)

1. **Board View (Kanban - Default)**
   - Layout: `Board`
   - Group by: `Status`
   - Visible Columns: `Backlog`, `Todo`, `In Progress`, `Review`, `Testing`, `Done`
   - Card Fields: `Title`, `Assignee`, `Priority`, `Type`, `Milestone`, `Labels`

2. **Roadmap / Milestone View**
   - Layout: `Roadmap` หรือ `Table`
   - Group by: `Milestone` (เช่น `v1.5.0`, `v1.6.0`)
   - Sort by: `Priority` (Descending)

3. **Sprint Iteration View**
   - Layout: `Board` หรือ `Table`
   - Filter by: `Sprint: @current`
   - เพื่อโฟกัสเฉพาะงานที่ต้องส่งมอบในรอบปัจจุบัน

4. **Bugs & Security Triage View**
   - Layout: `Table`
   - Filter by: `Type: Bug, Security` หรือ `label:bug,security`
   - Sort by: `Priority` (Urgent → High → Medium → Low)

---

## 3. Project Fields Specification (ข้อกำหนดฟิลด์ของโปรเจกต์)

| Field Name | Type | Options / Format | วัตถุประสงค์ |
| :--- | :--- | :--- | :--- |
| **Status** | Single Select | `Backlog`, `Todo`, `In Progress`, `Review`, `Testing`, `Done` | ระบุขั้นตอนปัจจุบันของ Task |
| **Priority** | Single Select | `Urgent` (วิกฤต), `High` (สำคัญสูง), `Medium` (ปกติ), `Low` (ต่ำ/ปรับปรุงทั่วไป) | ลำดับความเร่งด่วนในการแก้ไข |
| **Type** | Single Select | `Feature`, `Bug`, `UI/UX`, `Security`, `Documentation`, `Refactor` | จัดหมวดหมู่ลักษณะงาน |
| **Assignee** | User | GitHub Members | ผู้รับผิดชอบงานหลัก |
| **Milestone** | Milestone | Linked Milestone (e.g. `v1.5.0`) | รอบการส่งมอบเวอร์ชันระบบ |
| **Sprint** | Iteration | 2-Week Cadence (Iteration) | รอบสปรินต์ของการทำงาน |
| **Labels** | Labels | GitHub Labels (`feature`, `bug`, `ui/ux`, `security`, `refactor`, `documentation`, ฯลฯ) | ป้ายกำกับสำหรับค้นหาและคัดกรอง |

---

## 4. Issue Templates (แบบฟอร์มบันทึกงานในระบบ)

โปรเจกต์ได้ติดตั้ง GitHub Issue Forms ไว้ที่โฟลเดอร์ `.github/ISSUE_TEMPLATE/`:

1. **Feature Development (`feature_development.yml`)**: สำหรับข้อเสนอแนะและงานพัฒนาฟีเจอร์ใหม่
2. **Bug Fix (`bug_fix.yml`)**: สำหรับรายงานข้อผิดพลาด พร้อมขั้นตอน Reproduction, Logs, และระดับความรุนแรง
3. **UI/UX Improvement (`ui_ux_improvement.yml`)**: สำหรับงานปรับปรุงส่วนติดต่อผู้ใช้, Interaction และ Responsive Design
4. **Security Task (`security_task.yml`)**: สำหรับงานยกระดับความปลอดภัย (Hardening), อัปเดตนโยบาย, และตรวจสอบสิทธิ์
5. **Documentation Task (`documentation_task.yml`)**: สำหรับการจัดทำ/แก้ไขคู่มือ, Runbook, และเอกสารสถาปัตยกรรม
6. **Refactoring Task (`refactoring_task.yml`)**: สำหรับงานปรับปรุงโครงสร้างโค้ดโดยคงพฤติกรรมเดิมของระบบไว้ 100%

---

## 5. Development Rules & Lifecycle (กฎเกณฑ์และกระบวนการพัฒนา)

### 5.1 Branching Strategy
- กิ่งหลัก (`main`): สงวนไว้สำหรับ Production Code ที่พร้อมใช้งานเสมอ ห้าม Push ตรงเด็ดขาด
- รูปแบบชื่อกิ่งงาน:
  - ฟีเจอร์: `feat/<issue-id>-<short-description>` (เช่น `feat/12-barcode-scanner`)
  - บั๊ก: `fix/<issue-id>-<short-description>` (เช่น `fix/34-stock-out-rounding`)
  - งานปรับปรุง UI: `ui/<issue-id>-<short-description>`
  - งานความปลอดภัย: `sec/<issue-id>-<short-description>`
  - รีแฟกเตอร์: `refactor/<issue-id>-<short-description>`

### 5.2 Mandatory System Version Management (Rule 10)
ทุกการเปลี่ยนแปลงของซอร์สโค้ดและคอนฟิกระบบ **ต้องทำการปรับปรุงเวอร์ชันของระบบเสมอ (SemVer)**:
- **PATCH (`1.4.x → 1.4.x+1`)**: งานแก้บั๊ก, ปรับปรุง UI, รีแฟกเตอร์, คอนฟิกทั่วไป
- **MINOR (`1.x.0 → 1.x+1.0`)**: ฟีเจอร์ใหม่ที่รองรับการทำงานย้อนหลัง (Backward Compatible)
- **MAJOR (`x.0.0 → x+1.0.0`)**: การเปลี่ยนแปลงโครงสร้างหลักที่มีผลกระทบต่อ API หรือ Database Schema เดิม
- อัปเดตไฟล์ศูนย์กลางเวอร์ชัน: `package.json`, `README.md`, `SECURITY.md`, และ `CHANGELOG.md`

### 5.3 Pull Request & Automation
1. ทุก Pull Request ต้องอ้างอิง Issue ที่เกี่ยวข้อง (เช่น `Closes #12` หรือ `Fixes #34`) เพื่อให้ระบบปิด Issue อัตโนมัติเมื่อ Merge
2. Workflows อัตโนมัติ:
   - [.github/workflows/project-automation.yml](file:///d:/APP/Stock-Flow-app/.github/workflows/project-automation.yml) จะดึง Issue และ PR ใหม่เข้าสู่ Project Board อัตโนมัติ
   - [.github/dependabot.yml](file:///d:/APP/Stock-Flow-app/.github/dependabot.yml) จะเปิด PR สำหรับอัปเดต Dependencies อัตโนมัติทุกสัปดาห์

### 5.4 Definition of Done (DoD)
งานจะถูกเลื่อนเข้าสู่สถานะ **Done** ได้เมื่อ:
- [ ] โค้ดผ่านการทดสอบอัตโนมัติ (`npm run test:email` และ `npm run build` สำเร็จ 100%)
- [ ] ไม่มี ESLint errors ใหม่ในไฟล์ที่แก้ไข
- [ ] ปฏิบัติตาม UI Icon Policy (ไม่ใช้อีโมจิเป็นไอคอนใน UI)
- [ ] มีการขยับเลขเวอร์ชันของระบบตาม SemVer และบันทึก Changelog
- [ ] ได้รับการอนุมัติ (Approve) จาก Reviewer
- [ ] Merge โค้ดเข้าสู่กิ่ง `main` เรียบร้อย
