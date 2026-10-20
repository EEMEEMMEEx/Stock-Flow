import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowDownToLine, Package, CornerDownRight } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { formatI18nDate } from '@/lib/i18n-format';

export const StockInOrderDetailModal = ({
  selectedOrder,
  orderDetails = [],
  onClose
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-6 rounded-xl bg-card border border-border shadow-xl">
        <DialogHeader className="pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ArrowDownToLine className="w-5 h-5" aria-hidden="true" />
              </div>
              <span>Stock Receipt Details</span>
            </DialogTitle>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              Parent/Child Hierarchy
            </span>
          </div>
          <DialogDescription className="sr-only">
            Stock receipt details, metadata summary, and item list
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Metadata Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-muted/30 p-4 rounded-xl border border-border">
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Storage Location</span>
              <span className="font-bold text-sm text-foreground block">
                {selectedOrder?.projects?.project_code ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono mr-1">
                    [{selectedOrder.projects.project_code}]
                  </span>
                ) : ''}
                {selectedOrder?.projects?.name || '-'}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Recorded By</span>
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                  {(selectedOrder?.profiles?.full_name || 'A')[0].toUpperCase()}
                </div>
                {selectedOrder?.profiles?.full_name || 'Admin User'}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Receipt Date</span>
              <span className="font-semibold font-mono text-foreground block">
                {formatI18nDate(selectedOrder?.created_at, 'dd/MM/yyyy HH:mm')}
              </span>
            </div>
          </div>
          
          {/* Items Summary Header */}
          <div className="flex items-center justify-between pt-1">
            <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
              <Package className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              <span>Items in this Receipt ({orderDetails.length} {orderDetails.length === 1 ? 'item' : 'items'})</span>
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              Total Quantity: {orderDetails.reduce((sum, item) => sum + (item.quantity || 0), 0)} pcs
            </span>
          </div>

          {/* Scrollable Items Table */}
          <div className="border border-border rounded-xl overflow-hidden shadow-xs max-h-[50vh] overflow-y-auto overflow-x-auto">
            <Table className="min-w-[650px]" aria-label="Stock Receipt Details Table">
              <TableHeader className="bg-muted/60 sticky top-0 z-10 backdrop-blur text-xs">
                <TableRow className="border-b">
                  <TableHead className="w-[10%] font-bold">Type</TableHead>
                  <TableHead className="w-[38%] font-bold">SKU / Material Name</TableHead>
                  <TableHead className="w-[15%] font-bold">Model</TableHead>
                  <TableHead className="w-[10%] text-right font-bold">Quantity</TableHead>
                  <TableHead className="w-[8%] font-bold">Unit</TableHead>
                  <TableHead className="w-[19%] font-bold">S/N & Part No. / Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {orderDetails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No items found in this receipt
                    </TableCell>
                  </TableRow>
                ) : (
                  orderDetails.map(item => {
                    const isChild = item.item_type === 'CHILD' || !!item.parent_sku;
                    const itemName = (item.items?.name && item.items.name !== item.items?.sku)
                      ? item.items.name 
                      : (item.notes || item.items?.name || item.items?.sku || '-');

                    return (
                      <TableRow 
                        key={item.id} 
                        className={`transition-colors hover:bg-muted/40 ${isChild ? "bg-blue-50/30 dark:bg-blue-950/20" : ""}`}
                      >
                        <TableCell className="align-top">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md border ${
                            isChild 
                              ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700' 
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700'
                          }`}>
                            {item.item_type || (isChild ? 'CHILD' : 'PARENT')}
                          </span>
                        </TableCell>

                        <TableCell className={`align-top ${isChild ? 'pl-6' : ''}`}>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isChild && <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0 inline-block select-none" aria-hidden="true" />}
                              {item.items?.sku && (
                                <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                                  [{item.items.sku}]
                                </span>
                              )}
                              <span className={`font-semibold ${isChild ? 'text-blue-950 dark:text-blue-200' : 'text-foreground'}`}>
                                {itemName}
                              </span>
                            </div>
                            {item.parent_sku && (
                              <div className="text-xs text-muted-foreground font-mono pl-4 flex items-center gap-1">
                                <CornerDownRight className="w-3 h-3 text-blue-500 shrink-0 inline-block select-none" aria-hidden="true" />
                                <span>Parent SKU: <span className="font-bold text-blue-600 dark:text-blue-400">{item.parent_sku}</span></span>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="align-top font-medium text-foreground">
                          {item.model || item.items?.model || '-'}
                        </TableCell>

                        <TableCell className="align-top text-right font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono">
                          +{item.quantity}
                        </TableCell>

                        <TableCell className="align-top text-muted-foreground font-medium">
                          {item.items?.unit || t('common.defaultUnit', 'ชิ้น')}
                        </TableCell>

                        <TableCell className="align-top text-muted-foreground font-mono text-xs space-y-0.5">
                          {item.serial_number && (
                            <div className="text-foreground">SN: <span className="font-bold">{item.serial_number}</span></div>
                          )}
                          {item.part_number && (
                            <div>PN: {item.part_number}</div>
                          )}
                          {item.notes && item.notes !== itemName && (
                            <div className="text-xs text-muted-foreground italic">{item.notes}</div>
                          )}
                          {!item.serial_number && !item.part_number && (!item.notes || item.notes === itemName) && (
                            <span>-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t shrink-0">
          <Button 
            type="button" 
            variant="outline" 
            className="min-h-[44px] sm:min-h-9 h-auto px-5 rounded-lg text-xs font-semibold hover:bg-muted cursor-pointer"
            onClick={onClose}
          >
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
