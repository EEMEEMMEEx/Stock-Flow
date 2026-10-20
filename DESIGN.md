---
name: Stock-Flow
description: Enterprise Inventory & Material Flow OS
colors:
  primary: "#4338ca"
  primary-foreground: "#f8fafc"
  background: "#f8fafc"
  foreground: "#0f172a"
  card: "#ffffff"
  card-foreground: "#0f172a"
  secondary: "#f1f5f9"
  secondary-foreground: "#0f172a"
  muted: "#f1f5f9"
  muted-foreground: "#5b6a7e"
  accent: "#eef2f6"
  accent-foreground: "#0f172a"
  destructive: "#dc2626"
  destructive-foreground: "#f8fafc"
  border: "#e2e8f0"
  input: "#e2e8f0"
  ring: "#4338ca"
  status-success: "#059669"
  status-warning: "#d97706"
  status-error: "#e11d48"
  dark-background: "#090d16"
  dark-foreground: "#f8fafc"
  dark-card: "#141b27"
  dark-border: "#253041"
typography:
  display:
    fontFamily: "Sarabun, Inter, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "Sarabun, Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Sarabun, Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Sarabun, Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Sarabun, Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#3730a3"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System: Stock-Flow

## Overview

**Creative North Star: "The Precision Depot"**

Stock-Flow ถูกออกแบบภายใต้ปรัชญา **Enterprise Industrial & Disciplined** — พื้นที่ทำงานดิจิทัลของศูนย์กระจายสินค้าและคลังพัสดุระดับองค์กรขนาดใหญ่ (Forth Corporation Public Company Limited) ที่ต้องการความแม่นยำสูงสุด รวดเร็ว ไร้ความคลุมเครือ และรองรับภาระงานหนัก (Heavy Operational Load) ทุกองค์ประกอบบนหน้าจอมีหน้าที่ชัดเจน (Purpose-Driven) ปราศจากการตกแต่งที่ฟุ่มเฟือยหรือลูกเล่นการตลาดที่ไม่จำเป็น

การออกแบบผสานความคล่องตัวของสถานีเบิกจ่ายหน้าร้าน (POS Terminal) เข้ากับความสุขุมรอบคอบของระบบจัดการคลังและวิศวกรรมภาคสนาม ใน Light Mode ระบบใช้มิติ Soft Tactical Layering ที่มีเส้นขอบคมชัด (1px crisp border) เงาบางเบาที่ให้สัมผัสจับต้องได้ และใน Dark Mode เลือกใช้พื้นหลัง Deep Charcoal ตัดกับแผ่น Card ที่ลอยตัวอย่างชัดเจน เพื่อลดความล้าของสายตาเมื่อใช้งานในสภาพแสงน้อย

**Key Characteristics:**
- **Strictly Purpose-Driven:** ทุกพิกเซลมีเหตุผลเพื่อการปฏิบัติงาน ข้อมูลตารางและรหัสพัสดุต้องสแกนสายตาได้ทันที (High Scanability)
- **Soft Tactical Layering:** มิติของวัตถุเกิดจากการซ้อนทับระดับเฉดสีและเส้นขอบ 1px เป็นหลัก เงาทำหน้าที่เพียงบอกสถานะสัมผัส
- **Pure Vector Fidelity:** ไอคอนทั้งหมดในระบบเป็น 100% Vector SVG ผ่าน Lucide React ปราศจาก Unicode Emojis โดยเด็ดขาด
- **Dual Script Harmony:** จัดจังหวะช่องไฟและ Line-height ให้ข้อความภาษาไทย (Sarabun) และอังกฤษ (Inter) แสดงผลคู่กันได้อย่างสมดุล

## Colors

ระบบสีของ Stock-Flow วางอยู่บนโทนสุขุมของ Enterprise Indigo ตัดกับ Slate Neutral Palette โดยแบ่งแยกบทบาทของสีไว้อย่างเด็ดขาดเพื่อป้องกันการรบกวนสายตาของผู้ปฏิบัติงาน

