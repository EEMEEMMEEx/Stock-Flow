# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **กลุ่มผู้ใช้งานหลัก (Primary Users):** เจ้าหน้าที่คลังสินค้า (Warehouse Officers) และทีมช่าง/วิศวกรภาคสนาม (Field Engineers / Technicians) ของ Forth Corporation Public Company Limited
  - *สถานการณ์และภารกิจ:* ปฏิบัติงานเบิกจ่ายวัสดุและอุปกรณ์ความเร็วสูงที่หน้างานคลัง (POS Terminal), ตรวจสอบความพร้อมของวัสดุสำหรับโครงการติดตั้ง (เช่น DOPA, USO Phase 3), ยืมและคืนเครื่องมืออุปกรณ์พร้อมตรวจสภาพ, และบันทึกส่งซ่อม/ตัดซาก
- **กลุ่มผู้ใช้งานรอง (Secondary Users):** ผู้จัดการโครงการ (Project Managers) และผู้ดูแลระบบ (System Admins / Supervisors)
  - *สถานการณ์และภารกิจ:* พิจารณาอนุมัติคำขอเบิกจ่ายวัสดุ (All-or-Nothing Approval), บริหารจัดการสิทธิ์การเข้าถึง (RBAC), ตรวจสอบความพร้อมของชุดติดตั้ง Site Kits (BOM), และตรวจสอบรายงาน Analytics / เอกสารหลักฐาน

## Product Purpose
- **หน้าที่ของผลิตภัณฑ์:** ระบบปฏิบัติการบริหารจัดการคลังสินค้าและกระบวนการเคลื่อนย้ายวัสดุระดับองค์กร (Enterprise Inventory & Material Flow OS)
- **เหตุผลที่มีระบบนี้:** ขจัดปัญหาความล่าช้าในการเบิกจ่ายหน้างาน, ป้องกันการเกิด Race Condition และข้อผิดพลาดสต็อกติดลบ (Double-Deduction), เชื่อมโยงรายการพัสดุเข้ากับรหัสโครงการจริง และติดตามวงจรชีวิตอุปกรณ์ (Lending, Condition Inspection, Repair/Scrap) อย่างโปร่งใส ตรวจสอบย้อนหลังได้ 100%
- **นิยามความสำเร็จ:** การเบิกจ่ายที่หน้าคลังทำได้อย่างรวดเร็ว ถูกต้อง แม่นยำ ข้อมูลสต็อกตรงกับหน้างานจริงเสมอ มีหลักฐานใบเบิกพัสดุ (PDF Issue Voucher) ที่เป็นมาตรฐานพร้อมลายเซ็นกำกับ และไม่มีปัญหาวัสดุขาดแคลนในโครงการโดยไม่รู้ล่วงหน้า

## Positioning
ระบบเบิกจ่ายวัสดุความเร็วสูงสไตล์ POS ที่ผสานการตรวจสอบความพร้อมของชุดติดตั้ง Site Kits (BOM) เชื่อมโยงรหัสโครงการโดยตรง พร้อมรับประกันความปลอดภัยระดับ Atomic Transactions (`SELECT ... FOR UPDATE` ผ่าน Supabase PostgreSQL RPC) ที่ป้องกันปัญหาเบิกของชนกันหรือสต็อกติดลบ 100% ควบคู่กับระบบจัดเก็บไฟล์สื่อความเร็วสูงผ่าน Cloudflare R2 (Zero Egress)

## Operating Context
- **กระบวนการทำงานหลัก (Workflows):**
  - *POS Material Withdrawal:* ค้นหา/สแกน SKU, Barcode, Serial Number แล้วเลือกใส่ตะกร้า (Cart) และระบุโครงการเป้าหมายเพื่อสร้างบิลคำขอเบิก (Order)
  - *Approval Gate:* กฎทางธุรกิจแบบ All-or-Nothing Approval ผ่านการแจ้งเตือนแบบ One-Click Quick Approval หรือหน้ารายการคำขอ
  - *Issue Voucher Generation:* ออกเอกสารใบเบิกพัสดุทางการในรูปแบบ PDF พร้อมลายเซ็นและเลขที่เอกสารลำดับอัตโนมัติ
  - *Equipment Borrow/Return:* ยืม-คืนอุปกรณ์เครื่องมือ ตรวจสภาพรับเข้าและส่งคืน แจ้งเตือนเมื่อเกินกำหนด (Overdue Alerts)
  - *Damage & Repair / Scrap:* บันทึกของชำรุด ติดตามสถานะส่งซ่อม และตัดซากตามระเบียบ
  - *Batch Stock-In:* นำเข้ารายการพัสดุล็อตใหญ่ผ่าน CSV (UTF-8 with BOM) ที่เปิดและบันทึกจาก Excel บน Windows ได้ภาษาไทยถูกต้อง
- **สภาพแวดล้อมการใช้งาน (Environments):** คลังสินค้าหลักและคลังย่อย (Multi-Warehouse), จุดบริการเบิกจ่ายหน้างาน (POS Station / Desktop / Tablet), หน้างานติดตั้งภาคสนาม (Field Site)

