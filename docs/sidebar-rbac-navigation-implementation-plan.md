# Implementation Plan — Permission-Based Sidebar Navigation & Consistent RBAC Authorization

## Goal Description
Fix authorization UX inconsistencies where STAFF users saw restricted Sidebar menu items (e.g. `/items`, `/stock-in`) that resulted in "Access Denied" screens upon clicking. Eliminate legacy `if (!isAdmin)` page guards in `Items.jsx` and `StockIn.jsx`, unify navigation filtering using canonical RBAC permissions (`can(item.permission)`), eliminate initial loading flicker, and introduce a user-friendly Access Denied UI for direct URL attempts.

---

## User Review Required

> [!IMPORTANT]
> **Key Architecture & Security Changes:**
> 1. **Declarative Navigation Config:** `Sidebar.jsx` uses a single declarative navigation array filtered by `!item.permission || can(item.permission)`.
> 2. **Removal of Legacy Role Guards:** Removed legacy `if (!isAdmin) return Access Denied;` from `Items.jsx` and `StockIn.jsx`. Authorization is now entirely driven by RBAC permissions (`items.view`, `stock_in.view`) enforced at the route level via `PermissionRoute`.
> 3. **Action-Level Control:** Page CRUD controls (Add Item, Edit Item, Delete Item, Create Stock In) are conditionally rendered using action-level permissions (`items.create`, `items.update`, `items.delete`, `stock_in.create`).
> 4. **No Flicker During Load:** `Sidebar.jsx` renders a subtle skeleton loader while permissions load, preventing menu flicker.
> 5. **Polished Access Denied UI:** When unauthorized users directly enter a restricted URL, `PermissionRoute` renders a polished, accessible Thai error card with navigation options back to safety.

---

## Proposed Changes

### Navigation & Layout Layer

#### [MODIFY] [Sidebar.jsx](file:///d:/APP/Stock-Flow-app/src/components/layout/Sidebar.jsx)
- Implement declarative `NAVIGATION_ITEMS` array with permission mappings (`dashboard.view`, `projects.view`, `items.view`, `stock_in.view`, `withdrawals.view`, `history.view`, `reports.view`, `users.view`, `roles.view`, `settings.view`).
- Filter items using `can(item.permission)`.
- Handle `loading` state with skeleton items to prevent authorization flicker.

#### [MODIFY] [PermissionRoute.jsx](file:///d:/APP/Stock-Flow-app/src/components/auth/PermissionRoute.jsx)
- Update permission check using `can(permission)`.
- Replace abrupt redirection with a production-grade Access Denied UI card ("ไม่มีสิทธิ์เข้าถึงหน้านี้") with "กลับหน้าหลัก" and "ย้อนกลับ" actions.

---

### Pages Layer

#### [MODIFY] [Items.jsx](file:///d:/APP/Stock-Flow-app/src/pages/Items.jsx)
- Remove legacy `if (!isAdmin) return Access Denied;` line.
- Wrap "+ เพิ่มรายการวัสดุ" button with `can('items.create')`.
- Wrap Edit icon with `can('items.update')`.
- Wrap Delete icon with `can('items.delete')`.

#### [MODIFY] [StockIn.jsx](file:///d:/APP/Stock-Flow-app/src/pages/StockIn.jsx)
- Remove legacy `if (!isAdmin) return Access Denied: Admin role required.;` line.
- Wrap "+ บันทึกรับเข้าสต็อก" button with `can('stock_in.create')`.

---

## Verification Plan

### Automated & Pre-flight Verification
- Run project build check (`npm run build`) to ensure clean compilation without syntax or import errors.

### Manual Security & Navigation Verification
1. **STAFF User Verification:**
   - Log in as a STAFF user.
   - Verify Sidebar renders ONLY permitted routes (e.g. Dashboard, Projects, Withdrawals, History, Manual). Restricted menus (`/items`, `/stock-in`, `/users`, `/roles`) must NOT be visible in desktop or mobile navigation.
   - Verify no flicker occurs during page load.
2. **Direct URL Protection:**
   - As a STAFF user without `items.view`, manually type `http://localhost:5173/items` in browser address bar.
   - Verify Access Denied UI renders ("ไม่มีสิทธิ์เข้าถึงหน้านี้") with navigation buttons to return safely to Dashboard.
3. **ADMIN User Verification:**
   - Log in as an ADMIN user.
   - Verify all navigation items (`/dashboard`, `/projects`, `/items`, `/stock-in`, `/withdrawals`, `/history`, `/reports`, `/users`, `/roles`, `/settings`, `/manual`) are fully visible and accessible.
4. **Action Permission Verification:**
   - For users with `items.view` but lacking `items.create`, verify the page renders but the "+ เพิ่มรายการวัสดุ" button is hidden.
