# Implementation Plan - Redesign & Modernize `/reports` Page

ปรับปรุงหน้า `/reports` ใหม่ทั้งหมดเพื่อยกระดับเป็นระบบรายงานและบริหารคลังสินค้าระดับ Enterprise ที่ทันสมัย ใช้งานง่าย มี Visual Hierarchy ชัดเจน ลดความยาวของหน้าจอด้วย KPI Cards, Visual Analytics (Recharts), Sticky Data Table และ Pagination พร้อมคง Business Logic เดิมครบถ้วน 100%

## User Review Required

> [!IMPORTANT]
> **การคงเดิมของ Business Logic และ Data Schema:**
> - หน้าใหม่จะดึงข้อมูลจาก `stock_in_orders`, `withdrawal_orders`, `stock_balance`, `projects`, และ `categories` เหมือนเดิม
> - ระบบ Export Excel (`xlsx`) และ Export PDF (`@react-pdf/renderer`) จะยังคงทำงานได้ถูกต้องและมีโครงสร้างข้อมูลเหมือนเดิมทุกประการ
> - ไม่มีการแก้ไข Database Schema หรือความสัมพันธ์ของข้อมูลใดๆ

> [!NOTE]
> **คุณสมบัติใหม่ที่เพิ่มเข้ามาใน UX/UI:**
> - **Operational KPI Grid (Above the Fold):** แสดงยอดรวมสำคัญ เช่น จำนวนรายการวัสดุ, ยอดรับเข้าสะสม, ยอดเบิกจ่ายสะสม, ยอดคงเหลือรวม, รายการรออนุมัติ/ของขาด (Shortage)
> - **Visual Analytics Section:** กราฟสรุปการเคลื่อนไหวของสต็อก (Stock Movement Trend), การเปรียบเทียบรับเข้า vs เบิกจ่าย (In vs Out), และสัดส่วนสต็อกตามโครงการ (Distribution by Project) สามารถยุบ/ขยายได้
> - **Smart Filter Toolbar:** รวมตัวกรองโครงการ, วันที่เริ่ม-สิ้นสุด, ค้นหา (Supplier/PO/รายการ), สถานะ, หมวดหมู่ และปุ่ม quick preset วันที่
> - **High-Performance Data Table:** Sticky table header, badge แสดงสถานะสวยงาม, การจัดกลุ่มคอลัมน์, Sorting (เรียงลำดับข้อมูล), และ Client-side Pagination (10/25/50/100 รายการต่อหน้า)

---

## Proposed Changes

### 1. Component Architecture (สร้างใหม่ใน `src/components/reports/`)

#### [NEW] [ReportHeader.jsx](file:///d:/APP/Stock-Flow-app/src/components/reports/ReportHeader.jsx)
- แสดงส่วนหัวของหน้า รายงาน (Reports) พร้อม Icon, คำอธิบาย
- Navigation Tab 3 สไตล์สำหรับเปลี่ยนประเภทรายงาน (1. รายงานรับเข้า, 2. รายงานเบิกจ่าย, 3. รายงานยอดคงเหลือ)
- ปุ่ม Export PDF และ Export Excel พร้อมสถานะ loading และไอคอนชัดเจน

#### [NEW] [ReportKpiGrid.jsx](file:///d:/APP/Stock-Flow-app/src/components/reports/ReportKpiGrid.jsx)
- แสดงการ์ดสรุปตัวเลขสำคัญ (Total Items, Stock In, Withdrawals, Available Stock, Shortage/Pending, Project count)
- ดีไซน์การ์ดกระชับ สวยงาม รองรับทั้ง Light/Dark mode มีไอคอนและ Badge แสดงสถานะ

#### [NEW] [ReportFilterBar.jsx](file:///d:/APP/Stock-Flow-app/src/components/reports/ReportFilterBar.jsx)
- แถบตัวกรองข้อมูล ค้นหา ค้นตามโครงการ วันที่ สถานะ และหมวดหมู่
- ปุ่ม Quick Date Presets (วันนี้, 7 วันล่าสุด, 30 วันล่าสุด, เดือนนี้)
- ปุ่ม Reset Filter และ Toggle ปิด/เปิดส่วน Visual Charts

