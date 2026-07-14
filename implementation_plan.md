# Stock Flow App — ระบบจัดการ Stock วัสดุโครงการ

ระบบ Web Application สำหรับจัดการ Stock ของวัสดุ/อุปกรณ์ที่สั่งซื้อมาสำหรับติดตั้งโครงการ โดยรองรับการเบิกจ่ายจาก Admin ไปยังทีมงานติดตั้ง พร้อม Dashboard สรุปยอดและประวัติการเบิกจ่าย

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + React Router v6 |
| Styling | CSS Variables + Modern CSS (glassmorphism, animations) |
| State Management | React Context + useReducer |
| Backend & Auth | Supabase (PostgreSQL + Auth + RLS) |
| Export | jsPDF + SheetJS (xlsx) |
| Icons | Lucide React |
| Charts | Recharts |

---

## Database Schema (Supabase PostgreSQL)

```sql
-- 1. Profiles (เก็บข้อมูล user เพิ่มเติมจาก auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Projects (โครงการ)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Categories (หมวดหมู่สินค้า)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Items (รายการสินค้า/วัสดุ Master)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category_id UUID REFERENCES categories(id),
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Stock Entries (รับเข้า Stock แต่ละโครงการ)
CREATE TABLE stock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  item_id UUID NOT NULL REFERENCES items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2),
  supplier TEXT,
  po_number TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Withdrawals (เบิกจ่าย Stock)
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  item_id UUID NOT NULL REFERENCES items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  purpose TEXT,
  notes TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 7. View: Stock คงเหลือแต่ละโครงการ
CREATE VIEW stock_balance AS
SELECT 
  se.project_id,
  se.item_id,
  i.name AS item_name,
  i.unit,
  p.name AS project_name,
  COALESCE(SUM(se.quantity), 0) AS total_in,
  COALESCE((
    SELECT SUM(w.quantity) 
    FROM withdrawals w 
    WHERE w.project_id = se.project_id 
    AND w.item_id = se.item_id 
    AND w.status IN ('approved', 'completed')
  ), 0) AS total_out,
  COALESCE(SUM(se.quantity), 0) - COALESCE((
    SELECT SUM(w.quantity) 
    FROM withdrawals w 
    WHERE w.project_id = se.project_id 
    AND w.item_id = se.item_id 
    AND w.status IN ('approved', 'completed')
  ), 0) AS balance
FROM stock_entries se
JOIN items i ON i.id = se.item_id
JOIN projects p ON p.id = se.project_id
GROUP BY se.project_id, se.item_id, i.name, i.unit, p.name;
```

> [!IMPORTANT]
> จะตั้งค่า Row Level Security (RLS) เพื่อ:
> - **Admin**: เข้าถึงทุกข้อมูล, สร้าง/แก้ไข/ลบได้ทุกอย่าง, อนุมัติเบิกจ่ายได้
> - **Staff**: ดูข้อมูลโครงการตัวเอง, สร้างคำขอเบิกจ่ายได้, ดูประวัติตัวเองได้

---

## User Review Required

> [!WARNING]
> **Supabase Project**: ผู้ใช้จะต้องสร้าง Supabase Project เองก่อน แล้วนำ `SUPABASE_URL` และ `SUPABASE_ANON_KEY` มาใส่ในไฟล์ `.env` ของโปรเจกต์ (ผมจะเตรียม `.env.example` ให้)

> [!IMPORTANT]
> **การสร้าง Database**: ผมจะเตรียมไฟล์ SQL migration ให้ ผู้ใช้นำไปรันใน Supabase SQL Editor เพื่อสร้าง tables ทั้งหมด

---

## Open Questions

> [!IMPORTANT]
> 1. **ต้องการรองรับรูปภาพสินค้าหรือไม่?** — หากต้องการ จะใช้ Supabase Storage สำหรับ upload รูป
> 2. **ต้องการ Notification เมื่อมีคำขอเบิกจ่ายใหม่หรือไม่?** — เช่น Email notification หรือ in-app notification
> 3. **หน่วยของสินค้ามีอะไรบ้าง?** — เช่น ชิ้น, ม้วน, กล่อง, เมตร, กก. เป็นต้น (จะทำเป็น dropdown ให้เลือก)

---

## Proposed Changes

### Frontend Application Structure

#### [NEW] Project Setup (React + Vite)

