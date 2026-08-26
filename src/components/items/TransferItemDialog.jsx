import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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
import {
  Building2,
  ArrowRight,
  ArrowRightLeft,
  Package,
  Layers,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Info,
  ImageIcon
} from 'lucide-react';
import { ProjectLocationSelector } from '@/components/common/ProjectLocationSelector';
import toast from 'react-hot-toast';

export const TransferItemDialog = ({
  open,
  onOpenChange,
  item,
  projectsList = [],
  onSuccess,
  currentProfile
}) => {
  const [destinationProjectId, setDestinationProjectId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available destination projects (excluding source project)
  const availableDestinations = React.useMemo(() => {
    if (!item?.project_id) return projectsList;
    return projectsList.filter(p => p.id !== item.project_id);
  }, [projectsList, item?.project_id]);

  // Reset form whenever dialog opens or item changes
  useEffect(() => {
    if (open && item) {
      setDestinationProjectId('');
      setTransferQuantity(item.balance > 0 ? '1' : '0');
      setNotes('');
      setIsSubmitting(false);
    }
  }, [open, item]);

  if (!item) return null;

  const maxBalance = parseInt(item.balance, 10) || 0;
  const currentQtyNum = parseInt(transferQuantity, 10) || 0;
  const isValidQuantity = currentQtyNum > 0 && currentQtyNum <= maxBalance;

  const handleSetMax = () => {
    setTransferQuantity(String(maxBalance));
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!destinationProjectId) {
      toast.error('กรุณาเลือกโครงการและคลังจัดเก็บปลายทาง');
      return;
    }

    if (!isValidQuantity) {
      toast.error(`จำนวนที่โอนต้องอยู่ระหว่าง 1 ถึง ${maxBalance} ${item.unit || 'ชิ้น'}`);
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('กำลังประมวลผลการโอนย้ายสต็อก...');

    try {
      // 1. Try atomic Supabase RPC (Migration 49)
      const { data: rpcData, error: rpcError } = await supabase.rpc('process_item_transfer', {
        p_source_project_id: item.project_id,
        p_dest_project_id: destinationProjectId,
        p_item_id: item.id,
        p_quantity: currentQtyNum,
        p_notes: notes.trim() || null,
        p_actor_id: currentProfile?.id || null
      });

      if (rpcError) {
        // Fallback to client-side transactions if RPC is not yet executed in database
        console.warn('[Transfer] RPC process_item_transfer error, attempting client fallback:', rpcError);

        const destProject = projectsList.find(p => p.id === destinationProjectId);
        const destDisplayName = destProject 
          ? `${destProject.name}${destProject.location ? ` (${destProject.location})` : ''}` 
          : 'คลังปลายทาง';
        const sourceDisplayName = item.project_display || 'คลังต้นทาง';

        // 1. Record stock_out on source (stock_transactions has no notes column)
        const { error: outError } = await supabase.from('stock_transactions').insert([{
          project_id: item.project_id,
          item_id: item.id,
          quantity: currentQtyNum,
          transaction_type: 'transfer_out',
          created_by: currentProfile?.id || null
        }]);

        if (outError) throw outError;

        // 2. Create stock_in_order on destination
        const { data: inOrder, error: inOrderErr } = await supabase
          .from('stock_in_orders')
          .insert([{
            project_id: destinationProjectId,
            created_by: currentProfile?.id || null,
            received_date: new Date().toISOString().split('T')[0],
            notes: `รับโอนสต็อกมาจาก: ${sourceDisplayName}${notes.trim() ? ` | ${notes.trim()}` : ''}`
          }])
          .select()
          .single();

        if (inOrderErr) throw inOrderErr;

        // 3. Insert stock_in_items
        const { error: itemErr } = await supabase.from('stock_in_items').insert([{
          order_id: inOrder.id,
          item_id: item.id,
          quantity: currentQtyNum,
          notes: `รับโอนมาจาก ${sourceDisplayName}`
        }]);

        if (itemErr) throw itemErr;
      }

      toast.success(
        rpcData?.message || `โอนย้าย ${item.name} จำนวน ${currentQtyNum} ${item.unit || 'ชิ้น'} สำเร็จ`,
        { id: toastId }
      );

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('[Transfer] Error executing transfer:', error);
      toast.error('เกิดข้อผิดพลาดในการโอนย้าย: ' + (error.message || 'กรุณาลองใหม่อีกครั้ง'), { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-3xl border border-border/80 shadow-2xl bg-background/95 backdrop-blur-xl">
        {/* Header with Visual Icon */}
        <div className="p-5 pb-4 bg-gradient-to-br from-indigo-500/10 via-background to-background border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <span>โอนย้ายสถานที่จัดเก็บ / คลังสินค้า</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                ย้ายยอดคงเหลือของวัสดุอุปกรณ์ระหว่างคลังจัดเก็บและโครงการ
              </DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={handleTransfer} className="p-5 space-y-5">
          {/* Item Preview Card */}
          <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 flex items-center gap-3.5">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                className="w-14 h-14 object-cover rounded-xl border border-border/60 shadow-sm shrink-0"
              />
            ) : (
              <div className="w-14 h-14 bg-muted/80 rounded-xl flex items-center justify-center border border-border/40 text-muted-foreground/60 shrink-0">
                <Package className="w-6 h-6 text-indigo-500/70" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground line-clamp-1">
                  {item.name}
                </span>
                {item.category_name && item.category_name !== '-' && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {item.category_name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono">
                {item.model && item.model !== '-' && <span>รุ่น: <strong className="text-foreground">{item.model}</strong></span>}
                {item.sku && item.sku !== '-' && <span>SKU: <strong className="text-foreground">{item.sku}</strong></span>}
              </div>
            </div>
          </div>

          {/* Transfer Movement Visualizer (Source -> Destination) */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
              {/* 1. Source Warehouse Card (Locked) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-border/70 space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>คลังต้นทาง (Source Location)</span>
                </span>
                <div className="font-bold text-xs text-foreground truncate">
                  {item.project_display || '-'}
                </div>
                {item.project_location && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{item.project_location}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">สต็อกที่มีอยู่:</span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                    {maxBalance} {item.unit || 'ชิ้น'}
                  </span>
                </div>
              </div>

              {/* 2. Destination Warehouse Selector */}
              <div className="p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-2">
                <ProjectLocationSelector
                  projects={availableDestinations}
                  value={destinationProjectId}
                  onChange={(val) => setDestinationProjectId(val)}
                  required={true}
                  mode="unified"
                  size="sm"
                  label="คลังปลายทาง (Destination Location)"
                  description="เลือกโครงการและคลังที่จะรับโอน"
                  showSummaryCard={false}
                />
                {!destinationProjectId && (
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                    * กรุณาเลือกสถานที่จัดเก็บปลายทาง
                  </p>
                )}
              </div>
            </div>

            {/* Quantity Input & Quick Max Button */}
            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="transfer-qty" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>จำนวนที่ต้องการโอนย้าย ({item.unit || 'ชิ้น'}) *</span>
                </Label>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-0.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                >
                  โอนทั้งหมด ({maxBalance} {item.unit || 'ชิ้น'})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  id="transfer-qty"
                  type="number"
                  min="1"
                  max={maxBalance}
                  value={transferQuantity}
                  onChange={(e) => setTransferQuantity(e.target.value)}
                  className="h-10 text-sm font-mono font-bold rounded-xl bg-background"
                  placeholder="ระบุจำนวน..."
                  required
                />
                <span className="text-xs font-semibold text-muted-foreground shrink-0 px-2">
                  {item.unit || 'ชิ้น'}
                </span>
              </div>

              {currentQtyNum > maxBalance && (
                <div className="flex items-center gap-1.5 text-destructive text-[11px] font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>จำนวนที่โอนเกินกว่าสต็อกคงเหลือที่มีอยู่ ({maxBalance} {item.unit || 'ชิ้น'})</span>
                </div>
              )}
            </div>

            {/* Transfer Notes / Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="transfer-notes" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                <span>เหตุผล / หมายเหตุการโอนย้าย (Notes)</span>
              </Label>
              <Input
                id="transfer-notes"
                type="text"
                placeholder="เช่น โอนย้ายเพื่อสำรองใช้งานหน้างาน, ปรับสมดุลสต็อก, อ้างอิงเอกสาร..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-10 text-xs rounded-xl bg-background"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/60 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="rounded-xl text-xs h-10 font-semibold"
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !destinationProjectId || !isValidQuantity}
              className="rounded-xl text-xs h-10 font-bold bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm shadow-indigo-500/20"
            >
              <ArrowRightLeft className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'กำลังโอนย้าย...' : 'ยืนยันการโอนย้าย'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransferItemDialog;
