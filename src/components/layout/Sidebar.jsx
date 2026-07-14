import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Package, ArrowDownToLine, ArrowUpFromLine, History, FileText, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const Sidebar = () => {
  const { isAdmin } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, show: true },
    { name: 'โครงการ (Projects)', path: '/projects', icon: FolderKanban, show: true },
    { name: 'รายการวัสดุ (Items)', path: '/items', icon: Package, show: isAdmin },
    { name: 'รับเข้า Stock', path: '/stock-in', icon: ArrowDownToLine, show: isAdmin },
    { name: 'เบิกจ่าย (Withdrawals)', path: '/withdrawals', icon: ArrowUpFromLine, show: true },
    { name: 'ประวัติ (History)', path: '/history', icon: History, show: true },
    { name: 'รายงาน (Reports)', path: '/reports', icon: FileText, show: true },
  ];

  return (
    <aside className="w-64 flex-shrink-0 hidden md:flex flex-col border-r bg-white/80 backdrop-blur-xl h-screen sticky top-0">
      <div className="h-16 flex items-center px-6 border-b">
        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          StockFlow
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-3 space-y-1">
          {navItems.filter(item => item.show).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="p-4 border-t">
        <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
          <Settings className="w-5 h-5" />
          Settings
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
