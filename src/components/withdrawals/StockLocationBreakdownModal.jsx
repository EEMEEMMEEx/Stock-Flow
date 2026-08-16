import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Package, Building2, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';

const StockLocationBreakdownModal = ({
  isOpen,
  onClose,
  item,
  rawBalances = [],
  projects = [],
  selectedProjectId,
  onSelectProject
}) => {
  if (!item) return null;

  // Filter balances for this item that have stock > 0
  const itemBalances = (rawBalances || [])
    .filter(b => b.item_id === item.id)
    .map(b => {
      const project = projects.find(p => p.id === b.project_id);
      return {
        ...b,
        balance: Number(b.balance) || 0,
        project: project || { name: 'คลังไม่ระบุชื่อ', project_code: '-', location: '-' }
      };
    })
    .filter(b => b.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const totalBalance = itemBalances.reduce((sum, b) => sum + b.balance, 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
        <DialogHeader className="space-y-2 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center shrink-0">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-10 h-10 object-contain rounded-xl" />
              ) : (
                <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400 stroke-[1.75]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-extrabold text-foreground tracking-tight line-clamp-1">
                {item.name}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                <span>SKU: <strong className="text-foreground">{item.sku || 'N/A'}</strong></span>
                {item.model && (
                  <>
                    <span>•</span>
                    <span>Model: <strong className="text-indigo-600 dark:text-indigo-400">{item.model}</strong></span>
                  </>
                )}
                <span>•</span>
                <span>รวมทั้งระบบ: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{totalBalance} {item.unit || 'ชิ้น'}</strong></span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="py-3 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <span>สถานที่จัดเก็บและยอดคงเหลือ ({itemBalances.length} คลัง)</span>
            <span>สถานะ</span>
          </div>

          {itemBalances.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-xs bg-muted/20 rounded-2xl border border-dashed border-border/60">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-1" />
              ไม่มีสินค้าในคลังใดเลย (ยอดคงเหลือ 0 {item.unit || 'ชิ้น'})
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {itemBalances.map(b => {
                const isCurrentSelected = selectedProjectId === b.project_id;
                return (
                  <div
                    key={b.id || b.project_id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isCurrentSelected
                        ? 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/40 shadow-xs'
                        : 'bg-card/50 hover:bg-accent/40 border-border/60'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="font-bold text-xs text-foreground truncate">
                          {b.project.project_code ? `[${b.project.project_code}] ` : ''}{b.project.name}
                        </span>
                        {isCurrentSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> คลังที่เลือกอยู่
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                        <span>{b.project.location || 'คลังหลัก'}</span>
                        {b.project.description && (
                          <span className="text-muted-foreground/70">({b.project.description})</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                          {b.balance}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">{item.unit || 'ชิ้น'}</span>
                      </div>

                      {!isCurrentSelected && onSelectProject && (
                        <Button
                          type="button"
                          size="xs"
                          onClick={() => {
                            onSelectProject(b.project_id);
                            onClose();
                          }}
                          className="h-7 px-2.5 rounded-xl text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white gap-1 shadow-2xs cursor-pointer"
                        >
                          <span>เลือกคลังนี้</span>
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/40 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl text-xs h-9"
          >
            ปิดหน้าต่าง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StockLocationBreakdownModal;
