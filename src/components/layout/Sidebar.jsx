import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Package, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  RotateCcw,
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
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Declarative Navigation Configuration grouped logically into operational sections.
 * Permission codes map directly to canonical RBAC permissions from AuthContext.
 */
const NAVIGATION_GROUPS = [
  {
    id: 'main',
    title: 'Main Operations',
    titleKey: 'nav.mainOperations',
    items: [
      { id: 'dashboard', name: 'Dashboard', nameKey: 'nav.dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard.view' },
      { id: 'projects', name: 'Projects', nameKey: 'nav.projects', path: '/projects', icon: FolderKanban, permission: 'projects.view' },
      { id: 'items', name: 'Items', nameKey: 'nav.items', path: '/items', icon: Package, permission: 'items.view' },
      { id: 'stock_in', name: 'Stock In', nameKey: 'nav.stockIn', path: '/stock-in', icon: ArrowDownToLine, permission: 'stock_in.view' },
      { id: 'withdrawals', name: 'Withdrawals', nameKey: 'nav.withdrawals', path: '/withdrawals', icon: ArrowUpFromLine, permission: 'withdrawals.view' },
      { id: 'checkouts', name: 'Checkouts', nameKey: 'nav.checkouts', path: '/checkouts', icon: RotateCcw, permission: 'checkouts.view' },
      { id: 'history', name: 'History', nameKey: 'nav.history', path: '/history', icon: History, permission: 'history.view' },
      { id: 'reports', name: 'Reports', nameKey: 'nav.reports', path: '/reports', icon: FileText, permission: 'reports.view' },
    ]
  },
  {
    id: 'admin',
    title: 'Administration',
    titleKey: 'nav.administration',
    items: [
      { id: 'users', name: 'Users', nameKey: 'nav.users', path: '/users', icon: UserCog, permission: 'users.view' },
      { id: 'roles', name: 'Roles & Permissions', nameKey: 'nav.roles', path: '/roles', icon: ShieldCheck, permission: 'roles.view' },
    ]
  },
  {
    id: 'account',
    title: 'Account & Help',
    titleKey: 'nav.accountHelp',
    items: [
      { id: 'profile', name: 'Profile', nameKey: 'nav.profile', path: '/profile', icon: User, permission: null },
      { id: 'manual', name: 'Manual', nameKey: 'nav.manual', path: '/manual', icon: BookOpen, permission: null },
    ]
  }
];

