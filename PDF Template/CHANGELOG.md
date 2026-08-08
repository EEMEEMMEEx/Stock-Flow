## [2026-07-15 13:10]
- **Files Modified:** `output/index.html`, `output/styles.css`, `output/template.json` [NEW]
- **Changes:**
  - `output/template.json`: สร้างไฟล์ JSON สำหรับเก็บ Data schema (`document_number`, `date`, `receiver_name`, `items`, ฯลฯ) เพื่อใช้ Inject ข้อมูลลงในรายงาน
  - `output/index.html`: เปลี่ยนข้อความแบบ Hardcoded ทั้งหมด (เช่น ชื่อเอกสาร, วันที่, รายการสิ่งของ 9 รายการ, และชื่อในลายเซ็นต์) ให้กลายเป็น Placeholder ในรูปแบบ Handlebars (เช่น `{{document_number}}`, `{{#each items}}...{{/each}}`) เพื่อให้เป็น Editable Enterprise Report Template อย่างสมบูรณ์ โดยคงเหลือบรรทัดว่าง (empty rows) 5 แถวไว้ต่อท้ายเพื่อให้ตารางมีความยาวที่สวยงาม
  - `output/styles.css`: เพิ่ม `text-align: center;` ใน class `.sign-underline` เพื่อให้ชื่อผู้เซ็นต์ที่ถูก Inject เข้ามาแสดงอยู่กึ่งกลางเส้นบรรทัด
- **Reason:** ผู้ใช้ต้องการยกระดับจากไฟล์ Static HTML ให้เป็น Editable Template ที่รองรับ Dynamic Data Injection เพื่อใช้ออกรายงาน (Enterprise Report Builder)

## [2026-07-15 13:05]
- **Files Modified:** `output/index.html`
- **Changes:**
  - `output/index.html`: ลดจำนวนบรรทัดว่าง (Empty rows) ในตารางด้านล่างลงจาก 13 บรรทัด ให้เหลือเพียง 5 บรรทัดตามที่ผู้ใช้ร้องขอ
- **Reason:** ผู้ใช้ต้องการให้ตารางสั้นลงโดยมีบรรทัดว่างต่อท้ายรายการเพียงแค่ 5 บรรทัด

## [2026-07-15 13:03]
- **Files Modified:** `output/index.html`, `output/styles.css`, `output/layout.xml`
- **Changes:**
  - `output/styles.css`: ปรับแก้ตำแหน่งของช่องลายเซ็นต์ (ด้านล่างตาราง) ให้ตรงกับแนวคอลัมน์ด้านบนแบบเป๊ะๆ โดยกำหนดให้ช่อง "ผู้ส่งของ" วางตัวตรงกับคอลัมน์ "รายการ" (left: 20mm) และ "ผู้รับของ" วางตัวตรงกับคอลัมน์ "Serial Number" (left: 115mm)
  - `output/index.html`: เพิ่ม CSS Classes เฉพาะเจาะจง (`signature-sender`, `signature-receiver`) เพื่อควบคุมตำแหน่ง X-axis ให้ตรงตามต้นฉบับ
  - `output/layout.xml`: อัปเดตพิกัดแกน X สำหรับข้อความและเส้นประของลายเซ็นต์ให้สอดคล้องกัน
- **Reason:** ผู้ใช้ส่งภาพเปรียบเทียบมาให้ดู ทำให้พบว่าแม้ลายเซ็นต์จะอยู่นอกตารางแล้ว แต่ตำแหน่งแกน X ยังไม่ได้ศูนย์กลางตรงกับคอลัมน์ด้านบนตามต้นฉบับ (Alignment fix)

## [2026-07-15 12:58]
- **Files Modified:** `output/index.html`, `output/styles.css`, `output/layout.xml`
- **Changes:**
  - `output/index.html`: ย้ายส่วนของลายเซ็นต์กลับออกมาอยู่นอกตาราง (ด้านล่างตาราง) และจำกัดจำนวนบรรทัดว่างในตารางให้ตรงกับ PDF ต้นฉบับ (13 บรรทัดว่าง)
  - `output/styles.css`: คืนค่า CSS สำหรับ `.footer-section` เพื่อควบคุมตำแหน่งของลายเซ็นต์ให้อยู่ด้านล่างสุดของหน้ากระดาษอย่างเป็นอิสระ
  - `output/layout.xml`: อัปเดตโครงสร้าง XML เพื่อให้ฟิลด์ลายเซ็นต์กลับมาอยู่นอกตาราง
- **Reason:** ผู้ใช้ให้ข้อมูลเพิ่มเติมพร้อมภาพเปรียบเทียบ ทำให้เห็นชัดเจนว่าช่องลายเซ็นต์ในต้นฉบับไม่ได้อยู่ในตาราง แต่อยู่ใต้ตารางต่างหาก

## [2026-07-15 12:55]
- **Files Modified:** `output/styles.css`
- **Changes:**
  - `output/styles.css`: ปรับแก้การจัดวาง (Alignment) ของช่องลายเซ็นต์ให้ชิดซ้าย (flex-start) แทนการจัดกึ่งกลาง (center) และเพิ่ม padding-left, padding-right ให้ระยะขอบซ้ายขวาเป๊ะตามภาพตัวอย่างที่ผู้ใช้ส่งมา
- **Reason:** ผู้ใช้แจ้งว่าตำแหน่งของช่องลายเซ็นต์ยังจัดวางไม่เหมือนต้นฉบับ 

## [2026-07-15 12:50]
- **Files Modified:** `output/index.html`, `output/styles.css`, `output/layout.xml`
- **Changes:**
  - `output/index.html`: ย้ายส่วนของลายเซ็นต์ (ผู้ส่งของ, เบอร์โทรศัพท์, วันที่) เข้าไปเป็นส่วนหนึ่งของตาราง (Table Rows) ให้ตรงกับภาพต้นฉบับ
  - `output/styles.css`: ปรับแต่งสไตล์ CSS ของช่องลายเซ็นต์ให้อยู่ในเซลล์ของตารางและเปลี่ยนเส้นประเป็นเส้นทึบตามต้นฉบับ
  - `output/layout.xml`: อัปเดตโครงสร้าง XML เพื่อสะท้อนการย้ายส่วนลายเซ็นต์เข้ามาในตาราง
- **Reason:** ผู้ใช้แจ้งว่ารูปแบบเดิมไม่ตรงกับต้นฉบับแบบเป๊ะๆ เนื่องจากลายเซ็นต์ต้องอยู่ในบรรทัดล่างๆ ของตาราง

## [2026-07-15 12:35]
- **Files Modified:** `output/index.html`, `output/styles.css`, `output/layout.xml`
- **Changes:**
  - `output/index.html`: สร้างโครงสร้าง HTML สำหรับเอกสารเบิกและนำส่งอุปกรณ์ รองรับขนาด A4
  - `output/styles.css`: สร้างสไตล์ CSS แบบ Pixel-perfect โดยใช้หน่วย mm (มิลลิเมตร) เพื่อกำหนดขนาดระยะห่างและตำแหน่งต่างๆ 
  - `output/layout.xml`: สร้างไฟล์ XML เก็บ Metadata ของ Layout ทั้งหมดตามพิกัดแบบเป๊ะๆ ของแต่ละ Object (ข้อความ, ตาราง, ภาพ) 
- **Reason:** ผู้ใช้ต้องการแปลงจากไฟล์ PDF ต้นฉบับมาเป็น HTML/CSS/XML เพื่อให้นำไป Print และ Generate เป็น PDF กลับได้เหมือนต้นฉบับ 100%
