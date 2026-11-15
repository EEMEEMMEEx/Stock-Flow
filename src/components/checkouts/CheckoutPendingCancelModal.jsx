import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n';

const CheckoutPendingCancelModal = ({
  isOpen = false,
  onClose,
  order = null,
  onConfirmCancel,
  isProcessing = false,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReason('');
  }, [isOpen, order?.id]);

  if (!order) return null;

  const items = order.checkout_items || [];

  const handleClose = () => {
    if (isProcessing) return;
    setReason('');
    onClose?.();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isProcessing || !onConfirmCancel) return;
    onConfirmCancel(order, reason.trim());
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-md w-[95vw] p-5 sm:p-6 bg-card border border-border shadow-xl rounded-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-destructive/10 border border-destructive/20 shrink-0">
                <Ban className="w-5 h-5 text-destructive" aria-hidden="true" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                {t('checkouts.pendingCancelModalTitle', 'ยกเลิกคำขอยืมพัสดุ')}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {t(
                'checkouts.pendingCancelModalDesc',
                'ยืนยันการยกเลิกคำขอยืมที่ยังรอเจ้าหน้าที่ตรวจสอบ หากยกเลิกแล้วคำขอจะถูกย้ายไปยังประวัติรายการ'
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Order Brief */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5 text-xs">
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground shrink-0">
                {t('checkouts.orderNumber', 'เลขที่คำขอ')}:
              </span>
              <span className="font-mono font-bold text-foreground truncate">
                {order.order_number || order.id?.slice(0, 8)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground shrink-0">
                {t('checkouts.borrowerName', 'ผู้ขอยืม')}:
              </span>
              <span className="font-medium text-foreground truncate">
                {order.borrower_name || '—'}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground shrink-0">
                {t('checkouts.itemsCount', 'จำนวนรายการ')}:
              </span>
              <span className="font-medium text-foreground">
                {items.length} {t('checkouts.itemsUnit', 'รายการ')}
              </span>
            </div>
          </div>

          {/* Pending / No-Stock-Deducted Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/25 text-xs leading-relaxed">
            <AlertTriangle
              className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <p className="font-semibold">
                {t(
                  'checkouts.pendingCancelNoticeTitle',
                  'คำขอยังไม่ได้รับการอนุมัติ (ยังไม่ตัดสต็อก)'
                )}
              </p>
              <p className="text-[11px] leading-relaxed">
                {t(
                  'checkouts.pendingCancelNotice',
                  'คำขอยืมนี้ยังอยู่ในสถานะรอตรวจสอบและยังไม่มีการตัดยอดสต็อก การยกเลิกจะเปลี่ยนสถานะเป็นยกเลิก (Cancelled) และไม่สามารถย้อนกลับได้'
                )}
              </p>
            </div>
          </div>

          {/* Optional Reason Input */}
          <div className="space-y-1.5">
            <Label
              htmlFor="checkout-pending-cancel-reason"
              className="text-xs font-semibold text-foreground"
            >
              {t('checkouts.pendingCancelReasonLabel', 'เหตุผลในการยกเลิก (ไม่บังคับ)')}
            </Label>
            <textarea
              id="checkout-pending-cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isProcessing}
              placeholder={t(
                'checkouts.pendingCancelReasonPlaceholder',
                'ระบุเหตุผลเพิ่มเติม เช่น ยื่นคำขอซ้ำ, เปลี่ยนแผนการใช้งาน...'
              )}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <DialogFooter className="pt-2 border-t border-border/40 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
              className="min-h-[44px] sm:min-h-0 sm:h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer"
            >
              {t('checkouts.keepRequisitionBtn', 'เก็บคำขอไว้')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isProcessing}
              className="min-h-[44px] sm:min-h-0 sm:h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer shadow-xs gap-1.5"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>
                {isProcessing
                  ? t('checkouts.cancellingRequisition', 'กำลังยกเลิกคำขอ...')
                  : t('checkouts.confirmPendingCancelBtn', 'ยืนยันยกเลิกคำขอ')}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutPendingCancelModal;
