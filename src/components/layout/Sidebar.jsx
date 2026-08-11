import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Package, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  History, 
  FileText, 
  Settings, 
  X, 
  BookOpen, 
  UserCog, 
  ShieldCheck,
  User,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Declarative Navigation Configuration grouped logically into operational sections.
 * Permission codes map directly to canonical RBAC permissions from AuthContext.
 */
const NAVIGATION_GROUPS = [
  {
    id: 'main',
    title: 'การดำเนินงานหลัก',
    items: [
      { id: 'dashboard', name: 'Dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard.view' },
      { id: 'projects', name: 'โครงการ (Projects)', path: '/projects', icon: FolderKanban, permission: 'projects.view' },
      { id: 'items', name: 'รายการวัสดุ (Items)', path: '/items', icon: Package, permission: 'items.view' },
      { id: 'stock_in', name: 'รับเข้า Stock', path: '/stock-in', icon: ArrowDownToLine, permission: 'stock_in.view' },
      { id: 'withdrawals', name: 'เบิกจ่าย (Withdrawals)', path: '/withdrawals', icon: ArrowUpFromLine, permission: 'withdrawals.view' },
      { id: 'history', name: 'ประวัติ (History)', path: '/history', icon: History, permission: 'history.view' },
      { id: 'reports', name: 'รายงาน (Reports)', path: '/reports', icon: FileText, permission: 'reports.view' },
    ]
  },
  {
    id: 'admin',
    title: 'ผู้ดูแลระบบ',
    items: [
      { id: 'users', name: 'จัดการผู้ใช้ (Users)', path: '/users', icon: UserCog, permission: 'users.view' },
      { id: 'roles', name: 'จัดการบทบาทและสิทธิ์ (RBAC)', path: '/roles', icon: ShieldCheck, permission: 'roles.view' },
    ]
  },
  {
    id: 'account',
    title: 'ส่วนตัวและช่วยเหลือ',
    items: [
      { id: 'profile', name: 'โปรไฟล์ส่วนตัว (Profile)', path: '/profile', icon: User, permission: null },
      { id: 'manual', name: 'คู่มือการใช้งาน (Manual)', path: '/manual', icon: BookOpen, permission: null },
    ]
  }
];

