# Implementation Plan — Dynamic Role & Permission Management System (RBAC)

## Goal Description
Implement a production-ready, dynamic Role-Based Access Control (RBAC) system for StockFlow. The system transitions authorization from hardcoded role checks (`if (role === "ADMIN")`) to a fine-grained, permission-based model (`can("permission.code")`). Authorized users will be able to create custom roles, edit role metadata, assign permissions grouped by category with automatic dependency management, view user/permission counts per role, and enforce action-level and route-level authorization across the entire application and Supabase database.

---

## User Review Required

> [!IMPORTANT]
> **Permission-Based Architecture & System Role Protections:**
> 1. **Permission Catalog:** Permissions use stable machine-readable codes in `<resource>.<action>` format (e.g. `projects.view`, `withdrawals.approve`, `users.create`, `roles.manage_permissions`).
> 2. **Default System Roles:** Baseline system roles (`ADMIN`, `STAFF`, `SUPERVISOR`) are seeded into the database. System roles cannot be deleted.
> 3. **Delete Role Safeguard:** Deleting custom roles is restricted if any active user is currently assigned to the role (`RESTRICT` policy). Users must be reassigned before role deletion.
> 4. **Lockout Protection:** The last administrative account retaining `roles.manage_permissions` cannot be demoted or deleted.
> 5. **Database-Enforced Security:** Authorization is enforced via PostgreSQL RLS policies calling `public.has_permission(auth.uid(), 'permission.code')` and atomic `SECURITY DEFINER` RPC functions.

---

## Proposed Changes

### Database & Supabase Layer

#### [NEW] [09_dynamic_rbac_roles_permissions.sql](file:///d:/APP/Stock-Flow-app/supabase/migrations/09_dynamic_rbac_roles_permissions.sql)
- **Roles Table (`public.roles`):**
  - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - `code` TEXT UNIQUE NOT NULL (uppercase, alphanumeric + `_`)
  - `name` TEXT NOT NULL
  - `description` TEXT
  - `badge_background` TEXT DEFAULT 'bg-purple-100 dark:bg-purple-950'
  - `badge_text_color` TEXT DEFAULT 'text-purple-700 dark:text-purple-300'
  - `is_system` BOOLEAN DEFAULT FALSE
  - `is_active` BOOLEAN DEFAULT TRUE
  - `created_at`, `updated_at` TIMESTAMPTZ DEFAULT NOW()
- **Permissions Table (`public.permissions`):**
  - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - `code` TEXT UNIQUE NOT NULL
  - `name` TEXT NOT NULL
  - `description` TEXT
  - `resource` TEXT NOT NULL
  - `action` TEXT NOT NULL
  - `category` TEXT NOT NULL
  - `created_at` TIMESTAMPTZ DEFAULT NOW()
- **Role Permissions Mapping Table (`public.role_permissions`):**
  - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - `role_id` UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE
  - `permission_id` UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE
  - UNIQUE(`role_id`, `permission_id`)
- **Profiles Table Integration:**
  - Add `role_id` UUID REFERENCES public.roles(id) ON DELETE SET NULL to `public.profiles`.
  - Seed default roles (`ADMIN`, `STAFF`, `SUPERVISOR`) and complete permission catalog.
  - Migrate existing `profiles.role` string values to point to corresponding `roles.id`.
- **Helper Functions & Security DEFINER RPCs:**
  - `public.has_permission(p_user_id UUID, p_perm_code TEXT)`: Checks if a user has a specific permission code.
  - `public.get_user_permissions(p_user_id UUID)`: Returns list of active permission codes for logged-in user.
  - `public.admin_get_roles_with_stats()`: Returns list of roles with assigned user count and enabled permission count.
  - `public.admin_get_permissions_catalog()`: Returns complete permission catalog grouped by category.
  - `public.admin_save_role_permissions(p_role_id UUID, p_permission_ids UUID[])`: Atomically updates role permissions.
  - `public.admin_create_role(p_code, p_name, p_description, p_badge_bg, p_badge_text)`: Creates a custom role.
  - `public.admin_update_role(p_role_id, p_name, p_description, p_badge_bg, p_badge_text)`: Updates role metadata.
  - `public.admin_delete_role(p_role_id)`: Safely deletes custom role if no users are assigned.
- **Row Level Security (RLS) Policy Upgrades:**
  - Update RLS policies on `projects`, `items`, `stock_entries`, `withdrawals`, `profiles`, `roles`, `permissions`, `role_permissions` to evaluate `public.has_permission(auth.uid(), '...')`.

---

### React & Frontend Architecture Layer

#### [MODIFY] [AuthContext.jsx](file:///d:/APP/Stock-Flow-app/src/contexts/AuthContext.jsx)
- Fetch user's permission codes on login/profile refresh.
- Expose authorization helpers:
  - `can(permissionCode)`: Returns boolean indicating if user possesses the permission code.
  - `canAny([code1, code2])`: Returns true if user has at least one permission.
  - `canAll([code1, code2])`: Returns true if user has all specified permissions.

