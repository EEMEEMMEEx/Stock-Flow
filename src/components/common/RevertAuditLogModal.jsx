import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, History, RefreshCw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n';
import {
  REVERT_ACTION_LABEL_KEYS,
  REVERT_AUDIT_ACTION_TYPES,
  formatRevertDate,
} from '@/lib/superRevert';

const RevertAuditLogModal = ({ isOpen = false, onClose }) => {
  const { t, lang } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('audit_logs')
        .select('id, action_type, target_table, target_id, previous_status, new_status, reason, created_at, actor_id, profiles:actor_id(id, full_name)')
        .in('action_type', REVERT_AUDIT_ACTION_TYPES)
        .order('created_at', { ascending: false })
        .limit(100);

      if (queryError) throw queryError;
      setLogs(data || []);
    } catch (err) {
      console.error('Revert audit log fetch failed:', err);
      setError(err?.message || t('superRevert.failed'));
      toast.error(err?.message || t('superRevert.failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) fetchLogs();
  }, [isOpen, fetchLogs]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] overflow-hidden grid-cols-[minmax(0,1fr)] rounded-xl bg-card p-4 sm:p-6 border border-border shadow-xl">
        <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <History className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-foreground">
                  {t('superRevert.auditLogTitle')}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {t('superRevert.revertHistorySubtitle')}
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
              className="h-9 px-3 rounded-lg text-xs font-semibold gap-1.5 shrink-0"
            >
              <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} aria-hidden="true" />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>
          <div className="inline-flex items-center gap-1.5 self-start rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
            <ShieldCheck className="w-3 h-3" aria-hidden="true" />
            <span>{t('superRevert.superOnly')}</span>
          </div>
        </DialogHeader>

        <div className="min-w-0 py-3 space-y-2 max-h-[65vh] overflow-y-auto pr-1">
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          )}
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
              {t('superRevert.loadingAudit')}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30 stroke-1" aria-hidden="true" />
              <p>{t('superRevert.auditLogEmpty')}</p>
            </div>
          ) : (
            logs.map((log) => {
              const actorName = Array.isArray(log.profiles) ? log.profiles[0]?.full_name : log.profiles?.full_name;
              return (
                <div key={log.id} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                      {t(REVERT_ACTION_LABEL_KEYS[log.action_type] || 'superRevert.auditLogTitle')}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatRevertDate(log.created_at, lang)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-bold">
                    {log.previous_status && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-700 dark:text-slate-200">
                        {String(log.previous_status).toUpperCase()}
                      </span>
                    )}
                    <ArrowRight className="w-3 h-3 text-amber-500" aria-hidden="true" />
                    {log.new_status && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        {String(log.new_status).toUpperCase()}
                      </span>
                    )}
                    <span className="ml-1 text-muted-foreground font-sans font-semibold">
                      {log.target_table || '-'} {log.target_id ? '#' + String(log.target_id).slice(0, 8) : ''}
                    </span>
                  </div>

                  {log.reason && (
                    <p className="text-[11px] text-foreground">
                      <span className="text-muted-foreground font-semibold mr-1">{t('superRevert.auditReason')}:</span>
                      {log.reason}
                    </p>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    {t('superRevert.auditActor')}: {actorName || 'SUPER'}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RevertAuditLogModal;