const Sidebar = ({ isOpen, onClose, isCollapsed, onToggleCollapse }) => {
  const { can, loading } = useAuth();
  const location = useLocation();
  const closeButtonRef = useRef(null);

  // Lock mobile body scroll & manage Escape key
  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.dataset.mobileMenuOpen = 'true';
    document.addEventListener('keydown', closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      delete document.body.dataset.mobileMenuOpen;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  // Auto close mobile drawer on route change
  useEffect(() => {
    if (isOpen) onClose();
  }, [location.pathname, onClose]);

  const isSettingsActive = location.pathname.startsWith('/settings');

  const renderNavItem = (item, isDesktopCollapsed) => {
    const isActive = item.path === '/' 
      ? location.pathname === '/' 
      : location.pathname.startsWith(item.path);

    const linkContent = (
      <NavLink
        key={item.id}
        to={item.path}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 py-3 rounded-xl transition-all duration-200 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden whitespace-nowrap shrink-0",
          isDesktopCollapsed ? "justify-center px-0 w-11 h-11 mx-auto" : "px-3 w-full",
          isActive
            ? "neu-pressed text-primary font-semibold shadow-sm border-l-2 border-primary"
            : "text-muted-foreground hover:neu-flat-sm hover:text-foreground"
        )}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        <span 
          className={cn(
            "truncate transition-opacity duration-200 whitespace-nowrap",
            isDesktopCollapsed ? "hidden" : "block"
          )}
        >
          {item.name}
        </span>
      </NavLink>
    );

    if (isDesktopCollapsed) {
      return (
        <Tooltip key={item.id} delayDuration={100}>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {item.name}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <TooltipProvider>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <button
          type="button"
          aria-label="ปิดเมนูนำทาง"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar Aside Element */}
      <aside 
        id="stockflow-sidebar"
        aria-label="แถบเมนูหลัก"
        className={cn(
          "fixed top-0 z-50 flex h-screen flex-shrink-0 flex-col border-r border-[var(--glass-card-border)] bg-[var(--glass-card-bg)] shadow-xl backdrop-blur-xl transition-[width,transform] duration-200 ease-out md:sticky md:z-20 md:translate-x-0 md:opacity-100 md:shadow-sm overflow-x-hidden",
          isCollapsed ? "md:w-20" : "md:w-64",
          isOpen ? "w-64 translate-x-0 opacity-100" : "w-64 pointer-events-none -translate-x-full opacity-0 md:pointer-events-auto"
        )}
      >
        {/* App Brand Header & Toggle Control */}
        {isCollapsed && !isOpen ? (
          /* Collapsed Header: Single centered toggle button with brand icon & tooltip */
          <div className="h-16 flex items-center justify-center border-b border-border/40 shrink-0">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                  aria-expanded={false}
                  aria-controls="stockflow-sidebar"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
                >
                  <Package className="w-5 h-5 group-hover:hidden" />
                  <PanelLeftOpen className="w-5 h-5 hidden group-hover:block" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12}>
                Expand sidebar (StockFlow)
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded Header: Logo on left, collapse button on right */
          <div className="h-16 flex items-center justify-between px-5 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 shadow-inner">
                <Package className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent truncate whitespace-nowrap">
                StockFlow
              </span>
            </div>

            <button
              type="button"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              aria-expanded={true}
              aria-controls="stockflow-sidebar"
              onClick={onToggleCollapse}
              className="hidden md:flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-[var(--glass-hover)] hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>

            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close navigation"
              title="Close navigation"
              aria-expanded={isOpen}
              aria-controls="stockflow-sidebar"
              className="flex md:hidden h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-[var(--glass-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Navigation Items Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
          <nav className={cn("space-y-4", isCollapsed ? "px-2" : "px-3")}>
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "h-10 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse flex items-center gap-3 px-3 py-2.5",
                    isCollapsed && "w-11 h-11 p-0 justify-center mx-auto"
                  )}
                >
                  <div className="w-5 h-5 rounded bg-black/10 dark:bg-white/10 shrink-0" />
                  {!isCollapsed && <div className="h-4 w-32 rounded bg-black/10 dark:bg-white/10" />}
                </div>
              ))
            ) : (
              NAVIGATION_GROUPS.map((group, groupIdx) => {
                const visibleItems = group.items.filter(
                  (item) => !item.permission || can(item.permission)
                );
                if (visibleItems.length === 0) return null;

                return (
                  <div key={group.id} className="space-y-1">
                    {groupIdx > 0 && (
                      <div className={cn("my-2 border-t border-border/30", isCollapsed ? "mx-1" : "mx-2")} />
                    )}
                    <div 
                      className={cn(
                        "px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 transition-all duration-200 whitespace-nowrap",
                        isCollapsed ? "hidden" : "block"
                      )}
                    >
                      {group.title}
                    </div>
                    {visibleItems.map((item) => renderNavItem(item, isCollapsed))}
                  </div>
                );
              })
            )}
          </nav>
        </div>

        {/* Settings Menu Footer */}
        {!loading && can('settings.view') && (
          <div className={cn("p-3 border-t border-border/40 shrink-0", isCollapsed && "px-2 text-center")}>
            {isCollapsed ? (
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/settings"
                    onClick={onClose}
                    className={cn(
                      "flex items-center justify-center w-11 h-11 mx-auto rounded-xl transition-all duration-200 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden whitespace-nowrap shrink-0",
                      isSettingsActive
                        ? "neu-pressed text-primary font-semibold shadow-sm border-l-2 border-primary"
                        : "text-muted-foreground hover:neu-flat-sm hover:text-foreground"
                    )}
                  >
                    <Settings className="w-5 h-5 shrink-0" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  ตั้งค่าระบบ (Settings)
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                to="/settings"
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden whitespace-nowrap shrink-0",
                  isSettingsActive
                    ? "neu-pressed text-primary font-semibold shadow-sm border-l-2 border-primary"
                    : "text-muted-foreground hover:neu-flat-sm hover:text-foreground"
                )}
              >
                <Settings className="w-5 h-5 shrink-0" />
                <span className="truncate whitespace-nowrap">ตั้งค่าระบบ (Settings)</span>
              </NavLink>
            )}
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
};

export default Sidebar;
