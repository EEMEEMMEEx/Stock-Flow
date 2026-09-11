import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2,
  
  ArrowRightLeft,
  Package,
  Layers,
  MapPin,
  AlertCircle,
  
  Info,
  
} from 'lucide-react';
import { ProjectLocationSelector } from '@/components/common/ProjectLocationSelector';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';

export const TransferItemDialog = ({
  open,
  onOpenChange,
  item,
  projectsList = [],
  onSuccess,
  currentProfile
}) => {
  const { t } = useTranslation();
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
      toast.error(t('items.transfer.toasts.selectDifferent'));
      return;
    }

    if (!isValidQuantity) {
      toast.error(t('items.transfer.toasts.invalidQty'));
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(t('common.pleaseWait'));

    try {
      // Execute atomic Supabase RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('process_item_transfer', {
        p_source_project_id: item.project_id,
        p_dest_project_id: destinationProjectId,
        p_item_id: item.id,
        p_quantity: currentQtyNum,
        p_notes: notes.trim() || null,
        p_actor_id: currentProfile?.id || null
      });

      if (rpcError) throw rpcError;
      if (!rpcData?.success) {
        throw new Error(rpcData?.message || t('items.transfer.toasts.failed'));
      }

      toast.success(
        rpcData?.message || t('items.transfer.toasts.success'),
        { id: toastId }
      );

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('[Transfer] Error executing transfer:', error);
      toast.error(t('items.transfer.toasts.failed') + ': ' + (error.message || ''), { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-xl border border-border shadow-lg bg-card">
        {/* Header with Visual Icon */}
        <div className="p-5 pb-4 bg-muted/20 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <span>{t('items.transfer.title')}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {t('items.transferItem')}
              </DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={handleTransfer} className="p-5 space-y-5">
          {/* Item Preview Card */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border/60 flex items-center gap-3.5">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                className="w-14 h-14 object-cover rounded-lg border border-border shadow-xs shrink-0"
              />
            ) : (
              <div className="w-14 h-14 bg-muted/80 rounded-lg flex items-center justify-center border border-border/60 text-muted-foreground/60 shrink-0">
                <Package className="w-6 h-6 text-primary/70" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground line-clamp-1">
                  {item.name}
                </span>
                {item.category_name && item.category_name !== '-' && (
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-medium text-muted-foreground border">
                    {item.category_name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono">
                {item.model && item.model !== '-' && <span>{t('items.model')}: <strong className="text-foreground">{item.model}</strong></span>}
                {item.sku && item.sku !== '-' && <span>{t('items.sku')}: <strong className="text-foreground">{item.sku}</strong></span>}
              </div>
            </div>
          </div>

          {/* Transfer Movement Visualizer (Source -> Destination) */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
              {/* 1. Source Warehouse Card (Locked) */}
              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/70 space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{t('items.transfer.sourceLocation')}</span>
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
                  <span className="text-muted-foreground font-medium">{t('items.currentStock')}:</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                    {maxBalance} {item.unit || t('items.defaultUnit')}
                  </span>
                </div>
              </div>

              {/* 2. Destination Warehouse Selector */}
              <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                <ProjectLocationSelector
                  projects={availableDestinations}
                  value={destinationProjectId}
                  onChange={(val) => setDestinationProjectId(val)}
                  required={true}
                  mode="unified"
                  size="sm"
                  label={t('items.transfer.targetLocation')}
                  description={t('items.destLocation')}
                  showSummaryCard={false}
                />
              </div>
            </div>

            {/* Quantity Input & Quick Max Button */}
            <div className="p-3.5 rounded-lg bg-muted/30 border border-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="transfer-qty" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span>{t('items.transfer.transferQty')} ({item.unit || t('items.defaultUnit')}) *</span>
                </Label>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-[11px] font-bold text-primary hover:underline px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  {t('items.transferQty')} ({maxBalance})
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
                  className="h-9 text-xs font-mono font-bold rounded-lg bg-background"
                  required
                />
                <span className="text-xs font-semibold text-muted-foreground shrink-0 px-2">
                  {item.unit || t('items.defaultUnit')}
                </span>
              </div>

              {currentQtyNum > maxBalance && (
                <div className="flex items-center gap-1.5 text-destructive text-[11px] font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('items.transfer.toasts.invalidQty')}</span>
                </div>
              )}
            </div>

            {/* Transfer Notes / Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="transfer-notes" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{t('items.transfer.notes')}</span>
              </Label>
              <Input
                id="transfer-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs rounded-lg bg-background"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/60 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="rounded-lg text-xs h-9 font-medium"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !destinationProjectId || !isValidQuantity}
              className="rounded-lg text-xs h-9 font-medium bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-xs"
            >
              <ArrowRightLeft className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? t('common.pleaseWait') : t('items.transfer.transferBtn')}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransferItemDialog;
