import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  BookOpen, AlertTriangle, ShieldCheck, User, CheckCircle2, 
  Search, Users, Shield, FolderKanban, ArrowDownToLine, 
  ArrowUpFromLine, FileText, Sparkles, ExternalLink,
  Package, Clock, Layers,
  HelpCircle, SlidersHorizontal, ArrowLeftRight, Info,
  BookmarkCheck, Zap
} from 'lucide-react';

const Manual = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState('all'); // 'all' | 'staff' | 'supervisor' | 'admin' | 'checkouts' | 'inventory'

  const roleFilters = [
    { id: 'all', label: 'All Sections', icon: BookOpen },
    { id: 'staff', label: 'Staff / Requisition', icon: User, color: 'text-blue-500' },
    { id: 'supervisor', label: 'Supervisor / Approver', icon: ShieldCheck, color: 'text-emerald-500' },
    { id: 'admin', label: 'Administrator & RBAC', icon: Shield, color: 'text-purple-500' },
    { id: 'checkouts', label: 'Checkouts & Returns', icon: ArrowLeftRight, color: 'text-amber-500' },
    { id: 'inventory', label: 'Inventory & Stock-In', icon: Package, color: 'text-cyan-500' },
  ];

  // Comprehensive documentation catalog
  const manualSections = useMemo(() => [
    {
      id: 'sidebar-navigation',
      category: ['staff', 'supervisor', 'admin'],
      title: '1. Navigation & RBAC Visibility',
      shortDesc: 'Overview of menu layout and permission-based dynamic visibility.',
      icon: Layers,
      iconColor: 'text-primary',
      badgeColor: 'border-l-primary',
      path: '/dashboard',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['dashboard.view', 'projects.view', 'items.view'],
      whatItDoes: 'The sidebar and action buttons in StockFlow are dynamic and context-aware. Menus appear only when your account is granted permissions corresponding to each specific module. If a menu is hidden, your assigned role does not currently have access.',
      whoCanUse: 'All system users. Menu visibility varies depending on assigned role and permissions.',
      steps: [
        'Check authorized navigation items in the sidebar.',
        'Upon selecting a page, access is validated across both the frontend router and database Row-Level Security (RLS).',
        'To request additional menu access, contact a System Administrator to update your role permissions at /roles.'
      ],
      proTips: 'Administrators can customize menu permissions for each role dynamically via /roles without updating application code.',
      warnings: 'Directly navigating to unauthorized URLs will be blocked by system security (403 Forbidden).'
    },
    {
      id: 'staff-requisition-pos',
      category: ['staff'],
      title: '2. Stock Checking & Withdrawal POS Terminal',
      shortDesc: 'Select project, check available balances, and submit requisitions via the POS cart.',
      icon: ArrowUpFromLine,
      iconColor: 'text-blue-500',
      badgeColor: 'border-l-blue-500',
      path: '/withdrawals',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['withdrawals.view', 'withdrawals.create'],
      whatItDoes: 'The POS Terminal interface allows operators to select projects, search for materials, verify actual available stock, and submit multi-item requisition orders seamlessly in a single transaction.',
      whoCanUse: 'Requisition staff (Staff / Requester) and all roles granted withdrawals.create permission.',
      steps: [
        'Navigate to "Withdrawals" and select the destination project from the selector.',
        'Click "+ New Request (POS)" to open the POS shopping cart terminal.',
        'Search for items, enter required quantities, and click "Add to Cart" (alerts will trigger if quantity exceeds available stock).',
        'Select the storage location and specify purpose or usage notes.',
        'Review line items and click "Submit Request" to finalize.'
      ],
      proTips: 'Use the Site Kits / BOM Requisition feature to add standardized project kits to the cart in a single click.',
      warnings: 'Requisition orders are verified atomically on an All-or-Nothing basis during approval. If any item is out of stock, the entire order is rejected.'
    },
    {
      id: 'withdrawal-status-lifecycle',
      category: ['staff', 'supervisor'],
      title: '3. Withdrawal Status Lifecycle',
      shortDesc: 'Understanding the 4 lifecycle stages from order submission to final stock deduction.',
      icon: Clock,
      iconColor: 'text-amber-500',
      badgeColor: 'border-l-amber-500',
      path: '/withdrawals',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['withdrawals.view'],
      whatItDoes: 'Provides transparent tracking of requisition order progress so requesters and supervisors can monitor status with precision.',
      whoCanUse: 'Requesters, Approvers, and Administrators.',
      steps: [
        '1. Pending: Order submitted, awaiting supervisor or admin review and stock availability check.',
        '2. Approved: Order approved; requester can pick up materials at the designated warehouse.',
        '3. Completed: Materials successfully issued; stock balances are deducted from inventory.',
        '4. Rejected: Order rejected (e.g. insufficient stock or invalid requisition details) with reason provided.'
      ],
      proTips: 'Requesters can inspect rejection reasons and audit logs in the order details view to correct and resubmit.',
      warnings: 'Physical stock is not deducted from inventory until the order is approved and marked as completed.'
    },
    {
      id: 'checkouts-and-returns',
      category: ['staff', 'checkouts'],
      title: '4. Checkouts & Equipment Borrowing',
      shortDesc: 'Record tool checkouts, schedule due dates, request extensions, and process returns.',
      icon: ArrowLeftRight,
      iconColor: 'text-amber-500',
      badgeColor: 'border-l-amber-500',
      path: '/checkouts',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['checkouts.view', 'checkouts.create', 'checkouts.return', 'checkouts.extend'],
      whatItDoes: 'Manages circulating tools and returnable assets required for temporary field tasks. Features automated due-date countdowns, overdue tracking, and return date extensions.',
      whoCanUse: 'Staff borrowing equipment and warehouse staff processing returns.',
      steps: [
        'Borrowing: Go to "Checkouts", click "+ Borrow Tool", select borrower, expected return date, and item serial number.',
        'Monitoring: View active checkout status (Active, Due Soon, or Overdue).',
        'Extension (Extend Due Date): If additional time is needed, click "Extend Due Date", choose a new date, and provide a reason.',
        'Returns: When equipment is returned, warehouse staff click "Return", inspect condition, and confirm to restore item to stock.'
      ],
      proTips: 'Overdue items are highlighted with red status badges for rapid equipment tracking and recovery.',
      warnings: 'Inspect tool physical condition and operational status thoroughly before confirming return into inventory.'
    },
    {
      id: 'supervisor-approval-workflow',
      category: ['supervisor'],
      title: '5. Supervisor Approval Workflow',
      shortDesc: 'Stock validation guidelines, full-order approvals, and the All-or-Nothing principle.',
      icon: CheckCircle2,
      iconColor: 'text-emerald-500',
      badgeColor: 'border-l-emerald-500',
      path: '/withdrawals',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['withdrawals.approve', 'withdrawals.reject'],
      whatItDoes: 'Ensures safe and consistent approval processing by calculating real-time inventory balances and enforcing All-or-Nothing atomic transactions to eliminate inventory discrepancies.',
      whoCanUse: 'Supervisors, Approvers, and Administrators.',
      steps: [
        'Navigate to "Withdrawals" and filter by "Pending" status.',
        'Click an order to review requested items, quantities, and current available stock.',
        'If all items have sufficient available stock, click "Approve".',
        'If even one item is insufficient, click "Reject" and provide an explanatory note for the requester.'
      ],
      proTips: 'The system uses PostgreSQL row-level locking so multiple approvers can process orders simultaneously without race conditions.',
      warnings: 'Partial approvals for individual items in an order are disabled to maintain accounting and requisition integrity.'
    },
    {
      id: 'stock-in-inventory-management',
      category: ['supervisor', 'inventory'],
      title: '6. Stock In & CSV Import',
      shortDesc: 'Direct stock receipts entry and bulk imports via CSV/Excel spreadsheets.',
      icon: ArrowDownToLine,
      iconColor: 'text-cyan-500',
      badgeColor: 'border-l-cyan-500',
      path: '/stock-in',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['stock_in.view', 'stock_in.create'],
      whatItDoes: 'Records replenishment of materials and equipment into projects. Supports both single-entry direct receipts and bulk file uploads in a single operation.',
      whoCanUse: 'Warehouse personnel, Supervisors, and Administrators.',
      steps: [
        'Navigate to "Stock Receipts" and click "+ Receive Stock" or "Import CSV".',
        'Direct Entry: Select storage location, select items, enter quantities, and record PO or delivery note numbers.',
        'CSV Import: Click "Import CSV", download the template, populate records, and upload the file.',
        'Review preview table for accurate quantities and click "Confirm Stock Receipt".'
      ],
      proTips: 'Ensure CSV files are saved in UTF-8 encoding (or UTF-8 BOM) for flawless parsing.',
      warnings: 'Recording stock in increments available balances immediately. Verify SKU codes and locations before confirming.'
    },
    {
      id: 'stock-adjustment-and-transfer',
      category: ['supervisor', 'inventory'],
      title: '7. Stock Adjustment & Transfer',
      shortDesc: 'Physical inventory cycle counting, stock adjustments, and cross-warehouse transfers.',
      icon: SlidersHorizontal,
      iconColor: 'text-indigo-500',
      badgeColor: 'border-l-indigo-500',
      path: '/items',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['items.adjust_stock', 'items.transfer'],
      whatItDoes: 'Designed for periodic inventory audits and cycle counts. Allows operators to adjust stock balances up or down due to damage, shrinkage, or audit discrepancies, as well as transfer materials between projects and locations.',
      whoCanUse: 'Supervisors and Administrators granted items.adjust_stock permission.',
      steps: [
        'Navigate to "Items Master" and locate the item to adjust.',
        'Click "Adjust Stock".',
        'Enter the actual counted quantity or choose adjustment direction (Increase / Decrease).',
        'Specify the reason for adjustment (e.g. Annual Cycle Count, Damaged Goods, Initial Balance Import).',
        'Confirm the adjustment. The system logs an audit entry and updates the balance immediately.'
      ],
      proTips: 'All stock adjustments are logged in detail in "History" with timestamps, operator identity, and reasons.',
      warnings: 'Negative adjustments directly affect inventory valuation. Supervisor approval is recommended before submitting.'
    },
    {
      id: 'projects-and-items-master',
      category: ['admin'],
      title: '8. Projects & Master Catalog',
      shortDesc: 'Create projects, configure storage locations, and register SKU catalog items.',
      icon: FolderKanban,
      iconColor: 'text-blue-600',
      badgeColor: 'border-l-blue-600',
      path: '/projects',
      roles: ['ADMIN'],
      permissions: ['projects.create', 'projects.update', 'items.create', 'items.update'],
      whatItDoes: 'Master Data repository for managing project structures, physical warehouse locations, and catalog registrations for all materials and equipment.',
      whoCanUse: 'System Administrators.',
      steps: [
        'Creating Projects: Go to "Projects", click "+ Add Project", specify project code, name, and sub-locations.',
        'Deactivating Projects: When a project concludes, change its status to Inactive to prevent new transactions while preserving audit history.',
        'Registering Items: Go to "Items Master", click "+ Add Item", specify SKU, name, unit of measure, and category.'
      ],
      proTips: 'Standardize project codes and SKU patterns (e.g. PRJ-001, MAT-ELC-001) for optimal search and filtering performance.',
      warnings: 'Inactive projects are automatically hidden from withdrawal and stock-in forms.'
    },
    {
      id: 'user-management-and-avatars',
      category: ['admin'],
      title: '9. User Management & Scopes',
      shortDesc: 'Create user accounts, assign roles, define project access scopes, and manage R2 profile avatars.',
      icon: Users,
      iconColor: 'text-cyan-600',
      badgeColor: 'border-l-cyan-600',
      path: '/users',
      roles: ['ADMIN'],
      permissions: ['users.view', 'users.create', 'users.update', 'users.deactivate'],
      whatItDoes: 'Centralized administration for user accounts, profile details, departments, project scopes, forced password resets, and Cloudflare R2 avatars.',
      whoCanUse: 'System Administrators.',
      steps: [
        'Go to "Users", click "+ Add User" or click the pencil icon to edit an existing user.',
        'Profile Tab: Enter full name, phone number, department, position, upload avatar, and toggle "Force password change on next login".',
        'Role & Status Tab: Select the user role and account status (ACTIVE, INACTIVE, or SUSPENDED).',
        'Project Access Tab: Choose "All Projects" or "Selected Projects" to restrict project visibility.',
        'Click "Save Changes". Updates sync to the database and refresh the table instantly.'
      ],
      proTips: 'The system includes Last Admin Protection to prevent accidental deactivation or demotion of the final administrator.',
      warnings: 'When employees leave, set their account status to INACTIVE instead of deleting to preserve historical audit logs.'
    },
    {
      id: 'dynamic-rbac-role-management',
      category: ['admin'],
      title: '10. Dynamic RBAC at /roles',
      shortDesc: 'Create custom roles, configure granular permissions, and customize badge color themes.',
      icon: Shield,
      iconColor: 'text-purple-600',
      badgeColor: 'border-l-purple-600',
      path: '/roles',
      roles: ['ADMIN'],
      permissions: ['roles.view', 'roles.create', 'roles.manage_permissions'],
      whatItDoes: 'Advanced Role-Based Access Control system enabling Administrators to create custom roles and configure permissions across 36+ granular security rights.',
      whoCanUse: 'System Administrators.',
      steps: [
        'Navigate to "Roles & Permissions" at `/roles`.',
        'Inspect user counts and permission allocations on role summary cards.',
        'Click "+ Create New Role", specify role code, display name, description, and badge color with live preview.',
        'Click "Manage Permissions" on any role card to toggle functional permissions.',
        'The Permission Dependency Engine automatically activates prerequisite permissions (e.g. enabling project creation auto-enables project viewing).',
        'Click "Save Permissions". Changes take effect immediately for all users assigned to that role.'
      ],
      proTips: 'Default system roles (ADMIN, STAFF, SUPERVISOR) are protected from deletion to maintain system stability.',
      warnings: 'Revoking permissions takes effect immediately for active sessions assigned to that role.'
    },
    {
      id: 'reports-and-audit-history',
      category: ['supervisor', 'admin'],
      title: '11. Reports & Audit Trail',
      shortDesc: 'Generate inventory summaries, requisition reports, and export to Excel / PDF.',
      icon: FileText,
      iconColor: 'text-rose-500',
      badgeColor: 'border-l-rose-500',
      path: '/reports',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['reports.view', 'reports.export', 'history.view'],
      whatItDoes: 'Reporting hub for inventory balances, stock movements, project requisition history, and user audit logs. Supports export to formatted Excel spreadsheets and print-ready PDF documents.',
      whoCanUse: 'Supervisors, Approvers, Executives, and Administrators.',
      steps: [
        'Navigate to "Reports" and choose the desired report type (Stock Balance / Withdrawal History / Site Kits Report).',
        'Select date range and filter by project.',
        'Click "Export Excel (XLSX)" for spreadsheet analysis.',
        'Click "Print PDF Report" to generate an official formatted document with letterhead and statistical summaries.'
      ],
      proTips: 'Inspect audit trail details at any time in "History", which records IP addresses, timestamps, and change diffs.',
      warnings: 'When exporting large datasets, select specific date ranges to optimize report generation speed.'
    }
  ], []);

  // Filter sections based on search query and active role filter
  const filteredSections = useMemo(() => {
    return manualSections.filter((sec) => {
      const matchesFilter = activeRoleFilter === 'all' || sec.category.includes(activeRoleFilter);
      
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesFilter;

      const matchesTitle = sec.title.toLowerCase().includes(query);
      const matchesDesc = sec.shortDesc.toLowerCase().includes(query) || sec.whatItDoes.toLowerCase().includes(query);
      const matchesSteps = sec.steps.some(step => step.toLowerCase().includes(query));
      const matchesRoles = sec.roles.some(r => r.toLowerCase().includes(query));
      const matchesPerms = sec.permissions.some(p => p.toLowerCase().includes(query));

      return matchesFilter && (matchesTitle || matchesDesc || matchesSteps || matchesRoles || matchesPerms);
    });
  }, [searchQuery, activeRoleFilter, manualSections]);

  return (
    <div className="space-y-8 pb-20 max-w-6xl mx-auto">
      {/* Hero Header Section */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-xl bg-card border border-border shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> StockFlow System Knowledge Base
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
              <BookOpen className="w-8 h-8 sm:w-10 h-10 text-primary shrink-0" />
              StockFlow User Manual
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Comprehensive system guide detailing workflows across all roles (Staff, Supervisor, Admin) 
              and dynamic RBAC access control.
            </p>
          </div>

          {/* Search Box */}
          <div className="w-full md:w-80 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search functions, permissions, steps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 bg-background border border-input text-xs rounded-lg"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Role Navigation Bar */}
        <div className="mt-6 pt-5 border-t border-border flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filter by Role:
          </span>
          {roleFilters.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeRoleFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveRoleFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary-foreground' : tab.color || 'text-muted-foreground'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Role Responsibility Quick Summary Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Role 1: Staff */}
        <div className="p-4 rounded-xl border border-border border-l-4 border-l-blue-500 bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> Requisition Staff (STAFF)
            </span>
            <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
              Requester
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Check project inventory, create withdrawal orders via POS, borrow and return tools, request due date extensions, and track order status.
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">withdrawals.create</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">checkouts.create</span>
          </div>
        </div>

        {/* Role 2: Supervisor */}
        <div className="p-4 rounded-xl border border-border border-l-4 border-l-emerald-500 bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Approver (SUPERVISOR)
            </span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
              Approver
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Review and approve/reject withdrawal requests, record stock receipts, adjust inventory balances, and export project summary reports.
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">withdrawals.approve</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">stock_in.create</span>
          </div>
        </div>

        {/* Role 3: Admin */}
        <div className="p-4 rounded-xl border border-border border-l-4 border-l-purple-500 bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" /> System Administrator (ADMIN)
            </span>
            <span className="text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
              Administrator
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Full administrative authority: manage projects, item catalog, user accounts, project access scopes, and configure dynamic RBAC at /roles.
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">roles.manage_permissions</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">users.update</span>
          </div>
        </div>
      </div>

      {/* Result Counter & Search Status */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing documentation: <strong className="text-foreground">{filteredSections.length}</strong> of {manualSections.length} sections
        </span>
        {searchQuery && (
          <span>
            Search results for: &quot;<span className="text-primary font-medium">{searchQuery}</span>&quot;
          </span>
        )}
      </div>

      {/* Manual Content Cards List */}
      <div className="space-y-6">
        {filteredSections.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-card border border-border shadow-xs space-y-3">
            <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
            <h3 className="text-base font-bold text-foreground">No documentation found matching your search query</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Try searching for terms like &quot;withdrawals&quot;, &quot;borrow&quot;, &quot;approve&quot;, &quot;CSV&quot;, &quot;permissions&quot;, or &quot;projects&quot;
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(''); setActiveRoleFilter('all'); }}
              className="text-xs h-8 px-3 rounded-lg mt-2 cursor-pointer"
            >
              Show all documentation
            </Button>
          </div>
        ) : (
          filteredSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <Card 
                key={sec.id} 
                id={sec.id}
                className={`rounded-xl bg-card border border-border shadow-xs border-l-4 ${sec.badgeColor} overflow-hidden transition-all duration-200 hover:shadow-md`}
              >
                <CardHeader className="bg-muted/10 pb-4 border-b border-border/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-center shrink-0">
                        <Icon className={`w-5 h-5 ${sec.iconColor}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                          {sec.title}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                          {sec.shortDesc}
                        </CardDescription>
                      </div>
                    </div>

                    {/* Quick Jump Link to Live Feature Page */}
                    {sec.path && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(sec.path)}
                        className="text-xs h-8 px-3 rounded-lg shrink-0 self-start sm:self-auto flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Open Live Page</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 sm:p-6 space-y-5 text-sm">
                  {/* 1. What it does & Who can use */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="md:col-span-2 space-y-1.5">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-primary" /> What it does
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sec.whatItDoes}
                      </p>
                    </div>

                    <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-border/40 pt-3 md:pt-0 md:pl-4">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-500" /> Who can use
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sec.whoCanUse}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {sec.permissions.map((perm) => (
                          <span key={perm} className="text-[10px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 2. Step-by-Step Instructions */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" /> Step-by-Step Instructions
                    </h4>
                    <div className="space-y-2">
                      {sec.steps.map((step, index) => (
                        <div 
                          key={index} 
                          className="flex items-start gap-3 p-2.5 rounded-lg bg-background/60 border border-border/40 text-xs text-foreground leading-relaxed"
                        >
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                            {index + 1}
                          </span>
                          <span className="flex-1">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. Pro-Tips & Safety Warnings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {sec.proTips && (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs space-y-1">
                        <span className="font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                          <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Pro-Tip
                        </span>
                        <p className="text-[11px] leading-relaxed opacity-90">{sec.proTips}</p>
                      </div>
                    )}

                    {sec.warnings && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                        <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Safety Rules / Warnings
                        </span>
                        <p className="text-[11px] leading-relaxed opacity-90">{sec.warnings}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Footer Support & System Info */}
      <div className="p-6 rounded-xl bg-muted/30 border border-border/50 text-center space-y-2">
        <h4 className="font-bold text-xs text-foreground flex items-center justify-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-primary" /> Need additional help or want to report an issue?
        </h4>
        <p className="text-xs text-muted-foreground max-w-lg mx-auto">
          If you encounter stock calculation issues, menu access errors, or require a specialized custom role, 
          contact your organization System Administrator.
        </p>
      </div>
    </div>
  );
};

export default Manual;
