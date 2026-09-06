# 🚀 System Features & Capabilities

เอกสารนี้รวบรวมรายละเอียดฟังก์ชันการทำงานหลักทั้ง 9 โมดูลของระบบ **Stock-Flow** เพื่อสนับสนุนงานคลังสินค้าและการจัดสรรพัสดุไซต์งานอย่างครบวงจร

---

## 📋 สารบัญฟังก์ชันหลัก

1. [โมดูล POS เบิกจ่ายพัสดุด่วน (Fast POS Dispatch Terminal)](#1-โมดูล-pos-เบิกจ่ายพัสดุด่วน-fast-pos-dispatch-terminal)
2. [ระบบชุดอุปกรณ์ประกอบไซต์งาน (BOM Site Kits)](#2-ระบบชุดอุปกรณ์ประกอบไซต์งาน-bom-site-kits)
3. [ระบบยืม-คืนอุปกรณ์และเครื่องมือช่าง (Lending & Return Tracker)](#3-ระบบยืม-คืนอุปกรณ์และเครื่องมือช่าง-lending--return-tracker)
4. [ระบบการอนุมัติหลายระดับ (Multi-Tier Approval Workflow)](#4-ระบบการอนุมัติหลายระดับ-multi-tier-approval-workflow)
5. [ระบบแจ้งเตือนแบบเรียลไทม์ (Real-Time Notification System)](#5-ระบบแจ้งเตือนแบบเรียลไทม์-real-time-notification-system)
6. [ระบบจัดการสิทธิ์และบันทึกประวัติ (Enterprise RBAC & Audit Trail)](#6-ระบบจัดการสิทธิ์และบันทึกประวัติ-enterprise-rbac--audit-trail)
7. [ระบบนำเข้าและส่งออกข้อมูล (Batch Import & Export Engine)](#7-ระบบนำเข้าและส่งออกข้อมูล-batch-import--export-engine)
8. [ระบบออกเอกสารและพิมพ์รายงาน (PDF & Slip Report Generator)](#8-ระบบออกเอกสารและพิมพ์รายงาน-pdf--slip-report-generator)
9. [ระบบจัดการสื่อและรูปภาพพัสดุ (Cloudflare R2 Asset Management)](#9-ระบบจัดการสื่อและรูปภาพพัสดุ-cloudflare-r2-asset-management)

---

### 1. โมดูล POS เบิกจ่ายพัสดุด่วน (Fast POS Dispatch Terminal)
* **Barcode & QR Scanning:** รองรับเครื่องยิงบาร์โค้ด USB/Bluetooth และกล้องมือถือ/แท็บเล็ตเพื่อค้นหาพัสดุได้ในเวลาเสี้ยววินาที
* **Quick Cart:** ระบบตะกร้าเบิกพัสดุด่วน รองรับการปรับเปลี่ยนจำนวน ตรวจสอบ Available Stock ทันที
* **Location Lookup:** แสดงตำแหน่งจัดเก็บในคลัง (โซน, แถว, ชั้นวาง) เพื่อความรวดเร็วในการหยิบสินค้า
* **Instant Slip Print:** พิมพ์ใบส่งมอบพัสดุขนาดกะทัดรัด (Receipt Slip 80mm) สำหรับแนบไปกับกล่องพัสดุ

### 2. ระบบชุดอุปกรณ์ประกอบไซต์งาน (BOM Site Kits)
* **Bill of Materials (BOM) Management:** จัดหมวดหมู่พัสดุเป็นชุดตามประเภทงาน เช่น ชุดติดตั้งกล้อง CCTV, ตู้ชุมสาย, เสา Smart Pole, และตู้ชาร์จ EV
* **One-Click Kit Dispatch:** เบิกจ่ายทั้งชุดงานได้ในคลิกเดียว พร้อมคำนวณยอดสต็อกพัสดุย่อยทุกชิ้นในชุดโดยอัตโนมัติ
* **Kit Customization:** สามารถเพิ่ม/ลดอุปกรณ์เฉพาะกิจสำหรับหน้างานที่มีความต้องการพิเศษได้

### 3. ระบบยืม-คืนอุปกรณ์และเครื่องมือช่าง (Lending & Return Tracker)
* **Serial Number Tracking:** ติดตามเครื่องมือช่างที่มีมูลค่าสูงด้วยรหัสเฉพาะ (Serial / Asset Tag)
* **Borrower Profile:** บันทึกข้อมูลช่างผู้ยืม, ไซต์งานที่นำไปใช้, วันที่กำหนดคืน, และภาพถ่ายสภาพเครื่องมือตอนส่งมอบ
* **Overdue Tracking:** แจ้งเตือนสถานะเมื่อเกินกำหนดส่งคืน พร้อมบันทึกประวัติความเสียหายหรือสภาพอุปกรณ์ตอนรับคืน

### 4. ระบบการอนุมัติหลายระดับ (Multi-Tier Approval Workflow)
* **Configurable Rules:** กำหนดเงื่อนไขมูลค่าพัสดุ หรือประเภทพัสดุพิเศษที่ต้องผ่านการอนุมัติจากผู้จัดการฝ่าย
* **One-Click Email Approval:** ผู้อนุมัติสามารถกดปุ่ม Approve หรือ Reject ผ่านลิงก์ในอีเมลได้อย่างสะดวกและปลอดภัย
* **Live Status Tracking:** ผู้ขอเบิกสามารถตรวจสอบสถานะคำขอ (Pending, Approved, Dispatched, Rejected) ได้ตลอดเวลา

### 5. ระบบแจ้งเตือนแบบเรียลไทม์ (Real-Time Notification System)
* **Enterprise Email Delivery:** เชื่อมต่อกับระบบอีเมล Forth Corporation ผ่าน SMTP พร้อมระบบรับมือ Fallback
* **In-App Alerts:** แสดงแถบแจ้งเตือนเตือนภัยสต็อกต่ำ (Low Stock Alert) และงานที่ต้องรอการดำเนินการ
* **Safety Threshold:** ตั้งค่าจุดสั่งซื้อซ้ำ (Reorder Point) รายหมวดหมู่และแจ้งเตือนจัดซื้ออัตโนมัติ

### 6. ระบบจัดการสิทธิ์และบันทึกประวัติ (Enterprise RBAC & Audit Trail)
* **Role-Based Access Control:**
  * `Admin` — สิทธิ์สูงสุด จัดการการตั้งค่าและโครงสร้างระบบ
  * `Manager` — สิทธิ์อนุมัติ ดูรายงานเชิงลึก และสรุปยอด
  * `Warehouse Staff` — สิทธิ์ตรวจนับ รับเข้า เบิกจ่าย และพิมพ์สลิป
  * `General User / Technician` — สิทธิ์สร้างคำขอเบิกและตรวจสอบประวัติการยืมของตนเอง
* **Immutable Audit Trail:** บันทึกทุกธุรกรรม (ใคร ทำอะไร เวลาใด จำนวนเท่าใด ยอดคงเหลือก่อน-หลัง) ป้องกันการแก้ไขย้อนหลัง

### 7. ระบบนำเข้าและส่งออกข้อมูล (Batch Import & Export Engine)
* **Powered by SheetJS:** นำเข้าพัสดุเป็นพันรายการผ่านไฟล์ `.xlsx` หรือ `.csv`
* **Schema Validation & Error Report:** ตรวจสอบความถูกต้องของแถวข้อมูล เช่น SKU ซ้ำ, ค่าติดลบ, หรือประเภทข้อมูลผิดพลาดก่อนบันทึกจริง
* **Excel Summary Export:** สรุปยอดการเบิกจ่ายและสต็อกคงเหลือส่งออกเป็นไฟล์ Excel ได้ทันที

### 8. ระบบออกเอกสารและพิมพ์รายงาน (PDF & Slip Report Generator)
* **Client-side PDF Render:** ขับเคลื่อนด้วย `@react-pdf/renderer` รวดเร็วและแม่นยำ
* **Formal Issue Vouchers:** สร้างใบเบิกจ่ายพัสดุมาตรฐานขนาด A4 พร้อมช่องลงนามผู้ขอเบิก, ผู้อนุมัติ, และผู้จ่ายพัสดุ
* **Inventory Valuation Report:** รายงานมูลค่าสินค้าคงคลังจำแนกตามหมวดหมู่และแผนก

### 9. ระบบจัดการสื่อและรูปภาพพัสดุ (Cloudflare R2 Asset Management)
* **Zero Egress Architecture:** รูปภาพพัสดุและภาพหลักฐานถูกบันทึกบน Cloudflare R2
* **High-Speed CDN:** โหลดรูปภาพพัสดุขนาดใหญ่ได้อย่างรวดเร็วผ่าน Global CDN Edge
* **Presigned Security:** การอัปโหลดมีอายุจำกัด 15 นาที ป้องกันการเข้าถึงพื้นที่จัดเก็บโดยไม่ได้รับอนุญาต

---

## 🧭 เอกสารที่เกี่ยวข้อง
* [[Architecture|Architecture]] — สถาปัตยกรรมทางเทคนิคของแต่ละโมดูล
* [[Database-and-Storage|Database-and-Storage]] — ตารางข้อมูลที่รองรับฟังก์ชันเหล่านี้
* [[Development-Workflow|Development-Workflow]] — การต่อยอดฟังก์ชันใหม่ในโปรเจกต์
