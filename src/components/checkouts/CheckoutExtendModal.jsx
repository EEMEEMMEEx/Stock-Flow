import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  CalendarClock, Calendar, AlertTriangle, CheckCircle2, 
  User, Building2, Sparkles, Plus, Infinity as InfinityIcon
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, addDays, differenceInDays, isAfter, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const CheckoutExtendModal = ({
  isOpen,
  onClose,
  order,
  onExtendSuccess
}) => {
  const { user } = useAuth();
  const [newDueDate, setNewDueDate] = useState('');
  const [isIndefiniteChoice, setIsIndefiniteChoice] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentDueDate = useMemo(() => {
    if (!order?.expected_return_date) return new Date();
    try {
      return parseISO(order.expected_return_date);
    } catch {
      return new Date();
    }
  }, [order?.expected_return_date]);

  const minSelectableDate = useMemo(() => {
    return format(addDays(currentDueDate, 1), 'yyyy-MM-dd');
  }, [currentDueDate]);

  // Initialize dates when order changes
  useEffect(() => {
    if (order && (order.borrow_type === 'indefinite' || !order.expected_return_date) && isOpen) {
      toast.error('รายการยืมแบบไม่มีกำหนดคืน ไม่สามารถขยายเวลาส่งคืนได้');
      onClose();
      return;
    }

    if (order && order.expected_return_date && isOpen) {
      const currentDue = parseISO(order.expected_return_date);
      // Default to +7 days from current expected return date
      const defaultNext = addDays(currentDue, 7);
      setNewDueDate(format(defaultNext, 'yyyy-MM-dd'));
      setIsIndefiniteChoice(false);
      setReason('');
    }
  }, [order, isOpen, onClose]);

  // Calculate extension preview metrics
  const previewData = useMemo(() => {
    if (!order) return null;

    if (isIndefiniteChoice) {
      return {
        isValid: true,
        isIndefinite: true,
        statusType: 'indefinite',
        statusLabel: 'ปกติ (ไม่มีกำหนดส่งคืน)',
        formattedNewDate: 'ไม่มีกำหนดส่งคืน'
      };
    }

    if (!newDueDate) return null;

    try {
      const parsedNewDate = parseISO(newDueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const isValid = isAfter(parsedNewDate, currentDueDate);
      const additionalDays = differenceInDays(parsedNewDate, currentDueDate);
      const daysFromToday = differenceInDays(parsedNewDate, today);

      let statusType = 'normal';
      let statusLabel = 'สถานะปกติ';
      if (daysFromToday < 0) {
        statusType = 'overdue';
        statusLabel = 'ยังคงเกินกำหนด';
      } else if (daysFromToday <= 2) {
        statusType = 'due_soon';
        statusLabel = `ใกล้ครบกำหนด (อีก ${daysFromToday} วัน)`;
      } else {
        statusType = 'normal';
        statusLabel = `ปกติ (อีก ${daysFromToday} วัน)`;
      }

      return {
        isValid,
        isIndefinite: false,
        additionalDays,
        daysFromToday,
        statusType,
        statusLabel,
        formattedNewDate: format(parsedNewDate, 'dd MMMM yyyy', { locale: th })
      };
    } catch {
      return null;
    }
  }, [newDueDate, currentDueDate, order, isIndefiniteChoice]);

  if (!order) return null;

  // Quick preset adder
  const handleQuickAddDays = (days) => {
    setIsIndefiniteChoice(false);
    const baseDate = isAfter(new Date(), currentDueDate) ? new Date() : currentDueDate;
    const target = addDays(baseDate, days);
    setNewDueDate(format(target, 'yyyy-MM-dd'));
  };

  const handleSelectIndefinite = () => {
    setIsIndefiniteChoice(true);
    setNewDueDate('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (order?.borrow_type === 'indefinite' && !isIndefiniteChoice) {
      toast.error('รายการยืมแบบไม่มีกำหนดคืน ไม่สามารถขยายเวลาส่งคืนได้');
      return;
    }

    if (!isIndefiniteChoice && !newDueDate) {
      toast.error('กรุณาระบุกำหนดส่งคืนใหม่ หรือเลือกไม่มีกำหนดคืน');
      return;
    }

    if (!isIndefiniteChoice && !previewData?.isValid) {
      toast.error(`กำหนดส่งคืนใหม่ต้องมากกว่าวันที่เดิม (${format(currentDueDate, 'dd/MM/yyyy')})`);
      return;
    }

    try {
      setSubmitting(true);

      // 1. Try atomic PostgreSQL RPC first
      let rpcSuccess = false;
      try {
        const { data, error } = await supabase.rpc('extend_checkout_due_date', {
          p_order_id: order.id,
          p_new_due_date: isIndefiniteChoice ? null : newDueDate,
          p_reason: reason.trim() || null,
          p_extended_by: user?.id || null,
          p_is_indefinite: isIndefiniteChoice
        });

        if (!error && data?.success) {
          rpcSuccess = true;
        } else if (error && error.message) {
          console.warn('RPC notice:', error.message);
        }
      } catch (rpcErr) {
        console.warn('extend_checkout_due_date RPC error, falling back to direct table update:', rpcErr);
      }

      // 2. Direct fallback if RPC not yet deployed
      if (!rpcSuccess) {
        let newStatus = order.status;
        const hasPartial = (order.checkout_items || []).some(
          i => Number(i.quantity_returned || 0) > 0 || Number(i.quantity_damaged || 0) > 0 || Number(i.quantity_lost || 0) > 0
        );

        if (isIndefiniteChoice) {
          newStatus = hasPartial ? 'partial_returned' : 'active';
        } else {
          // Calculate new order status
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const parsedNew = parseISO(newDueDate);
          const isStillOverdue = parsedNew < today;
          
          if (order.status === 'overdue') {
            if (!isStillOverdue) {
              newStatus = hasPartial ? 'partial_returned' : 'active';
            }
          }
        }

        // Update checkout_orders table
        const { error: updateErr } = await supabase
          .from('checkout_orders')
          .update({
            borrow_type: isIndefiniteChoice ? 'indefinite' : (order.borrow_type || 'standard'),
            expected_return_date: isIndefiniteChoice ? null : newDueDate,
            status: newStatus
          })
          .eq('id', order.id);

        if (updateErr) throw updateErr;

        // Insert into checkout_extension_logs table
        try {
          await supabase.from('checkout_extension_logs').insert({
            checkout_order_id: order.id,
            previous_due_date: order.expected_return_date,
            new_due_date: isIndefiniteChoice ? null : newDueDate,
            extension_reason: isIndefiniteChoice
              ? (reason.trim() ? `[เปลี่ยนเป็นไม่มีกำหนดคืน] ${reason.trim()}` : 'เปลี่ยนเป็นการยืมแบบไม่มีกำหนดคืน (Indefinite Borrow)')
              : (reason.trim() || null),
            extended_by: user?.id || null,
            extended_at: new Date().toISOString()
          });
        } catch (logErr) {
          console.warn('Extension log table insert notice:', logErr);
        }

        // Insert into audit_logs if available
        try {
          await supabase.from('audit_logs').insert({
            user_id: user?.id || null,
            action: 'checkout.extend_due_date',
            target_type: 'checkout_order',
            target_id: order.id,
            details: {
              order_number: order.order_number,
              previous_due_date: order.expected_return_date,
              new_due_date: isIndefiniteChoice ? null : newDueDate,
              borrow_type: isIndefiniteChoice ? 'indefinite' : (order.borrow_type || 'standard'),
              reason: reason.trim() || null
            }
          });
        } catch (auditErr) {
          console.warn('Audit log notice:', auditErr);
        }
      }

      if (isIndefiniteChoice) {
        toast.success(`เปลี่ยนเป็นไม่มีกำหนดคืนสำหรับใบยืม ${order.order_number} สำเร็จ`);
      } else {
        toast.success(`ขยายกำหนดวันส่งคืนของใบยืม ${order.order_number} สำเร็จ`);
      }
      if (onExtendSuccess) onExtendSuccess();
      onClose();
    } catch (err) {
      console.error('Extend Due Date Error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] rounded-xl bg-card p-6 border border-border shadow-xl">
        <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                <span>ขยายกำหนดวันส่งคืนพัสดุ</span>
                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                  {order.order_number}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                ขยายระยะเวลาการยืมอุปกรณ์ หรือเปลี่ยนเป็นยืมแบบไม่มีกำหนดคืน (Indefinite Borrow)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Borrower & Current Due Date Card */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{order.borrower_name}</span>
                {order.borrower_department && (
                  <span className="text-muted-foreground font-normal">({order.borrower_department})</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span className="truncate max-w-[140px]">{order.projects?.name}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className="text-muted-foreground">กำหนดส่งคืนปัจจุบัน:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-foreground font-mono">
                  {format(currentDueDate, 'dd/MM/yyyy')}
                </span>
                {order.isOverdue && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-600 border border-red-500/30">
                    เกินกำหนด
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* New Due Date Input */}
          <div className="space-y-2">
            <Label htmlFor="new-due-date" className="text-xs font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>กำหนดส่งคืนใหม่ (New Return Due Date) *</span>
              </span>
              {!isIndefiniteChoice && (
                <span className="text-[11px] text-muted-foreground font-normal">
                  ต้องหลังวันที่ {format(currentDueDate, 'dd/MM/yyyy')}
                </span>
              )}
            </Label>

            {isIndefiniteChoice ? (
              <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-950 dark:text-purple-200 flex items-center justify-between transition-all">
                <div className="flex items-center gap-2">
                  <InfinityIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <div className="font-bold text-xs">ยืมแบบไม่มีกำหนดคืน (Indefinite Borrow)</div>
                    <div className="text-[11px] opacity-80">ไม่มีกำหนดวันส่งคืน และคำสั่งยืมจะไม่แสดงแจ้งเตือนเกินกำหนด</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsIndefiniteChoice(false);
                    handleQuickAddDays(7);
                  }}
                  className="h-7 px-2 text-[11px] font-medium border-purple-500/40 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 cursor-pointer"
                >
                  กลับไประบุวันที่
                </Button>
              </div>
            ) : (
              <Input
                id="new-due-date"
                type="date"
                min={minSelectableDate}
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="h-9 text-xs rounded-lg font-mono"
                required={!isIndefiniteChoice}
              />
            )}

            {/* Quick Extension Shortcut Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[11px] text-muted-foreground mr-1">ขยายด่วน:</span>
              {[
                { label: '+3 วัน', days: 3 },
                { label: '+7 วัน (1 สัปดาห์)', days: 7 },
                { label: '+14 วัน (2 สัปดาห์)', days: 14 },
                { label: '+30 วัน (1 เดือน)', days: 30 }
              ].map(preset => (
                <Button
                  key={preset.days}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAddDays(preset.days)}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border-border/80 hover:bg-indigo-500/10 hover:text-indigo-600 hover:border-indigo-500/30 cursor-pointer transition-all"
                >
                  <Plus className="w-2.5 h-2.5 mr-0.5" />
                  {preset.label}
                </Button>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectIndefinite}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  isIndefiniteChoice
                    ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700 hover:text-white shadow-xs'
                    : 'border-purple-500/30 bg-purple-500/5 text-purple-700 dark:text-purple-300 hover:bg-purple-500/15 hover:border-purple-500/50'
                }`}
              >
                <InfinityIcon className="w-3 h-3 mr-1" />
                ไม่มีกำหนดคืน (Indefinite)
              </Button>
            </div>
          </div>

          {/* Extension Status Preview */}
          {previewData && (
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
              isIndefiniteChoice
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-900 dark:text-purple-300'
                : previewData.isValid
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-300'
            }`}>
              <div className="flex items-center gap-2">
                {isIndefiniteChoice ? (
                  <InfinityIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                ) : previewData.isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <div>
                  <div className="font-bold">
                    {isIndefiniteChoice
                      ? 'เปลี่ยนสถานะ: ยืมแบบไม่มีกำหนดส่งคืน (Indefinite Borrow)'
                      : previewData.isValid 
                        ? `ขยายเพิ่ม +${previewData.additionalDays} วัน (${previewData.formattedNewDate})`
                        : 'วันที่ไม่ถูกต้อง (ต้องมากกว่ากำหนดคืนเดิม)'}
                  </div>
                  <div className="text-[11px] opacity-85">
                    สถานะคำสั่งยืมใหม่: <strong>{previewData.statusLabel}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reason / Notes Textarea */}
          <div className="space-y-1.5">
            <Label htmlFor="extend-reason" className="text-xs font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>เหตุผลในการขอขยายเวลา (Extension Reason)</span>
              <span className="text-[11px] text-muted-foreground font-normal">(ระบุหรือไม่ก็ได้)</span>
            </Label>
            <textarea
              id="extend-reason"
              rows={2}
              placeholder="เช่น งานติดตั้งไซต์งานยังไม่แล้วเสร็จ, อยู่ระหว่างรอทดสอบระบบ..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-xs shadow-2xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-end border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg h-9 text-xs font-semibold cursor-pointer"
            >
              ยกเลิก
            </Button>

            {isIndefiniteChoice ? (
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="rounded-lg h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5 font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <InfinityIcon className="w-3.5 h-3.5" />
                <span>{submitting ? 'กำลังบันทึก...' : 'ยืนยันเปลี่ยนเป็นไม่มีกำหนดคืน'}</span>
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !previewData?.isValid}
                className="rounded-lg h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5 font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>{submitting ? 'กำลังบันทึก...' : 'ยืนยันขยายเวลาส่งคืน'}</span>
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutExtendModal;
