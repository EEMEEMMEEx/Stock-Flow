---
name: Stock-Flow
description: Industrial Precision Design System for Enterprise Inventory & Material Flow
version: 1.28.13
colors:
  primary: "#4338ca"
  primary-hover: "#3730a3"
  primary-foreground: "#f8fafc"
  accent: "#0284c7"
  accent-hover: "#0369a1"
  accent-foreground: "#f8fafc"
  background: "#f8fafc"
  foreground: "#0f172a"
  card: "#ffffff"
  card-foreground: "#0f172a"
  secondary: "#f1f5f9"
  secondary-foreground: "#0f172a"
  muted: "#f1f5f9"
  muted-foreground: "#64748b"
  border: "#e2e8f0"
  input: "#e2e8f0"
  ring: "#0284c7"
  status-success: "#10b981"
  status-warning: "#f59e0b"
  status-error: "#ef4444"
  status-neutral: "#64748b"
  dark-background: "#090d16"
  dark-foreground: "#f8fafc"
  dark-card: "#141b27"
  dark-border: "#253041"
  dark-muted: "#1e293b"
  dark-muted-foreground: "#94a3b8"
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
  mono-figure:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    fontFeature: "tabular-nums"
rounded:
  none: "0px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  nudge: "2px"
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.status-error}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
    padding: "20px"
  table-cell:
    padding: "10px 14px"
    typography: "{typography.body}"
---

# Design System: Stock-Flow

## Overview

**Creative North Star: "The Precision Depot" (Industrial Telecom Precision)**

Stock-Flow ถูกออกแบบภายใต้ปรัชญา **Enterprise Industrial & Disciplined** — สถาปัตยกรรมอินเทอร์เฟซสำหรับศูนย์กระจายสินค้า พัสดุ และอุปกรณ์โทรคมนาคม/ระบบโครงข่าย (Forth Corporation Public Company Limited) ที่ต้องรองรับการปฏิบัติงานต่อเนื่องของเจ้าหน้าที่คลังสินค้าและวิศวกรสนาม

ระบบยึดหลัก **"Anti-Slop Craft"** ตามข้อกำหนด `@unslop` และ `@design-spec`:
- **Quiet Chrome:** ส่วนนำทาง, ปุ่ม, บาร์หัวเรื่อง และตารางใช้สี Neutral Ramp (Slate) นิ่งสนิท ปราศจากแสงฟุ้ง (no glows), ปราศจาก Gradient หลากสี, และไร้เงาหนาเกินจริง เพื่อให้เนื้อหาและข้อมูลสต็อกเป็นจุดสนใจหลัก
- **One Focal Element:** ในแต่ละหน้าจอจะมีจุดเด่น (Focal Point) เพียงจุดเดียว เช่น KPI Chart สรุปยอด, ตารางจัดการพัสดุหลัก, หรือ POS Cart Panel
- **Data-Dense Scanability:** ข้อมูลตัวเลข รหัสพัสดุ วันที่ และสถานะสต็อก ต้องอ่านและกวาดสายตาได้อย่างแม่นยำด้วยฟอนต์ Monospace แบบ Tabular Numbers
- **Zero Decorative Noise:** ปราศจาก Emoji Unicode ใน UI โดยสิ้นเชิง ใช้ไอคอน 100% Vector SVG (`lucide-react`) ขนาดและเส้นขีดสม่ำเสมอ

---

## Colors

ระบบสีของ Stock-Flow วางอยู่บนโทนสุขุมของ Slate Neutral Ramp ผสานกับ Primary Enterprise Indigo และ Sky Blue Accent:

