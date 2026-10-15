import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Ban, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/i18n';

const CheckoutCancelModal = ({
  isOpen = false,
  onClose,
  order = null,
  onConfirmCancel,
  isProcessing = false
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
    }
  }, [isOpen]);

  if (!order) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirmCancel(order.id, reason.trim());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isProcessing && onClose()}>
      <DialogContent className="max-w-md rounded-xl bg-card p-6 border border-border shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {t('checkouts.cancelModalTitle', 'ยกเลิกรายการประวัติยืม-คืน (SUPER)')}
                </DialogTitle>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  Order #{order.order_number || order.id?.slice(0, 8)} • {order.borrower_name || '-'}
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Warning Banner */}
          <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t('checkouts.cancelNoticeTitle', 'การยกเลิกรายการยืม-คืนพัสดุ')}</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {t('checkouts.cancelNotice', 'รายการนี้จะถูกเปลี่ยนสถานะเป็นยกเลิก (Cancelled) และหากมีพัสดุหรือยอดคงเหลือที่ค้างอยู่ ระบบจะทำการปรับสถานะและคืนยอดสต็อกให้อัตโนมัติ')}
            </p>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t('checkouts.cancellationReason', 'เหตุผลในการยกเลิก')}</span>
              <span className="text-[10px] text-rose-500 font-bold">* {t('common.required', 'จำเป็น')}</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('checkouts.cancellationReasonPlaceholder', 'ระบุเหตุผลในการยกเลิกรายการยืม-คืนนี้...')}
              className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:ring-2 focus:ring-rose-500 focus:outline-none resize-none"
              disabled={isProcessing}
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isProcessing}
              className="text-xs rounded-lg h-9"
            >
              {t('common.cancel', 'ยกเลิก')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isProcessing || !reason.trim()}
              className="text-xs rounded-lg h-9 gap-1.5 font-semibold"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{isProcessing ? t('common.processing', 'กำลังดำเนินการ...') : t('checkouts.confirmCancelOrder', 'ยืนยันการยกเลิก')}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutCancelModal;
