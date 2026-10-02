import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/i18n';

const CheckoutApproveModal = ({
  isOpen,
  onClose,
  order,
  onConfirmApprove,
  loading = false
}) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');

  if (!order) return null;

  const items = order.checkout_items || [];
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity_borrowed || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirmApprove(order, notes.trim());
  };

  const handleClose = () => {
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg w-[95vw] p-5 sm:p-6 bg-card border border-border shadow-xl rounded-2xl max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden space-y-4">
          <DialogHeader className="space-y-1.5 shrink-0">
            <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                {t('checkouts.approveModalTitle', 'อนุมัติและจ่ายพัสดุ')}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {t('checkouts.approveModalDesc', 'ตรวจสอบรายการอุปกรณ์และยอดสต็อกคงเหลือ เมื่อยืนยันระบบจะตัดยอดสต็อกจริงและเปลี่ยนสถานะเป็นใช้งานอยู่')}
            </DialogDescription>
          </DialogHeader>

          {/* Order Header Summary */}
          <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs shrink-0">
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('checkouts.orderNumber', 'เลขที่คำขอ')}:</span>
              <span className="font-mono font-bold text-foreground">{order.order_number}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('checkouts.project', 'โครงการ/คลัง')}:</span>
              <span className="font-medium text-foreground truncate block">
                {order.projects?.name || order.projects?.project_code || '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('checkouts.borrowerName', 'ผู้ขอยืม')}:</span>
              <span className="font-medium text-foreground">{order.borrower_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('checkouts.expectedReturnDate', 'กำหนดส่งคืน')}:</span>
              <span className="font-medium text-foreground">
                {order.borrow_type === 'indefinite' 
                  ? t('checkouts.indefiniteBorrow', 'ไม่กำหนดวันคืน') 
                  : (order.expected_return_date ? format(new Date(order.expected_return_date), 'dd/MM/yyyy') : '—')}
              </span>
            </div>
          </div>

          {/* Items List (Scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t('checkouts.requisitionItems', 'รายการพัสดุที่ขอยืม')} ({items.length} {t('checkouts.itemsUnit', 'รายการ')})</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                {t('checkouts.totalUnits', 'รวมทั้งสิ้น')} {totalQuantity} {t('checkouts.units', 'หน่วย')}
              </span>
            </Label>

            <div className="border border-border/70 rounded-xl divide-y divide-border/50 overflow-hidden bg-background">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-muted/20 transition-colors">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <p className="font-semibold text-foreground truncate">
                      {item.items?.name || item.item_name || 'วัสดุ/อุปกรณ์'}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                      <span>{item.items?.sku || item.items?.model || '-'}</span>
                      {item.serial_number && (
                        <span className="px-1.5 py-0.2 rounded bg-muted text-foreground border border-border text-[10px]">
                          S/N: {item.serial_number}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-foreground">
                      {Number(item.quantity_borrowed || 0).toLocaleString()}
                    </span>
                    <span className="text-muted-foreground ml-1 text-[11px]">
                      {item.items?.unit || t('checkouts.units', 'ชิ้น')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Approval Note */}
          <div className="space-y-1.5 shrink-0">
            <Label htmlFor="checkout-approval-note" className="text-xs font-semibold text-foreground">
              {t('checkouts.approvalNoteLabel', 'บันทึกเจ้าหน้าที่ผู้จ่ายพัสดุ (ถ้ามี)')}
            </Label>
            <input
              id="checkout-approval-note"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('checkouts.approvalNotePlaceholder', 'ระบุบันทึกเพิ่มเติม เช่น ตรวจสอบสภาพสมบูรณ์ พร้อมแบตเตอรี่สำรอง...')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 text-[11px] leading-relaxed shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{t('checkouts.approveDeductionNotice', 'ระบบจะทำการตัดยอดสต็อกคงเหลือจริง และบันทึกชื่อคุณเป็นเจ้าหน้าที่ผู้จ่ายพัสดุ')}</span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40 shrink-0">
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
              size="sm"
              disabled={loading}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shadow-xs gap-1.5"
            >
              {loading && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? t('common.submitting', 'กำลังดำเนินการ...') : t('checkouts.confirmApproveBtn', 'ยืนยันอนุมัติและจ่ายของ')}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutApproveModal;