const Sidebar = ({ isOpen, onClose, isCollapsed, onToggleCollapse }) => {
  const { can, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const closeButtonRef = useRef(null);

  // Lock mobile body scroll & manage Escape key
  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.mobileMenuOpen = 'true';
    document.addEventListener('keydown', closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      delete document.body.dataset.mobileMenuOpen;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  // Auto close mobile drawer on route change
  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  const isSettingsActive = location.pathname.startsWith('/settings');

  // On mobile drawer (isOpen === true), navigation must ALWAYS be expanded with full labels
  const isNavCollapsed = isCollapsed && !isOpen;

  /* Single source of truth for the rail width.
     Previously the collapsed class (md:w-20) sat in the same class list as an
     unconditional md:w-64, and Tailwind emits md:w-64 later in the stylesheet —
     so the 80px rail never applied and the icon-only rail stayed 256px wide.
     Only ONE md width class may be present at a time. */
  const railWidthClass = isNavCollapsed ? 'md:w-16' : 'md:w-64';

  const renderNavItem = (item) => {
    const isActive = item.path === '/' 
      ? location.pathname === '/' 
      : location.pathname.startsWith(item.path);

    const itemName = item.nameKey ? t(item.nameKey) : item.name;

    const linkContent = (
      <NavLink
        key={item.id}
        to={item.path}
        onClick={onClose}
        /* Collapsed rail hides the visible label with display:none, so the link
           must carry its own accessible name; expanded state uses the visible text. */
        aria-label={isNavCollapsed ? itemName : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          "relative flex items-center gap-3 py-2.5 rounded-lg transition-colors duration-150 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card overflow-hidden whitespace-nowrap shrink-0",
          isNavCollapsed ? "justify-center px-0 w-10 h-10 mx-auto" : "px-3 w-full",
          isActive
            ? "bg-primary/15 text-primary font-semibold shadow-xs hover:bg-primary/25"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {/* Active indicator: absolutely positioned so the 2px shift of a left border
            never moves the icon (keeps collapsed tiles perfectly centred). */}
        {isActive && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
          />
        )}
        <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span 
          className={cn(
            "truncate transition-opacity duration-200 whitespace-nowrap",
            isNavCollapsed ? "hidden" : "block"
          )}
        >
          {itemName}
        </span>
      </NavLink>
    );

    if (isNavCollapsed) {
      return (
        <Tooltip key={item.id} delayDuration={100}>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {itemName}
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
          aria-label={t('nav.closeNavigation')}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar Aside Element */}
      <aside 
        id="stockflow-sidebar"
        aria-label={t('nav.sidebar', 'Sidebar')}
        className={cn(
          "fixed top-0 z-50 flex h-dvh flex-shrink-0 flex-col border-r border-border bg-card shadow-lg md:shadow-none transition-[width,transform,visibility] duration-200 ease-out md:sticky md:z-20 md:translate-x-0 md:opacity-100 overflow-x-hidden",
          isOpen ? "w-[85vw] max-w-[320px] sm:w-80 translate-x-0 opacity-100" : "w-[85vw] max-w-[320px] sm:w-80 pointer-events-none -translate-x-full opacity-0 max-md:invisible md:pointer-events-auto",
          railWidthClass
        )}
      >
        {/* App Brand Header & Toggle Control */}
        {isCollapsed && !isOpen ? (
          /* Collapsed Header: Single centered toggle button with brand icon & tooltip */
          <div className="h-14 flex items-center justify-center border-b border-border/40 shrink-0">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label={t('nav.expandSidebar')}
                  title={t('nav.expandSidebar')}
                  aria-expanded={false}
                  aria-controls="stockflow-sidebar"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group cursor-pointer"
                >
                  <Package className="w-5 h-5 group-hover:hidden" aria-hidden="true" />
                  <PanelLeftOpen className="w-5 h-5 hidden group-hover:block" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12}>
                {t('nav.expandSidebar')}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded Header: Logo on left, collapse button on right */
          <div className="h-14 flex items-center justify-between px-5 border-b border-border/40 shrink-0 pt-[env(safe-area-inset-top)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent truncate whitespace-nowrap">
                StockFlow
              </span>
            </div>

            <button
              type="button"
              aria-label={t('nav.collapseSidebar')}
              title={t('nav.collapseSidebar')}
              aria-expanded={true}
              aria-controls="stockflow-sidebar"
              onClick={onToggleCollapse}
              className="hidden md:flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 cursor-pointer"
            >
              <PanelLeftClose className="w-5 h-5" aria-hidden="true" />
            </button>

            <button
              ref={closeButtonRef}
              type="button"
              aria-label={t('nav.closeNavigation')}
              title={t('nav.closeNavigation')}
              aria-expanded={isOpen}
              aria-controls="stockflow-sidebar"
              className="flex md:hidden h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 cursor-pointer"
              onClick={onClose}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Navigation Items Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <nav aria-label={t('nav.mainNavigation')} className={cn("space-y-2", isNavCollapsed ? "px-2" : "px-3")}>
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "h-10 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse flex items-center gap-3 px-3 py-2.5",
                    isNavCollapsed && "w-11 h-11 p-0 justify-center mx-auto"
                  )}
                >
                  <div className="w-5 h-5 rounded bg-black/10 dark:bg-white/10 shrink-0" />
                  {!isNavCollapsed && <div className="h-4 w-32 rounded bg-black/10 dark:bg-white/10" />}
                </div>
              ))
            ) : (
              NAVIGATION_GROUPS.map((group, groupIdx) => {
                const visibleItems = group.items.filter(
                  (item) => !item.permission || can(item.permission)
                );
                if (visibleItems.length === 0) return null;

                return (
                  <div
                    key={group.id}
                    role="group"
                    aria-labelledby={`sidebar-group-${group.id}`}
                    className="space-y-1"
                  >
                    {groupIdx > 0 && (
                      <div aria-hidden="true" className={cn("my-1.5 border-t border-border/30", isNavCollapsed ? "mx-1" : "mx-2")} />
                    )}
                    {/* sr-only (not hidden) when collapsed so the section name stays
                        available to assistive technology in both states. */}
                    <div
                      id={`sidebar-group-${group.id}`}
                      className={cn(
                        "px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 transition-all duration-200 whitespace-nowrap",
                        isNavCollapsed ? "sr-only" : "block"
                      )}
                    >
                      {group.titleKey ? t(group.titleKey) : group.title}
                    </div>
                    {visibleItems.map((item) => renderNavItem(item))}
                  </div>
                );
              })
            )}
          </nav>
        </div>

        {/* Settings Menu Footer */}
        {!loading && can('settings.view') && (
          <nav
            aria-label={t('nav.settings')}
            className={cn("p-3 border-t border-border/40 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]", isNavCollapsed && "px-2 text-center")}
          >
            {isNavCollapsed ? (
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/settings"
                    onClick={onClose}
                    aria-label={t('nav.settings')}
                    aria-current={isSettingsActive ? 'page' : undefined}
                    className={cn(
                      "relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-colors duration-150 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card overflow-hidden whitespace-nowrap shrink-0",
                      isSettingsActive
                        ? "bg-primary/15 text-primary font-semibold shadow-xs hover:bg-primary/25"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {isSettingsActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                      />
                    )}
                    <Settings className="w-5 h-5 shrink-0" aria-hidden="true" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  {t('nav.settings')}
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                to="/settings"
                onClick={onClose}
                aria-current={isSettingsActive ? 'page' : undefined}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card overflow-hidden whitespace-nowrap shrink-0",
                  isSettingsActive
                    ? "bg-primary/15 text-primary font-semibold shadow-xs hover:bg-primary/25"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {isSettingsActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                  />
                )}
                <Settings className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="truncate whitespace-nowrap">{t('nav.settings', 'Settings')}</span>
              </NavLink>
            )}
          </nav>
        )}
      </aside>
    </TooltipProvider>
  );
};

export default Sidebar;
