import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  FileText, XCircle, AlertTriangle, 
  Building2, User, MapPin, Package, Printer, Ban, RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/i18n';
import { getWarehouseLabel } from '@/lib/withdrawalStock';
import StatusBadge from '@/components/ui/StatusBadge';
import { REVERT_KINDS } from '@/lib/superRevert';

const WithdrawalDetailModal = ({
  order,
  orderDetails = [],
  stockRows = [],
  projects = [],
  showSourceWarehouse = false,
  isOpen,
  onClose,
  isAdmin: _isAdmin = false,
  isSuperAdmin = false,
  canApprove = false,
  canReject = false,
  canComplete = false,
  canCancel = false,
  onApproveOrder,
  onOpenRejectModal,
  onOpenCancelModal,
  onCompleteOrder,
  onDownloadPDF,
  onDownloadDispatchPDF,
  canRevertAction = false,
  onOpenRevertModal
}) => {
  const { t } = useTranslation();
  if (!order) return null;

  const isPending = order.status === 'pending';
  const isApproved = order.status === 'approved';
  const isCompleted = order.status === 'completed';
  const isRejected = order.status === 'rejected';
  const isCancelled = order.status === 'cancelled';
  const hasShortage = order.has_shortage || order.is_shortage_override;

  // Current balance per (source warehouse, item) for the transparency label.
  const stockByKey = new Map((stockRows || []).map(row => [`${row.project_id}::${row.item_id}`, row]));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col grid-cols-[minmax(0,1fr)] rounded-xl bg-card p-4 sm:p-6 border border-border shadow-xl">
        <DialogHeader className="min-w-0 space-y-3 border-b border-border/40 pb-4 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <span>{t('withdrawals.requisitionRequest', 'Requisition Request')} #{order.id?.slice(0, 8)}</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('withdrawals.createdAt', 'Created at')}: {order.requested_at ? format(new Date(order.requested_at), 'dd/MM/yyyy HH:mm:ss') : '-'}
                </p>
              </div>
            </div>

            {/* Status Icon Badge */}
            <div className="shrink-0">
              <StatusBadge
                status={order.status}
                has_shortage={hasShortage}
                size="lg"
              />
            </div>
          </div>

          {/* Visual Requisition Workflow Stepper */}
          {!isRejected && !isCancelled && (
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs font-bold">
                {/* Step 1: Requested */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 text-indigo-600 dark:text-indigo-400">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-mono shrink-0">
                    1
                  </div>
                  <span className="truncate text-[11px] sm:text-xs">{t('withdrawals.stepRequestSubmitted', 'Request Submitted')}</span>
                </div>

                <div className={`flex-1 min-w-3 sm:min-w-6 h-1 mx-2 sm:mx-3 rounded-full ${isApproved || isCompleted ? 'bg-indigo-600' : 'bg-muted'}`} />

                {/* Step 2: Approved */}
                <div className={`flex items-center gap-1.5 sm:gap-2 min-w-0 ${isApproved || isCompleted ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono shrink-0 ${
                    isApproved || isCompleted ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    2
                  </div>
                  <span className="truncate text-[11px] sm:text-xs">{t('withdrawals.stepApprovedDeducted', 'Approved & Deducted')}</span>
                </div>

                <div className={`flex-1 min-w-3 sm:min-w-6 h-1 mx-2 sm:mx-3 rounded-full ${isCompleted ? 'bg-indigo-600' : 'bg-muted'}`} />

                {/* Step 3: Completed */}
                <div className={`flex items-center gap-1.5 sm:gap-2 min-w-0 ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono shrink-0 ${
                    isCompleted ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    3
                  </div>
                  <span className="truncate text-[11px] sm:text-xs">{t('withdrawals.stepDeliveredCompleted', 'Delivered & Completed')}</span>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="min-w-0 py-3 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
          {/* Order Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/40 dark:bg-muted/20 p-4 rounded-xl border border-border text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                {t('common.location', 'Location')}:
              </span>
              <p className="font-bold text-foreground">
                {order.projects?.project_code ? `[${order.projects.project_code}] ` : ''}{order.projects?.name || '-'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                {t('common.requester', 'Requester')}:
              </span>
              <p className="font-bold text-foreground">{order.profiles?.full_name || t('common.user', 'User')}</p>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                {t('withdrawals.purpose', 'Purpose')}:
              </span>
              <p className="font-semibold text-foreground">{order.purpose || t('withdrawals.notSpecified', 'Not specified')}</p>
            </div>

            {order.delivery_address && (
              <div className="space-y-1 sm:col-span-2">
                <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  {t('withdrawals.deliveryDestinationRecipient', 'Delivery Destination / Recipient')}:
                </span>
                <p className="font-semibold text-foreground">{order.delivery_address}</p>
              </div>
            )}

            {/* Shortage Override Notice */}
            {(order.is_shortage_override || order.override_reason) && (
              <div className="sm:col-span-2 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>{t('withdrawals.shortageOverrideNotes', 'Shortage Override Notes')}:</span>
                </p>
                <p className="text-[11px] pl-5">{order.override_reason || t('withdrawals.stockDeductedActual', 'Stock deducted based on actual available inventory')}</p>
              </div>
            )}

            {/* Rejection Reason Notice */}
            {order.reject_reason && (
              <div className="sm:col-span-2 bg-red-500/10 border border-red-500/30 p-3 rounded-xl text-red-900 dark:text-red-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span>{t('withdrawals.rejectionReason', 'Rejection Reason')}:</span>
                </p>
                <p className="text-[11px] pl-5">{order.reject_reason}</p>
              </div>
            )}

            {/* Last Revert Notice */}
            {order.last_reverted_at && (
              <div className="sm:col-span-2 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span>
                    {t('superRevert.lastReverted', {
                      name: order.reverter?.full_name || 'SUPER',
                      date: format(new Date(order.last_reverted_at), 'dd/MM/yyyy HH:mm')
                    })}
                  </span>
                </p>
                {order.last_revert_reason && (
                  <p className="text-[11px] pl-5">
                    <span className="font-semibold">{t('superRevert.revertReason')}:</span> {order.last_revert_reason}
                  </p>
                )}
                {(order.last_revert_from_status || order.last_revert_to_status) && (
                  <p className="text-[10px] pl-5 font-mono font-bold">
                    {String(order.last_revert_from_status || '-').toUpperCase()}
                    {' -> '}
                    {String(order.last_revert_to_status || '-').toUpperCase()}
                  </p>
                )}
              </div>
            )}

            {/* Cancellation Notice */}
            {(isCancelled || order.cancellation_reason) && (
              <div className="sm:col-span-2 bg-slate-500/10 border border-slate-500/30 p-3 rounded-xl text-slate-800 dark:text-slate-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>{t('withdrawals.cancellationNotice', 'คำขอนี้ถูกยกเลิกแล้ว (Cancelled)')}:</span>
                </p>
                {order.cancellation_reason && (
                  <p className="text-[11px] pl-5">
                    <span className="font-semibold">{t('withdrawals.cancellationReason', 'เหตุผล')}:</span> {order.cancellation_reason}
                  </p>
                )}
                {order.cancelled_at && (
                  <p className="text-[10px] text-muted-foreground pl-5">
                    {t('withdrawals.cancelledAt', 'ยกเลิกเมื่อ')}: {format(new Date(order.cancelled_at), 'dd/MM/yyyy HH:mm:ss')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Requested Items Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{t('withdrawals.requestedItems', 'Requested Items')} ({orderDetails.length} {t('common.items', 'items')})</span>
            </h4>

            <div className="border border-border rounded-xl overflow-hidden shadow-xs max-w-full">
              <Table className="min-w-[640px]">
                <TableHeader className="bg-muted/50 text-xs">
                  <TableRow>
                    <TableHead>{t('items.itemName', 'Item Name')}</TableHead>
                    {showSourceWarehouse && (
                      <TableHead>{t('withdrawals.sourceWarehouse', 'Source Warehouse')}</TableHead>
                    )}
                    <TableHead className="text-center">{t('withdrawals.requested', 'Requested')}</TableHead>
                    <TableHead className="text-center">{t('withdrawals.actualDeducted', 'Actual Deducted')}</TableHead>
                    <TableHead className="text-center text-amber-600">{t('withdrawals.shortage', 'Shortage')}</TableHead>
                    <TableHead>{t('withdrawals.destinationSN', 'Destination / S/N')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {orderDetails.map(item => {
                    const isApprovedOrCompleted = order.status === 'approved' || order.status === 'completed';
                    const deducted = item.deducted_quantity !== undefined && item.deducted_quantity !== null
                      ? item.deducted_quantity
                      : (isApprovedOrCompleted ? item.quantity : 0);
                    const shortage = item.shortage_quantity !== undefined && item.shortage_quantity !== null
                      ? item.shortage_quantity
                      : 0;
                    const stockRow = stockByKey.get(`${item.project_id || ''}::${item.item_id}`);
                    const stockBalance = Number(stockRow?.balance);
                    const hasStockBalance = Boolean(stockRow) && Number.isFinite(stockBalance);

                    return (
                      <TableRow key={item.id} className="hover:bg-accent/40">
                        <TableCell>
                          <div className="font-bold text-foreground">{item.items?.name}</div>
                          {item.part_number && (
                            <span className="text-[10px] text-muted-foreground font-mono">PN: {item.part_number}</span>
                          )}
                        </TableCell>
                        {showSourceWarehouse && (
                          <TableCell className="text-[11px]">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 border border-border/60 font-semibold text-muted-foreground">
                              <Building2 className="w-3 h-3" />
                              <span>
                                {getWarehouseLabel(projects.find(p => p.id === item.project_id))
                                  || getWarehouseLabel(order.projects)
                                  || '-'}
                              </span>
                              {hasStockBalance && (
                                <span className="font-mono font-normal">
                                  ({t('withdrawals.remainingCount', { count: stockBalance }, `คงเหลือ ${stockBalance}`)})
                                </span>
                              )}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="text-center font-bold font-mono text-foreground">
                          {item.quantity} {item.items?.unit}
                        </TableCell>
                        <TableCell className="text-center">
                          {isPending ? (
                            <span className="text-muted-foreground italic font-normal text-[11px]">- ({t('common.pending', 'Pending')})</span>
                          ) : isApprovedOrCompleted ? (
                            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                              {deducted} {item.items?.unit}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold font-mono text-amber-600">
                          {shortage > 0 ? `${shortage} ${item.items?.unit}` : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          <div>{item.delivery_to || order.delivery_address || '-'}</div>
                          {item.serial_number && (
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono truncate max-w-[140px]" title={item.serial_number}>
                              S/N: {item.serial_number}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="min-w-0 border-t border-border/40 pt-3 sm:pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between justify-between gap-3 sm:gap-3 sm:space-x-0 flex-wrap shrink-0 mt-auto bg-card">
          {(isApproved || isCompleted) && (
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDownloadPDF(order, orderDetails)}
                className="rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1.5 cursor-pointer h-9 px-3 sm:px-4 flex-1 sm:flex-initial"
              >
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>{t('withdrawals.printDownloadPDF', 'Print / Download Issue Slip (PDF)')}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDownloadDispatchPDF(order, orderDetails)}
                className="rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 gap-1.5 cursor-pointer h-9 px-3 sm:px-4 flex-1 sm:flex-initial"
              >
                <Printer className="w-4 h-4 text-sky-600" />
                <span>{t('withdrawals.printDispatchPdf', 'พิมพ์ใบนำส่งเบิกของ (PDF)')}</span>
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end sm:ml-auto">
            {isPending && (
              <>
                {canReject && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="rounded-lg text-xs font-semibold cursor-pointer h-9 min-h-[44px] sm:min-h-0 px-4"
                    onClick={() => onOpenRejectModal(order)}
                  >
                    {t('withdrawals.rejectRequest', 'Reject Request')}
                  </Button>
                )}
                {canApprove && (
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer h-9 min-h-[44px] sm:min-h-0 px-4 shadow-xs"
                    onClick={() => onApproveOrder(order.id)}
                  >
                    {t('withdrawals.approveRequest', 'Approve Request')}
                  </Button>
                )}
              </>
            )}

            {isApproved && canComplete && (
              <Button
                type="button"
                size="sm"
                className="rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer h-9 min-h-[44px] sm:min-h-0 px-4 shadow-xs"
                onClick={() => onCompleteOrder(order.id)}
              >
                {t('withdrawals.confirmReceiptComplete', 'Confirm Receipt Complete')}
              </Button>
            )}

            {canRevertAction && (isCompleted || isApproved || isRejected) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg text-xs font-semibold text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 gap-1.5 cursor-pointer h-9 min-h-[44px] sm:min-h-0 px-4"
                onClick={() => onOpenRevertModal && onOpenRevertModal(
                  order,
                  isCompleted
                    ? REVERT_KINDS.WITHDRAWAL_COMPLETION
                    : isApproved
                    ? REVERT_KINDS.WITHDRAWAL_APPROVAL
                    : REVERT_KINDS.WITHDRAWAL_REJECTION
                )}
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>
                  {t(
                    isCompleted
                      ? 'superRevert.revertCompletionBtn'
                      : isApproved
                      ? 'superRevert.revertApprovalBtn'
                      : 'superRevert.revertRejectionBtn'
                  )}
                </span>
              </Button>
            )}

            {(canCancel || isSuperAdmin) && !isCancelled && (
              <>
                <span aria-hidden="true" className="hidden sm:block w-px h-6 bg-border/60" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5 cursor-pointer h-9 min-h-[44px] sm:min-h-0 px-4"
                  onClick={() => {
                    onOpenCancelModal && onOpenCancelModal(order);
                    onClose();
                  }}
                >
                  <Ban className="w-4 h-4 text-rose-600" />
                  <span>{t('withdrawals.cancelOrder', 'ยกเลิกคำขอ (SUPER)')}</span>
                </Button>
              </>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-lg text-xs h-9 min-h-[44px] sm:min-h-0 px-4 font-semibold"
            >
              {t('common.close', 'Close')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalDetailModal;
