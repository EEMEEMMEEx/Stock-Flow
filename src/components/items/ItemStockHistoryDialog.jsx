import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { History, Building2, RefreshCw, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/i18n';

export const ItemStockHistoryDialog = ({
  open,
  onOpenChange,
  selectedItem,
  loading = false,
  logs = []
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] rounded-xl border-border bg-card shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <History className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>{t('items.dialogs.historyTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t('items.dialogs.historyItem', { name: selectedItem?.name, sku: selectedItem?.sku || '-' })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-600" aria-hidden="true" />
              <span>{t('items.dialogs.loadingHistory')}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-border/80 text-center text-xs text-muted-foreground">
              <History className="w-6 h-6 mx-auto mb-1 opacity-40" aria-hidden="true" />
              <span>{t('items.dialogs.noHistory')}</span>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const projName = log.projects?.project_code 
                  ? `${log.projects.project_code} — ${log.projects.name}` 
                  : (log.projects?.name || 'Warehouse');
                return (
                  <div 
                    key={log.id} 
                    className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-muted/60 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-primary" aria-hidden="true" />
                          {projName}
                        </span>
                        <span className="text-muted-foreground font-mono text-xs inline-flex items-center gap-1">
                          {log.previous_quantity}
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                          <strong className="text-foreground font-bold">{log.new_quantity}</strong>
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-md font-mono text-xs font-semibold ${
                          log.difference > 0 
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                            : log.difference < 0
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {log.difference > 0 ? `+${log.difference}` : log.difference} {selectedItem?.unit || 'ชิ้น'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('items.dialogs.reason')} <span className="text-foreground font-medium">&quot;{log.reason}&quot;</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('items.dialogs.by')} {log.profiles?.full_name || t('items.dialogs.staff')}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground font-mono self-end sm:self-auto shrink-0">
                      {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
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
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-lg text-xs"
          >
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
