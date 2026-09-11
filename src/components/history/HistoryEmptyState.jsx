import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileQuestion, RotateCcw, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n';

export const HistoryLoadingSkeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="h-24 animate-pulse bg-muted/40 border-border/40" />
      ))}
    </div>
    <Card className="h-80 animate-pulse bg-muted/30 border-border/40" />
  </div>
);

export const HistoryErrorState = ({ error, onRetry }) => {
  const { t } = useTranslation();
  return (
    <Card className="border border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/10 shadow-xs">
      <CardContent className="p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-3">
        <div className="p-4 rounded-full bg-rose-100 dark:bg-rose-950/60 ring-1 ring-rose-200 dark:ring-rose-800 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="w-8 h-8 stroke-1.5" />
        </div>
        <h3 className="text-lg font-bold text-foreground tracking-tight">{t('common.error', 'Failed to load withdrawal history')}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
          {error || t('notifications.failedToLoad', 'Unable to connect to database. Please check your internet connection and try again.')}
        </p>

        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="mt-2 rounded-xl text-xs font-semibold gap-1.5 border-rose-200 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('notifications.tryAgain', 'Retry')}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const HistoryEmptyState = ({ onResetFilters }) => {
  const { t } = useTranslation();
  return (
    <Card className="border border-dashed border-border/80 shadow-xs">
      <CardContent className="p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-3">
        <div className="p-4 rounded-full bg-muted/60 ring-1 ring-border text-muted-foreground">
          <FileQuestion className="w-8 h-8 stroke-1.5" />
        </div>
        <h3 className="text-lg font-bold text-foreground tracking-tight">{t('history.noHistoryFound', 'No History Records Found')}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
          {t('history.noHistoryFoundDesc', 'No records match the selected project, status, requester, or date range. Try adjusting your search query or reset filters to view all records.')}
        </p>

        {onResetFilters && (
          <Button
            onClick={onResetFilters}
            variant="outline"
            size="sm"
            className="mt-2 rounded-xl text-xs font-semibold gap-1.5 border-border hover:bg-accent cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('history.resetFilters', 'Reset Filters')}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default HistoryEmptyState;
