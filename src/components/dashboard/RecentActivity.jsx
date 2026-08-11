import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, ArrowUpFromLine, AlertTriangle, RefreshCw, Building2, UserRound, Clock, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';

const getStatusInfo = (status) => {
  switch (status) {
    case 'pending':
      return { text: 'รออนุมัติ', cls: 'text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300 dark:bg-amber-400/15' };
    case 'approved':
      return { text: 'อนุมัติ', cls: 'text-blue-700 bg-blue-500/10 border-blue-500/30 dark:text-blue-300 dark:bg-blue-400/15' };
    case 'completed':
      return { text: 'รับของแล้ว', cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300 dark:bg-emerald-400/15' };
    case 'rejected':
      return { text: 'ปฏิเสธ', cls: 'text-red-700 bg-red-500/10 border-red-500/30 dark:text-red-300 dark:bg-red-400/15' };
    default:
      return { text: status, cls: 'text-muted-foreground bg-muted/70 border-border' };
  }
};

/**
 * Reusable Dashboard "กิจกรรมล่าสุด" list.
 * Shows requester, project, time, item count and status. Rows link to /history
 * only when the user has `history.view` permission. Stable keys from order id.
 */
const RecentActivity = ({
  data = [],
  status = 'loading', // 'loading' | 'success' | 'empty' | 'error'
  error = null,
  onRetry = null,
  canViewHistory = false,
  className = '',
}) => {
  const rowClasses =
    'group flex flex-col gap-2 px-4 py-4 sm:px-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';

  const renderRow = (item) => {
    const statusInfo = getStatusInfo(item.status);
    const requester = item.profiles?.full_name || 'ผู้ใช้ไม่ระบุ';
    const itemCount = item.withdrawal_items?.length || 0;
    const firstItemName = item.withdrawal_items?.[0]?.items?.name;
    const extraCount = Math.max(itemCount - 1, 0);

    const content = (
      <>
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{requester}</span>
          </p>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-sm font-bold ${statusInfo.cls}`}
          >
            {statusInfo.text}
          </span>
        </div>

        <p className="text-sm font-medium leading-snug text-foreground">
          เบิก {firstItemName || 'วัสดุ'}
          {extraCount > 0 ? ` และอีก ${extraCount} รายการ` : ''}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.projects?.name || '—'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ListOrdered className="h-4 w-4 shrink-0" aria-hidden="true" />
            {itemCount} รายการ
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {format(new Date(item.requested_at), 'dd/MM/yyyy HH:mm')}
          </span>
        </div>
      </>
    );

    if (canViewHistory) {
      return (
        <li key={item.id}>
          <Link
            to="/history"
            className={cn(rowClasses, 'hover:bg-foreground/[0.04]')}
            aria-label={`ดูรายการเบิกจ่ายโดย ${requester} สำหรับโครงการ ${item.projects?.name || 'ไม่ระบุ'} จำนวน ${itemCount} รายการ สถานะ ${statusInfo.text}`}
          >
            {content}
          </Link>
        </li>
      );
    }

    return (
      <li key={item.id}>
        <div className={cn(rowClasses, 'cursor-default')}>{content}</div>
      </li>
    );
  };

  return (
    <section
      aria-label="กิจกรรมล่าสุด"
      className={cn(
        'flex flex-col neu-flat border-0 text-card-foreground',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-muted/30 border-b border-foreground/10 px-4 py-3.5 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase text-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          กิจกรรมล่าสุด
        </h2>
        {canViewHistory && status === 'success' && data.length > 0 && (
          <Link
            to="/history"
            className="neu-button inline-flex h-11 shrink-0 items-center px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ดูทั้งหมด
          </Link>
        )}
      </div>

      {/* Body */}
      <div className="flex-1">
        {status === 'loading' && (
          <div className="space-y-0 divide-y divide-foreground/10" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2.5 px-4 py-4 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="h-4 w-32 animate-pulse rounded-md bg-foreground/10" />
                  <div className="h-5 w-16 animate-pulse rounded-md bg-foreground/10" />
                </div>
                <div className="h-4 w-3/4 animate-pulse rounded-md bg-foreground/10" />
                <div className="h-3.5 w-1/2 animate-pulse rounded-md bg-foreground/10" />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="flex min-h-[280px] flex-col items-center justify-center text-center px-6">
            <div className="p-4 rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
              <AlertTriangle className="h-8 w-8 stroke-1.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">โหลดกิจกรรมล่าสุดไม่สำเร็จ</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {error || 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง'}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="neu-button mt-4 inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                ลองใหม่อีกครั้ง
              </button>
            )}
          </div>
        )}

        {status === 'empty' && (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-center px-6">
            <div className="p-4 rounded-2xl bg-muted/60 text-muted-foreground ring-1 ring-foreground/10">
              <ArrowUpFromLine className="h-8 w-8 stroke-1.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">ยังไม่มีกิจกรรม</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              เมื่อมีการเบิกจ่ายวัสดุ รายการจะแสดงที่นี่
            </p>
            {canViewHistory && (
              <Link
                to="/history"
                className="neu-button mt-4 inline-flex h-11 items-center px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ดูประวัติการเบิกจ่าย
              </Link>
            )}
          </div>
        )}

        {status === 'success' && data.length > 0 && (
          <ul className="divide-y divide-foreground/10">
            {data.map((item) => renderRow(item))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default RecentActivity;
