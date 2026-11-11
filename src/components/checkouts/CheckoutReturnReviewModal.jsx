import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Camera,
  Clock,
  Tag,
  Eye,
  Loader2,
  Building2,
  User,
  FileImage,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n';
import { resolveStorageUrl, extractFileName, handleStorageImageError } from '@/lib/r2Storage';

const CONDITION_LABEL_KEYS = {
  normal: 'checkouts.normal',
  damaged: 'checkouts.damaged',
  needs_repair: 'checkouts.needsRepair',
  lost: 'checkouts.lost',
  consumed: 'checkouts.consumedShort',
};

const CheckoutReturnReviewModal = ({
  isOpen,
  onClose,
  order,
  onConfirmSuccess,
}) => {
  const { t } = useTranslation();
  const [pendingLogs, setPendingLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null); // 'all' or specific log.id
  const [previewPhotoLog, setPreviewPhotoLog] = useState(null);

  const fetchPendingReturnLogs = useCallback(async (orderId) => {
    if (!orderId) return;
    try {
      setLoadingLogs(true);
      const { data, error } = await supabase
        .from('checkout_return_logs')
        .select(`
          *,
          checkout_items (
            id,
            serial_number,
            quantity_borrowed,
            items (name, unit, sku)
          ),
          projects (name, project_code)
        `)
        .eq('checkout_order_id', orderId)
        .eq('verification_status', 'pending_review')
        .order('returned_at', { ascending: true });

      if (error) throw error;
      const activePending = (data || []).filter((l) => !l.is_reverted);
      setPendingLogs(activePending);
    } catch (err) {
      console.error('[CheckoutReturnReviewModal] Fetch pending logs error:', err);
      // Fallback to embedded checkout_return_logs on order if available
      const embedded = (order?.checkout_return_logs || []).filter(
        (l) => l.verification_status === 'pending_review' && !l.is_reverted
      );
      setPendingLogs(embedded);
    } finally {
      setLoadingLogs(false);
    }
  }, [order?.checkout_return_logs]);

  useEffect(() => {
    if (isOpen && order?.id) {
      fetchPendingReturnLogs(order.id);
      setPreviewPhotoLog(null);
    }
  }, [isOpen, order?.id, fetchPendingReturnLogs]);

  if (!order) return null;

  const handleConfirmReturn = async (returnLogId = null) => {
    try {
      setConfirmingId(returnLogId || 'all');
      const { data, error } = await supabase.rpc('confirm_checkout_return', {
        p_payload: {
          order_id: order.id,
          return_log_id: returnLogId || null,
        },
      });

      if (error) throw error;

      toast.success(data?.message || t('checkouts.toasts.returnConfirmedSuccess'));

      const claimEligibleReturns = (data?.returns || []).filter((r) =>
        ['consumed', 'damaged', 'needs_repair'].includes(r.condition)
      );
      if (claimEligibleReturns.length > 0) {
        toast(t('checkouts.toasts.claimReviewRequired'), { icon: '📦' });
      }

      if (onConfirmSuccess) {
        await onConfirmSuccess(data);
      }

      if (!returnLogId || pendingLogs.length <= 1) {
        onClose();
      } else {
        await fetchPendingReturnLogs(order.id);
      }
    } catch (err) {
      console.error('[CheckoutReturnReviewModal] Confirm return error:', err);
      toast.error(err.message || t('checkouts.toasts.returnConfirmFailed'));
    } finally {
      setConfirmingId(null);
    }
  };

  const resolveItemInfo = (log) => {
    const joinedItem = log.checkout_items;
    const fallbackItem = (order.checkout_items || []).find((i) => i.id === log.checkout_item_id);
    const name =
      joinedItem?.items?.name ||
      fallbackItem?.items?.name ||
      fallbackItem?.item_name ||
      t('common.item');
    const unit =
      joinedItem?.items?.unit ||
      fallbackItem?.items?.unit ||
      t('common.piece');
    const serialNumber =
      log.returned_serial_number ||
      log.replaced_serial_number ||
      joinedItem?.serial_number ||
      fallbackItem?.serial_number ||
      '';
    return { name, unit, serialNumber };
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-170 rounded-xl bg-card p-6 border border-border shadow-xl">
          <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-extrabold text-foreground tracking-tight flex items-center gap-2 flex-wrap">
                  <span>{t('checkouts.reviewReturnModalTitle')}</span>
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                    {order.order_number}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  {t('checkouts.reviewReturnModalDesc')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Borrower & Order Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-muted/30 border border-border text-xs">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t('checkouts.borrower')}:</span>
              <strong className="text-foreground">{order.borrower_name}</strong>
              {order.borrower_department && (
                <span className="text-muted-foreground">({order.borrower_department})</span>
              )}
            </div>
            {order.projects?.name && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <strong className="text-foreground">{order.projects.name}</strong>
              </div>
            )}
          </div>

          {/* Pending Return Items with Proof Photos */}
          <div className="space-y-3 max-h-100 overflow-y-auto pr-1">
            {loadingLogs ? (
              <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>{t('common.loading')}</span>
              </div>
            ) : pendingLogs.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground space-y-1">
                <CheckCircle2 className="w-7 h-7 mx-auto text-emerald-500 opacity-70" />
                <p className="font-semibold text-foreground">{t('checkouts.noPendingReturnsToReview')}</p>
              </div>
            ) : (
              pendingLogs.map((log) => {
                const { name, unit, serialNumber } = resolveItemInfo(log);
                const isConfirmingThis = confirmingId === log.id || confirmingId === 'all';

                return (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/15 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-foreground">{name}</span>
                          {serialNumber && (
                            <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />
                              <span>S/N: {serialNumber}</span>
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{t('checkouts.pendingReturnReviewStatus')}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>
                            {t('checkouts.chooseReturnQty')}:{' '}
                            <strong className="text-foreground font-mono">
                              {log.returned_quantity} {unit}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            {t('checkouts.condition')}:{' '}
                            <strong
                              className={
                                log.item_condition === 'normal'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              {CONDITION_LABEL_KEYS[log.item_condition]
                                ? t(CONDITION_LABEL_KEYS[log.item_condition])
                                : log.item_condition}
                            </strong>
                          </span>
                          {log.returned_at && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px]">
                                {format(new Date(log.returned_at), 'dd/MM/yyyy HH:mm')}
                              </span>
                            </>
                          )}
                        </div>

                        {log.damage_notes && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                            {log.damage_notes}
                          </p>
                        )}
                      </div>

                      { pendingLogs.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={Boolean(confirmingId) || !log.evidence_photo_url}
                          onClick={() => handleConfirmReturn(log.id)}
                          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg gap-1.5 shrink-0 cursor-pointer"
                        >
                          {isConfirmingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>{t('checkouts.confirmReturn')}</span>
                        </Button>
                      )}
                    </div>

                    {/* Uploaded Proof Photo Card */}
                    {log.evidence_photo_url && (
                      <div className="p-2.5 rounded-lg bg-background border border-border flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewPhotoLog({
                                url: resolveStorageUrl(log.evidence_photo_url),
                                key: log.evidence_photo_url,
                                name,
                              })
                            }
                            className="relative w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0 group cursor-pointer shadow-xs bg-muted/40"
                            title={t('checkouts.viewReturnPhotoBtn')}
                          >
                            <img
                              src={resolveStorageUrl(log.evidence_photo_url)}
                              alt={name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              onError={(e) => handleStorageImageError(e, log.evidence_photo_url)}
                            />
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-4 h-4 text-white" />
                            </span>
                          </button>

                          <div className="space-y-1 min-w-0">
                            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <Camera className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="truncate">{t('checkouts.returnPhotoPreviewTitle')}</span>
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setPreviewPhotoLog({
                                    url: resolveStorageUrl(log.evidence_photo_url),
                                    key: log.evidence_photo_url,
                                    name,
                                  })
                                }
                                className="h-7 px-2.5 text-[11px] font-semibold rounded-md gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>{t('checkouts.viewReturnPhotoBtn')}</span>
                              </Button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewPhotoLog({
                                    url: resolveStorageUrl(log.evidence_photo_url),
                                    key: log.evidence_photo_url,
                                    name,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:underline max-w-[220px] truncate cursor-pointer transition-colors"
                                title={extractFileName(log.evidence_photo_url)}
                              >
                                <FileImage className="w-3 h-3 shrink-0 text-indigo-500" />
                                <span className="truncate">{extractFileName(log.evidence_photo_url)}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={Boolean(confirmingId)}
              className="rounded-lg h-9 px-4 text-xs font-semibold cursor-pointer"
            >
              {t('common.cancel')}
            </Button>

            {pendingLogs.length > 0 && (
              <Button
                type="button"
                disabled={Boolean(confirmingId) || pendingLogs.some((l) => !l.evidence_photo_url)}
                onClick={() => handleConfirmReturn(null)}
                className="rounded-lg h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
              >
                {confirmingId === 'all' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>
                  {confirmingId === 'all'
                    ? t('common.pleaseWait')
                    : pendingLogs.length > 1
                    ? t('checkouts.confirmAllReturnsBtn', { count: pendingLogs.length })
                    : t('checkouts.confirmReturn')}
                </span>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enlarged Photo Preview Dialog */}
      <Dialog
        open={Boolean(previewPhotoLog)}
        onOpenChange={(open) => !open && setPreviewPhotoLog(null)}
      >
        <DialogContent className="sm:max-w-lg rounded-xl bg-card p-5 border border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Camera className="w-4 h-4 text-indigo-500" />
              <span>
                {t('checkouts.returnPhotoPreviewTitle')} — {previewPhotoLog?.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          {previewPhotoLog?.url && (
            <div className="rounded-xl overflow-hidden border border-border bg-black/5 flex items-center justify-center max-h-[70vh]">
              <img
                src={previewPhotoLog.url}
                alt={previewPhotoLog.name}
                className="max-w-full max-h-[65vh] object-contain"
                onError={(e) => handleStorageImageError(e, previewPhotoLog.key || previewPhotoLog.url)}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewPhotoLog(null)}
              className="rounded-lg text-xs font-semibold cursor-pointer"
            >
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CheckoutReturnReviewModal;
