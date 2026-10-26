import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  PackageCheck,
  PackageX,
  AlertCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmCaimInboundResolution } from '@/lib/caimSync';

/**
 * Modal สำหรับยืนยันผลการเคลม/ซ่อมจาก CAIM
 * - Case A (repaired / replaced_new): ยืนยันรับเข้าคลัง เพิ่มสต็อก 1 หน่วย
 * - Case B (unrepairable): ยืนยันแทงจำหน่ายเป็นของเสีย สต็อกไม่ขยับ
 */
const CaimInboundConfirmModal = ({
  isOpen = false,
  onClose,
  log = null,
  onSuccess
}) => {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const order = log?.checkout_orders || {};
  const checkoutItem = log?.checkout_items || {};
  const masterItem = checkoutItem?.items || {};
  const repairResult = log?.caim_repair_result || '';
  const payload = log?.caim_inbound_payload || {};

  const isRestoration = repairResult === 'repaired' || repairResult === 'replaced_new';

  const ticketId = log?.caim_ticket_id || payload?.ticketId || '-';
  const ticketUrl = log?.caim_ticket_url || `https://claims-nu-taupe.vercel.app/tickets?search=${encodeURIComponent(ticketId)}`;
  const serialNo = payload?.newSerialNo || payload?.replacedNewSerialNo || payload?.serialNo || log?.replaced_serial_number || checkoutItem?.serial_number || '-';

  const handleConfirm = async () => {
    setErrorMessage('');
    try {
      setSubmitting(true);
      const res = await confirmCaimInboundResolution({
        returnLogId: log.id,
        action: 'confirm',
        notes: notes.trim()
      });

      toast.success(res?.message || 'บันทึกการดำเนินการเรียบร้อย');
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      console.error('[CaimInboundConfirmModal] Error:', err);
      setErrorMessage(err.message || 'ดำเนินการไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (!log) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg rounded-xl bg-card p-6 border border-border shadow-xl">
        <div className="space-y-4">
          <DialogHeader className="space-y-1.5 border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              {isRestoration ? (
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <PackageCheck className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <PackageX className="w-5 h-5" />
                </div>
              )}
              <DialogTitle className="text-base text-foreground font-bold">
                {isRestoration
                  ? 'ยืนยันรับอุปกรณ์คืนเข้าคลัง (สต็อก +1 หน่วย)'
                  : 'ยืนยันแทงจำหน่ายของเสีย (สต็อกไม่เปลี่ยนแปลง)'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {isRestoration
                ? 'CAIM แจ้งว่าอุปกรณ์ซ่อมเสร็จหรือได้เปลี่ยนเครื่องใหม่ เมื่อยืนยันระบบจะสร้างใบรับเข้าคลังทันที'
                : 'CAIM สรุปผลว่าอุปกรณ์ชำรุดเสียหายถาวรไม่สามารถซ่อมได้ เมื่อยืนยันระบบจะบันทึกลงทะเบียนของเสีย'}
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Ticket & Result Details */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <span>Ticket: {ticketId}</span>
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-500 hover:text-blue-600 inline-flex items-center gap-0.5"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold text-xs border ${
                  repairResult === 'repaired'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    : repairResult === 'replaced_new'
                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                }`}
              >
                {repairResult === 'repaired'
                  ? 'ซ่อมสำเร็จ'
                  : repairResult === 'replaced_new'
                  ? 'เปลี่ยนเครื่องใหม่'
                  : 'ซ่อมไม่ได้ (Scrap)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t border-border/30">
              <div className="truncate">
                <span className="font-medium text-foreground">พัสดุ: </span>
                {masterItem.name || '-'}
              </div>
              <div className="truncate font-mono">
                <span className="font-medium text-foreground">S/N: </span>
                {serialNo}
              </div>
              <div className="truncate">
                <span className="font-medium text-foreground">คำสั่งยืม: </span>
                {order.order_number || '-'}
              </div>
              <div className="truncate">
                <span className="font-medium text-foreground">โครงการ: </span>
                {order.projects?.name || '-'}
              </div>
            </div>

            {payload?.notes && (
              <div className="pt-1 border-t border-border/30 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">บันทึกจาก CAIM: </span>
                {payload.notes}
              </div>
            )}
          </div>

          {/* User confirmation notes */}
          <div>
            <Label htmlFor="inboundNotes" className="text-xs font-semibold">
              หมายเหตุการรับเข้า / แทงจำหน่าย (ทางเลือก)
            </Label>
            <textarea
              id="inboundNotes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)..."
              className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none resize-none disabled:opacity-50 mt-1"
              disabled={submitting}
            />
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
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={submitting}
              className={`h-8 text-xs gap-1.5 font-semibold text-white cursor-pointer shadow-xs ${
                isRestoration
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : isRestoration ? (
                <>
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>ยืนยันรับเข้าสต็อก (+1)</span>
                </>
              ) : (
                <>
                  <PackageX className="w-3.5 h-3.5" />
                  <span>ยืนยันแทงจำหน่าย</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CaimInboundConfirmModal;