### 1. Neutral Ramp (Slate System)
- **Base Canvas (Light):** `#f8fafc` (`slate-50`) — พื้นหลังสะอาดตา สบายตาเมื่อทำงานต่อเนื่องหลายชั่วโมง
- **Base Canvas (Dark):** `#090d16` — ถ่านชาร์โคลลึก ลดแสงจ้าในสภาพแสงน้อย
- **Elevated Card (Light):** `#ffffff` (`card`) — พื้นหลังการ์ด ตาราง โมดอล ตัดขอบ 1px คมชัด
- **Elevated Card (Dark):** `#141b27` (`dark-card`) — พื้นหลังยกตัวใน Dark Mode
- **Crisp Structural Border:** `#e2e8f0` (`slate-200`) ใน Light, `#253041` ใน Dark — เส้นขอบ Hairline 1px สำหรับกั้นแบ่งสัดส่วน
- **Typography Scale:**
  - *Primary Text:* `#0f172a` (`slate-900`) ใน Light, `#f8fafc` (`slate-50`) ใน Dark
  - *Secondary / Muted Text:* `#64748b` (`slate-500`) ใน Light, `#94a3b8` (`slate-400`) ใน Dark (ผ่านเกณฑ์ WCAG AA ≥ 4.5:1)

### 2. Primary & Accent Colors
- **Enterprise Indigo (`#4338ca` / `indigo-700`):** สีแบรนด์หลักของระบบ ใช้สำหรับ Action สำคัญอันดับหนึ่ง (Submit, Primary Buttons, Active Rail)
- **Precision Sky Blue (`#0284c7` / `sky-600`):** สี Accent สำหรับเน้นจุดข้อมูลสำคัญ เช่น แถบชาร์ตเดี่ยว, โฟกัสริง, ลิงก์ดาวน์โหลดเอกสาร PDF

### 3. Functional Status Semantics
- **Signal Emerald (`#10b981` / `emerald-500`):** สต็อกปกติ, อนุมัติแล้ว (Approved), พร้อมใช้งาน (Completed)
- **Signal Amber (`#f59e0b` / `amber-500`):** คำขอรออนุมัติ (Pending), สต็อกใกล้หมด, คำเตือน Shortage
- **Signal Rose (`#ef4444` / `rose-500`):** สินค้าชำรุด (Damaged), ปฏิเสธ (Rejected), ยกเลิกคำขอ (Cancelled)
- **Neutral Slate (`#64748b` / `slate-500`):** ยืมไม่กำหนดเวลา (Indefinite Loan), สินค้าทดแทน (Consumed), แบบร่าง (Draft)

### Named Rules:
- **The Zero-Purple-Slop Rule:** ห้ามใช้สีม่วง (`purple`, `fuchsia`, `violet`) แบบสุ่มตกแต่งหรือใช้กับป้ายสถานะที่ไม่เกี่ยวข้องกับแบรนด์
- **The Monochrome Chart Rule:** ชาร์ตสถิติหลักต้องใช้คู่สี Accent เดียว (`#0284c7`) เป็นตัวนำ หรือใช้คู่สี Semantic ที่มีความหมายชัดเจน ห้ามใช้ชาร์ตรุ้งหลากสี

---

## Typography

