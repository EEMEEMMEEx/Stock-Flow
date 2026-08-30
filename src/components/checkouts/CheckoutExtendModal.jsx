import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  CalendarClock, Calendar, AlertTriangle, CheckCircle2, 
  User, Building2, Sparkles, Plus
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
    if (order && order.expected_return_date && isOpen) {
      const currentDue = parseISO(order.expected_return_date);
      // Default to +7 days from current expected return date
      const defaultNext = addDays(currentDue, 7);
      setNewDueDate(format(defaultNext, 'yyyy-MM-dd'));
      setReason('');
    }
  }, [order, isOpen]);

  // Calculate extension preview metrics
  const previewData = useMemo(() => {
    if (!newDueDate || !order) return null;

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
        additionalDays,
        daysFromToday,
        statusType,
        statusLabel,
        formattedNewDate: format(parsedNewDate, 'dd MMMM yyyy', { locale: th })
      };
    } catch {
      return null;
    }
  }, [newDueDate, currentDueDate, order]);

  if (!order) return null;

  // Quick preset adder
  const handleQuickAddDays = (days) => {
    const baseDate = isAfter(new Date(), currentDueDate) ? new Date() : currentDueDate;
    const target = addDays(baseDate, days);
    setNewDueDate(format(target, 'yyyy-MM-dd'));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newDueDate) {
      toast.error('กรุณาระบุกำหนดส่งคืนใหม่');
      return;
    }

    if (!previewData?.isValid) {
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
          p_new_due_date: newDueDate,
          p_reason: reason.trim() || null,
          p_extended_by: user?.id || null
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
        // Calculate new order status
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const parsedNew = parseISO(newDueDate);
        const isStillOverdue = parsedNew < today;
        
        let newStatus = order.status;
        if (order.status === 'overdue') {
          if (!isStillOverdue) {
            const hasPartial = (order.checkout_items || []).some(
              i => Number(i.quantity_returned || 0) > 0 || Number(i.quantity_damaged || 0) > 0 || Number(i.quantity_lost || 0) > 0
            );
            newStatus = hasPartial ? 'partial_returned' : 'active';
          }
        }

        // Update checkout_orders table
        const { error: updateErr } = await supabase
          .from('checkout_orders')
          .update({
            expected_return_date: newDueDate,
            status: newStatus
          })
          .eq('id', order.id);

        if (updateErr) throw updateErr;

        // Insert into checkout_extension_logs table
        try {
          await supabase.from('checkout_extension_logs').insert({
            checkout_order_id: order.id,
            previous_due_date: order.expected_return_date,
            new_due_date: newDueDate,
            extension_reason: reason.trim() || null,
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
              new_due_date: newDueDate,
              reason: reason.trim() || null
            }
          });
        } catch (auditErr) {
          console.warn('Audit log notice:', auditErr);
        }
      }

      toast.success(`ขยายกำหนดวันส่งคืนของใบยืม ${order.order_number} สำเร็จ`);
      if (onExtendSuccess) onExtendSuccess();
      onClose();
    } catch (err) {
      console.error('Extend Due Date Error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการขยายกำหนดวันส่งคืน');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
        <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
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
                ขยายระยะเวลาการยืมอุปกรณ์สำหรับรายการที่งานยังไม่เสร็จสิ้น หรือเลื่อนกำหนดงาน
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Borrower & Current Due Date Card */}
          <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-2 text-xs">
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
              <span className="text-[11px] text-muted-foreground font-normal">
                ต้องหลังวันที่ {format(currentDueDate, 'dd/MM/yyyy')}
              </span>
            </Label>

            <Input
              id="new-due-date"
              type="date"
              min={minSelectableDate}
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="h-10 text-xs rounded-xl font-mono"
              required
            />

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
            </div>
          </div>

          {/* Extension Status Preview */}
          {previewData && (
            <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between transition-all ${
              previewData.isValid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-300'
            }`}>
              <div className="flex items-center gap-2">
                {previewData.isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <div>
                  <div className="font-bold">
                    {previewData.isValid 
                      ? `ขยายเพิ่ม +${previewData.additionalDays} วัน (${previewData.formattedNewDate})`
                      : 'วันที่ไม่ถูกต้อง (ต้องมากกว่ากำหนดคืนเดิม)'}
                  </div>
                  {previewData.isValid && (
                    <div className="text-[11px] opacity-85">
                      สถานะคำสั่งยืมใหม่: <strong>{previewData.statusLabel}</strong>
                    </div>
                  )}
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
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-xs shadow-2xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-end border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl h-9 text-xs font-semibold cursor-pointer"
            >
              ยกเลิก
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={submitting || !previewData?.isValid}
              className="rounded-xl h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5 font-bold shadow-sm cursor-pointer active:scale-[0.98] transition-all"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>{submitting ? 'กำลังบันทึก...' : 'ยืนยันขยายเวลาส่งคืน'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutExtendModal;
