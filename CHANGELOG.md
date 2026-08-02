# Changelog

## [2026-08-02 16:15]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - แก้ไขปัญหา IDE Code Parser Error / Warning ในส่วนตัวอย่างโค้ด JSX โดยทำการ Escape เครื่องหมายแท็ก HTML (`<` เป็น `&lt;` และ `>` เป็น `&gt;`) ภายในบล็อก `<pre><code>` ทุกจุด
- **Reason:** แก้ไขปัญหาสวนทางระหว่างไวยากรณ์ HTML/CSS ของ IDE Parser กับโค้ดตัวอย่าง JSX เพื่อให้โค้ดถูก Highlight อย่างถูกต้องและไม่มี Syntax Error

## [2026-08-02 16:12]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - เพิ่มหัวข้อและรายละเอียดส่วน "การออกแบบและกำหนดรูปแบบหน้าตา PDF (PDF Layout & UI/UX Design Systems)"
  - เพิ่มส่วนอธิบายสเปกขอบกระดาษ, สัดส่วนความกว้างคอลัมน์ตาราง, แบบจำลองโครงสร้างหน้าตาเอกสาร PDF (Visual Page Layout Mockup Preview), และตารางอ้างอิงคุณสมบัติสไตล์ใน `@react-pdf/renderer`
- **Reason:** ผู้ใช้ต้องการเพิ่มข้อมูลรายละเอียดการจัดและออกแบบรูปแบบหน้าตา PDF ในเอกสารคู่มือ

## [2026-08-02 16:08]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - ตัดส่วนข้อมูล Server-Side PDF Service (`Puppeteer + Express`) ออกจากคู่มือทั้งหมด
  - ปรับสถาปัตยกรรมเอกสารคู่มือให้เน้นการใช้งาน Client-Side PDF (`@react-pdf/renderer`) และ HTML/CSS Print Standard (`delivery-note.html`) อย่างสมบูรณ์
- **Reason:** ผู้ใช้แจ้งว่าส่วน Server-Side PDF Service ไม่ได้ใช้งานแล้วในปัจจุบัน

## [2026-08-02 16:04]

- **Files Modified:** `pdf_generation_guide.html`
- **Changes:**
  - สร้างเอกสารคู่มือการสร้างไฟล์ PDF แบบละเอียด (PDF Generation Architecture Guide) ในรูปแบบ HTML ตามมาตรฐาน UI/UX Pro Max
  - รวบรวมคำอธิบายทั้ง Client-Side PDF (`@react-pdf/renderer`), Server-Side PDF Microservice (`Puppeteer Express`), การตั้งค่าฟอนต์ภาษาไทย (`THSarabunNew` / `Sarabun`), และตัวอย่างโค้ดพร้อมเทคนิคแก้ไขบั๊ก
- **Reason:** ผู้ใช้ต้องการสรุปคู่มือและสถาปัตยกรรมกระบวนการสร้างเอกสาร PDF ของโปรเจกต์ Stock-Flow-app ที่ใช้งานอยู่

## [2026-07-15 16:27]

- **Files Modified:** `src/pages/Withdrawals.jsx`, `src/pages/History.jsx`, `src/lib/pdf-templates.jsx`
- **Changes:**
  - เพิ่มช่องกรอก "สถานที่จัดส่ง (Delivery Address)" ในฟอร์มยืนยันการเบิกจ่าย
  - ปรับให้ใบนำส่ง (PDF) ดึงข้อมูลสถานที่จัดส่งมาแสดงตรงหัวกระดาษ (ส่งของที่ : ) แทนชื่อโครงการ
  - นำข้อมูลสถานที่จัดส่งไปแสดงในหน้ารายละเอียดคำขอเบิกด้วย
- **Reason:** ผู้ใช้ต้องการสามารถระบุที่อยู่จัดส่งแบบกำหนดเองได้ เพื่อความสะดวกและยืดหยุ่นในการออกใบนำส่ง

## [2026-07-15 16:20]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เพิ่มการแสดงผลหน่วยของวัสดุ (Unit) ต่อท้ายตัวเลขจำนวนในตาราง PDF (เช่น จาก "1" เป็น "1 ชุด" หรือ "1 ชิ้น")
- **Reason:** ผู้ใช้ต้องการให้แสดงหน่วยในเอกสารเพื่อให้เกิดความชัดเจนในการเบิกจ่าย

