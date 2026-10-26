import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, AlertCircle, Loader2, Building2, User, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { syncReturnLogToCaim } from '@/lib/caimSync';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Modal สำหรับตรวจสอบข้อมูลและยืนยันเปิดใบแจ้งเคลมใน CAIM จากหน้า /scrap
 */
const CaimClaimSubmitModal = ({
  isOpen = false,
  onClose,
  log = null,
  onSuccess
}) => {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [problemDesc, setProblemDesc] = useState('');
  const [vendor, setVendor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const order = log?.checkout_orders || {};
  const checkoutItem = log?.checkout_items || {};
  const masterItem = checkoutItem?.items || {};
  const serialNo = log?.replaced_serial_number || checkoutItem?.serial_number || '';

  useEffect(() => {
    if (isOpen && log) {
      setProblemDesc(log.damage_notes || 'อุปกรณ์ชำรุดจากการใช้งานหน้างาน');
      setVendor(masterItem.vendor || '');
      setErrorMessage('');
    }
  }, [isOpen, log, masterItem.vendor]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMessage('');

    if (!serialNo || !serialNo.trim()) {
      setErrorMessage('จำเป็นต้องระบุหมายเลขเครื่อง (S/N) ก่อนส่งเคลม CAIM');
      return;
    }

    if (!problemDesc.trim()) {
      setErrorMessage('กรุณาระบุอาการชำรุดหรือเหตุผลในการส่งเคลม');
      return;
    }

    try {
      setSubmitting(true);
      const res = await syncReturnLogToCaim({
        returnLogId: log.id,
        orderNumber: order.order_number,
        borrowerName: order.borrower_name,
        projectName: order.projects?.name,
        serialNumber: serialNo.trim(),
        itemName: masterItem.name || 'อุปกรณ์',
        vendor: vendor.trim() || masterItem.vendor || 'Other',
        model: masterItem.model || masterItem.name || '-',
        problemDesc: problemDesc.trim(),
        reporterName: profile?.full_name || 'เจ้าหน้าที่คลัง'
      });

      toast.success(
        t('checkouts.toasts.caimTicketCreated', { ticket: res.ticket_id }) ||
          `เปิดใบแจ้งเคลมใน CAIM สำเร็จ (${res.ticket_id})`
      );

      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      console.error('[CaimClaimSubmitModal] Error:', err);
      setErrorMessage(err.message || 'ส่งข้อมูลเปิดเคลมไปยัง CAIM ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (!log) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg rounded-xl bg-card p-6 border border-border shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-1.5 border-b border-border/40 pb-3">
            <div className="flex items-center gap-2 text-primary font-bold">
              <Send className="w-5 h-5 text-blue-500" />
              <DialogTitle className="text-base text-foreground">
                ยืนยันการเปิดใบแจ้งเคลมในระบบ CAIM
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              ตรวจสอบข้อมูลอุปกรณ์และส่งข้อมูลเปิด Ticket เคลม/ส่งซ่อมไปยังระบบ CAIM
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Item & Order Summary */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>{masterItem.name || 'อุปกรณ์'}</span>
              <span className="font-mono px-1.5 py-0.5 rounded bg-background border border-border/60">
                S/N: {serialNo || '-'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div className="flex items-center gap-1.5 truncate">
                <Hash className="w-3.5 h-3.5 shrink-0" />
                <span>คำสั่งยืม: {order.order_number || '-'}</span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span>ผู้ยืม: {order.borrower_name || '-'}</span>
              </div>
              <div className="flex items-center gap-1.5 truncate col-span-2">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>โครงการ: {order.projects?.name || '-'}</span>
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="vendor" className="text-xs font-semibold">
                ผู้ผลิต / ยี่ห้อ (Vendor)
              </Label>
              <Input
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="เช่น Hikvision, Cisco, Bosch หรือ Other"
                className="h-9 text-xs mt-1"
                disabled={submitting}
              />
            </div>

            <div>
              <Label htmlFor="problemDesc" className="text-xs font-semibold">
                อาการชำรุด / รายละเอียดปัญหา <span className="text-rose-500">*</span>
              </Label>
              <textarea
                id="problemDesc"
                rows={3}
                value={problemDesc}
                onChange={(e) => setProblemDesc(e.target.value)}
                placeholder="ระบุอาการชำรุด เช่น เปิดไม่ติด พอร์ตแลนช็อต หรือภาพลาย..."
                className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none resize-none disabled:opacity-50 mt-1"
                disabled={submitting}
                required
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="h-8 text-xs cursor-pointer"
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !serialNo}
              className="h-8 text-xs gap-1.5 font-semibold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังส่งข้อมูล...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>ยืนยันเปิดใบเคลม</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CaimClaimSubmitModal;