### Primary
- **Enterprise Indigo** (`#4338ca` / `hsl(242 82% 60%)`): สีประจำตัวของระบบ ใช้สำหรับ Action สำคัญอันดับหนึ่ง (Primary Buttons, Active Nav Rail, Links, Selection Rings) สื่อถึงความน่าเชื่อถือทางวิศวกรรมและเทคโนโลยี
- **Indigo Contrast Foreground** (`#f8fafc` / `hsl(210 40% 98%)`): สีตัวอักษรสีขาวสว่างบนพื้นหลัง Indigo ผ่านเกณฑ์คอนทราสต์ WCAG AAA

### Secondary & Accent
- **Slate Secondary** (`#f1f5f9` / `hsl(210 40% 96.1%)`): พื้นหลังปุ่มรอง แถบฟิลเตอร์ และแถบส่วนหัวของตาราง
- **Tactical Accent** (`#eef2f6` / `hsl(210 40% 94%)`): สีพื้นผิวเมื่อเกิด Hover บนปุ่มหรือเมนูรายการ

### Status Accents
- **Signal Emerald** (`#059669` / `emerald-600`): สำหรับสถานะ "Approved", "Completed", และความพร้อม 100% ของชุด BOM
- **Signal Amber** (`#d97706` / `amber-600`): สำหรับสถานะ "Pending", คำขอรออนุมัติ, และคำเตือนสต็อกไม่พอ (Shortage)
- **Signal Rose / Destructive** (`#dc2626` / `hsl(0 84.2% 48.5%)`): สำหรับสถานะ "Rejected", ปุ่มลบรายการ, ยกเลิกบิล และข้อผิดพลาด

### Neutral
- **Clean Slate Mist (Light Background)** (`#f8fafc` / `hsl(210 20% 98%)`): พื้นหลังแอปพลิเคชันหลัก สบายตา ไม่สะท้อนแสงจ้า
- **Deep Tactical Charcoal (Dark Background)** (`#090d16` / `hsl(222.2 47.4% 8%)`): พื้นหลังโหมดมืดลึก ช่วยขับข้อมูลให้เด่นชัด
- **Elevated White Card (Light)** (`#ffffff` / `hsl(0 0% 100%)`): พื้นหลังการ์ด ตาราง และโมดอลในโหมดสว่าง
- **Elevated Slate Card (Dark)** (`#141b27` / `hsl(222.2 40% 13%)`): พื้นหลังการ์ดในโหมดมืด
- **Crisp Structural Border** (`#e2e8f0` / `hsl(214.3 31.8% 91.4%)` ใน Light, `#253041` ใน Dark): เส้นขอบ 1px สำหรับแบ่งบล็อกโครงสร้าง
- **Muted Slate Typography** (`#5b6a7e` / `hsl(215.4 16.3% 44%)`): สีข้อความคำอธิบายรอง ผ่านเกณฑ์ WCAG AA 4.81:1

### Named Rules
**The Pure Vector Rule.** ทุกสัญลักษณ์ ไอคอน และการแสดงสถานะในระบบต้องใช้ Vector SVG ผ่าน `lucide-react` เท่านั้น ห้ามใช้อิโมจิ Unicode ใน UI โดยเด็ดขาด เพื่อคงความน่าเชื่อถือระดับ Enterprise
**The Single Accent Rule.** สี Primary Enterprise Indigo ต้องใช้ไม่เกิน 15% ของพื้นที่หน้าจอทั้งหมด จุดเด่นของสีเน้นคือการนำสายตาไปยัง Action ถัดไป ไม่ใช่การแต่งแต้มรอบจอ
**The High Contrast Baseline Rule.** ทุกคู่สีข้อความและพื้นหลังต้องผ่านเกณฑ์ WCAG AA (≥ 4.5:1 สำหรับข้อความปกติ และ ≥ 3.0:1 สำหรับข้อความขนาดใหญ่) เสมอ

## Typography

**Display & Headline Font:** Sarabun, Inter, sans-serif
**Body & UI Controls Font:** Sarabun, Inter, sans-serif
**Numeric & Code Font:** Inter, ui-monospace, monospace

