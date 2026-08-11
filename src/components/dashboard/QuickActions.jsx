import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, History, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const ACTION_DEFS = [
  {
    id: 'stock-in',
    label: 'รับเข้า Stock',
    description: 'เพิ่มวัสดุเข้าคลัง',
    href: '/stock-in',
    icon: ArrowDownToLine,
    permission: 'stock_in.view',
  },
  {
    id: 'withdrawals',
    label: 'เบิกจ่ายวัสดุ',
    description: 'ส่งคำขอเบิกจ่าย',
    href: '/withdrawals',
    icon: ArrowUpFromLine,
    permission: 'withdrawals.view',
  },
  {
    id: 'history',
    label: 'ดูประวัติ',
    description: 'ตรวจสอบรายการ',
    href: '/history',
    icon: History,
    permission: 'history.view',
  },
];

/**
 * Quick actions row — only actions the current user has permission for are shown.
 * Icon + label + description buttons with 44px+ touch targets.
 */
const QuickActions = ({ className = '' }) => {
  const { can } = useAuth();
  const actions = ACTION_DEFS.filter((action) => can(action.permission));

  if (actions.length === 0) return null;

  return (
    <section
      aria-label="ดำเนินการด่วน"
      className={cn(
        'flex flex-col neu-flat border-0 text-card-foreground',
        className
      )}
    >
      <div className="flex items-center gap-2 bg-muted/30 border-b border-foreground/10 px-4 py-3.5 sm:px-5">
        <Zap className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-bold tracking-wide uppercase text-foreground">ดำเนินการด่วน</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              to={action.href}
              className="neu-flat-sm border-0 neu-interactive group flex min-h-[56px] items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-foreground">{action.label}</span>
                <span className="block truncate text-sm text-muted-foreground">{action.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default QuickActions;