## [2026-07-15 16:07]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ลบคอลัมน์ "Remark" ออกจากตารางใน PDF เพื่อเพิ่มพื้นที่ความกว้างให้กับคอลัมน์ชื่อรายการและ Serial Number
  - ย้ายข้อมูล Remark (จุดประสงค์การเบิก) ไปแสดงผลเป็นบรรทัดใหม่ที่อยู่ต่อท้ายตาราง และก่อนถึงส่วนของลายเซ็น
- **Reason:** ผู้ใช้ต้องการนำ Remark ออกจากตารางเพื่อไม่ให้กินพื้นที่ และย้ายไปไว้ด้านล่างแทน

## [2026-07-15 16:02]

- **Files Modified:** `index.html`
- **Changes:**
  - เพิ่ม Script สำหรับโหลด `Buffer` และ `global` (Polyfill) จาก `esm.sh` เข้าไปใน `index.html`
- **Reason:** แก้บั๊ก Vite รัน `Buffer is not defined` เวลาที่ Component ของ `@react-pdf/renderer` พยายามประมวลผลไฟล์รูปภาพหรือไฟล์ PDF ในฝั่ง Client-side

## [2026-07-15 15:46]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ยกเลิกการล็อกลายเซ็นให้ติดขอบล่างของหน้ากระดาษ (ลบคำสั่ง `fixed` และ `position: absolute`)
  - เปลี่ยนให้ส่วนของลายเซ็น (Footer) ไหลต่อท้ายตารางเสมอ ไม่ว่าตารางจะสั้นหรือยาว
  - ใช้คำสั่ง `wrap={false}` กับส่วนลายเซ็น เพื่อให้แน่ใจว่าถ้าพื้นที่ท้ายกระดาษไม่พอ ลายเซ็นทั้งก้อนจะถูกปัดขึ้นหน้าใหม่พร้อมกัน โดยไม่ถูกตัดขาดครึ่ง
- **Reason:** ผู้ใช้ต้องการให้ลายเซ็นต่อท้ายรายการเสมอ และไม่ต้องการให้ล็อกติดพื้นกระดาษเผื่อกรณีรายการยาวมากๆ

## [2026-07-15 15:42]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - แก้ไขปัญหาตารางทับซ้อนกับลายเซ็นเมื่อมีรายการเบิกเกิน 15 รายการ
  - เพิ่มระยะขอบด้านล่างของหน้ากระดาษ (Padding Bottom) เป็น `70mm` เพื่อกันพื้นที่สำหรับลายเซ็น
  - เพิ่มคำสั่ง `fixed` ในส่วนของ Footer เพื่อบังคับให้ลายเซ็นแสดงผลที่ด้านล่างสุดของกระดาษ *ทุกหน้า* เสมอ และตารางจะถูกตัดขึ้นหน้าใหม่โดยอัตโนมัติ
- **Reason:** ระบบเก่าตารางไหลลงมาทับลายเซ็นและทำให้ลายเซ็นขาดครึ่งเมื่อข้อมูลยาวเกิน 1 หน้า

## [2026-07-15 15:39]

- **Files Modified:** `src/pages/Withdrawals.jsx`, `src/pages/History.jsx`
- **Changes:**
  - เพิ่ม Scrollbar ให้กับตารางในหน้าต่าง (Modal) "รายละเอียดบิลคำขอเบิกจ่าย"
  - จำกัดความสูงของตารางไว้ที่ 50% ของหน้าจอ (`max-h-[50vh]`) เพื่อไม่ให้หน้าต่างล้นขอบจอเวลาที่มีรายการเบิกจำนวนมาก
- **Reason:** ผู้ใช้พบปัญหาเวลาเบิกของเยอะๆ รายการจะล้นจอทำให้ดูไม่ครบและกดปิด/อนุมัติลำบาก

## [2026-07-15 15:10]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ปรับสเกลขนาดตัวอักษรทั้งหมดในเอกสาร (ตาราง, หัวข้อ, ลายเซ็น) ให้เป็นมาตรฐานของ `THSarabunNew` (Base size `16pt`)
  - ปรับขนาดชื่อบริษัทเป็น `30pt` (TH) / `22pt` (EN) และที่อยู่เป็น `14pt` ตามที่ผู้ใช้ปรับแต่ง เพื่อให้ขนาดตัวอักษรเมื่อพิมพ์ออกมาเท่ากับต้นฉบับจริง
