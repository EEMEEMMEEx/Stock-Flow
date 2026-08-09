# Implementation Plan — Production-Grade Destructive-Action User Action Modal

## Goal Description
Redesign and upgrade the User Action modal in `UserManagement.jsx` into a production-grade, secure, and accessible destructive-action modal (`UserActionModal.jsx`). The new modal enforces RBAC permissions, provides a compact user identity card, separates reversible Suspend/Reactivate actions from hard deletion, introduces a 2-step Delete confirmation requiring text verification, and performs audit/integrity checks to prevent data loss or admin lockouts.

---

## User Review Required

> [!IMPORTANT]
> **Key Security & UX Enhancements:**
> 1. **RBAC Authorization:** Permission checks use `can('users.suspend')` / `can('users.update')` and `can('users.delete')` instead of simple `isAdmin` checks.
> 2. **Integrity Guard:** Hard delete is blocked if the user has historical references in `withdrawals`, `stock_transactions`, or `stock_in_orders`, or if the user is the last active Administrator. In such cases, the system recommends **Suspend** instead.
> 3. **Two-Step Deletion:** Permanent delete requires confirming intent by typing either the exact user email or `DELETE`.

---

## Proposed Changes

### Components & UI Layer

#### [NEW] [UserActionModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/users/UserActionModal.jsx)
- **User Identity Card:** Shows avatar (or gradient initials), `full_name`, `position`, `email`, role badge, and active/inactive status badge.
- **Reversible Action Section (Suspend / Reactivate):**
  - Styled in Amber (`bg-amber-500/10`, `border-amber-500/30`).
  - Explains that login/access is blocked while historical data remains safe.
  - Toggles between **Suspend (ระงับการใช้งาน)** and **Reactivate (เปิดใช้งานอีกครั้ง)** based on current user status.
  - Authorized via `can('users.suspend') || can('users.deactivate') || can('users.update')`.
- **Danger Zone Section (Permanent Delete):**
  - Styled in Danger Red (`bg-red-500/5`, `border-red-500/30`).
  - Explains the irreversible nature of hard deletion.
  - Performs an automated database integrity check on mount.
  - Blocks hard delete with a Caution notice if audit data exists or if the user is the last active Admin.
  - Authorized via `can('users.delete')`.
- **Two-Step Confirmation Flow:**
  - Step 1: Overview & action selection.
  - Step 2: Delete confirmation view requiring exact typing of `{user.email}` or `DELETE`.
  - Delete button remains disabled until exact text match.
- **UX & Accessibility:** Loading spinners during async RPC operations, keyboard trap / `Escape` key close, mobile-first responsive layout (min 44px touch targets), aria labels.

#### [MODIFY] [UserManagement.jsx](file:///d:/APP/Stock-Flow-app/src/pages/UserManagement.jsx)
- Replace legacy simple deletion Dialog with the new `UserActionModal.jsx`.
- Pass users list, current user context, and callbacks (`onToggleStatus`, `onDeletePermanent`).

---

## Verification Plan

### Automated & Pre-flight Verification
- Run syntax and lint verification on `UserActionModal.jsx` and `UserManagement.jsx`.
- Verify project build with `npm run build`.

### Manual & UX Verification
1. **User Identity Card:** Verify avatar, role, email, and status badges display correctly for active/inactive users.
2. **Suspend / Reactivate:** Click Suspend on an active user, verify amber styling, toast notification, and status update. Re-open modal to verify it shows Reactivate option.
3. **Integrity Guard:** Attempt hard delete on a user with transaction history or on the last Admin. Verify hard delete is disabled with an explanatory Caution alert recommending Suspend.
4. **Two-Step Confirmation:** Click Initiate Permanent Delete on a clean test user without history. Verify step 2 opens, input validation blocks deletion until email or `DELETE` is typed, and delete completes successfully.
