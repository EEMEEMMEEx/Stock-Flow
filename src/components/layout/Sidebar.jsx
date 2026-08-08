import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Package, ArrowDownToLine, ArrowUpFromLine, History, FileText, Settings, X, BookOpen, UserCog, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { can } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, show: can('dashboard.view') },
    { name: 'โครงการ (Projects)', path: '/projects', icon: FolderKanban, show: can('projects.view') },
    { name: 'รายการวัสดุ (Items)', path: '/items', icon: Package, show: can('items.view') },
    { name: 'รับเข้า Stock', path: '/stock-in', icon: ArrowDownToLine, show: can('stock_in.view') },
    { name: 'เบิกจ่าย (Withdrawals)', path: '/withdrawals', icon: ArrowUpFromLine, show: can('withdrawals.view') },
    { name: 'ประวัติ (History)', path: '/history', icon: History, show: can('history.view') },
    { name: 'รายงาน (Reports)', path: '/reports', icon: FileText, show: can('reports.view') },
    { name: 'จัดการผู้ใช้ (Users)', path: '/users', icon: UserCog, show: can('users.view') },
    { name: 'จัดการบทบาทและสิทธิ์ (RBAC)', path: '/roles', icon: ShieldCheck, show: can('roles.view') },
    { name: 'คู่มือการใช้งาน (Manual)', path: '/manual', icon: BookOpen, show: true },
  ];



  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={cn(
        "w-64 flex-shrink-0 flex-col bg-[#e0e5ec] shadow-[5px_0_10px_rgb(163,177,198,0.6)] h-screen z-50 fixed md:sticky top-0 transition-transform duration-300 md:flex",
        isOpen ? "translate-x-0 flex" : "-translate-x-full md:translate-x-0 hidden md:flex"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/40">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            StockFlow
          </h1>
          <button className="md:hidden text-muted-foreground p-1 hover:bg-black/5 rounded-md" onClick={() => setIsOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-3 space-y-1">
            {navItems.filter(item => item.show).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium",
                    isActive
                      ? "neu-pressed text-primary"
                      : "text-muted-foreground hover:neu-flat-sm hover:text-foreground"
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>
        {can('settings.view') && (
          <div className="p-4 border-t">
            <NavLink
              to="/settings"
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium",
                  isActive
                    ? "neu-pressed text-primary font-semibold"
                    : "text-muted-foreground hover:neu-flat-sm hover:text-foreground"
                )
              }
            >
              <Settings className="w-5 h-5" />
              ตั้งค่าระบบ (Settings)
            </NavLink>
          </div>
        )}

      </aside>
    </>
  );
};

export default Sidebar;