- **Reason:** ฟอนต์ `THSarabunNew` มีสเกลที่เล็กกว่าปกติ การใช้ขนาด 9pt-10pt แบบเดิมจะทำให้อ่านไม่ออกเมื่อพิมพ์เป็นกระดาษ A4

## [2026-07-15 15:06]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เปลี่ยนฟอนต์ในเอกสาร PDF จาก `Sarabun` เป็น `THSarabunNew`
  - ทำการรองรับฟอนต์ทั้ง 4 สไตล์ (Regular, Italic, Bold, BoldItalic)
- **Reason:** ผู้ใช้ต้องการเปลี่ยนไปใช้ฟอนต์ `THSarabunNew` เพื่อให้เหมือนกับเอกสารราชการ/บริษัทมากขึ้น

## [2026-07-15 15:00]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - แก้ไขปัญหาเส้นขอบตาราง (Borders) ในแถวที่ว่างเปล่า โดยเปลี่ยนจากการตีเส้นที่ตัว Text ให้ไปตีเส้นที่กรอบ View (Cell) แทน เพื่อให้เส้นตารางลากยาวลงมาเชื่อมกันสนิท
  - ปรับการจัดวางตำแหน่งข้อความในช่องลายเซ็นให้อยู่เหนือเส้นบรรทัดพอดี ตรงตามต้นฉบับ
- **Reason:** ผู้ใช้แจ้งว่า Layout ยังมีจุดผิดเพี้ยน (เส้นขอบตารางขาดตอนในแถวว่าง และลายเซ็นไม่ลอยอยู่บนเส้น)

## [2026-07-15 14:41]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - ปรับโครงสร้างหน้าตาของ `DeliveryNotePDF` ให้ตรงกับแบบฟอร์มเอกสารใบนำส่งฉบับจริง (Template HTML) ของบริษัท
  - เพิ่มโลโก้บริษัท (อ่านจาก `/images/logo.png`)
  - เพิ่มหัวกระดาษบริษัท และข้อความระบุว่า "ใบนำส่งอุปกรณ์" / "ต้นฉบับ"
  - ปรับช่องตารางให้มีคอลัมน์ ลำดับ, รายการ, จำนวน, Serial Number/Part Number, และ Remark
  - เติมแถวว่างอัตโนมัติให้ครบอย่างน้อย 15 แถว เพื่อให้เอกสารดูเป็นทางการและมีที่ว่างสำหรับเขียนเพิ่ม
  - เพิ่มช่องลายเซ็นสำหรับผู้ส่งของและผู้รับของด้านล่างสุด
- **Reason:** เพื่อให้แบบฟอร์ม PDF ที่ Export ออกมาจากระบบมีหน้าตาตรงกับมาตรฐานเอกสารเบิกและนำส่งอุปกรณ์ที่บริษัท FORTH ใช้งานอยู่จริง

## [2026-07-15 14:27]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เปลี่ยนการเรียกใช้ฟอนต์จาก CDN (`cdn.jsdelivr.net`) กลับมาเป็น Local Path (`/fonts/Sarabun-*.ttf`) อีกครั้ง
- **Reason:** ผู้ใช้ได้ทำการดาวน์โหลดไฟล์ฟอนต์ `Sarabun` มาใส่ไว้ในโฟลเดอร์ `public/fonts` เรียบร้อยแล้ว การเรียกใช้ไฟล์จาก Local โดยตรงจะมีความเสถียรและรวดเร็วกว่าการดึงผ่าน CDN ที่อาจเกิด Error 404 ได้

## [2026-07-15 14:23]

- **Files Modified:** `src/lib/pdf-templates.jsx`
- **Changes:**
  - เปลี่ยนพาร์ท (Path) ของฟอนต์ Sarabun จาก Local (`/fonts/Sarabun-Regular.ttf`) เป็น URL ของ CDN (`cdn.jsdelivr.net`)
- **Reason:** การเรียกใช้ฟอนต์จาก Local เกิดข้อผิดพลาด (Unknown font format) เนื่องจากไม่มีไฟล์ฟอนต์อยู่ในโฟลเดอร์ `public/fonts` และตัว Vite server ส่งคืนหน้า HTML (404) กลับมาให้แทน ทำให้ React-PDF แปลงไฟล์ไม่สำเร็จ การดึงจาก CDN โดยตรงจะช่วยแก้ปัญหานี้ได้ทันที