#### [NEW] [PermissionRoute.jsx](file:///d:/APP/Stock-Flow-app/src/components/auth/PermissionRoute.jsx)
- Wrapper route guard component checking `can(requiredPermission)`. Redirects unauthorized users to `/` with Forbidden warning.

#### [MODIFY] [Sidebar.jsx](file:///d:/APP/Stock-Flow-app/src/components/layout/Sidebar.jsx)
- Update sidebar menu item visibility to check `can(...)` permissions instead of hardcoded role checks:
  - Projects -> `can('projects.view')`
  - Items -> `can('items.view')`
  - Stock In -> `can('stock_in.view')`
  - Withdrawals -> `can('withdrawals.view')`
  - History -> `can('history.view')`
  - Reports -> `can('reports.view')`
  - User Management -> `can('users.view')`
  - Role & Permissions -> `can('roles.view')`

#### [MODIFY] [App.jsx](file:///d:/APP/Stock-Flow-app/src/App.jsx)
- Add protected route `<Route path="/roles" element={<PermissionRoute permission="roles.view"><RoleManagement /></PermissionRoute>} />`.

#### [NEW] [RoleManagement.jsx](file:///d:/APP/Stock-Flow-app/src/pages/RoleManagement.jsx)
- Main Role & Permission Management page styled with Neumorphic & Glass UI system.
- Header: `จัดการบทบาทและสิทธิ์ (Role & Permission Management)`
- Toolbar button: `+ เพิ่มบทบาท`
- Responsive Role Cards Grid (3 cols desktop, 2 cols tablet, 1 col mobile):
  - Live Badge with customizable colors
  - Role Name, Role Code, Description
  - Count Badges: `ผู้ใช้: X`, `สิทธิ์: Y`
  - Action Buttons with tooltips: `[Shield] กำหนดสิทธิ์`, `[Edit] แก้ไขบทบาท`, `[Trash] ลบบทบาท`

#### [NEW] [PermissionManagementModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/roles/PermissionManagementModal.jsx)
- Dialog modal for configuring permissions of a role:
  - Grouped by Category (Dashboard, Projects, Items, Stock In, Withdrawals, Reports, Users, Roles, Settings)
  - Group Expand / Collapse toggle
  - Select All / Clear All per group
  - Automatic Permission Dependency Resolver (e.g. enabling `projects.create` automatically enables parent `projects.view`)
  - Displays count of enabled permissions and diff count before saving.

#### [NEW] [AddRoleModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/roles/AddRoleModal.jsx)
- Dialog modal for creating custom roles with fields: Role Code *, Role Name *, Description, Badge Color selector, Live Badge Preview. Code validation: uppercase, alphanumeric + `_`, no spaces.

#### [NEW] [EditRoleModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/roles/EditRoleModal.jsx)
- Dialog modal for editing custom role metadata (Role Code is immutable).

#### [MODIFY] [UserManagement.jsx](file:///d:/APP/Stock-Flow-app/src/pages/UserManagement.jsx) & [AddUserModal.jsx](file:///d:/APP/Stock-Flow-app/src/components/users/AddUserModal.jsx)
- Dynamically fetch and display active roles from `public.roles` table in the Role dropdown instead of hardcoding ADMIN/STAFF.
- Update action buttons across `Projects.jsx`, `Items.jsx`, `StockIn.jsx`, `Withdrawals.jsx`, and `UserManagement.jsx` to check action-level permissions (`can('items.create')`, `can('withdrawals.approve')`, etc.).

---

## Verification Plan

### Automated & Syntax Verification
1. Run syntax and lint verification on SQL migration and React components.
2. Run build check (`npm run build`) to ensure clean compilation.

### Manual Security & Functional Verification

#### 1. Role & Permission Management (Admin Flow)
- Log in as Admin.
- Navigate to `/roles`. Verify system roles (`ADMIN`, `STAFF`, `SUPERVISOR`) render with correct user and permission counts.
- Create a new custom role `PROJECT_MANAGER`. Verify role card appears with live badge preview.
- Click `[Shield]` on `PROJECT_MANAGER` to open Permission Management Modal.
- Enable `projects.create`. Verify `projects.view` is automatically selected via dependency rules.
- Save permissions. Verify permission count updates on the card.

#### 2. User Role Assignment & Dynamic Authorization
- Navigate to `/users` and assign `PROJECT_MANAGER` role to a test user.
- Log in as the test user.
- Verify Sidebar shows only authorized menus (Dashboard, Projects).
- Verify user can view and create projects, but cannot access `/items`, `/stock-in`, `/users`, or `/roles`.
- Attempt entering direct URL `/roles`; verify redirection with Forbidden toast.

#### 3. Role Deletion Safety & System Role Safeguards
- Attempt deleting system role `ADMIN`; verify delete action is disabled/blocked.
- Attempt deleting custom role `PROJECT_MANAGER` while users are assigned; verify system blocks deletion with warning message asking to reassign users first.
- Reassign test user back to `STAFF`, then delete `PROJECT_MANAGER`; verify successful removal.
