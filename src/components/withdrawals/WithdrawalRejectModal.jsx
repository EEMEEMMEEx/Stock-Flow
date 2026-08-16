import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { XCircle, AlertCircle } from 'lucide-react';

const REJECT_PRESETS = [
  'วัสดุในคลังโครงการไม่เพียงพอ',
  'ข้อมูลรายการที่ขอเบิกไม่ถูกต้อง',
  'ผู้ขอเบิกแจ้งขอยกเลิกรายการ',
  'โครงการสิ้นสุดหรือปิดรับเบิกแล้ว'
];

const WithdrawalRejectModal = ({
  isOpen,
  onClose,
  orderToReject,
  rejectReason,
  onRejectReasonChange,
  onConfirmReject,
  isProcessing = false
}) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirmReject(e);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
            <DialogTitle className="flex items-center gap-2.5 text-red-600 dark:text-red-400 text-base font-extrabold">
              <div className="p-2 rounded-2xl bg-red-500/15 border border-red-500/30">
                <XCircle className="w-5 h-5" />
              </div>
              <span>ปฏิเสธคำขอเบิกจ่าย #{orderToReject?.id?.slice(0, 8)}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>ระบุเหตุผลในการปฏิเสธ</span>
                <span className="text-destructive">*</span>
              </label>
              <textarea
                required
                className="flex min-h-[90px] w-full rounded-2xl border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 resize-none shadow-2xs"
                placeholder="เช่น สินค้าในคลังโครงการไม่เพียงพอ หรือข้อมูลไม่ถูกต้อง..."
                value={rejectReason}
                onChange={(e) => onRejectReasonChange(e.target.value)}
              />
            </div>

            {/* Quick Reason Presets */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">เลือกเหตุผลสำเร็จรูป:</span>
              <div className="flex flex-wrap gap-1">
                {REJECT_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onRejectReasonChange(preset)}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-muted/60 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 border border-border/50 transition-all cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl text-xs h-10"
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!rejectReason.trim() || isProcessing}
              className="rounded-xl text-xs h-10 font-bold shadow-sm cursor-pointer"
            >
              {isProcessing ? 'กำลังปฏิเสธ...' : 'ยืนยันปฏิเสธคำขอ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalRejectModal;
