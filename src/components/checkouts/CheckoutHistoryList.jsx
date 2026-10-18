import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, History, CheckCircle2, Eye, User, 
  Building2, FileText, Infinity as InfinityIcon, Ban, RotateCcw, Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/i18n';
import { formatRevertDate, REVERT_KINDS } from '@/lib/superRevert';
import { resolveCheckoutMeta } from '@/lib/checkoutDisplay';

const HISTORY_FILTERS = [
  { value: 'all', labelKey: 'checkouts.historyFilterAll' },
  { value: 'completed', labelKey: 'checkouts.historyFilterCompleted' },
  { value: 'approved', labelKey: 'checkouts.historyFilterApproved' },
  { value: 'rejected', labelKey: 'checkouts.historyFilterRejected' },
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
    if (!searchQuery.trim()) return byStatus;
    const q = searchQuery.toLowerCase();
    return byStatus.filter(order => (
      order.order_number?.toLowerCase().includes(q) ||
      order.borrower_name?.toLowerCase().includes(q) ||
      order.borrower_department?.toLowerCase().includes(q) ||
      order.projects?.name?.toLowerCase().includes(q) ||
      order.projects?.project_code?.toLowerCase().includes(q) ||
      order.rejection_reason?.toLowerCase().includes(q) ||
      order.checkout_items?.some(i => i.items?.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q))
    ));
  }, [historyOrders, searchQuery, statusFilter]);


  return (
    <Card className="rounded-xl bg-card border border-border shadow-xs">
      <CardHeader className="border-b border-border/40 pb-3 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <History className="w-4 h-4" />
          </div>
          <span>
            {t('checkouts.completedHistory')} ({filteredOrders.length} {filteredOrders.length === 1 ? t('checkouts.order') : t('checkouts.orders')})
          </span>
        </CardTitle>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('checkouts.searchHistoryPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-xs rounded-lg"
          />
        </div>
        </div>

        {/* Sub-filters so SUPER can find what to revert quickly */}
        <div className="flex flex-wrap items-center gap-1.5">
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
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer min-h-[32px] ${isActive ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}
              >
                <span>{t(filter.labelKey)}</span>
                <span className="font-mono text-[10px] opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-xs">
            {t('checkouts.loadingHistory')}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-xs space-y-1">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-1" />
            <p className="font-semibold text-foreground">{t('checkouts.noCompletedRecords')}</p>
            <p className="text-[11px]">{t('checkouts.completedWillAppear')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {filteredOrders.map(order => {
              const { department, location } = resolveCheckoutMeta(order);

              const totalBorrowed = (order.checkout_items || []).reduce((s, i) => s + Number(i.quantity_borrowed || 0), 0);
              const isRejected = order.status === 'rejected';
              const isCancelled = order.status === 'cancelled';

              return (
                <div 
                  key={order.id}
                  className="p-4 sm:p-5 hover:bg-muted/15 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-lg">
                        {order.order_number}
                      </span>
                      {order.borrow_type === 'indefinite' && (
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 flex items-center gap-1">
                          <InfinityIcon className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          {t('checkouts.noReturnDate')}
                        </span>
                      )}
                      {isCancelled ? (
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30 flex items-center gap-1">
                          <Ban className="w-3 h-3 text-slate-500" />
                          {t('common.cancelled', 'ยกเลิกแล้ว')}
                        </span>
                      ) : isRejected ? (
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-destructive" />
                          {t('checkouts.statusRejected', 'ถูกปฏิเสธ')}
                        </span>
                      ) : bucketOf(order) === 'completed' ? (
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('checkouts.fullyReturned')} ({totalBorrowed} {totalBorrowed === 1 ? t('checkouts.unitCount_one') : t('checkouts.unitCount_other')})
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {order.status === 'overdue'
                            ? t('checkouts.statusOverdue', 'เลยกำหนดคืน')
                            : order.status === 'partial_returned'
                              ? t('checkouts.statusPartialReturned', 'คืนบางส่วน')
                              : t('checkouts.statusActive', 'กำลังยืม')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-foreground font-semibold">
                      <span className="flex items-center gap-1 min-w-0">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate" title={order.borrower_name}>{order.borrower_name}</span>
                        {department && (
                          <span className="text-muted-foreground font-normal truncate" title={department}>
                            ({department})
                          </span>
                        )}
                      </span>
                      {location && (
                        <span className="text-muted-foreground font-normal flex items-center gap-1 min-w-0" title={location}>
                          <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span className="truncate">{location}</span>
                        </span>
                      )}
                    </div>

                    {isRejected && order.rejection_reason && (
                      <div className="p-2 rounded-lg bg-destructive/10 text-destructive text-[11px] font-medium border border-destructive/20">
                        <span className="font-semibold mr-1">{t('checkouts.rejectionReasonLabel', 'เหตุผลที่ปฏิเสธ')}:</span>
                        {order.rejection_reason}
                      </div>
                    )}

                    {isCancelled && order.cancellation_reason && (
                      <div className="p-2 rounded-lg bg-slate-500/10 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-500/20">
                        <span className="font-semibold mr-1">{t('checkouts.cancellationReasonLabel', 'เหตุผลที่ยกเลิก')}:</span>
                        {order.cancellation_reason}
                      </div>
                    )}

                    {order.last_reverted_at && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 flex flex-wrap items-center gap-1.5">
                        <RotateCcw className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>
                          {t('superRevert.lastReverted', {
                            name: order.reverter?.full_name || 'SUPER',
                            date: formatRevertDate(order.last_reverted_at, lang)
                          })}
                        </span>
                        {order.last_revert_reason && (
                          <span className="font-normal text-amber-800/80 dark:text-amber-200/80 truncate max-w-[280px]" title={order.last_revert_reason}>
                            {t('superRevert.revertReason')}: {order.last_revert_reason}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="text-[11px] text-muted-foreground pt-1 flex flex-wrap gap-1.5">
                      {order.checkout_items?.map((item, idx) => (
                        <span key={item.id || idx} className="bg-muted/60 px-2 py-0.5 rounded-md border border-border/40 font-mono text-[10px]">
                          {item.items?.name || t('common.item')} ×{item.quantity_borrowed} {item.items?.unit || t('common.defaultUnit')}
                          {item.serial_number && <span className="text-indigo-600 dark:text-indigo-400 font-semibold"> (S/N: {item.serial_number})</span>}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    <div className="text-right text-xs">
                      <div className="text-muted-foreground text-[11px]">
                        {t('checkouts.borrowed')}: {order.checkout_date ? format(new Date(order.checkout_date), 'dd/MM/yyyy') : '-'}
                      </div>
                      {isCancelled ? (
                        <div className="font-semibold text-slate-500 text-[11px]">
                          {t('checkouts.cancelledAt', 'ยกเลิกเมื่อ')}: {order.cancelled_at ? format(new Date(order.cancelled_at), 'dd/MM/yyyy') : '-'}
                        </div>
                      ) : isRejected ? (
                        <div className="font-semibold text-destructive text-[11px]">
                          {t('checkouts.rejectedAt', 'ปฏิเสธเมื่อ')}: {order.rejected_at ? format(new Date(order.rejected_at), 'dd/MM/yyyy') : '-'}
                        </div>
                      ) : bucketOf(order) === 'completed' ? (
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {t('checkouts.returned')}: {order.actual_returned_date ? format(new Date(order.actual_returned_date), 'dd/MM/yyyy') : '-'}
                        </div>
                      ) : (
                        <div className="font-semibold text-amber-600 dark:text-amber-400">
                          {t('checkouts.dueDateLabel', 'กำหนดคืน')}: {order.expected_return_date ? format(new Date(order.expected_return_date), 'dd/MM/yyyy') : t('checkouts.noReturnDate')}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDetailModal(order)}
                      className="rounded-lg h-9 text-xs gap-1.5 font-semibold shadow-2xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{t('checkouts.viewDetailsPrint')}</span>
                    </Button>

                    {canRevertAction && onOpenRevertModal && revertKindFor(order) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenRevertModal(order, revertKindFor(order))}
                        className="rounded-lg h-9 text-xs gap-1.5 font-semibold text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 shadow-2xs cursor-pointer whitespace-nowrap"
                        title={t(revertLabelKeyFor(order))}
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t(revertLabelKeyFor(order))}</span>
                      </Button>
                    )}

                    {(canCancel || isSuperAdmin) && !isCancelled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenCancelModal && onOpenCancelModal(order)}
                        className="rounded-lg h-9 text-xs gap-1.5 font-semibold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 shadow-2xs cursor-pointer"
                        title={t('checkouts.cancelOrder', 'ยกเลิกรายการ (SUPER)')}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{t('common.cancel', 'ยกเลิก')}</span>
                      </Button>
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
