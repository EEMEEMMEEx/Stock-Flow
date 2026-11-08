import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  Search, History, CheckCircle2, Eye, User, 
  Building2, FileText, Infinity as InfinityIcon, Ban, RotateCcw, Clock,
  MoreHorizontal, ChevronDown, ChevronUp, X, Filter, AlertCircle, Calendar
} from 'lucide-react';
import { subDays, startOfMonth } from 'date-fns';
import { useTranslation } from '@/i18n';
import { formatRevertDate, REVERT_KINDS } from '@/lib/superRevert';
import { resolveCheckoutMeta } from '@/lib/checkoutDisplay';
import { formatI18nDate } from '@/lib/i18n-format';
import { cn } from '@/lib/utils';

const HISTORY_FILTERS = [
  { value: 'all', labelKey: 'checkouts.historyFilterAll' },
  { value: 'completed', labelKey: 'checkouts.historyFilterCompleted' },
  { value: 'approved', labelKey: 'checkouts.historyFilterApproved' },
  { value: 'rejected', labelKey: 'checkouts.historyFilterRejected' },
];

const DATE_RANGE_FILTERS = [
  { value: 'all', labelKey: 'checkouts.dateRangeAll' },
  { value: 'today', labelKey: 'checkouts.dateRangeToday' },
  { value: '7days', labelKey: 'checkouts.dateRange7Days' },
  { value: '30days', labelKey: 'checkouts.dateRange30Days' },
  { value: 'month', labelKey: 'checkouts.dateRangeThisMonth' },
];

const revertKindFor = (order) => {
  if (order.status === 'completed' || order.status === 'partial_returned') return REVERT_KINDS.CHECKOUT_RETURNS;
  if (order.status === 'active' || order.status === 'overdue') return REVERT_KINDS.CHECKOUT_APPROVAL;
  if (order.status === 'rejected') return REVERT_KINDS.CHECKOUT_REJECTION;
  return null;
};

const revertLabelKeyFor = (order) => {
  if (order.status === 'completed' || order.status === 'partial_returned') return 'superRevert.revertReturnBtn';
  if (order.status === 'active' || order.status === 'overdue') return 'superRevert.revertCheckoutApprovalBtn';
  if (order.status === 'rejected') return 'superRevert.revertRejectionBtn';
  return null;
};

const matchesDateRange = (dateStr, range) => {
  if (!range || range === 'all') return true;
  if (!dateStr) return false;
  const targetDate = new Date(dateStr);
  if (Number.isNaN(targetDate.getTime())) return false;
  const now = new Date();
  if (range === 'today') {
    return targetDate.toDateString() === now.toDateString();
  }
  if (range === '7days') {
    return targetDate >= subDays(now, 7);
  }
  if (range === '30days') {
    return targetDate >= subDays(now, 30);
  }
  if (range === 'month') {
    return targetDate >= startOfMonth(now);
  }
  return true;
};

const getAccentBorderClass = (order, bucket) => {
  if (order.status === 'cancelled') return 'border-l-slate-400 dark:border-l-slate-500';
  if (order.status === 'rejected') return 'border-l-rose-500 dark:border-l-rose-400';
  if (bucket === 'completed') return 'border-l-emerald-500 dark:border-l-emerald-400';
  if (order.status === 'overdue') return 'border-l-red-500 dark:border-l-red-400';
  if (order.borrow_type === 'indefinite') return 'border-l-purple-500 dark:border-l-purple-400';
  if (order.status === 'partial_returned') return 'border-l-amber-500 dark:border-l-amber-400';
  return 'border-l-indigo-500 dark:border-l-indigo-400';
};