## [2026-07-15 14:20]

- **Files Modified:** `src/components/ui/PosTerminal.jsx`
- **Changes:**
  - นำ Component `<Card>` กลับมาครอบการ์ดสินค้าและตะกร้าสินค้าในหน้า POS
  - ลบเส้นแกน Y (`divide-x`) ออก และใช้ช่องว่าง (`gap-6`) ระหว่างการ์ดแทน เพื่อปล่อยให้แสงเงาของ Neumorphism ทำหน้าที่แบ่งสัดส่วนหน้าจอแทนเส้นขอบ
  - คงการจัดเรียง Typography และ Spacing ภายในที่สะอาดตาตามสไตล์ Gridgeist เอาไว้
- **Reason:** เพื่อคืนความนูน (Neumorphism) ให้กับหน้า POS เช่นเดียวกับหน้า Dashboard แต่ยังคงความเป็นระเบียบเรียบร้อยไว้

## [2026-07-15 14:18]

- **Files Modified:** `src/pages/Dashboard.jsx`
- **Changes:**
  - นำ Component `<Card>` กลับมาใช้เพื่อให้ Design System กลับไปเป็นสไตล์ Neumorphism (ผ่านคลาส `neu-flat`)
  - ผสมผสานหลักการของ `gridgeist` เข้าไปไว้ "ภายใน" การ์ดแทน โดยใช้ Typography จัดลำดับชั้นข้อมูลให้ชัดเจนขึ้น
  - จัดโครงสร้าง Layout กลับมาอยู่ใน `<Card>` โดยไม่มีเส้นขอบ (border-none) เพื่อให้ตัวการ์ดนูนขึ้นมาด้วยแสงเงาอย่างสมบูรณ์
  - ปรับ Tooltip ของกราฟ BarChart ให้มีแสงเงาสไตล์ Neumorphism
- **Reason:** ผู้ใช้ต้องการนำเอกลักษณ์ความนูน (Neumorphism) กลับมา แต่ยังคงต้องการให้ข้อมูลถูกจัดเรียงอย่างเป็นระเบียบตามหลัก Editorial UI

## [2026-07-15 14:14]

- **Files Modified:** `src/pages/Dashboard.jsx`
- **Changes:**
  - รื้อโครงสร้าง UI หน้า Dashboard ใหม่ทั้งหมดตามหลักการของ Skill `gridgeist`
  - ลบ Component `<Card>` ออกทั้งหมด และเปลี่ยนมาใช้ Grid 12 คอลัมน์ (8 คอลัมน์สำหรับกราฟ, 4 คอลัมน์สำหรับกิจกรรมล่าสุด)
  - ปรับการจัดลำดับชั้นข้อมูล (Hierarchy) ด้วย Typography แทนกล่อง โดยปรับตัวเลขสถิติให้ใหญ่ขึ้น (`text-5xl font-light`) และแยกส่วนด้วยเส้น 1px rule
  - แก้ไขกราฟ BarChart ให้เป็นทรงเหลี่ยม (Square corners) และลบเงา (Shadow) ออก
  - ใช้ฟอนต์ Monospace (`font-mono`) สำหรับเวลาในส่วนของกิจกรรมล่าสุด
  - ยังคงรักษาฟังก์ชัน สีประจำแบรนด์ และการดึงข้อมูลทั้งหมดไว้เหมือนเดิม
- **Reason:** ผู้ใช้ต้องการ Redesign หน้า Dashboard ใหม่ให้เป็นระเบียบ เรียบง่าย และมีความเป็นมืออาชีพมากขึ้น

## [2026-07-15 14:11]

- **Files Modified:** `src/components/ui/PosTerminal.jsx`
- **Changes:**
  - ปรับปรุง (Redesign) หน้าต่าง POS ใหม่ตามหลักการของ Skill `gridgeist` (Editorial POS Workspace)
  - ลบเส้นกรอบและเงาที่ไม่จำเป็นออกจากการ์ดสินค้าและรายการในตะกร้า
  - เพิ่มเส้นแกน Y (1px rule) แบ่งฝั่งซ้ายและขวาอย่างชัดเจน
  - ปรับซ่อนปุ่มลบ/ขยายรายละเอียดในตะกร้าให้แสดงเมื่อโฮเวอร์ (Hover) เท่านั้น เพื่อลดความรกของหน้าจอ