**Character:** การประกบคู่ระหว่างฟอนต์ Sarabun ซึ่งเป็นฟอนต์ทางการสำหรับภาษาไทยที่อ่านง่ายในขนาดเล็ก กับ Inter ซึ่งเป็นฟอนต์มาตรฐานของ UI สากล ทำให้ระบบอ่านสบายตา ไม่ติดขัด ทั้งในหน้า Dashboard ที่เต็มไปด้วยตัวเลข และหน้าแบบฟอร์มเอกสารใบเบิกพัสดุ

### Hierarchy
- **Display** (Bold 700, `1.875rem` / 30px, Line-height 1.2): ใช้สำหรับหัวข้อหลักของหน้า (Page Title) และตัวเลขสถิติภาพรวมขนาดใหญ่
- **Headline** (Semi-bold 600, `1.5rem` / 24px, Line-height 1.3): ใช้สำหรับหัวข้อการ์ดสำคัญ (Section Headers, Modal Titles)
- **Title** (Semi-bold 600, `1.125rem` / 18px, Line-height 1.4): ใช้สำหรับหัวข้อกลุ่มย่อย ชื่อตาราง และชื่อการ์ดพัสดุ
- **Body** (Regular 400 / Medium 500, `0.875rem` / 14px, Line-height 1.6): ใช้สำหรับเนื้อหาหลัก ข้อมูลในแถวตาราง และคำอธิบาย
- **Label** (Semi-bold 600, `0.75rem` / 12px, Line-height 1.4, Letter-spacing 0.02em): ใช้สำหรับป้ายกำกับฟิลด์ (Input Labels), Badges, และปุ่มขนาดเล็ก

### Named Rules
**The Dual Script Rhythm Rule.** ข้อความที่มีภาษาไทยต้องกำหนด `line-height: 1.6` และ `letter-spacing: 0.01em` เสมอ เพื่อป้องกันสระและวรรณยุกต์ชนกับบรรทัดถัดไป
**The Tabular Numbers Rule.** ตัวเลขรหัสพัสดุ จำนวนสต็อก ราคา และยอดคงเหลือในตารางต้องแสดงผลด้วย `font-variant-numeric: tabular-nums` เพื่อให้ตัวเลขตรงหลักกันในแนวตั้ง

## Layout

ระบบ Layout ของ Stock-Flow เป็นแบบ Responsive Operational Shell ที่ปรับตัวตามอุปกรณ์และบริบทการใช้งาน:

- **Global Shell (`PageWrapper`):** หน้าจอความสูงเต็ม `100dvh` แบบ `overflow-hidden` ป้องกันการเลื่อนหลุดกรอบ แบ่งพื้นที่เป็น Sidebar นำทางด้านซ้าย และเนื้อหาหลักทางขวา
- **Navigation Rail / Drawer:**
  - *Desktop (≥ 768px):* Sidebar สามารถย่อเป็น Rail ขนาดบาง 64px (`w-16`) แสดงเฉพาะไอคอนพร้อม Tooltip หรือขยายเต็ม 256px (`w-64`) พร้อมจดจำสถานะผ่าน `localStorage`
  - *Mobile / Tablet (< 768px):* ซ่อนเป็น Off-canvas Drawer เลื่อนเปิดจากซ้ายพร้อม Backdrop Overlay และ Focus Trap
- **Top Navigation Bar (`Topbar`):** ความสูงคงที่ 64px (`h-16`) ขึงชิดขอบบนพร้อมเส้นขอบล่าง 1px เป็นจุดศูนย์รวมปุ่มสลับคลัง (Warehouse Selector), ศูนย์แจ้งเตือนด่วน (`NotificationBell`), ตัวสลับธีม/ภาษา และโปรไฟล์
- **Content Container:** ความกว้างสูงสุดจำกัดที่ `max-w-384` (1536px) กึ่งกลางหน้าจอ พร้อมระยะเว้นขอบแบบก้าวหน้า: `p-3` (มือถือ), `sm:p-4`, `md:p-6`, `lg:p-8`

## Elevation & Depth

