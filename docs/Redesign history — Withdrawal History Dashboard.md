# Redesign `/history` — Withdrawal History Dashboard

## Goal

ปรับปรุงหน้า `/history` จากรูปแบบ minimal table ให้เป็น **Production-Grade Withdrawal History Dashboard** ที่มีข้อมูลเชิงปฏิบัติการครบถ้วน สอดคล้องกับ visual design system ที่ใช้ในหน้า `/reports`, `/withdrawals`, `/projects` ของ StockFlow

## Current Behavior

- หน้า `/history` มีแค่ Header + Search + Table 6 คอลัมน์ + Dialog รายละเอียด
- ไม่มี KPI สรุปภาพรวม, ไม่มีตัวกรองขั้นสูง, ไม่มี Pagination
- Loading state เป็นข้อความธรรมดา, Empty state เป็นแถวเดียวในตาราง
- ไม่มี Error state / Retry
- จำกัดดึงข้อมูล 100 records โดยไม่มีการแบ่งหน้า

## Target Behavior

Dashboard หน้าประวัติการเบิกจ่ายที่ให้ข้อมูลเชิงปฏิบัติการครบถ้วน:

1. **Header**: ชื่อหน้า + คำอธิบาย + ปุ่ม Refresh + Badge จำนวนรายการ
2. **KPI Cards**: Total / Approved / Completed / Rejected / Shortage
3. **Filter Bar**: Project / Status / Requester / Date Range / Search + Quick Date Presets + Reset
4. **Data Table**: Withdrawal No. / Date / Project / Requester / Items / Qty / Status / Actions — พร้อม Sorting + Pagination
5. **Detail Dialog**: ปรับปรุง layout ให้ชัดเจนขึ้น รองรับ timestamp ครบ, shortage info, PDF download
6. **Empty / Loading / Error States**: Loading skeleton, Empty illustration + reset action, Error + Retry

## Scope

| Area | Action |
|------|--------|
| `src/pages/History.jsx` | Refactor เป็น orchestrator ของ subcomponents |
| `src/components/history/HistoryHeader.jsx` | **[NEW]** Header + Actions |
| `src/components/history/HistoryKpiGrid.jsx` | **[NEW]** KPI Summary Cards |
| `src/components/history/HistoryFilterBar.jsx` | **[NEW]** Smart Filter Toolbar |
| `src/components/history/HistoryDataTable.jsx` | **[NEW]** Data Table + Sort |
| `src/components/history/HistoryPagination.jsx` | **[NEW]** Pagination Controls |
| `src/components/history/HistoryEmptyState.jsx` | **[NEW]** Empty / Error States |
| Backend / DB / RPC | ❌ ไม่แก้ — ใช้ query เดิม |

---

## Proposed Changes

### 1. `src/components/history/` [NEW directory]

สร้างโฟลเดอร์ `history/` ภายใต้ `src/components/` (ตามรูปแบบ `reports/`)

---

### 2. HistoryHeader.jsx [NEW]

- ไอคอน History + Title "ประวัติการเบิกจ่าย" + Subtitle
- Badge แสดงจำนวน Total records
- ปุ่ม Refresh (spinner animation ขณะโหลด)
- **Design**: `bg-card/60 backdrop-blur border border-border/60 rounded-2xl shadow-sm` — เหมือน ReportHeader

---

### 3. HistoryKpiGrid.jsx [NEW]

5 KPI Cards แบบ grid responsive:

| Card | ข้อมูล | Icon | Color |
|------|--------|------|-------|
| รายการทั้งหมด | `history.length` | `ClipboardList` | Blue |
| อนุมัติแล้ว | count `approved` | `CheckCircle2` | Blue |
| รับของแล้ว | count `completed` | `PackageCheck` | Emerald |
| ไม่อนุมัติ | count `rejected` | `XCircle` | Rose |
| มีค้างส่ง | count shortage | `AlertTriangle` | Amber |

**Design**: ใช้รูปแบบ `ReportKpiGrid` — Card + iconBg + badge + value + subtext

---

### 4. HistoryFilterBar.jsx [NEW]

ตัวกรองขั้นสูง (Collapsible):

- **โครงการ** — select dropdown (จาก unique projects ใน history data)
- **สถานะ** — select (approved / completed / rejected)
- **ผู้ขอเบิก** — select (จาก unique requesters ใน history data)
- **วันที่เริ่มต้น / สิ้นสุด** — date inputs
- **ค้นหา** — text search (ชื่อวัสดุ, โครงการ)
- **Quick Date Presets**: วันนี้ / 7 วัน / 30 วัน / เดือนนี้
- ปุ่ม **ล้างตัวกรอง** (แสดงเมื่อมี active filter)