- **Reason:** ผู้ใช้ต้องการให้ UI ดูโปร่ง เป็นระเบียบ และมีความเป็น Workspace เชิงเทคนิคมากขึ้น

## [2026-07-15 13:58]

- **Files Modified:** `src/lib/pdf-templates.jsx` (New), `src/pages/Withdrawals.jsx`, `src/pages/Reports.jsx`, `.env`
- **Changes:**
  - เพิ่มไฟล์ `src/lib/pdf-templates.jsx` เพื่อสร้าง Template PDF ด้วย `@react-pdf/renderer` โดยฝังฟอนต์ Sarabun
  - แก้ไข `Withdrawals.jsx` และ `Reports.jsx` ให้สร้างไฟล์ PDF ฝั่ง Frontend ด้วยไลบรารี `@react-pdf/renderer` (เปลี่ยนจาก `fetch()` ยิงไป API เป็นเรียกใช้ `pdf().toBlob()`)
  - ลบตัวแปร `VITE_PDF_API_URL` ออกจากไฟล์ `.env`
- **Reason:** ผู้ใช้ต้องการยกเลิกการใช้ระบบ Backend ในการสร้าง PDF และย้ายการทำงานทั้งหมดมาไว้ที่ฝั่ง Frontend เพื่อความรวดเร็วและลดความซับซ้อนของระบบ

## [2026-07-15 13:34]

- **Files Modified:** `pdf-service/server.js`, `pdf-service/Dockerfile`, `pdf-service/package.json`, `src/pages/Withdrawals.jsx`, `src/pages/Reports.jsx`
- **Changes:**
  - `pdf-service/server.js`: ลบการใช้งาน `Ghostscript` ออกทั้งหมด และให้ Puppeteer คืนค่า PDF buffer โดยตรง ไม่ต้องบันทึกไฟล์ชั่วคราว
  - `pdf-service/Dockerfile`: ลบคำสั่งติดตั้ง `ghostscript` ออกเพื่อลดขนาดของ Docker Image
  - `pdf-service/package.json`: แก้ไขคำอธิบายโปรเจกต์เป็น True PDF
  - `src/pages/Withdrawals.jsx`, `src/pages/Reports.jsx`: แก้ไขข้อความในระบบแจ้งเตือน (Toast) และเปลี่ยนชื่อไฟล์ตอนดาวน์โหลดไม่ให้มีคำว่า "PDFA"
- **Reason:** ผู้ใช้ต้องการเปลี่ยนการสร้างเอกสารจากรูปแบบ PDF/A-2b กลับไปเป็นรูปแบบ True PDF ธรรมดา เพื่อให้ได้ความคมชัด คัดลอกข้อความได้ และลดความซับซ้อน/ขนาดของไฟล์

## [2026-07-15 10:35]

- **Files Modified:** `supabase/migrations/03_add_delivery_note_fields.sql` (New), `src/components/ui/PosTerminal.jsx`, `src/pages/Withdrawals.jsx`, `src/lib/pdf-service.js` (New)
- **Changes:**
  - สร้างสคริปต์ Migration เพื่อเพิ่ม Column `delivery_to`, `serial_number`, `part_number` ในตารางเบิกจ่ายและรับเข้า
  - อัปเดต `PosTerminal.jsx` ให้สามารถกดขยาย (Expand) รายการในตะกร้าเพื่อกรอกข้อมูล S/N (Textarea แบบคั่นด้วยลูกน้ำ), P/N และสถานที่ส่ง (EMS/Office) ได้
  - เพิ่มปุ่ม "พิมพ์ใบนำส่ง (PDF)" ในหน้า `Withdrawals.jsx` (Order Details Dialog)
  - สร้างเซอร์วิส `pdf-service.js` สำหรับแปลงข้อมูลใบเบิกและรายการวัสดุให้อยู่ในรูปแบบ XML ตาม Template มาตรฐาน และยิงไปที่ API (`VITE_PDF_API_URL/api/generate-delivery-note`) เพื่อรับไฟล์ PDF กลับมา
- **Reason:** ผู้ใช้ต้องการฟีเจอร์สร้างใบนำส่งอุปกรณ์ (Delivery Note) ในรูปแบบ PDF/A-2b ผ่าน API ภายนอก โดยอิงจากข้อมูล XML เดิมที่มีอยู่

## [2026-07-15 09:55]

