import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileText, Eye, Clock, CheckCircle2, AlertTriangle, XCircle, ArrowUpDown, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/i18n';

export const StatusBadge = ({ status, has_shortage, is_shortage_override }) => {
  const { t } = useTranslation();
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-semibold border border-amber-500/20">
          <Clock className="w-3.5 h-3.5" /> {t('common.pending', 'Pending')}
        </span>
      );
    case 'approved':
      if (has_shortage || is_shortage_override) {
        return (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> {t('withdrawals.approvedShortage', 'Approved (Shortage)')}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full text-xs font-semibold border border-blue-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t('common.approved', 'Approved')}
        </span>
      );
    case 'completed':
      if (has_shortage || is_shortage_override) {
        return (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> {t('withdrawals.completedShortage', 'Completed (Shortage)')}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full text-xs font-semibold border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t('common.completed', 'Completed')}
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full text-xs font-semibold border border-rose-500/20">
          <XCircle className="w-3.5 h-3.5" /> {t('common.rejected', 'Rejected')}
        </span>
      );
    default:
      return null;
  }
};

const HistoryDataTable = ({
  data = [],
  sortField,
  sortDirection: _sortDirection,
  onSort,
  onViewDetails,
  onDownloadPDF
}) => {
  const { t } = useTranslation();

  const renderSortHeader = (label, field) => {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-xs font-bold text-foreground hover:text-primary transition-colors cursor-pointer select-none"
      >
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${isActive ? 'text-primary' : 'text-muted-foreground opacity-50'}`} />
      </button>
    );
  };

  return (
    <Card className="overflow-hidden border border-border/60 shadow-xs rounded-2xl">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40 backdrop-blur border-b border-border/50">
            <TableRow>
              <TableHead className="w-[110px] font-bold text-xs">{t('history.orderNo', 'Order #')}</TableHead>
              <TableHead className="w-[140px] text-xs">
                {renderSortHeader(t('history.dateTime', 'Date / Time'), 'requested_at')}
              </TableHead>
              <TableHead className="min-w-[180px] text-xs">
                {renderSortHeader(t('history.project', 'Project'), 'project')}
              </TableHead>
              <TableHead className="min-w-[130px] text-xs">
                {renderSortHeader(t('history.requester', 'Requester'), 'requester')}
              </TableHead>
              <TableHead className="min-w-[200px] text-xs">{t('history.items', 'Items')}</TableHead>
              <TableHead className="w-[100px] text-center text-xs">{t('history.totalQty', 'Total Qty')}</TableHead>
              <TableHead className="w-[170px] text-center text-xs">
                {renderSortHeader(t('common.status', 'Status'), 'status')}
              </TableHead>
              <TableHead className="w-[140px] text-right text-xs font-bold">{t('common.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.map((order) => {
              const items = order.withdrawal_items || [];
              const firstItem = items[0];
              const totalItemsCount = items.length;
              const totalQuantitySum = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
              const displayDate = order.completed_at || order.approved_at || order.requested_at;

              return (
                <TableRow key={order.id} className="hover:bg-muted/30 transition-colors group">
                  {/* Order ID */}
                  <TableCell className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                    #{order.id?.slice(0, 8)}
                  </TableCell>

                  {/* Timestamp */}
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {displayDate ? format(new Date(displayDate), 'dd/MM/yy HH:mm') : '—'}
                  </TableCell>

                  {/* Project */}
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate max-w-[220px]">
                        {order.projects?.project_code ? (
                          <strong className="text-indigo-600 dark:text-indigo-400 mr-1">
                            [{order.projects.project_code}]
                          </strong>
                        ) : null}
                        {order.projects?.name || '—'}
                      </span>
                    </div>
                  </TableCell>

                  {/* Requester */}
                  <TableCell className="text-xs font-medium text-foreground whitespace-nowrap">
                    {order.profiles?.full_name || '—'}
                  </TableCell>

                  {/* Items summary */}
                  <TableCell className="text-xs">
                    {firstItem ? (
                      <div className="space-y-1">
                        <div className="font-medium text-foreground line-clamp-1">
                          {firstItem.items?.name || t('dashboard.item', 'Item')}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span>{t('withdrawals.requested', 'Requested')}: {firstItem.quantity} {firstItem.items?.unit || ''}</span>
                          {firstItem.shortage_quantity > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              ({t('history.shortage', 'Shortage')}: {firstItem.shortage_quantity})
                            </span>
                          )}
                        </div>
                        {totalItemsCount > 1 && (
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {t('history.moreItems', {
                              count: totalItemsCount - 1,
                              defaultValue: `+${totalItemsCount - 1} more items`
                            })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Total Quantity */}
                  <TableCell className="text-center font-bold text-xs text-foreground">
                    {totalQuantitySum.toLocaleString()}
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell className="text-center">
                    <StatusBadge
                      status={order.status}
                      has_shortage={order.has_shortage}
                      is_shortage_override={order.is_shortage_override}
                    />
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewDetails(order)}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold hover:bg-accent border-border cursor-pointer gap-1"
                        title="View withdrawal order details"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="hidden xl:inline">{t('history.details', 'Details')}</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDownloadPDF(order)}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900/60 hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer gap-1"
                        title="Print / Download PDF"
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>{t('history.pdf', 'PDF')}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default HistoryDataTable;