> **หมายเหตุ**: ทำ client-side filtering บน data ที่ fetch มาแล้ว (ตามพฤติกรรมเดิม) — ไม่เพิ่ม server-side filter ใหม่เพื่อรักษา backward compatibility

---

### 5. HistoryDataTable.jsx [NEW]

ตารางข้อมูลพร้อม sorting:

| Column | ข้อมูล | Sortable |
|--------|--------|----------|
| เลขที่ | `id.slice(0,8)` | ❌ |
| วันที่ | `requested_at` | ✅ |
| โครงการ | `projects.project_code` — `projects.name` | ✅ |
| ผู้ขอเบิก | `profiles.full_name` | ✅ |
| รายการ | items count | ❌ |
| จำนวนรวม | sum quantities | ❌ |
| สถานะ | status badge (เดิม) | ✅ |
| จัดการ | ดูรายละเอียด + PDF | ❌ |

- Sticky header
- Responsive: ซ่อนคอลัมน์ที่ไม่จำเป็นบนหน้าจอเล็ก
- Row hover effect

---

### 6. HistoryPagination.jsx [NEW]

- Reuse pattern จาก `ReportPagination`
- Page size options: 10 / 25 / 50 / 100
- Default: 25
- First / Prev / Page Numbers / Next / Last
- แสดงข้อมูล "แสดง X ถึง Y จาก Z รายการ"

---

### 7. HistoryEmptyState.jsx [NEW]

2 states:

1. **Empty** (ไม่มีข้อมูล): ไอคอน + ข้อความ + ปุ่มล้างตัวกรอง
2. **Error** (โหลดข้อมูลผิดพลาด): ไอคอน + ข้อความ + ปุ่ม Retry

---

### 8. History.jsx [MODIFY]

Refactor เป็น orchestrator:

- **State Management**: filters, pagination, sorting, loading, error
- **Data Fetching**: คง `fetchHistory()` เดิมแต่เพิ่ม:
  - เอา `limit(100)` ออก เปลี่ยนเป็น `limit(500)` เพื่อรองรับ dataset ใหญ่กว่า
  - เพิ่ม error state
  - เพิ่มการ fetch distinct projects / requesters สำหรับ filter dropdowns
- **Client-side filtering**: รวม project / status / requester / date range / search
- **Client-side pagination**: คำนวณ `paginatedData` จาก `filteredData`
- **Client-side sorting**: sort by column + direction
- **StatusBadge**: ย้ายไปไว้ใน `HistoryDataTable` (หรือแชร์เป็น shared component)
- **Detail Dialog**: คงเดิมแต่ปรับ styling ให้สอดคล้องกับ design system

---

## Risks

| Risk | Mitigation |
|------|-----------|
| เพิ่ม `limit(500)` อาจช้ากว่าเดิม | Client-side pagination ลดการแสดงผลจริง เดิมไม่มี pagination จึงแสดงหมดทีเดียวอยู่แล้ว |
| Filter dropdowns ดึง unique values จาก data ที่ fetch มา | ไม่ต้อง query เพิ่ม รักษา architecture เดิม |
| StatusBadge ถูกใช้ที่ Detail Dialog ด้วย | ส่งเป็น prop หรือ shared component |

## Backward Compatibility

- ✅ ไม่แก้ Supabase query structure (เพิ่มแค่ limit)
- ✅ ไม่แก้ authorization logic (isAdmin filter)
- ✅ คง PDF download flow เดิม 100%
- ✅ คง Dialog content เดิม (ปรับ styling เท่านั้น)
- ✅ ไม่แก้ไฟล์อื่นนอก scope

## Verification Plan

### Automated
```bash
npm run build
```

### Manual
- ✅ หน้า `/history` แสดง KPI, Filters, Table, Pagination ถูกต้อง
- ✅ Filter ทำงาน (project, status, requester, date, search)
- ✅ Sorting ทำงาน (คลิกหัวคอลัมน์)
- ✅ Pagination ทำงาน (เปลี่ยนหน้า, เปลี่ยน page size)
- ✅ ดูรายละเอียด (Dialog) ทำงานปกติ
- ✅ PDF download ทำงานปกติ
- ✅ Empty state แสดงเมื่อไม่มีข้อมูล
- ✅ Loading skeleton แสดงขณะโหลด
- ✅ Responsive: desktop, tablet, mobile
- ✅ Visual consistency กับหน้า `/reports`