- **Files Modified:** `src/pages/Manual.jsx` (New), `src/App.jsx`, `src/components/layout/Sidebar.jsx`, `CONTEXT.md`
- **Changes:**
  - สร้างหน้าเพจ "คู่มือการใช้งาน (Manual)" (`/manual`) เพื่ออธิบายวิธีการใช้งานระบบ
  - แบ่งเนื้อหาคู่มือออกเป็น 2 ส่วนชัดเจน: สำหรับพนักงานทั่วไป (การเบิกของด้วย POS, ข้อจำกัด All-or-Nothing) และสำหรับแอดมิน (การรับเข้า, การอนุมัติ)
  - นำปุ่ม คู่มือการใช้งาน ไปแสดงบนเมนูด้านซ้าย (Sidebar)
  - อัปเดต `CONTEXT.md` (Glossary) เพิ่มคำศัพท์ `All-or-Nothing Approval` เพื่อให้เป็นเอกสารอ้างอิงของโปรเจกต์
- **Reason:** ผู้ใช้ต้องการทำ Document สำหรับการใช้งานแต่ละส่วนอย่างละเอียด (ออกแบบผ่านระบบ Grill-with-docs)

## [2026-07-15 09:45]

- **Files Modified:** `src/App.jsx`, `src/components/layout/PageWrapper.jsx`, `Topbar.jsx`, `Sidebar.jsx`
- **Changes:**
  - แก้ไข React Router Future Flag Warnings ใน `App.jsx` (`v7_startTransition`, `v7_relativeSplatPath`)
  - อัปเดตและเขียนระบบ Mobile Sidebar Toggle ใหม่ เพื่อให้ปุ่ม Hamburger menu (บนหน้าจอมือถือ/แท็บเล็ต) สามารถกดเพื่อเปิด-ปิด Sidebar ได้
- **Reason:** ผู้ใช้แจ้งปัญหาจากการทดสอบระบบบนหน้าจอขนาดเล็กและเห็น Error logs ใน Console (วิเคราะห์และแก้ไขผ่านทักษะ Debugger)

## [2026-07-15 09:35]

- **Files Modified:** `supabase/migrations/02_pos_orders.sql` (New), `src/components/ui/PosTerminal.jsx` (New), `src/pages/Items.jsx`, `src/pages/Withdrawals.jsx`, `src/pages/StockIn.jsx`, `src/pages/History.jsx`, `src/pages/Reports.jsx`
- **Changes:**
  - สร้างไฟล์ Migration `02_pos_orders.sql` เพื่อรื้อโครงสร้าง DB การเบิกจ่าย/รับเข้า จากรูปแบบ 1 แถวต่อวัสดุ เปลี่ยนเป็นรูปแบบ Order (บิล) และ Order Items (รายการย่อย)
  - สร้าง `PosTerminal.jsx` Component สำหรับระบบตะกร้าสินค้า (Cart), ค้นหา (Search), และตัวกรองหมวดหมู่ (Category Filter)
  - `Items.jsx`: เพิ่มการผูก `category_id` (หมวดหมู่) ในฟอร์มสร้างและแก้ไขวัสดุ
  - `Withdrawals.jsx` และ `StockIn.jsx`: เปลี่ยนหน้าจอสร้างคำขอเป็นระบบ POS เมื่อกดสร้างคำขอ จะสามารถกดเพิ่มลดสินค้าในตะกร้า และสั่งรวบยอดเป็นบิลเดียวได้
  - `History.jsx`: อัปเดตให้ดึงประวัติจากตาราง `withdrawal_orders` แสดงผลลัพธ์แบบรวมบิล
  - `Reports.jsx`: แก้ไข Query ดึงข้อมูลจากตารางใหม่ โดยแปลงข้อมูลให้ออกมาแบน (Flatten) เพื่อคงหน้าตารายงานให้เหมือนเดิม
- **Reason:** ผู้ใช้ต้องการให้ระบบเบิกจ่ายทำเป็นรูปแบบคล้าย POS ที่สามารถใส่ของในตะกร้าหลายชิ้นแล้วกด Checkout ได้ (เพื่อให้หาอุปกรณ์ได้ง่ายขึ้นจากรูปภาพ)

## [2026-07-15 09:15]