ระบบตัวอักษรผสานความชัดเจนของภาษาไทยและตัวเลขทางบัญชี/พัสดุ:
- **UI & Prose Font:** `Sarabun`, `Inter`, `sans-serif`
- **Numbers, Barcodes & Currencies:** `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, `monospace` พร้อมคุณสมบัติ `tabular-nums`

### Hierarchy & Scale:
| Role | Size | Weight | Line Height | Use Case |
|---|---|---|---|---|
| **Display** | 30px (`1.875rem`) | 700 (Bold) | 1.2 | Page Header, Landing Hero Title |
| **Headline** | 24px (`1.5rem`) | 600 (Semibold) | 1.3 | Section Titles, Modal Headers |
| **Title** | 18px (`1.125rem`) | 600 (Semibold) | 1.4 | Card Titles, Table Group Headers |
| **Body** | 14px (`0.875rem`) | 400 (Regular) | 1.6 | Table Data, Form Labels, Prose |
| **Label / Micro** | 12px (`0.75rem`) | 600 (Semibold) | 1.4 | Badges, Table Headers, Form Help |
| **Mono Metric** | 14px–20px | 600 / 700 | 1.2 | Stock Balances, Quantities, Serial Numbers |

### Named Rules:
- **The Tabular Figures Rule:** ตัวเลขทั้งหมดที่ใช้ในตาราง, บัตร KPI, จำนวนสต็อก, ราคา และรหัสพัสดุ **ต้อง** มีคลาส `font-mono tabular-nums` เสมอ และจัดตำแหน่งชิดขวา (`text-right`) ในตาราง
- **The Sentence Case Rule:** ป้ายกำกับ, หัวข้อ, และเมนูทั้งหมดต้องใช้ Sentence case (เช่น `Navigation`, `Current inventory`) ห้ามใช้ ALL-CAPS แบบ Wide-Tracking (`NAVIGATION`)

---

## Layout

ระบบ Layout แบบ Responsive Industrial Shell ยึดกริด 4px:
- **4px Spacing Grid:** ค่า Padding, Margin, Gap, และความสูงทั้งหมดต้องหารด้วย 4 ลงตัว (เช่น 4, 8, 12, 16, 20, 24, 32, 40, 48px) อนุญาตให้ใช้ 2px เฉพาะการ Nudge ขยับองค์ประกอบภายในคอนโทรลขนาดจิ๋ว
- **Desktop Shell:**
  - Sidebar นำทางด้านซ้าย: พับเป็น Rail 64px (`w-16`) หรือขยายเต็ม 256px (`w-64`)
  - Topbar ความสูงคงที่ 64px (`h-16`) พร้อมเส้นขอบล่าง 1px
  - Content Container จำกัดความกว้างสูงสุดที่ 1536px (`max-w-384`) กึ่งกลางจอ
- **Density Rules:**
  - Dense Navigation: ความสูงแถว 32px–36px, ระยะห่างระหว่างไอคอนและป้ายกำกับ 8px คงที่
  - Master Tables: ระยะเว้นบรรทัดเซลล์ 10px–12px เพื่อให้อ่านข้อมูลได้หลายสิบแถวในหนึ่งหน้าจอ

---

## Elevation & Depth

มิติของ Stock-Flow เกิดจาก **Structural Borders** และ **Tonal Step Layering**:
- **Borders over Shadows:** องค์ประกอบทุกชิ้น (Cards, Inputs, Modals, Panels) แยกชั้นด้วยเส้นขอบ Hairline 1px (`border-border`) เป็นหลัก
- **Soft Minimal Shadows:**
  - At-Rest: `shadow-xs` หรือ `shadow-sm`
  - Interactive Hover: `shadow-md` (ไม่มีเงานีออนหรือเงาสี)
  - Modal Overlays: `shadow-lg` ร่วมกับ `bg-black/50 backdrop-blur-xs`
- **Zero Glassmorphism:** ห้ามใช้ `backdrop-blur-xl`, `bg-card/40` หรือเอฟเฟกต์กระจกฝ้าหนาที่ทำให้ตัวอักษรเบลอและเสียคอนทราสต์

---

## Shapes

รูปทรงเรขาคณิตมีระเบียบและใช้สูตร Nested Radius:
- **Nested Radius Arithmetic:** รัศมีขอบในเท่ากับรัศมีขอบนอกลบด้วยระยะเว้นขอบ ($R_{inner} = R_{outer} - Padding$) โดยไม่น้อยกว่า 4px
- **Interactive Controls:** 8px (`rounded-lg` หรือ `rounded-md`) สำหรับ Buttons, Inputs, Dropdowns
- **Content Cards:** 12px–16px (`rounded-xl`)
- **Status Chips & Pills:** 6px–8px (`rounded-md` หรือ `rounded-lg`) สำหรับป้ายข้อมูล, ห้ามทำเป็น Capsule Pill ลอยๆ ทุกจุด

---

## Components

### 1. Buttons
- **Primary:** `bg-primary text-primary-foreground h-9 px-4 rounded-lg font-semibold shadow-xs hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Outline / Ghost:** `border border-border/80 bg-background hover:bg-muted text-foreground h-9 px-4 rounded-lg font-semibold`
- **Destructive:** `bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 px-4 rounded-lg`

