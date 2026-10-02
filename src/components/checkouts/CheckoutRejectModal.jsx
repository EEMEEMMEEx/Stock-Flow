import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertTriangle, XCircle, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/i18n';

const CheckoutRejectModal = ({
  isOpen,
  onClose,
  order,
  onConfirmReject,
  loading = false
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  if (!order) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirmReject(order, reason.trim());
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-[95vw] p-5 sm:p-6 bg-card border border-border shadow-xl rounded-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2.5 text-destructive">
              <div className="p-2 rounded-xl bg-destructive/10 border border-destructive/20">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                {t('checkouts.rejectModalTitle', 'ปฏิเสธคำขอยืมพัสดุ')}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {t('checkouts.rejectModalDesc', 'ระบุเหตุผลในการปฏิเสธคำขอยืม ข้อมูลนี้จะถูกบันทึกและแจ้งเตือนไปยังผู้ขอยืม')}
            </DialogDescription>
          </DialogHeader>

          {/* Order Details Brief */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('checkouts.orderNumber', 'เลขที่คำขอ')}:</span>
              <span className="font-mono font-bold text-foreground">{order.order_number}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('checkouts.borrowerName', 'ผู้ขอยืม')}:</span>
              <span className="font-medium text-foreground">{order.borrower_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('checkouts.itemsCount', 'จำนวนรายการ')}:</span>
              <span className="font-medium text-foreground">
                {(order.checkout_items || []).length} {t('checkouts.itemsUnit', 'รายการ')}
              </span>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <Label htmlFor="checkout-rejection-reason" className="text-xs font-semibold text-foreground">
              {t('checkouts.rejectionReasonLabel', 'เหตุผลในการปฏิเสธ')} <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="checkout-rejection-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('checkouts.rejectionReasonPlaceholder', 'ระบุเหตุผล เช่น สต็อกไม่เพียงพอ, วัสดุอยู่ระหว่างซ่อมบำรุง, ข้อมูลไม่ครบถ้วน...')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive transition-colors resize-none"
              required
            />
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{t('checkouts.rejectNotice', 'เมื่อปฏิเสธแล้ว คำขอจะถูกเปลี่ยนสถานะเป็น Rejected และไม่สามารถย้อนกลับได้')}</span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={loading}
              className="rounded-lg text-xs font-semibold cursor-pointer"
            >
              {t('common.cancel', 'ยกเลิก')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={loading || !reason.trim()}
              className="rounded-lg text-xs font-semibold cursor-pointer shadow-xs gap-1.5"
            >
              {loading && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? t('common.submitting', 'กำลังดำเนินการ...') : t('checkouts.confirmRejectBtn', 'ยืนยันปฏิเสธคำขอ')}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutRejectModal;
