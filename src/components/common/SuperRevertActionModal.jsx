import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n';
import {
  REVERT_KINDS,
  parseRevertErrorKey,
  resolveRevertRequest,
  summarizeRevertStockImpact,
} from '@/lib/superRevert';

const TITLE_KEYS = {
  [REVERT_KINDS.WITHDRAWAL_COMPLETION]: 'superRevert.actionWithdrawalCompletion',
  [REVERT_KINDS.WITHDRAWAL_APPROVAL]: 'superRevert.actionWithdrawalApproval',
  [REVERT_KINDS.WITHDRAWAL_REJECTION]: 'superRevert.actionWithdrawalRejection',
  [REVERT_KINDS.CHECKOUT_APPROVAL]: 'superRevert.actionCheckoutApproval',
  [REVERT_KINDS.CHECKOUT_RETURN]: 'superRevert.actionCheckoutReturn',
  [REVERT_KINDS.CHECKOUT_RETURNS]: 'superRevert.actionCheckoutReturns',
  [REVERT_KINDS.CHECKOUT_REJECTION]: 'superRevert.actionCheckoutRejection',
  [REVERT_KINDS.CHECKOUT_REPAIR]: 'superRevert.actionCheckoutRepair',
};

const DESCRIPTION_KEYS = {
  [REVERT_KINDS.WITHDRAWAL_COMPLETION]: 'superRevert.descWithdrawalCompletion',
  [REVERT_KINDS.WITHDRAWAL_APPROVAL]: 'superRevert.descWithdrawalApproval',
  [REVERT_KINDS.WITHDRAWAL_REJECTION]: 'superRevert.descWithdrawalRejection',
  [REVERT_KINDS.CHECKOUT_APPROVAL]: 'superRevert.descCheckoutApproval',
  [REVERT_KINDS.CHECKOUT_RETURN]: 'superRevert.descCheckoutReturn',
  [REVERT_KINDS.CHECKOUT_RETURNS]: 'superRevert.descCheckoutReturns',
  [REVERT_KINDS.CHECKOUT_REJECTION]: 'superRevert.descCheckoutRejection',
  [REVERT_KINDS.CHECKOUT_REPAIR]: 'superRevert.descCheckoutRepair',
};

const SuperRevertActionModal = ({
  isOpen = false,
  onClose,
  kind,
  order = null,
  returnLog = null,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const request = useMemo(() => resolveRevertRequest(kind, { order, returnLog }), [kind, order, returnLog]);
  const impact = useMemo(() => summarizeRevertStockImpact(kind, { order, returnLog }), [kind, order, returnLog]);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
      setProcessing(false);
    }
  }, [isOpen, kind, order?.id, returnLog?.id]);

  if (!request) return null;

  const titleKey = TITLE_KEYS[kind];
  const descriptionKey = DESCRIPTION_KEYS[kind];

  const impactText = (() => {
    if (impact.type === 'restore_withdrawal') {
      return t('superRevert.restoreLines', { qty: impact.qty, lines: impact.lines });
    }
    if (impact.type === 'restore_checkout') {
      return t('superRevert.restoreCheckout', { qty: impact.qty, unit: impact.unit || t('common.piece') });
    }
    if (impact.type === 'deduct_return') {
      return t('superRevert.deductReturn', { qty: impact.qty, unit: impact.unit || t('common.piece') });
    }
    if (impact.type === 'deduct_returns_all') {
      return t('superRevert.deductReturnsAll', { qty: impact.qty, unit: impact.unit || t('common.piece') });
    }
    return t('superRevert.stockImpactNone');
  })();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!reason.trim() || processing) return;

    setProcessing(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc(request.rpc, {
        ...request.params,
        p_reason: reason.trim(),
      });
      if (rpcError) throw rpcError;

      toast.success(data?.message || t('superRevert.success'));
      onSuccess?.(data, reason.trim());
      onClose?.();
    } catch (err) {
      const key = parseRevertErrorKey(err);
      const message = key ? t(key) : (err?.message || t('superRevert.failed'));
      setError(message);
      toast.error(message, { duration: 7000 });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !processing) onClose?.(); }}>
      <DialogContent className="max-w-lg rounded-xl bg-card p-6 border border-border shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-foreground">
                  {t(titleKey)}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {t(descriptionKey)}
                </DialogDescription>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 self-start rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              <ShieldCheck className="w-3 h-3" aria-hidden="true" />
              <span>{t('superRevert.superOnly')}</span>
            </div>
          </DialogHeader>

          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-muted-foreground">{t('superRevert.transition')}</span>
              <span className="inline-flex items-center gap-1.5 font-mono font-bold text-foreground">
                <span className="px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-700 dark:text-slate-200">
                  {String(request.fromStatus || '-').toUpperCase()}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  {String(request.toStatus || '-').toUpperCase()}
                </span>
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-2">
              <span className="font-semibold text-muted-foreground shrink-0">{t('superRevert.stockImpact')}</span>
              <span className={'text-right font-semibold ' + (impact.type === 'none' ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300')}>
                {impactText}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="super-revert-reason" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t('superRevert.reasonLabel')}</span>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">* {t('common.required')}</span>
            </label>
            <textarea
              id="super-revert-reason"
              required
              rows={3}
              maxLength={2000}
              value={reason}
              disabled={processing}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('superRevert.reasonPlaceholder')}
              className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none disabled:opacity-60"
            />
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={processing}
              className="h-9 min-h-[44px] sm:min-h-0 px-4 rounded-lg text-xs font-semibold"
            >
              {t('superRevert.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={processing || !reason.trim()}
              className="h-9 min-h-[44px] sm:min-h-0 px-4 rounded-lg text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{processing ? t('superRevert.processing') : t('superRevert.confirm')}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SuperRevertActionModal;
