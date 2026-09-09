import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History as HistoryIcon, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n';

const HistoryHeader = ({
  totalCount = 0,
  loading = false,
  onRefresh
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card/60 backdrop-blur border border-border/60 p-4 sm:p-5 rounded-2xl shadow-sm">
      {/* Title & Description */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20">
            <HistoryIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              {t('history.title', 'Withdrawal History')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('history.subtitle', 'Processed withdrawal requests — Approved / Completed / Rejected')}
            </p>
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        <Button
          onClick={onRefresh}
          disabled={loading}
          variant="outline"
          size="sm"
          className="h-9 px-3 rounded-xl border-border hover:bg-accent text-xs font-medium gap-1.5 transition-all"
          title="Refresh Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>

        <Badge
          variant="outline"
          className="h-9 px-3 rounded-xl bg-background border-border text-muted-foreground text-xs font-medium flex items-center gap-1.5 ml-auto sm:ml-0"
        >
          <span>Total:</span>
          <span className="font-bold text-foreground">{totalCount.toLocaleString()}</span>
          <span>{totalCount === 1 ? 'record' : 'records'}</span>
        </Badge>
      </div>
    </div>
  );
};

export default HistoryHeader;