```
d:\APP\Stock-Flow-app\
├── public/
├── src/
│   ├── assets/              # รูปภาพ, fonts
│   ├── components/           # Reusable UI Components
│   │   ├── ui/               # Button, Input, Modal, Card, Badge, Table
│   │   ├── layout/           # Sidebar, Header, PageWrapper
│   │   └── charts/           # DashboardChart, StockBarChart
│   ├── contexts/             # AuthContext, ThemeContext
│   ├── hooks/                # useAuth, useProjects, useStock, useWithdrawals
│   ├── lib/                  # supabase.js (client init)
│   ├── pages/                # หน้าหลักทั้งหมด
│   │   ├── auth/             # Login, Register
│   │   ├── Dashboard.jsx     # หน้า Dashboard สรุปยอด
│   │   ├── Projects.jsx      # จัดการโครงการ
│   │   ├── ProjectDetail.jsx # รายละเอียดโครงการ + Stock
│   │   ├── StockIn.jsx       # รับเข้า Stock
│   │   ├── Withdrawals.jsx   # เบิกจ่าย Stock
│   │   ├── History.jsx       # ประวัติการเบิกจ่าย
│   │   ├── Items.jsx         # จัดการรายการสินค้า Master
│   │   └── Reports.jsx       # รายงาน + Export
│   ├── utils/                # helpers, formatters, export functions
│   ├── App.jsx               # Router + Layout
│   ├── App.css               # Global styles + Design system
│   └── main.jsx              # Entry point
├── supabase/
│   └── migrations/           # SQL migration files
├── .env.example
├── package.json
├── vite.config.js
└── index.html
```

---

### หน้าจอหลัก (Pages)

#### 1. Login Page
- Email/Password login
- แยก role จาก `profiles.role`
- UI: Glassmorphism card, gradient background, animated

#### 2. Dashboard (หน้าหลัก)
- **Admin**: เห็นสรุปทุกโครงการ
  - จำนวนโครงการทั้งหมด / Active
  - มูลค่า Stock ทั้งหมด
  - จำนวนรายการรอเบิก (pending)
  - กราฟแท่ง Stock แต่ละโครงการ
  - กิจกรรมล่าสุด (Recent Activity)
- **Staff**: เห็นเฉพาะโครงการที่เกี่ยวข้อง

#### 3. Projects (จัดการโครงการ)
- CRUD โครงการ (Admin only)
- แสดงรายการโครงการแบบ Card Grid
- สถานะ: Active / Completed / Cancelled
- คลิกเข้าดูรายละเอียด Stock แต่ละโครงการ

#### 4. Stock In (รับเข้า Stock)
- ฟอร์มบันทึกรับเข้าวัสดุ: เลือกโครงการ → เลือกรายการ → จำนวน → ราคา → Supplier → เลข PO
- ตารางแสดง Stock Entry ทั้งหมด
- Admin only

#### 5. Withdrawals (เบิกจ่าย)
- **Admin**: สร้างรายการเบิก, อนุมัติ/ปฏิเสธคำขอ
- **Staff**: สร้างคำขอเบิก, ดูสถานะคำขอ
- สถานะ: Pending → Approved → Completed / Rejected
- ตรวจสอบ Stock คงเหลือก่อนอนุมัติ

#### 6. History (ประวัติ)
- ตารางแสดงประวัติเบิกจ่ายทั้งหมด
- Filter ตาม: โครงการ, วันที่, ผู้เบิก, สถานะ
- Timeline view

#### 7. Items Master (จัดการรายการสินค้า)
- CRUD รายการสินค้า/วัสดุ
- หมวดหมู่ + หน่วยนับ
- Admin only

#### 8. Reports (รายงาน)
- สรุป Stock คงเหลือแต่ละโครงการ
- สรุปการเบิกจ่ายตามช่วงเวลา
- Export เป็น PDF / Excel

---

### Design System

- **Theme**: Dark mode เป็นหลัก พร้อม gradient accents
- **Color Palette**:
  - Primary: `#6366f1` (Indigo)
  - Secondary: `#8b5cf6` (Purple)  
  - Success: `#22c55e` (Green)
  - Warning: `#f59e0b` (Amber)
  - Danger: `#ef4444` (Red)
  - Background: `#0f172a` → `#1e293b` (Slate dark)
  - Surface: `rgba(30, 41, 59, 0.8)` with blur
- **Typography**: Inter (Google Fonts)
- **Effects**: Glassmorphism cards, smooth transitions, hover animations
- **Layout**: Sidebar + Main content area, responsive

---

## Verification Plan

### Manual Verification
1. สร้าง Supabase Project และรัน SQL migrations
2. สมัครสมาชิก 2 accounts (1 Admin, 1 Staff)
3. ทดสอบ CRUD โครงการ
4. ทดสอบรับเข้า Stock
5. ทดสอบเบิกจ่าย + อนุมัติ
6. ตรวจสอบ Dashboard แสดงข้อมูลถูกต้อง
7. ทดสอบ Export PDF/Excel
8. ทดสอบ Responsive บน Mobile

### Build Verification
```bash
npm run build   # ต้อง build สำเร็จไม่มี error
npm run dev      # ต้องรันได้ปกติ
```
