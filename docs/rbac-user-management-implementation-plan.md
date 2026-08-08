# Implementation Plan — Admin User Management & Role-Based Access Control (RBAC)

## Goal Description
Implement a production-ready Admin User Management and Role-Based Access Control (RBAC) module for StockFlow. The system will enable Administrators to manage users, assign roles (ADMIN / STAFF), toggle account status (ACTIVE / INACTIVE), configure project-level permissions (All Projects vs. Selected Projects), reset passwords, and inspect audit logs. All security rules, project boundaries, and privileges will be strictly enforced server-side via Supabase Row Level Security (RLS) policies and atomic `SECURITY DEFINER` PL/pgSQL RPC functions.

---

## User Review Required

> [!IMPORTANT]
> **Authentication & Admin Authorization Model:**
> 1. User creation and management are executed via atomic `SECURITY DEFINER` PL/pgSQL RPC functions in Supabase PostgreSQL (`admin_create_user`, `admin_update_user`, `admin_reset_user_password`, `admin_toggle_user_status`). This avoids exposing `SUPABASE_SERVICE_ROLE_KEY` in Vite while guaranteeing server-side validation and multi-table atomic transactions (rolling back auth + profile + project assignments if any step fails).
> 2. **Account Deactivation over Deletion:** Users with historical stock transactions or withdrawal requests cannot be hard-deleted. Account deactivation (`status = 'inactive'`) revokes operational access while retaining historical audit trails.
> 3. **Protection of Last Active Admin:** System enforces that the last remaining active Admin cannot be deactivated or demoted to Staff.

---

## Proposed Changes

### Database & Supabase Layer

#### [NEW] [08_rbac_and_user_management.sql](file:///d:/APP/Stock-Flow-app/supabase/migrations/08_rbac_and_user_management.sql)
- **Profile Table Upgrades:**
  - Add columns to `public.profiles`: `status` (`TEXT CHECK (status IN ('active', 'inactive')) DEFAULT 'active'`), `phone` (`TEXT`), `position` (`TEXT`), `updated_at` (`TIMESTAMPTZ DEFAULT NOW()`).
- **User Project Assignments Table (`public.user_project_assignments`):**
  - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - `user_id` UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
  - `project_id` UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE
  - `created_at` TIMESTAMPTZ DEFAULT NOW()
  - `created_by` UUID REFERENCES public.profiles(id)
  - UNIQUE(`user_id`, `project_id`)
  - Indexes on `user_id` and `project_id`.
- **Audit Logs Table (`public.audit_logs`):**
  - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - `actor_id` UUID REFERENCES public.profiles(id) ON DELETE SET NULL
  - `target_user_id` UUID REFERENCES public.profiles(id) ON DELETE SET NULL
  - `action` TEXT NOT NULL
  - `details` JSONB
  - `created_at` TIMESTAMPTZ DEFAULT NOW()
- **Atomic PL/pgSQL RPCs (`SECURITY DEFINER`):**
  - `admin_create_user`: Verifies caller is active Admin, inserts into `auth.users` with encrypted password using `pgcrypto`, populates `profiles` and `user_project_assignments`, records event in `audit_logs`.
  - `admin_update_user`: Updates profile details, role, status, and syncs project assignments. Prevents demoting/deactivating the last active Admin.
  - `admin_reset_user_password`: Resets encrypted password in `auth.users` securely.
  - `admin_toggle_user_status`: Toggles active/inactive status and logs event.
  - `admin_get_users`: Retrieves user profiles along with email, role, status, phone, position, and array of assigned project IDs/names.
- **Row Level Security (RLS) Policies:**
  - `profiles`: SELECT allowed for authenticated active users. ALL/UPDATE for Admins.
  - `user_project_assignments`: SELECT for Admins or assigned users. ALL for Admins.
  - `projects`: Admins see all projects; Staff see active projects assigned to them in `user_project_assignments` (or all projects if unconstrained).
  - `withdrawals` & `stock_entries`: RLS filter enforcing project-level access for Staff.
  - `audit_logs`: SELECT for Admins only.

---

### React Component & Frontend Layer

#### [MODIFY] [AuthContext.jsx](file:///d:/APP/Stock-Flow-app/src/contexts/AuthContext.jsx)
- Extend `AuthContext` to fetch `status`, `phone`, `position`, and user project assignments.
- Expose `isAdmin` (`profile?.role === 'admin'`) and `isActive` (`profile?.status === 'active'`).
- Enforce logout / blocked screen if an authenticated user's profile `status` is set to `'inactive'`.

#### [MODIFY] [Sidebar.jsx](file:///d:/APP/Stock-Flow-app/src/components/layout/Sidebar.jsx)
- Add Admin-only menu item:
  - Label: `"จัดการผู้ใช้ (User Management)"`
  - Route: `/users`
  - Icon: `UserCog` from `lucide-react`
  - Condition: `show: isAdmin`

