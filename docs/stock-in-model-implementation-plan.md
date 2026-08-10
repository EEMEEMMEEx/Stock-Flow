# Stock-In Parent-Child Hierarchical CSV & Workflow Plan

## Goal
Implement a robust Parent-Child hierarchical item structure for the CSV Template, CSV import/export pipeline, database schema, and `/stock-in` Direct Stock Receipt workflow.

## Canonical CSV Schema
`No,Item_Type,SKU,Parent_SKU,รายการ,รุ่น,จำนวน,หมายเหตุ`

Where:
- `No` = sequence number for top-level/parent items (optional)
- `Item_Type` = `PARENT` or `CHILD`
- `SKU` = unique item SKU
- `Parent_SKU` = SKU of parent item; required for `CHILD`
- `รายการ` = item description/name (required)
- `รุ่น` = item model (required)
- `จำนวน` = quantity (required numeric)
- `หมายเหตุ` = additional notes / serial or part number remarks

## Parser State Machine & Heuristic Fallback
1. **Primary Parsing**: Reads `Item_Type` (`PARENT`/`CHILD`) and `Parent_SKU`.
2. **State Machine Context**: Tracks `last_seen_parent` as PARENT rows are processed.
3. **Heuristic Fallback**:
   - If `Item_Type`, `Parent_SKU`, and `No` are blank, AND `รายการ` starts with `-`, `•`, or has leading whitespace:
   - Evaluates row as `CHILD`
   - Maps to `last_seen_parent` context
   - Strips prefix (`- `, `• `) for display normalization
4. **Orphan Child Prevention**: If a CHILD item appears without a valid `Parent_SKU` and without a preceding `last_seen_parent`, halts import and throws a clear row-level error.

## Database Migration (`35_add_parent_child_hierarchy_to_stock_in.sql`)
- Added `item_type`, `parent_id`, `parent_sku`, `seq_no`, and `notes` to `public.items` and `public.stock_in_items`.
- Updated Supabase RPC `public.process_stock_in` to store relational hierarchy.