- **Files Modified:** `src/App.css`, `index.html`, `src/components/ui/card.jsx`, `button.jsx`, `input.jsx`, `table.jsx`, `src/components/layout/Sidebar.jsx`, `Topbar.jsx`, `src/pages/Dashboard.jsx`, `src/pages/Reports.jsx`, `src/pages/Projects.jsx`, `src/pages/Items.jsx`, `src/pages/History.jsx`, `src/pages/StockIn.jsx`, `src/pages/Withdrawals.jsx`
- **Changes:**
  - เปลี่ยนรูปแบบ Design System จาก Glassmorphism เป็น Neumorphism (Soft UI) โทนสว่าง
  - ปรับสีพื้นหลังของแอปพลิเคชันเป็น `#e0e5ec` (Light Grey)
  - เพิ่ม CSS Classes ใหม่สำหรับ Neumorphism (`.neu-flat`, `.neu-pressed`, `.neu-button`) ใน `App.css`
  - นำ `.glass-card` ออกจาก Component และ Page ทั้งหมด
  - อัปเดตเงาและลักษณะของ `Card`, `Button`, `Input` ให้มีความโค้งมนและนูนแบบ 3 มิติ
  - ปรับปรุง `Sidebar` และ `Topbar` ให้ใช้สีพื้นและเงาที่สอดคล้องกับธีมใหม่
- **Reason:** ผู้ใช้ให้ปรับ UI เป็นรูปแบบ Neumorphism โทนสว่าง (Option A) ตามที่ตกลงกันไว้

## [2026-07-15 08:53]

- **Files Modified:** `src/pages/Reports.jsx`
- **Changes:**
  - `Reports.jsx`: เขียนหน้าจอรายงานใหม่ทั้งหมด แบ่งออกเป็น 3 Tabs (รายงานรับเข้า, รายงานเบิกจ่าย, รายงานยอดคงเหลือ)
  - เพิ่มระบบฟิลเตอร์สำหรับแต่ละรายงาน เช่น กรองโครงการ, ช่วงวันที่, สถานะ, ผู้จำหน่าย
  - อัปเดตฟังก์ชัน Export Excel ให้รองรับโครงสร้างข้อมูลที่ต่างกันในแต่ละรายงาน (sheetName และ exportData เปลี่ยนแปลงแบบ dynamic)
  - ปรับการส่งข้อมูลไปยัง API Export PDF เพื่อรองรับ Report ทั้ง 3 ประเภท
- **Reason:** ผู้ใช้ให้ดำเนินการพัฒนาระบบ Reports ตามที่ได้สรุปแผนไว้ (Plan 8)

## [2026-07-15 08:31]

- **Files Modified:** `CONTEXT.md`, `implementation_plan.md`
- **Changes:**
  - `CONTEXT.md`: สร้างไฟล์และเพิ่มคำศัพท์นิยามสำหรับ Reports (Stock In, Withdrawals, Stock Balance)
  - `implementation_plan.md`: ปรับปรุงโครงสร้างหัวข้อ Reports ให้แยกเป็น 3 ประเภท พร้อมระบุตัวกรองข้อมูล
- **Reason:** ผู้ใช้ต้องการแยกประเภทรายงานให้ชัดเจนระหว่างรับเข้าและเบิกจ่าย (ผ่านระบบ Grill-with-docs)

## [2026-07-14 17:35]

- **Files Modified:** `src/pages/Items.jsx`, `src/pages/History.jsx`, `src/pages/Projects.jsx`, `supabase/migrations/01_initial_schema.sql`
- **Changes:**
  - `Items.jsx`: เพิ่มปุ่มอัปโหลดรูปภาพเข้า R2 และแก้ไขบั๊ก query ข้อมูล (`.select('*')` หายไป)
  - `History.jsx`: แก้ไขบั๊ก Error 400 จากการเรียงลำดับด้วยคอลัมน์ที่ไม่มีอยู่จริง (`updated_at` -> `requested_at`)
  - `Projects.jsx`: เพิ่มช่องและแสดงผล "รหัสโครงการ (Project Code)" เพื่อรองรับรหัสอย่างเช่น `25310-9999`
  - `01_initial_schema.sql`: เพิ่มฟิลด์ `project_code` ในตาราง `projects`
- **Reason:** ผู้ใช้นำเข้าข้อมูลจาก CSV (DOPA) และต้องการผูกรหัสโครงการ + แก้ไขบั๊กจากการดึงข้อมูลที่พบระหว่างการทดสอบ

## [2026-07-14 15:10]