#### [MODIFY] [App.jsx](file:///d:/APP/Stock-Flow-app/src/App.jsx)
- Add protected Admin-only route: `<Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />`
- Redirect unauthorized Staff attempts to `/` with error notification.

#### [NEW] [AdminRoute.jsx](file:///d:/APP/Stock-Flow-app/src/components/auth/AdminRoute.jsx)
- Wrapper component checking `isAdmin` state. Redirects non-admin users to home page.

#### [NEW] [UserManagement.jsx](file:///d:/APP/Stock-Flow-app/src/pages/UserManagement.jsx)
- Main User Management page styled with StockFlow's Neumorphic & Glass UI design system.
- **Header:**
  - Title: `จัดการผู้ใช้และสิทธิ์`
  - Subtitle: `Manage application users, roles, status, and project access.`
- **Toolbar & Controls:**
  - Search input ("ค้นหาชื่อ, อีเมล, ตำแหน่ง...")
  - Role Filter dropdown (`ทั้งหมด`, `ADMIN`, `STAFF`)
  - Status Filter dropdown (`ทั้งหมด`, `Active`, `Inactive`)
  - Project Filter dropdown
  - Refresh button
  - Button `+ เพิ่มผู้ใช้` (triggers Add User Modal)
- **Responsive User Table Columns:**
  - Avatar / Initial
  - Full Name & Position
  - Email & Phone
  - Role Badge (`ADMIN` - Purple/Primary, `STAFF` - Slate/Emerald)
  - Assigned Projects (Summary Badges)
  - Account Status Badge (`ACTIVE` - Emerald, `INACTIVE` - Red)
  - Created Date
  - Actions dropdown / buttons: `แก้ไข (Edit)`, `เปลี่ยนสิทธิ์ (Change Role)`, `จัดการโครงการ (Projects)`, `สลับสถานะ (Toggle Status)`, `รีเซ็ตรหัสผ่าน (Reset Password)`

#### [NEW] [AddUserModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/users/AddUserModal.jsx)
- Tabbed dialog modal for creating users:
  - **TAB 1 — ข้อมูลบัญชี (Account Information):**
    - Profile Image URL (optional)
    - Full Name *
    - Email *
    - Password * (with Show/Hide toggle, Generate Random Password button, and password strength meter)
    - Phone Number (optional)
    - Position / Job Title (optional)
  - **TAB 2 — สิทธิ์และระดับการเข้าถึง (Role & Access):**
    - Role * (`ADMIN`, `STAFF`)
    - Account Status (`ACTIVE`, `INACTIVE`)
    - Project Access (`โครงการทั้งหมด (All Projects)` vs `เลือกเฉพาะโครงการ (Selected Projects)`)
    - Searchable multi-select checkbox list for active projects when "Selected Projects" is chosen.

#### [NEW] [EditUserModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/users/EditUserModal.jsx)
- Dialog modal for updating existing user details, roles, status, and project access.

#### [NEW] [ResetPasswordModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/users/ResetPasswordModal.jsx)
- Dialog modal allowing Admin to assign a new temporary password or generate a random password for a user.

---

## Verification Plan

### Automated / Syntax & Build Verification
1. Run syntax and lint checks on new migration SQL and React files.
2. Run project build check (`npm run build`) to ensure zero bundle/compilation errors.

### Manual Security & Functional Verification

#### 1. Admin Verification (Positive Flow)
- Log in as Admin user.
- Navigate to "จัดการผู้ใช้" (`/users`) from sidebar.
- Click `+ เพิ่มผู้ใช้` and complete TAB 1 & TAB 2 to create a new `STAFF` user assigned to specific projects.
- Verify user appears in table immediately with proper badges and avatar initials.
- Edit the user profile, toggle status to `INACTIVE`, and verify update reflected in UI and DB.
- Test password reset for target user.

#### 2. Staff Verification (Access Restriction & Security Flow)
- Log in as `STAFF` user.
- Verify "จัดการผู้ใช้" menu item is hidden in sidebar.
- Manually enter URL `/users` in browser address bar; verify automatic redirection back to `/` with access denied toast.
- Attempt calling `admin_create_user` or `admin_update_user` via browser console or Supabase client; verify RPC returns `Unauthorized: Only active admins can perform user management operations.`

#### 3. Project Access Boundaries
- Log in as a `STAFF` user assigned only to Project A.
- Verify Projects page and Stock pages show only Project A data.
- Verify attempts to view Project B's withdrawals or stock entries via direct RPC or Supabase query are blocked by RLS policies.

#### 4. Data Integrity & Historical Audit Preservation
- Verify deactivating a user preserves their historic withdrawal requests (`requested_by`), approvals (`approved_by`), and stock entries (`created_by`).
- Verify audit log records all user creation, update, role change, status toggle, and password reset events in `audit_logs` table.