### 2. Master Tables (`Items.jsx`, `StockIn.jsx`, `Withdrawals.jsx`)
- **Header:** `bg-muted/80 text-muted-foreground font-semibold text-xs py-2.5 px-3`
- **Row:** `border-b border-border/40 hover:bg-muted/40 transition-colors`
- **Numbers Column:** `font-mono tabular-nums text-right font-semibold`
- **Actions Column:** ชิดขวา รวมปุ่มขนาดกะทัดรัด `h-8 px-2`

### 3. Status Badges (`StatusBadge.jsx`)
- **Visuals:** ไอคอน Vector SVG ขนาด 14px–16px พร้อมพื้นหลังโปร่งแสง 10% และเส้นขอบ 20%
- **Motion:** ปราศจาก `animate-ping` หรือ `animate-pulse` ที่กะพริบไม่หยุดนิ่ง

### 4. Stat Cards (KPIs)
- **Structure:** ป้ายชื่อตัวเล็ก, ตัวเลขขนาดใหญ่ `text-xl font-bold font-mono tabular-nums`, และบริบทเปรียบเทียบ (เช่น `vs last month`)
- **Anti-Slop:** ห้ามใส่ Sparkline หรือชาร์ตแท่งจิ๋วเป็นของประดับ ห้ามใส่ `group-hover:scale-105`

---

## Do's and Don'ts

### Do:
1. **Do** ใช้ `font-mono tabular-nums` สำหรับตัวเลข วันที่ รหัสสต็อก และจำนวนเงินทุกจุดในระบบ
2. **Do** รักษาระยะ Spacing บน 4px Grid System เสมอ
3. **Do** ตรวจสอบคอนทราสต์ของข้อความและพื้นหลังให้ผ่านเกณฑ์ WCAG AA (≥ 4.5:1) ทุกกรณี
4. **Do** ใช้ไอคอน Vector SVG จาก `lucide-react` เท่านั้น ขนาดมาตรฐาน 14px–16px เส้นขีด 1.5–2px
5. **Do** ให้ความสำคัญกับ Data Scanability และความเร็วในการปฏิบัติงานของเจ้าหน้าที่คลังสินค้า
6. **Do** ใช้เส้นขอบ 1px (`border-border`) เพื่อแบ่งแยกบล็อกข้อมูลแทนการใช้เงาฟุ้ง

### Don't:
1. **Don't** ใส่ Gradient สีม่วง ชมพู หรือ Rainbow Gradient บนพื้นหลัง ตัวอักษร หรือ Avatar
2. **Don't** ใช้อนิเมชันวนซ้ำไร้ประโยชน์ เช่น `animate-pulse`, `animate-ping`, หรือ Bouncy Hover Scale (`hover:scale-105`)
3. **Don't** ใส่อิโมจิ Unicode (📦, 🚀, ✨, ⚠️) ในส่วนของอินเทอร์เฟซ, ปุ่ม, หรือป้ายข้อความ
4. **Don't** ใช้ชาร์ตสีรุ้งโดยไม่มีเหตุผลทางข้อมูล ชาร์ตเดี่ยวต้องใช้ Accent Blue (`#0284c7`) เสมอ
5. **Don't** ใช้ข้อความโอ้อวด (Hype words) เช่น `Supercharged`, `Magic AI`, `Game-changing` ในเอกสารหรือระบบ
6. **Don't** ใช้ Glassmorphism หรือ Backdrop Blur หนาๆ ที่ทำให้ตัวอักษรสูญเสียความคมชัด