## Capabilities and Constraints
- **ฟังก์ชันที่ระบบรองรับ:**
  - จุดเบิกจ่ายพัสดุความเร็วสูงแบบ POS Cart Terminal
  - การจัดการสต็อกแยกตามคลัง (Multi-Warehouse)
  - การวิเคราะห์ความพร้อมของชุดติดตั้ง Site Kits ตาม BOM แบบเรียลไทม์
  - การติดตาม Serial Number พร้อมระบบป้องกันหมายเลขซ้ำ
  - การควบคุมสิทธิ์แบบละเอียด (Granular RBAC 12+ Permission Keys พร้อม PermissionRoute Guard)
  - ศูนย์การแจ้งเตือนในระบบพร้อมปุ่มอนุมัติทันที (`NotificationBell.jsx`)
  - ระบบส่งอีเมลแจ้งเตือนผ่าน Serverless API พร้อม Template สวยงาม (`/api/send-email`)
  - ระบบอัปโหลดไฟล์สื่อตรงสู่ Cloudflare R2 ด้วย S3 Presigned URLs (`/api/r2-upload-url`)
  - การสร้างเอกสาร PDF ใบเบิกพัสดุในเบราว์เซอร์ผ่าน `@react-pdf/renderer`
- **ข้อจำกัดและกฎเชิงเทคนิค:**
  - การเปลี่ยนแปลงจำนวนสต็อกทุกประเภทต้องทำผ่าน Atomic Transaction / RPC บนฐานข้อมูลเท่านั้น (ห้ามลดสต็อกฝั่งไคลเอนต์โดยลำพัง)
  - ไอคอนใน UI ต้องเป็น Vector SVG 100% ผ่าน `lucide-react` เท่านั้น (ห้ามใช้อิโมจิใน UI)
  - การนำเข้า/ส่งออก CSV ภาษาไทยต้องใช้ UTF-8 with BOM (`\uFEFF`) เสมอ
  - Responsive Web / PWA รองรับการใช้งานทั้งเดสก์ท็อปและแท็บเล็ต

## Brand Commitments
- **ชื่อผลิตภัณฑ์:** Stock-Flow
- **องค์กรเจ้าของ:** Forth Corporation Public Company Limited
- **น้ำเสียง (Voice):** สุภาพ ชัดเจน น่าเชื่อถือ เป็นมืออาชีพแบบระบบงานระดับ Enterprise
- **เอกลักษณ์ทางสายตา (Visual Identity):**
  - Light mode ใช้มิติ Neumorphism / Soft UI ที่นุ่มนวล เรียบหรู
  - Dark mode รองรับการทำงานในสภาพแสงน้อย
  - ไอคอน: Strict 100% Vector SVG (`lucide-react`)
  - ตัวอักษร: ฟอนต์อ่านง่าย รองรับภาษาไทยและอังกฤษอย่างเป็นทางการ

## Evidence on Hand
- **ระบบจริง (Production Web App):** `https://stockflowth.online`
- **Landing Page ทางการ:** `https://eemeemmeex.github.io/Stock-Flow/`
- **เอกสารและ Wiki ใน Repo:** `README.md`, `CONTEXT.md`, `docs/`, `wiki/`
- **ฐานข้อมูลและ Migration:** `supabase/migrations/` (Atomic RPCs, RLS policies, audit logs)
- **ชุดทดสอบและสคริปต์ตรวจสอบ:** `scripts/verify-*.mjs`, `src/lib/__tests__/`

## Product Principles
- **Atomic Integrity First:** ความถูกต้องของสต็อกหน้างานสำคัญที่สุด การเปลี่ยนแปลงสต็อกต้องทำผ่าน Atomic Transaction ในฐานข้อมูลเท่านั้น ห้ามเดาหรือพึ่งพาการตรวจฝั่ง Frontend เพียงอย่างเดียว
- **Speed at the Counter:** กระบวนการเบิกจ่ายและรับเข้าต้องเร็วที่สุด ลดขั้นตอนการกรอกที่ไม่จำเป็น รองรับการสแกนและการค้นหาแบบทันที
- **Uncompromised Accountability:** ทุกการเคลื่อนไหวของพัสดุ (รับ, เบิก, ยืม, คืน, ชำรุด, ซ่อม, ตัดซาก) ต้องมีผู้รับผิดชอบ โครงการที่ผูกไว้ และหลักฐานเอกสาร/บันทึก Audit Trail ชัดเจน
- **Zero Ambiguity in Approvals:** การอนุมัติบิลใช้หลัก All-or-Nothing เพื่อความชัดเจนในการจัดการสต็อก ไม่ปล่อยให้มีรายการค้างเติ่งบางส่วน
- **Field-Ready Pragmatism:** ระบบต้องทำงานได้ราบรื่นทั้งในคลังและภาคสนาม รองรับทั้งหน้าจอเดสก์ท็อปและอุปกรณ์พกพา มีความทนทานต่อข้อผิดพลาด

## Accessibility & Inclusion
- รองรับการสลับภาษาไทยและภาษาอังกฤษ (i18n ready)
- รองรับ Contrast เหมาะสมทั้งใน Dark Mode และ Light Mode สำหรับการทำงานในคลังสินค้าและกลางแจ้ง
- ปฏิบัติตามมาตรฐาน Web Accessibility (ARIA roles, keyboard navigable forms, clear focus rings via Radix UI)
