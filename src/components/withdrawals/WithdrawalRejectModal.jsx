import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

const REJECT_PRESETS = [
  'Insufficient stock in project location',
  'Incorrect requisition information',
  'Requester requested cancellation',
  'Project ended or requisitions closed'
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
      <DialogContent className="sm:max-w-[460px] rounded-xl bg-card p-6 border border-border shadow-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
            <DialogTitle className="flex items-center gap-2.5 text-red-600 dark:text-red-400 text-base font-extrabold">
              <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30">
                <XCircle className="w-5 h-5" />
              </div>
              <span>Reject Requisition #{orderToReject?.id?.slice(0, 8)}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>Rejection Reason</span>
                <span className="text-destructive">*</span>
              </label>
              <textarea
                required
                className="flex min-h-[90px] w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 resize-none shadow-2xs"
                placeholder="e.g. Insufficient stock in location or incorrect details..."
                value={rejectReason}
                onChange={(e) => onRejectReasonChange(e.target.value)}
              />
            </div>

            {/* Quick Reason Presets */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Quick presets:</span>
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
              className="rounded-lg text-xs h-9 px-4 font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!rejectReason.trim() || isProcessing}
              className="rounded-lg text-xs h-9 px-4 font-semibold shadow-xs cursor-pointer"
            >
              {isProcessing ? 'Rejecting...' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalRejectModal;
