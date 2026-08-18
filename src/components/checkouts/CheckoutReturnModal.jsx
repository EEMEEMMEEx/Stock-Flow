import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  RotateCcw, Package, Building2, User, Calendar, 
  CheckCircle2, AlertTriangle, XCircle, ArrowRight, Layers,
  Tag, Search, CheckSquare, Square, Check, Plus
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
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (order && order.checkout_items) {
      const initialItems = order.checkout_items.map(item => {
        const remaining = item.quantity_borrowed - (item.quantity_returned + item.quantity_damaged + item.quantity_lost);
        return {
          checkout_item_id: item.id,
          item_name: item.items?.name || item.item_name || 'อุปกรณ์',
          sku: item.items?.sku || '',
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
      setSearchTerm('');
    }
  }, [order]);

  if (!order) return null;

  const handleUpdateItem = (itemId, field, value) => {
    setReturnItems(prev => prev.map(item => {
      if (item.checkout_item_id !== itemId) return item;
      return { ...item, [field]: value };
    }));
  };

  // Quick action: Select / Return all remaining units
  const handleSelectAll = () => {
    setReturnItems(prev => prev.map(item => ({
      ...item,
      returned_quantity: item.remaining_to_return
    })));
  };

  // Quick action: Deselect / Clear all returns
  const handleClearAll = () => {
    setReturnItems(prev => prev.map(item => ({
      ...item,
      returned_quantity: 0
    })));
  };

  const filteredReturnItems = returnItems.filter(item => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(q) ||
      (item.serial_number && item.serial_number.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q))
    );
  });

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
  const totalRemainingInOrder = returnItems.reduce((sum, i) => sum + (Number(i.remaining_to_return) || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[660px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
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

          {/* Search & Quick Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-muted/20 p-2.5 rounded-2xl border border-border/40">
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อ, S/N..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs rounded-xl"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>คืนทั้งหมด ({totalRemainingInOrder})</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive rounded-xl"
              >
                เคลียร์
              </Button>
            </div>
          </div>

          {/* Line Items Return List */}
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {filteredReturnItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                ไม่พบรายการอุปกรณ์ตามคำค้นหา
              </div>
            ) : (
              filteredReturnItems.map(item => {
                const isItemSerialized = Boolean(item.serial_number);
                const isReturning = Number(item.returned_quantity) > 0;

                return (
                  <div 
                    key={item.checkout_item_id}
                    className={`p-3.5 rounded-2xl border transition-all space-y-3 ${
                      isReturning 
                        ? 'bg-emerald-500/5 dark:bg-emerald-950/15 border-emerald-500/30' 
                        : 'bg-card/60 border-border/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-xs text-foreground line-clamp-1">{item.item_name}</p>
                          {item.serial_number && (
                            <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              <span>S/N: {item.serial_number}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                          <span>ยืม: {item.quantity_borrowed} {item.unit}</span>
                          <span>•</span>
                          <span>คงค้าง: <strong className="text-indigo-600 dark:text-indigo-400">{item.remaining_to_return} {item.unit}</strong></span>
                        </div>
                      </div>

                      {item.remaining_to_return === 0 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600">
                          คืนครบแล้ว
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateItem(item.checkout_item_id, 'returned_quantity', isReturning ? 0 : item.remaining_to_return)}
                          className={`h-7 px-2 text-[10px] font-bold rounded-lg flex items-center gap-1 ${
                            isReturning 
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                              : 'bg-muted text-muted-foreground hover:bg-emerald-500 hover:text-white'
                          }`}
                        >
                          {isReturning ? (
                            <>
                              <Check className="w-3 h-3 inline" />
                              <span>เลือกคืนแล้ว</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 inline" />
                              <span>เลือกคืน</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {item.remaining_to_return > 0 && (
                      <div className="grid grid-cols-12 gap-2 pt-2 border-t border-border/40 items-center">
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

                        {/* Destination Warehouse */}
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
                );
              })
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl h-10 px-4 text-xs font-bold cursor-pointer"
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