- **Files Modified:** `src/pages/Dashboard.jsx`, `src/pages/Projects.jsx`, `src/pages/Items.jsx`, `src/pages/Reports.jsx`, `src/components/ui/skeleton.jsx`
- **Changes:**
  - เพิ่มกราฟ (BarChart) แสดงสัดส่วนรับเข้าและเบิกจ่ายในหน้า Dashboard ด้วยไลบรารี Recharts
  - เพิ่มฟังก์ชันแก้ไขและลบข้อมูล (Edit & Delete) สำหรับ Projects และ Items
  - เพิ่มระบบป้องกันการลบข้อมูลหาก Projects/Items นั้นถูกนำไปใช้งานเบิกจ่ายแล้ว (ดัก Error Code 23503)
  - เพิ่มปุ่ม Export PDF ในหน้ารายงาน ด้วยไลบรารี jsPDF และ jspdf-autotable
  - สร้างและนำ Skeleton Loading ไปใช้งานในหน้า Dashboard เพื่อความลื่นไหลระหว่างดึงข้อมูล
- **Reason:** ดำเนินการอัปเดตฟีเจอร์ระดับสูงตามแผนงาน Phase 6

## [2026-07-14 15:00]

- **Files Modified:** `src/App.jsx`, `src/App.css`, `src/pages/Dashboard.jsx`, `src/pages/auth/Login.jsx`, `src/components/layout/Sidebar.jsx`, `Topbar.jsx`, `public/favicon.svg`, `index.html`, `.gitignore`, `supabase/migrations/01_initial_schema.sql`
- **Changes:**
  - แก้ไข `App.jsx` ให้ import หน้าจอจริงทุกหน้า (เดิมใช้ placeholder)
  - เปลี่ยน Theme จาก Dark Mode เป็น **Light Mode (โทนสีขาว)** ตลอดทั้ง App
  - ปรับ CSS variables, Sidebar, Topbar, Login, Glass effect ให้เข้ากับโทนสว่าง
  - เขียน Dashboard ใหม่ให้ดึงข้อมูลจริงจาก Supabase (projects, items, withdrawals, stock_balance)
  - แก้ไข Trigger `handle_new_user` ให้รองรับการสร้าง User จาก Supabase Dashboard (แก้ bug NOT NULL)
  - เพิ่ม `favicon.svg` แก้ปัญหา 404
  - ปรับ `.gitignore` เพิ่ม `.env`, `dist`
- **Reason:** ผู้ใช้ต้องการโทนสีขาว และเชื่อมต่อระบบกับ Supabase จริง

## [2026-07-14 14:40]

- **Files Modified:** `package.json`, `vite.config.js`, `index.html`, `.env`, `src/main.jsx`, `src/App.css`, `src/App.jsx`, `components.json`, `src/lib/utils.js`, `src/lib/supabase.js`, `src/contexts/AuthContext.jsx`, `src/components/theme-provider.jsx`, `src/components/ui/button.jsx`, `input.jsx`, `card.jsx`, `table.jsx`, `dialog.jsx`, `label.jsx`, `src/components/layout/Sidebar.jsx`, `Topbar.jsx`, `PageWrapper.jsx`, `src/pages/auth/Login.jsx`, `src/pages/Dashboard.jsx`, `supabase/migrations/01_initial_schema.sql`, `src/pages/Projects.jsx`, `src/pages/Items.jsx`, `src/pages/StockIn.jsx`, `src/pages/Withdrawals.jsx`, `src/pages/History.jsx`, `src/pages/Reports.jsx`
- **Changes:**
  - สร้างโปรเจกต์ React + Vite
  - ติดตั้งและคอนฟิก Tailwind CSS v4, shadcn/ui
  - ตั้งค่า Supabase Client, Auth Context
  - สร้างไฟล์ SQL สำหรับจัดการ Database Schema (7 tables/views)
  - สร้าง Layout Component (Sidebar, Topbar) และตั้งค่า Routing
  - สร้างหน้า Login และ Dashboard พื้นฐาน
  - สร้างหน้า Projects (จัดการโครงการ), Items (รายการวัสดุ)
  - สร้างหน้า StockIn (รับเข้า), Withdrawals (เบิกจ่าย) พร้อมระบบ Role-based access
  - สร้างหน้า History (ประวัติ) และ Reports (รายงาน Export Excel)
- **Reason:** ดำเนินการสร้างระบบ Stock Flow ต่อจนครบทุกหน้าจอตามแผนงาน
