# 1. Replacement of Standalone Stock In POS Page with Direct Receipt Modal & CSV Import

Date: 2026-08-08

## Status

Accepted

## Context

Previously, inventory intake (`/stock-in`) allowed users to toggle a POS Grid interface (`isPosMode = true`) to add items to a cart before creating a Stock In order. However, inventory intake in real-world operations usually comes from physical invoices, PO numbers, or CSV bulk receipts from suppliers. Using a cashier POS grid with image cards for receiving stock was overly complex and inefficient for high-volume data entry.

## Decision

1. Remove the standalone POS Terminal interface (`isPosMode`) from `StockIn.jsx`.
2. Replace it with a **Direct Receipt Modal** directly on the Stock Receipt page (`/stock-in`).
3. Support **CSV Batch Import** with UTF-8 BOM (`\uFEFF`) encoding to ensure full compatibility with Thai characters when opened or generated from Microsoft Excel on Windows.
4. Support both CSV Upload (auto-populating the receipt items preview table) and manual Line Item row additions in the Direct Receipt Modal.
5. Retain the POS Interface for the Withdrawal workflow (`Withdrawals.jsx`), where visual browsing and cart selection fit the cashier-style user journey.

## Consequences

- Faster inventory receiving workflow for administrative users.
- Eliminates Thai character encoding issues ("ภาษาต่างดาว") when uploading CSV files.
- Simplified codebase in `StockIn.jsx` by removing dual-view mode state.
- Zero loss of atomic transaction guarantee (`public.process_stock_in` RPC is still used).