Stock-Flow ใช้หลักการ **Soft Tactical Layering** — มิติความลึกไม่ได้เกิดจากเงาฟุ้งขนาดใหญ่ แต่เกิดจากการตัดกันของพื้นผิวและเส้นขอบเฉียบคม

- **พื้นผิวระนาบหลัก (Base Canvas):** อยู่ที่ระดับล่างสุดด้วยสี `--background` (`#f8fafc` ใน Light / `#090d16` ใน Dark)
- **การ์ดและตาราง (Surfaces):** ยกตัวขึ้นด้วยสี `--card` (`#ffffff` ใน Light / `#141b27` ใน Dark) ตัดขอบด้วยเส้น 1px `--border` ที่มองเห็นได้ชัดเจน
- **เงาตอบสนองสถานะ (State Shadows):** เงาถูกจำกัดไว้ที่ `box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)` (`shadow-xs`) สำหรับปุ่มและการ์ด และจะขยายขึ้นเป็น `shadow-md` เฉพาะเมื่อมี Interaction (Hover หรือลากวาง)
- **โอเวอร์เลย์และโมดอล (Overlays):** ชั้น Dialog และ Sheet ใช้เงาความลึกระดับ `shadow-2xl` ร่วมกับฉากหลังโปร่งแสง `backdrop-blur-sm bg-black/50` เพื่อดึงความสนใจของผู้ใช้มาที่งานตรงหน้า

### Named Rules
**The Border Definition Rule.** ทุกการ์ด อินพุต และโมดอลต้องมีเส้นขอบ 1px ชัดเจน ห้ามพึ่งพาเงาฟุ้งเพียงอย่างเดียวในการแยกขอบเขตขององค์ประกอบ
**The Grounded Rest Rule.** วัตถุที่ไม่ได้ถูกกระทำ (At Rest) จะมีมิติเงาที่สงบนิ่งและแนบชิดพื้นผิว เงาจะลอยขึ้นเฉพาะเมื่อผู้ใช้แตะหรือชี้เมาส์เท่านั้น

## Shapes

รูปทรงเรขาคณิตของ Stock-Flow สื่อถึงความทนทาน มีระเบียบ และหยิบจับง่ายแบบอุปกรณ์ช่างอุตสาหกรรม:

- **Small Controls & Badges (`rounded-sm` - 6px):** ใช้กับ Status Badges, Tooltips, ป้าย Tag โครงการ, และปุ่มขนาดกะทัดรัด
- **Default Interactive Elements (`rounded-md` - 8px / `--radius`):** ใช้กับ Button ปกติ, Input Fields, Select Dropdowns, Checkboxes
- **Surface Containers (`rounded-lg` - 12px / `rounded-xl` - 16px):** ใช้กับการ์ดเนื้อหา (Content Cards), โมดอล (Dialogs), และบานหน้าต่างเลื่อน (Drawers)
- **Indicator Dots (`rounded-full`):** ใช้กับจุดแสดงสถานะความพร้อม (UserStatusDot, Indicator Dots ในตาราง)

## Components

### Buttons
- **Shape:** มนพอดี 8px (`rounded-md` หรือ `rounded-lg`)
- **Primary:** พื้นหลัง Enterprise Indigo (`#4338ca`), ตัวอักษรสีขาว, เงา `shadow-xs`, ความสูงมาตรฐาน 36px (`h-9 px-4`) หรือ 40px (`h-10 px-6` สำหรับปุ่ม Action หลัก)
- **Hover / Focus:** เปลี่ยนเฉดสีเข้มขึ้น (`hover:bg-primary/90`), แสดง Focus Ring 2px สี Indigo พร้อม Ring Offset 2px
- **Secondary / Ghost:** พื้นหลัง Slate 100 ในโหมดสว่าง ตัวอักษรสีเข้ม หรือโปร่งใสสำหรับปุ่ม Ghost พร้อม Hover สลับสีนุ่มนวล

### Cards / Containers
- **Corner Style:** มุมมน 12px ถึง 16px (`rounded-xl`)
- **Background:** สีขาวบริสุทธิ์ (`bg-card`) ใน Light, Slate เข้มลึก (`#141b27`) ใน Dark
- **Border:** เส้นขอบ 1px สี `--border` สม่ำเสมอรอบทิศทาง
- **Padding:** 20px บนมือถือ ขยายเป็น 24px บนเดสก์ท็อป (`p-5 sm:p-6`)

