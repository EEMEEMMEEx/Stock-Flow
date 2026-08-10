# Implementation Plan — Self-Service Profile Management for All Authenticated Users

## Goal Description
Enable all authenticated StockFlow users (STAFF, USER, SUPERVISOR, DTRS, ADMIN) to view and manage their own personal profile information (Full Name, Phone Number, Position, Avatar Image, and Password) on the `/profile` page without requiring Admin privileges. Maintain strict security boundaries so users can only update their own whitelisted profile fields, while system identity and authorization settings (Role, Account Status, Permissions, Username) remain read-only.

---

## User Review Required

> [!IMPORTANT]
> **Key Security & Architecture Safeguards:**
> 1. **Self-Service Access:** All logged-in users can access `/profile` regardless of role.
> 2. **Backend & RLS Enforcement:** Updates target `auth.uid() = id` explicitly. Frontend TAMPERING IS PREVENTED by constructing a whitelisted update payload (`full_name`, `email`, `phone`, `position`, `avatar_url`). System fields (`role`, `status`, `permissions`, `project_access`) cannot be modified by non-admin users.
> 3. **Read-Only Credentials:** Username/Login identifier and Role badges are strictly read-only.
> 4. **Live AuthContext Sync:** Saving profile changes triggers `refreshProfile()`, instantly updating Topbar, Sidebar, and active page context without a browser reload.

---

## Proposed Changes

### Pages Layer

#### [NEW] [Profile.jsx](file:///d:/APP/Stock-Flow-app/src/pages/Profile.jsx)
- **User Identity Card:** Shows current user avatar, full name, position, email, role badge, and active status badge.
- **Tab 1: Personal Information Form (ข้อมูลส่วนตัว):**
  - **Editable Fields:** Full Name (`full_name`), Position (`position`), Email (`email`), Phone Number (`phone`).
  - **Read-Only Fields:** Username (with helper text *"ชื่อผู้ใช้สำหรับเข้าสู่ระบบ ไม่สามารถแก้ไขได้"*), Role, Account Status, Assigned Projects.
  - **Profile Avatar Upload:** Image preview, file size/type validation (JPG/PNG <= 3MB), instant storage upload via `uploadAvatarImage`, and cache-busting preview.
  - **Dirty State Handling:** "บันทึกข้อมูล" button remains disabled when no fields are modified, and shows loading state ("กำลังบันทึก...") during execution.
  - **On Save:** Updates `profiles` table for `auth.uid()`, calls `refreshProfile()`, and shows toast notification.
- **Tab 2: Password & Security (เปลี่ยนรหัสผ่าน):**
  - Form with New Password and Confirm Password.
  - Calls `supabase.auth.updateUser({ password })` securely on submission.

---

### App & Layout Layer

#### [MODIFY] [App.jsx](file:///d:/APP/Stock-Flow-app/src/App.jsx)
- Import `Profile` and register route `<Route path="/profile" element={<PermissionRoute permission={null}><Profile /></PermissionRoute>} />`.

#### [MODIFY] [Sidebar.jsx](file:///d:/APP/Stock-Flow-app/src/components/layout/Sidebar.jsx)
- Add `โปรไฟล์ (Profile)` item to `NAVIGATION_ITEMS` with `permission: null` so it is visible to all authenticated users.

#### [MODIFY] [Topbar.jsx](file:///d:/APP/Stock-Flow-app/src/components/layout/Topbar.jsx)
- Wrap user profile card/avatar in `Link` to `/profile` for intuitive navigation.

---

## Verification Plan

### Automated & Pre-flight Verification
- Run project build check (`npm run build`) to ensure clean compilation.

### Manual Verification
1. **Self-Service Profile Edit (STAFF Role):**
   - Log in as a STAFF user.
   - Navigate to `/profile` via Sidebar or Topbar.
   - Update Full Name, Phone, and Position. Click "บันทึกข้อมูล".
   - Verify success toast, instant update in Topbar user name, and database persistence.
2. **Avatar Image Upload:**
   - Upload a new JPG/PNG image. Verify live preview updates and image persists across refresh.
3. **Read-Only Field Protection:**
   - Verify Username, Role, Status, and Assigned Projects fields are read-only and cannot be edited.
4. **Password Change:**
   - Change password on Tab 2. Log out and verify login succeeds with new password.
5. **Security Tampering Safeguard:**
   - Verify non-admin update payload contains no `role` or `status` attributes.