#### [NEW] [ReportCharts.jsx](file:///d:/APP/Stock-Flow-app/src/components/reports/ReportCharts.jsx)
- กราฟสรุป Visual Analytics 3 รูปแบบด้วย `Recharts`:
  1. **Stock Movement Trend Chart (BarChart / AreaChart):** สรุปแนวโน้มการรับเข้า/เบิกจ่ายตามวันที่/โครงการ
  2. **In vs Out Comparison Chart:** เปรียบเทียบยอดรับเข้าและยอดเบิกจ่ายแยกตามโครงการ
  3. **Stock Status Breakdown:** กราฟวงกลม/แท่งแสดงสัดส่วนสถานะการเบิกจ่ายหรือยอดคงเหลือ

#### [NEW] [ReportDataTable.jsx](file:///d:/APP/Stock-Flow-app/src/components/reports/ReportDataTable.jsx)
- ตารางข้อมูลรายงานดีไซน์ใหม่ รองรับ Sticky Header, Light/Dark mode
- Sorting ข้อมูลตามคอลัมน์ (วันที่, โครงการ, รายการวัสดุ, จำนวน)
- Badge แสดงสถานะเบิกจ่าย/ของขาด (Shortage) มีมิติ ชัดเจน อ่านง่าย

#### [NEW] [ReportPagination.jsx](file:///d:/APP/Stock-Flow-app/src/components/reports/ReportPagination.jsx)
- ส่วนควบคุม Pagination สำหรับแบ่งหน้าตาราง แสดงจำนวนรายการรวม เลือกขนาดหน้า (10/25/50/100) และเปลี่ยนหน้า

#### [NEW] [ReportEmptyState.jsx](file:///d:/APP/Stock-Flow-app/src/components/reports/ReportEmptyState.jsx)
- UI แสดงเมื่อไม่พบข้อมูลการค้นหาหรือไม่มีข้อมูลในระบบ มีไอคอนและปุ่มรีเซ็ตตัวกรอง

---

### 2. Main Page Refactoring

#### [MODIFY] [Reports.jsx](file:///d:/APP/Stock-Flow-app/src/pages/Reports.jsx)
- ปรับปรุงให้เป็น Container Orchestrator หลัก
- ควบคุม State การดึงข้อมูลจาก Supabase, ตัวกรอง, Sorting, Pagination, สถิติ KPI และ Chart Data
- เรียกใช้ Subcomponents สวยงาม เป็นระเบียบ ดูแลรักษาง่าย
- คงฟังก์ชัน `handleExportExcel` และ `handleExportPDF` เดิมไว้ 100%

---

## Verification Plan

### Automated / Build Verification
- รัน `npm run build` เพื่อตรวจสอบว่าไม่มี syntax error หรือ import issue ใดๆ
- รัน `npm run lint` เพื่อตรวจสอบรหัสตามมาตรฐานโปรเจกต์

### Manual Verification
1. **การแสดงผล Dashboard & KPIs:**
   - ตรวจสอบว่า KPI Cards คำนวณยอดถูกต้องตาม Tab และตัวกรองที่เลือก
2. **การทำงานของ Filter & Search:**
   - ทดสอบกรองตามโครงการ, วันที่, ค้นหาคำคำว่า Supplier/PO/รายการ, และกด Reset Filter
3. **การทำงานของ Charts:**
   - ตรวจสอบว่า Recharts แสดงผลกราฟได้ถูกต้อง สวยงาม รองรับทั้ง Light และ Dark mode
4. **การทำงานของ Data Table & Pagination:**
   - ทดสอบการกดจัดเรียงข้อมูล (Sorting) ตามคอลัมน์
   - ทดสอบการเปลี่ยนหน้า (Pagination) และการเปลี่ยนจำนวนรายการต่อหน้า (10, 25, 50, 100)
5. **การ Export ข้อมูล:**
   - ทดสอบกดปุ่ม **Export Excel** และตรวจสอบไฟล์ `.xlsx` ที่ได้
   - ทดสอบกดปุ่ม **Export PDF** และตรวจสอบไฟล์ `.pdf` ที่ได้
6. **Responsive Design:**
   - ตรวจสอบการแสดงผลบนหน้าจอ Desktop, Tablet, และ Mobile (ไม่มี Horizontal Scroll เล็ดลอดนอกตาราง)
