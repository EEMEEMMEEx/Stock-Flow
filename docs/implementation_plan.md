# Implementation Plan - Direct Stock Receipt Modal & CSV Import (UTF-8 with BOM)

## Goal Description
Remove the standalone POS view (`isPosMode`) from the Stock In page (`/stock-in`) and replace it with a **Direct Receipt Modal** that supports both manual Line Item additions and **CSV Batch Import with UTF-8 BOM encoding** (`\uFEFF`) to prevent Thai text encoding issues ("ภาษาต่างดาว") when working with Microsoft Excel on Windows.

## Proposed Changes

### Stock Receipt Page (`src/pages/StockIn.jsx`)

#### [MODIFY] [StockIn.jsx](file:///d:/APP/Stock-Flow-app/src/pages/StockIn.jsx)
- **Remove POS Terminal View:** Remove `isPosMode` state and `PosTerminal` component import/rendering from `StockIn.jsx`.
- **Direct Receipt Modal UI:**
  - Create a single comprehensive Modal triggered by `+ บันทึกรับเข้าสต็อก`.
  - Header section for metadata: Destination Project (`project_id`), Supplier (`supplier`), PO/Receipt Number (`po_number`), Notes (`notes`).
- **CSV Import Feature (UTF-8 BOM Support):**
  - **Download CSV Template:** Generates a UTF-8 BOM (`\uFEFF`) CSV sample file containing columns: `SKU / รหัสวัสดุ`, `ชื่อวัสดุ`, `จำนวน`, `ราคาต่อหน่วย (บาท)`, `Serial Number / Part Number`.
  - **CSV File Upload & Parser:** Parses uploaded `.csv` files using UTF-8 reading, strips UTF-8 BOM if present, matches `SKU` or `Item Name` with existing master items in Supabase, and populates the receipt table preview.
  - **Thai Encoding Safeguard:** Handles Thai characters seamlessly without broken symbols.
- **Dynamic Line Items Table:**
  - Allows adding manual row items (`+ เพิ่มรายการวัสดุ`) with searchable dropdown, quantity, unit price, and remove button.
  - Summarizes total items count and total estimated value before submission.
- **Backend RPC Integration:**
  - Retains the atomic Supabase RPC call `supabase.rpc('process_stock_in', ...)` for transactional consistency across `stock_in_orders`, `stock_in_items`, and `stock_transactions`.

---

## Verification Plan

### Automated / Pre-flight Verification
- Run static checks and syntax validation on `StockIn.jsx`.

### Manual Verification
- Test clicking `+ บันทึกรับเข้าสต็อก` on `/stock-in` to verify the new modal opens without toggling POS mode.
- Test downloading the sample CSV file and opening it in Excel/Text Editor to verify Thai characters render correctly.
- Test uploading a UTF-8 BOM `.csv` file with Thai item names to ensure automatic mapping to line items in the modal.
- Test submitting a Stock In order and verifying database records in `stock_in_orders`, `stock_in_items`, and `stock_transactions`.
