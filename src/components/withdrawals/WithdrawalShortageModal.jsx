import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { evaluateStockAvailability, getWarehouseLabel } from '@/lib/withdrawalStock';

const WithdrawalShortageModal = ({
  isOpen,
  onClose,
  shortageData,
  projects = [],
  overrideReason,
  onOverrideReasonChange,
  onConfirmApprove
}) => {
  const { t } = useTranslation();
  const shortageRows = Array.isArray(shortageData?.shortages) ? shortageData.shortages : [];
  const rowEvaluations = shortageRows.map(row => ({ row, evaluation: evaluateStockAvailability(row.available, row.requested) }));
  const hasRows = shortageRows.length > 0;
  const hasUnknownStock = rowEvaluations.some(({ evaluation }) => evaluation.status === 'unknown');
  // Never offer the override when the stock numbers are missing: a false 0 would
  // look like a genuine shortage.
  const canOverride = hasRows && !hasUnknownStock;
  const hasWarehouseColumn = shortageRows.some(row => row.warehouse_name || row.project_id);
  // RPC ส่งชื่อโครงการมาใน warehouse_name จึง resolve ชื่อคลัง (projects.location) ฝั่ง UI แทน
  const resolveRowWarehouse = (row) => getWarehouseLabel(projects.find(p => p.id === row.project_id))
    || row.warehouse_name
    || '-';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl rounded-xl bg-card p-6 border border-border shadow-xl">
        <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
          <DialogTitle className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 text-base font-extrabold">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <span>{t('withdrawals.approveWithShortage', 'Approve with Shortage Override')}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-3.5 rounded-xl leading-relaxed space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t('withdrawals.insufficientInventory', 'Insufficient project inventory detected for requested quantities')}</span>
            </p>
            <p className="text-[11px] pl-5 opacity-90">
              {t('withdrawals.shortageWarning', 'If confirmed, the system will deduct inventory up to available stock and record shortages.')}{' '}
              <strong>{t('withdrawals.stockWillNotGoNegative', 'Available stock will be reduced to 0 and will not go negative.')}</strong>
            </p>
          </div>

          {!canOverride && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-900 dark:text-red-200 p-3.5 rounded-xl text-[11px] leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>
                {t('withdrawals.shortageStockUnknown', 'ไม่สามารถตรวจสอบยอดสต็อกได้ครบถ้วน (ข้อมูลไม่ครบหรือโหลดไม่สำเร็จ) — กรุณาปิดหน้าต่างนี้แล้วกดอนุมัติใหม่อีกครั้ง')}
              </span>
            </div>
          )}

          <div className="border border-border rounded-xl overflow-hidden shadow-xs">
            <Table>
              <TableHeader className="bg-muted/50 text-xs">
                <TableRow>
                  <TableHead>{t('items.itemName', 'Item Name')}</TableHead>
                  {hasWarehouseColumn && <TableHead>{t('withdrawals.sourceWarehouse', 'Source Warehouse')}</TableHead>}
                  <TableHead className="text-center">{t('withdrawals.requested', 'Requested')}</TableHead>
                  <TableHead className="text-center">{t('withdrawals.available', 'Available')}</TableHead>
                  <TableHead className="text-center text-emerald-600 font-bold">{t('withdrawals.toDeduct', 'To Deduct')}</TableHead>
                  <TableHead className="text-center text-amber-600 font-bold">{t('withdrawals.shortage', 'Shortage')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {rowEvaluations.map(({ row: item, evaluation }) => (
                  <TableRow key={`${item.project_id || ''}::${item.request_item_id || item.item_id}`}>
                    <TableCell className="font-bold text-foreground">{item.item_name}</TableCell>
                    {hasWarehouseColumn && (
                      <TableCell className="text-[11px] text-muted-foreground font-semibold">
                        {resolveRowWarehouse(item)}
                      </TableCell>
                    )}
                    <TableCell className="text-center font-mono">{evaluation.requested ?? '—'} {item.unit}</TableCell>
                    <TableCell className="text-center font-mono">
                      {evaluation.status === 'unknown' ? '—' : evaluation.available} {item.unit}
                    </TableCell>
                    <TableCell className="text-center font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {item.deducted} {item.unit}
                    </TableCell>
                    <TableCell className="text-center font-bold font-mono text-amber-600 bg-amber-500/10">
                      {evaluation.shortage ?? '—'} {item.unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              {t('withdrawals.overrideReason', 'Override Reason')} <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder={t('withdrawals.overrideReasonPlaceholder', 'e.g. Issue available stock first, remaining quantity to be fulfilled later')}
              value={overrideReason}
              onChange={(e) => onOverrideReasonChange(e.target.value)}
              className="text-xs rounded-lg h-9 bg-background border-border"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border/40 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-lg text-xs h-9 px-4 font-semibold"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canOverride}
            className="rounded-lg text-xs h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onConfirmApprove(shortageData?.orderId, true, overrideReason)}
          >
            {t('withdrawals.confirmShortageOverride', 'Confirm Shortage Override')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalShortageModal;
