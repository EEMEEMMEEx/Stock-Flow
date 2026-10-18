import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Hash, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n';
import { cleanRpcMessage } from '@/lib/rpcErrors';

/**
 * Modal สำหรับระบุหรือแก้ไขหมายเลขเครื่อง (Serial Number) ย้อนหลัง
 * สำหรับอุปกรณ์ที่ส่งคืนสภาพชำรุดเสียหายเพื่อส่งเคลม CAIM
 * (docs/caim-claim-sn-fix-plan.md §4 / §5)
 */
const EditSerialModal = ({
  isOpen = false,
  onClose,
  log = null,
  order = null,
  onSuccess
}) => {
  const { t } = useTranslation();

  const [serialNumber, setSerialNumber] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Initialise fields when modal opens
  useEffect(() => {
    if (isOpen && log) {
      const currentSerial = log.replaced_serial_number || log.checkout_items?.serial_number || '';
      setSerialNumber(currentSerial);
      setReason('');
      setErrorMessage('');
    }
  }, [isOpen, log]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMessage('');

    const trimmedSerial = serialNumber.trim().toUpperCase();
    const trimmedReason = reason.trim();

    if (!trimmedSerial) {
      setErrorMessage(t('checkouts.serialNumberRequired', 'กรุณาระบุหมายเลขเครื่อง (Serial Number)'));
      return;
    }

    if (!trimmedReason || trimmedReason.length < 2) {
      setErrorMessage(t('checkouts.serialReasonRequired', 'กรุณาระบุเหตุผลในการบันทึก / แก้ไข (อย่างน้อย 2 ตัวอักษร)'));
      return;
    }

    const checkoutItemId = log.checkout_item_id || log.checkout_items?.id;
    if (!checkoutItemId) {
      setErrorMessage(t('checkouts.invalidCheckoutItem', 'ไม่พบข้อมูลรายการพัสดุ'));
      return;
    }

    try {
      setSubmitting(true);
      const { data, error } = await supabase.rpc('update_checkout_item_serial', {
        p_checkout_item_id: checkoutItemId,
        p_new_serial_number: trimmedSerial,
        p_reason: trimmedReason,
        p_return_log_id: log.id || null
      });

      if (error) {
        throw error;
      }

      toast.success(t('checkouts.serialUpdatedSuccess', 'บันทึกหมายเลขเครื่อง (S/N) เรียบร้อย'));
      if (onSuccess) {
        onSuccess({
          checkoutItemId,
          returnLogId: log.id,
          newSerial: trimmedSerial,
          data
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to update serial number:', err);
      const cleaned = cleanRpcMessage(err.message || '');
      setErrorMessage(cleaned || t('checkouts.updateSerialFailed', 'เกิดข้อผิดพลาดในการบันทึกหมายเลขเครื่อง'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const itemName = log?.checkout_items?.items?.name || log?.items?.name || '-';
  const orderNumber = order?.order_number || '-';
  const currentSerial = log?.replaced_serial_number || log?.checkout_items?.serial_number;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !submitting && !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Hash className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {t('checkouts.serialModalTitle', 'ระบุหมายเลขเครื่อง (Serial Number)')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {t('checkouts.serialModalDesc', 'ระบุหรือแก้ไขหมายเลขซีเรียลเพื่อใช้ในการส่งเคลม CAIM หรือติดตามอุปกรณ์')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Item details card */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between items-start gap-2">
              <span className="text-muted-foreground">{t('checkouts.item')}:</span>
              <span className="font-semibold text-foreground text-right">{itemName}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">{t('checkouts.orderNumber')}:</span>
              <span className="font-mono font-medium text-foreground">{orderNumber}</span>
            </div>
            {currentSerial && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground">{t('checkouts.currentSerial')}:</span>
                <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">{currentSerial}</span>
              </div>
            )}
          </div>

          {/* Serial Number Input */}
          <div className="space-y-1.5">
            <Label htmlFor="serial-number-input" className="text-xs font-medium">
              {t('checkouts.serialNumberLabel', 'หมายเลขเครื่อง (Serial Number)')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="serial-number-input"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
              placeholder={t('checkouts.serialNumberPlaceholder', 'เช่น HEX-65W-2026-00918')}
              disabled={submitting}
              className="font-mono text-sm uppercase tracking-wider"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              {t('checkouts.serialInputHint', 'ระบบจะตัดช่องว่างและแปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ')}
            </p>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <Label htmlFor="serial-reason-input" className="text-xs font-medium">
              {t('checkouts.serialReasonLabel', 'เหตุผลในการบันทึก / แก้ไข')} <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="serial-reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('checkouts.serialReasonPlaceholder', 'เช่น ระบุ S/N อุปกรณ์ที่ส่งคืนชำรุดเพื่อดำเนินการส่งเคลม CAIM')}
              disabled={submitting}
              rows={2}
              className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none disabled:opacity-50"
            />
          </div>

          {/* Notice box */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-700 dark:text-blue-300">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>{t('checkouts.serialCaimNotice', 'S/N นี้จะถูกบันทึกและนำไปใช้สำหรับเปิดใบแจ้งเคลมในระบบ CAIM โดยอัตโนมัติ')}</span>
          </div>

          {/* Error alert */}
          {errorMessage && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="break-words">{errorMessage}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="cursor-pointer"
            >
              {t('common.cancel', 'ยกเลิก')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !serialNumber.trim() || !reason.trim()}
              className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>{t('common.saving', 'กำลังบันทึก...')}</span>
                </>
              ) : (
                <span>{t('common.save', 'บันทึกข้อมูล')}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditSerialModal;
