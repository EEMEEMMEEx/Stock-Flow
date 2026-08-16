import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  RotateCcw, Package, Building2, User, Calendar, 
  CheckCircle2, AlertTriangle, XCircle, ArrowRight, Layers 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const CheckoutReturnModal = ({
  isOpen,
  onClose,
  order,
  projects = [],
  onReturnSuccess
}) => {
  const { profile } = useAuth();
  const [returnItems, setReturnItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (order && order.checkout_items) {
      const initialItems = order.checkout_items.map(item => {
        const remaining = item.quantity_borrowed - (item.quantity_returned + item.quantity_damaged + item.quantity_lost);
        return {
          checkout_item_id: item.id,
          item_name: item.items?.name || item.item_name || 'อุปกรณ์',
          unit: item.items?.unit || 'ชิ้น',
          serial_number: item.serial_number || '',
          quantity_borrowed: item.quantity_borrowed,
          quantity_already_returned: item.quantity_returned,
          remaining_to_return: remaining,
          returned_quantity: remaining > 0 ? remaining : 0, // default return all remaining
          condition: 'normal', // 'normal' | 'damaged' | 'lost' | 'needs_repair'
          destination_project_id: order.project_id || '',
          damage_notes: ''
        };
      });
      setReturnItems(initialItems);
    }
  }, [order]);

  if (!order) return null;

  const handleUpdateItem = (itemId, field, value) => {
    setReturnItems(prev => prev.map(item => {
      if (item.checkout_item_id !== itemId) return item;
      return { ...item, [field]: value };
    }));
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();

    const itemsToProcess = returnItems.filter(i => Number(i.returned_quantity) > 0);
    if (itemsToProcess.length === 0) {
      return toast.error('กรุณาระบุจำนวนอุปกรณ์ที่ต้องการรับคืนอย่างน้อย 1 รายการ');
    }

    for (const item of itemsToProcess) {
      const qty = Number(item.returned_quantity);
      if (qty <= 0) {
        return toast.error(`จำนวนรับคืนของ "${item.item_name}" ต้องมากกว่า 0`);
      }
      if (qty > item.remaining_to_return) {
        return toast.error(`จำนวนรับคืนของ "${item.item_name}" เกินกว่ายอดคงค้าง (${item.remaining_to_return} ${item.unit})`);
      }
    }

    try {
      setSubmitting(true);
      const payload = {
        order_id: order.id,
        received_by: profile?.id || null,
        returns: itemsToProcess.map(i => ({
          checkout_item_id: i.checkout_item_id,
          returned_quantity: Number(i.returned_quantity),
          condition: i.condition,
          destination_project_id: i.destination_project_id || order.project_id,
          damage_notes: i.damage_notes?.trim() || null
        }))
      };

      const { data, error } = await supabase.rpc('process_return_order', {
        p_payload: payload
      });

      if (error) throw error;

      toast.success(data.completed ? 'รับคืนอุปกรณ์ครบถ้วนเรียบร้อยแล้ว' : 'บันทึกการรับคืนบางส่วนสำเร็จ');
      if (onReturnSuccess) onReturnSuccess(data);
      onClose();
    } catch (err) {
      console.error('Return error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการรับคืนอุปกรณ์');
    } finally {
      setSubmitting(false);
    }
  };

  const totalUnitsToReturn = returnItems.reduce((sum, i) => sum + (Number(i.returned_quantity) || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[620px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <span>รับคืนเครื่องมือ / วัสดุอุปกรณ์</span>
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                    {order.order_number}
                  </span>
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span>ผู้ส่งคืน: <strong className="text-foreground">{order.borrower_name}</strong></span>
                  {order.borrower_department && <span>({order.borrower_department})</span>}
                  <span>•</span>
                  <span>คลังเดิม: <strong className="text-foreground">{order.projects?.name}</strong></span>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Line Items Return List */}
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {returnItems.map(item => (
              <div 
                key={item.checkout_item_id}
                className="p-3.5 rounded-2xl bg-card/60 border border-border/70 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-bold text-xs text-foreground line-clamp-1">{item.item_name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>ยืม: {item.quantity_borrowed} {item.unit}</span>
                      <span>•</span>
                      <span>คงค้าง: <strong className="text-indigo-600 dark:text-indigo-400">{item.remaining_to_return} {item.unit}</strong></span>
                      {item.serial_number && <span>• S/N: <strong className="text-foreground">{item.serial_number}</strong></span>}
                    </div>
                  </div>

                  {item.remaining_to_return === 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600">
                      คืนครบแล้ว
                    </span>
                  )}
                </div>

                {item.remaining_to_return > 0 && (
                  <div className="grid grid-cols-12 gap-2 pt-1 border-t border-border/40 items-center">
                    {/* Return Quantity */}
                    <div className="col-span-4 space-y-0.5">
                      <Label className="text-[10px] font-bold text-foreground">จำนวนที่คืนรอบนี้</Label>
                      <Input
                        type="number"
                        min={0}
                        max={item.remaining_to_return}
                        value={item.returned_quantity}
                        onChange={(e) => handleUpdateItem(item.checkout_item_id, 'returned_quantity', e.target.value)}
                        className="h-8 text-xs font-bold font-mono rounded-lg"
                      />
                    </div>

                    {/* Condition Selector */}
                    <div className="col-span-4 space-y-0.5">
                      <Label className="text-[10px] font-bold text-foreground">สภาพอุปกรณ์</Label>
                      <select
                        value={item.condition}
                        onChange={(e) => handleUpdateItem(item.checkout_item_id, 'condition', e.target.value)}
                        className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="normal">ปกติ (พร้อมใช้)</option>
                        <option value="needs_repair">ชำรุด (ต้องซ่อม)</option>
                        <option value="damaged">เสียหายหนัก</option>
                        <option value="lost">สูญหาย</option>
                      </select>
                    </div>

                    {/* Destination Warehouse (Supports cross-location return) */}
                    <div className="col-span-4 space-y-0.5">
                      <Label className="text-[10px] font-bold text-foreground">คืนเข้าคลัง</Label>
                      <select
                        value={item.destination_project_id}
                        onChange={(e) => handleUpdateItem(item.checkout_item_id, 'destination_project_id', e.target.value)}
                        className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 cursor-pointer truncate"
                      >
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.location ? `${p.name} (${p.location})` : p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Damage Note if not normal */}
                    {item.condition !== 'normal' && (
                      <div className="col-span-12 space-y-0.5 pt-1">
                        <Label className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                          ระบุรายละเอียดความชำรุด / การสูญหาย:
                        </Label>
                        <Input
                          placeholder="เช่น หน้าจอแตก, สายไฟขาด, หายในไซต์งาน..."
                          value={item.damage_notes}
                          onChange={(e) => handleUpdateItem(item.checkout_item_id, 'damage_notes', e.target.value)}
                          className="h-8 text-xs rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl h-10 px-4 text-xs font-bold"
            >
              ยกเลิก
            </Button>

            <Button
              type="submit"
              disabled={submitting || totalUnitsToReturn === 0}
              className="rounded-xl h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-sm cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'กำลังบันทึก...' : `ยืนยันรับคืน (${totalUnitsToReturn} ชิ้น)`}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutReturnModal;