const CheckoutHistoryList = ({
  orders = [],
  loading = false,
  isSuperAdmin = false,
  canCancel = false,
  canRevertAction = false,
  onOpenDetailModal,
  onOpenCancelModal,
  onOpenRevertModal
}) => {
  const { t, lang } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [expandedProjects, setExpandedProjects] = useState({});
  const [expandedItems, setExpandedItems] = useState({});

  const toggleExpandProject = (orderId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const toggleExpandItems = (orderId) => {
    setExpandedItems((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateRangeFilter('all');
  };

  // Every checkout that had an action taken on it (everything except pending).
  const historyOrders = useMemo(() => (
    orders.filter(o => o.status && o.status !== 'pending')
  ), [orders]);

  const bucketOf = (order) => {
    if (order.status === 'rejected' || order.status === 'cancelled') return 'rejected';
    if (order.status === 'completed') return 'completed';
    if (order.status === 'active' || order.status === 'overdue' || order.status === 'partial_returned') return 'approved';
    return 'approved';
  };

  const filteredOrders = useMemo(() => {
    const byStatus = statusFilter === 'all'
      ? historyOrders
      : historyOrders.filter(o => bucketOf(o) === statusFilter);

    const byDate = dateRangeFilter === 'all'
      ? byStatus
      : byStatus.filter(o => matchesDateRange(o.created_at || o.checkout_date, dateRangeFilter));

    if (!searchQuery.trim()) return byDate;
    const q = searchQuery.toLowerCase().trim();
    return byDate.filter(order => (
      order.order_number?.toLowerCase().includes(q) ||
      order.borrower_name?.toLowerCase().includes(q) ||
      order.borrower_department?.toLowerCase().includes(q) ||
      order.projects?.name?.toLowerCase().includes(q) ||
      order.projects?.project_code?.toLowerCase().includes(q) ||
      order.rejection_reason?.toLowerCase().includes(q) ||
      order.cancellation_reason?.toLowerCase().includes(q) ||
      order.checkout_items?.some(i => i.items?.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q))
    ));
  }, [historyOrders, searchQuery, statusFilter, dateRangeFilter]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || statusFilter !== 'all' || dateRangeFilter !== 'all'
  );

  return (
    <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
      {/* Sticky Search & Filter Header */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/50 p-3.5 sm:p-4 space-y-3">
        {/* Top line: Title & Result count & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground leading-relaxed flex items-center gap-1.5 flex-wrap">
                <span>{t('checkouts.completedHistory')}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  ({t('checkouts.resultsCount', { count: filteredOrders.length })})
                </span>
              </h2>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t('checkouts.searchHistoryPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-9 text-xs rounded-lg bg-background"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                title="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Chips Row: Status + Date Presets */}
        <div className="space-y-2">
          {/* Status Sub-filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0 hidden sm:inline-flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" />
            </span>
            {HISTORY_FILTERS.map(filter => {
              const isActive = statusFilter === filter.value;
              const count = filter.value === 'all'
                ? historyOrders.length
                : historyOrders.filter(o => bucketOf(o) === filter.value).length;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer min-h-[36px] shrink-0 leading-relaxed select-none',
                    isActive 
                      ? 'border-primary/50 bg-primary/10 text-primary font-bold shadow-2xs' 
                      : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <span>{t(filter.labelKey)}</span>
                  <span className="font-mono text-[10px] opacity-80 bg-background/60 px-1 py-0.2 rounded">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Date Range Sub-filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0 hidden sm:inline-flex items-center gap-1 mr-1">
              <Calendar className="w-3 h-3" />
            </span>
            {DATE_RANGE_FILTERS.map(df => {
              const isActive = dateRangeFilter === df.value;
              return (
                <button
                  key={df.value}
                  type="button"
                  onClick={() => setDateRangeFilter(df.value)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer min-h-[32px] shrink-0 leading-relaxed select-none',
                    isActive
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold shadow-2xs'
                      : 'border-border/50 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  {t(df.labelKey)}
                </button>
              );
            })}

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-8 px-2 text-[11px] text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 gap-1 cursor-pointer shrink-0 ml-auto min-h-[32px]"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('checkouts.clearFiltersBtn', 'ล้างตัวกรอง')}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <CardContent className="p-3 sm:p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="rounded-xl border border-border/50 bg-card p-4 space-y-3 border-l-4 border-l-muted">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-28 rounded-md" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-36 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
                <Skeleton className="h-4 w-48 rounded-md" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-10 w-28 rounded-lg" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 sm:py-16 px-4 text-center text-muted-foreground text-xs space-y-2">
            <FileText className="w-9 h-9 mx-auto mb-2 opacity-40 stroke-1" />
            <p className="font-semibold text-foreground text-sm">{t('checkouts.noCompletedRecords')}</p>
            <p className="text-xs max-w-xs mx-auto text-muted-foreground leading-relaxed">
              {hasActiveFilters
                ? t('common.notFound', 'ไม่พบข้อมูลที่ค้นหา')
                : t('checkouts.completedWillAppear')}
            </p>
            {hasActiveFilters && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="rounded-lg min-h-[44px] text-xs gap-1.5 font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('checkouts.clearFiltersBtn', 'ล้างตัวกรอง')}</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {filteredOrders.map(order => {
              const { department, location } = resolveCheckoutMeta(order);
              const bucket = bucketOf(order);
              const totalBorrowed = (order.checkout_items || []).reduce((s, i) => s + Number(i.quantity_borrowed || 0), 0);
              const isRejected = order.status === 'rejected';
              const isCancelled = order.status === 'cancelled';
              const items = order.checkout_items || [];
              const isItemsExpanded = Boolean(expandedItems[order.id]);
              const visibleItems = isItemsExpanded ? items : items.slice(0, 2);
              const remainingItemsCount = Math.max(0, items.length - 2);
              const isProjectExpanded = Boolean(expandedProjects[order.id]);

              // Request date & time
              const requestDateStr = order.created_at || order.checkout_date;
              const formattedRequestDate = requestDateStr 
                ? formatI18nDate(requestDateStr, 'd MMM yyyy, HH:mm', { lang })
                : '-';

              // Compact Neutral Reason & Revert Info Block
              const rejectionReason = (isRejected && order.rejection_reason) ? order.rejection_reason.trim() : null;
              const cancellationReason = (isCancelled && order.cancellation_reason) ? order.cancellation_reason.trim() : null;
              const revertReason = order.last_revert_reason ? order.last_revert_reason.trim() : null;
              const reverterName = order.reverter?.full_name || 'SUPER';
              const revertDateStr = order.last_reverted_at ? formatRevertDate(order.last_reverted_at, lang) : null;

              // Build merged neutral compact status info
              const noteParts = [];
              if (isRejected && rejectionReason) {
                noteParts.push(`${t('checkouts.rejectedCompactPrefix', 'ถูกปฏิเสธ')}: ${rejectionReason}`);
              } else if (isCancelled && cancellationReason) {
                noteParts.push(`${t('checkouts.cancelledCompactPrefix', 'ยกเลิกแล้ว')}: ${cancellationReason}`);
              }

              if (order.last_reverted_at) {
                let revPart = t('superRevert.lastReverted', {
                  name: reverterName,
                  date: revertDateStr
                });
                // Deduplicate: if revertReason is identical to rejectionReason or cancellationReason, do not repeat
                if (revertReason && revertReason !== rejectionReason && revertReason !== cancellationReason) {
                  revPart += ` (${t('superRevert.revertReason')}: ${revertReason})`;
                }
                noteParts.push(revPart);
              }

              const compactStatusNote = noteParts.join(' · ');

              // Determine actions
              const canRevertThisOrder = Boolean(canRevertAction && onOpenRevertModal && revertKindFor(order));
              const canCancelThisOrder = Boolean((canCancel || isSuperAdmin) && !isCancelled && !isRejected);

              // If revert is possible, Revert is the primary button, View Details goes into menu.
              // Otherwise, View Details is the primary button.
              const isRevertPrimary = canRevertThisOrder;
              const hasSecondaryActions = isRevertPrimary 
                ? true // View Details goes into dropdown
                : canCancelThisOrder; // Cancel goes into dropdown

              return (
                <div 
                  key={order.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 space-y-2.5 transition-all shadow-2xs hover:shadow-xs border-l-4",
                    getAccentBorderClass(order, bucket)
                  )}
                >
                  {/* Row 1: Request ID + Status Badge */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md shrink-0">
                        {order.order_number}
                      </span>
                      {order.borrow_type === 'indefinite' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 inline-flex items-center gap-1 shrink-0">
                          <InfinityIcon className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <span>{t('checkouts.noReturnDate')}</span>
                        </span>
                      )}
                    </div>

                    {/* Status Badge with Icon + Text */}
                    {isCancelled ? (
                      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30 inline-flex items-center gap-1.5 shrink-0 leading-normal">
                        <Ban className="w-3.5 h-3.5 text-slate-500" />
                        <span>{t('common.cancelled', 'ยกเลิกแล้ว')}</span>
                      </span>
                    ) : isRejected ? (
                      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 inline-flex items-center gap-1.5 shrink-0 leading-normal">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>{t('checkouts.statusRejected', 'ถูกปฏิเสธ')}</span>
                      </span>
                    ) : bucket === 'completed' ? (
                      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5 shrink-0 leading-normal">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{t('checkouts.historyFilterCompleted', 'คืนครบแล้ว')}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 inline-flex items-center gap-1.5 shrink-0 leading-normal">
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>
                          {order.status === 'overdue'
                            ? t('checkouts.statusOverdue', 'เลยกำหนดคืน')
                            : order.status === 'partial_returned'
                              ? t('checkouts.statusPartialReturned', 'คืนบางส่วน')
                              : t('checkouts.statusActive', 'กำลังยืม')}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Row 2: Requester + Date/time (muted) */}
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap leading-relaxed">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-foreground truncate" title={order.borrower_name}>
                        {order.borrower_name}
                      </span>
                      {department && (
                        <span className="text-muted-foreground truncate" title={department}>
                          ({department})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] shrink-0 text-muted-foreground">
                      <Calendar className="w-3 h-3 shrink-0 opacity-70" />
                      <span>{formattedRequestDate}</span>
                    </div>
                  </div>

                  {/* Row 3: Project on one line, truncated, with full text on tap */}
                  {location && (
                    <div 
                      onClick={() => toggleExpandProject(order.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { 
                        if (e.key === 'Enter' || e.key === ' ') { 
                          e.preventDefault(); 
                          toggleExpandProject(order.id); 
                        } 
                      }}
                      title={location}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors group select-none min-h-[32px] py-0.5"
                    >
                      <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 group-hover:scale-105 transition-transform" />
                      <span className={cn(
                        "text-[11px] sm:text-xs leading-relaxed transition-all",
                        isProjectExpanded ? "break-words text-foreground font-medium" : "truncate"
                      )}>
                        {location}
                      </span>
                      <span className="text-[10px] text-primary/70 shrink-0 ml-auto hidden sm:inline-block">
                        {isProjectExpanded ? t('checkouts.showLessItems', 'ย่อ') : t('checkouts.tapToViewFullProject', 'แตะเพื่อดูเต็ม')}
                      </span>
                    </div>
                  )}

                  {/* Merged Compact Neutral Rejection & Revert Box */}
                  {compactStatusNote && (
                    <div className="rounded-lg border border-border/60 bg-muted/30 dark:bg-muted/15 p-2 text-[11px] leading-relaxed text-muted-foreground flex items-start gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 break-words">
                        {compactStatusNote}
                      </div>
                    </div>
                  )}

                  {/* Row 4: Items (Regular UI font, 2 shown, '+N more', 'N items · M pcs' summary) */}
                  <div className="rounded-lg border border-border/50 bg-muted/20 dark:bg-muted/10 p-2.5 space-y-2">
                    {/* Items Summary Line */}
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground border-b border-border/40 pb-1.5 leading-relaxed">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span>{t('checkouts.itemsSummary', { itemCount: items.length, unitCount: totalBorrowed })}</span>
                      </div>
                      <div className="text-[10px] font-medium">
                        {bucket === 'completed' && order.actual_returned_date ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {t('checkouts.returned')}: {formatI18nDate(order.actual_returned_date, 'd MMM yyyy', { lang })}
                          </span>
                        ) : order.expected_return_date ? (
                          <span>
                            {t('checkouts.dueDateLabel')}: {formatI18nDate(order.expected_return_date, 'd MMM yyyy', { lang })}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Visible Items */}
                    <div className="space-y-1.5">
                      {visibleItems.map((item, idx) => {
                        const itemName = item.items?.name || t('common.item');
                        const qty = item.quantity_borrowed;
                        const unit = item.items?.unit || t('common.defaultUnit');
                        const serial = item.serial_number;

                        return (
                          <div key={item.id || idx} className="flex items-center justify-between gap-2 text-xs leading-relaxed">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                              <span className="text-foreground truncate" title={itemName}>
                                {itemName}
                              </span>
                              {serial && (
                                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium shrink-0 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800">
                                  S/N: {serial}
                                </span>
                              )}
                            </div>
                            <span className="text-muted-foreground font-medium shrink-0 text-right text-[11px] whitespace-nowrap">
                              ×{qty} {unit}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expand / Collapse Toggle if > 2 items */}
                    {remainingItemsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpandItems(order.id)}
                        className="w-full pt-1 text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center justify-center gap-1 cursor-pointer min-h-[36px] select-none"
                      >
                        <span>
                          {isItemsExpanded
                            ? t('checkouts.showLessItems')
                            : t('checkouts.showMoreItems', { count: remainingItemsCount })}
                        </span>
                        {isItemsExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Row 5: Actions (Single Primary Button + '⋯' Secondary Menu) */}
                  <div className="flex items-center justify-end gap-2 pt-1 w-full flex-wrap sm:flex-nowrap">
                    {/* Primary Action Button */}
                    {isRevertPrimary ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenRevertModal(order, revertKindFor(order))}
                        className="rounded-lg min-h-[44px] px-3.5 text-xs gap-1.5 font-semibold text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 shadow-2xs cursor-pointer flex-1 sm:flex-none justify-center whitespace-nowrap"
                        title={t(revertLabelKeyFor(order))}
                      >
                        <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{t(revertLabelKeyFor(order))}</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenDetailModal(order)}
                        className="rounded-lg min-h-[44px] px-3.5 text-xs gap-1.5 font-semibold shadow-2xs cursor-pointer flex-1 sm:flex-none justify-center whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('checkouts.viewDetailsPrint')}</span>
                      </Button>
                    )}

                    {/* Secondary Actions in '⋯' Menu */}
                    {hasSecondaryActions && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={t('checkouts.moreActions')}
                            title={t('checkouts.moreActions')}
                            className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border-border/70 hover:bg-muted cursor-pointer shrink-0"
                          >
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={6}
                            className="z-50 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
                          >
                            {/* If revert was primary, View Details is secondary in menu */}
                            {isRevertPrimary && (
                              <DropdownMenu.Item
                                onSelect={() => onOpenDetailModal(order)}
                                className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold rounded-lg hover:bg-muted cursor-pointer min-h-[44px] outline-none"
                              >
                                <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span>{t('checkouts.viewDetailsPrint')}</span>
                              </DropdownMenu.Item>
                            )}

                            {/* Cancel Order (SUPER) - ONLY on non-cancelled, non-rejected orders */}
                            {canCancelThisOrder && (
                              <DropdownMenu.Item
                                onSelect={() => onOpenCancelModal && onOpenCancelModal(order)}
                                className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer min-h-[44px] outline-none"
                              >
                                <Ban className="w-4 h-4 shrink-0" />
                                <span>{t('checkouts.cancelOrder', 'ยกเลิกรายการ (SUPER)')}</span>
                              </DropdownMenu.Item>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CheckoutHistoryList;