### Inputs / Search Fields
- **Style:** ความสูง 36px (`h-9`), เส้นขอบ 1px สี `--input`, พื้นหลัง `--background`, Padding แนวนอน 12px (`px-3`)
- **Focus:** ขอบเปลี่ยนสีตามโทน Ring พร้อม Focus Ring ชัดเจน ไม่ขยายขนาดกล่อง
- **Autofill Protection:** ป้องกันสีพื้นหลังเหลืองของเบราว์เซอร์ด้วยการใช้ Inset Box-Shadow สีพื้นหลังของแอป

### Status Badges (`StatusBadge.jsx`)
- **Style:** ทรงกลมกะทัดรัด (`w-7 h-7`), เส้นขอบสีเดียวกับสัญลักษณ์แต่โปร่งแสง 30%, พื้นหลังสีจาง 10%
- **Icon Only:** ภายในบรรจุเฉพาะไอคอน Vector SVG พร้อมข้อความแบบ `sr-only` และ Tooltip เพื่อการเข้าถึง (Accessibility)
- **Variants:**
  - *Approved / Completed:* สีเขียว Emerald (`CheckCircle2`)
  - *Pending / Shortage:* สีส้ม Amber (`Clock` หรือ `AlertTriangle`) พร้อมลูกเล่นกะพริบเบาๆ (`animate-pulse`) เมื่อเป็น Pending
  - *Rejected:* สีแดง Rose (`XCircle`)
  - *Cancelled:* สีเทา Slate (`Ban`)

### Navigation Rail & Tabs
- **Sidebar Nav Link:** ความสูง 40px (`py-2.5 px-3`), มุมมน 8px, มีแถบสี Indigo กว้าง 4px นูนชิดขอบซ้ายเมื่อเป็น Active Link
- **Notification Hub (`NotificationBell`):** กล่อง Popover กว้าง 380px แสดงรายการแจ้งเตือนคำขอเบิก แบ่งแท็บ "All", "Unread", "Action Required" พร้อมปุ่ม Quick Approval ทันทีในการ์ด

## Do's and Don'ts

### Do:
- **Do** ใช้ไอคอน Vector SVG จาก `lucide-react` เท่านั้นสำหรับทุกองค์ประกอบอินเทอร์เฟซ
- **Do** ตรวจสอบให้ข้อความทุกจุดผ่านเกณฑ์ WCAG AA Contrast (4.5:1) เสมอ
- **Do** ใช้ `tabular-nums` กับตัวเลขสต็อก ยอดเบิกจ่าย และรหัสเอกสารทุกครั้ง
- **Do** ให้ความสำคัญกับสถานะ Loading, Empty State, และ Error State ของทุกหน้าจอ
- **Do** ใช้เส้นขอบ 1px ควบคู่กับเงาเบาบาง เพื่อสร้างความชัดเจนในโครงสร้างหน้าจอ

### Don't:
- **Don't** ใส่อิโมจิ Unicode (เช่น 📦, 🚀, ⚠️) ในส่วนของ UI, ไอคอนปุ่ม, หรือป้ายสถานะโดยเด็ดขาด
- **Don't** ใช้สีฉูดฉาดหรือสีสะท้อนแสงโดยไม่มีความหมายเชิงฟังก์ชันกำกับ
- **Don't** สร้างปุ่มหรืออินพุตที่ไม่มี Focus State หรือมองไม่เห็นเส้น Focus Ring ขณะนำทางด้วยคีย์บอร์ด
- **Don't** ใช้เงาฟุ้งขนาดใหญ่แบบแอปโซเชียลมีเดียที่ทำให้องค์ประกอบดูเบลอหรือไม่มั่นคง
- **Don't** แก้ไขสีพื้นหลังโดยตรงแบบ Hardcoded (เช่น `bg-blue-600`) ให้ใช้โทเค็นของระบบเสมอ (`bg-primary`)
