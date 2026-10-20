import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, ArrowDownToLine, ArrowUpFromLine, Scale, Sparkles, RefreshCw, Layers } from 'lucide-react';
import { useTranslation } from '@/i18n';

const ReportHeader = ({
  activeTab,
  onTabChange,
  onExportPDF,
  onExportExcel,
  onRefresh,
  totalItemsCount = 0,
  loading = false,
  pdfLoading = false,
  excelLoading = false,
  canExport = true
}) => {
  const { t } = useTranslation();
  const tabRefs = useRef([]);

  // Roving-tabindex keyboard nav: selection follows focus per WAI-ARIA Tabs pattern.
  const handleTabKeyDown = (e) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = null;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    if (tabs[nextIndex].id !== activeTab) onTabChange(tabs[nextIndex].id);
  };

  const tabs = [
    {
      id: 'stock_in',
      label: t('reports.tabs.stockIn'),
      icon: ArrowDownToLine,
      color: 'emerald',
      activeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    },
    {
      id: 'withdrawals',
      label: t('reports.tabs.withdrawals'),
      icon: ArrowUpFromLine,
      color: 'amber',
      activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    },
    {
      id: 'balance',
      label: t('reports.tabs.balance'),
      icon: Scale,
      color: 'blue',
      activeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
    },
    {
      id: 'site_kits',
      label: t('reports.tabs.siteKits'),
      icon: Layers,
      color: 'teal',
      activeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Top Bar: Title & Primary Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card/60 backdrop-blur border border-border/60 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {t('reports.title')}
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="w-3 h-3" /> {t('reports.liveAnalytics')}
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('reports.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls — hidden on site_kits: ReportSiteKits provides its own
            refresh/export toolbar bound to its own filter state */}
        {activeTab !== 'site_kits' && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            onClick={onRefresh}
            disabled={loading}
            variant="outline"
            size="sm"
            className="h-11 sm:h-9 px-3 rounded-xl border-border hover:bg-accent text-xs font-medium gap-1.5 transition-all"
            title={t('common.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{loading ? t('common.loading') : t('common.refresh')}</span>
          </Button>

          {canExport && (
            <>
              <Button
                onClick={onExportPDF}
                disabled={pdfLoading || loading}
                variant="outline"
                size="sm"
                className="h-11 sm:h-9 px-3.5 rounded-xl font-semibold text-xs border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>{pdfLoading ? t('reports.export.generatingPdf', 'Generating PDF...') : t('reports.exportPdf')}</span>
              </Button>

              <Button
                onClick={onExportExcel}
                disabled={loading || excelLoading}
                size="sm"
                className="h-11 sm:h-9 px-3.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs hover:shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{excelLoading ? t('reports.export.generatingExcel', 'Exporting...') : t('reports.exportExcel')}</span>
              </Button>
            </>
          )}

          <Badge variant="outline" className="h-9 px-3 rounded-xl bg-background border-border text-muted-foreground text-xs font-medium flex items-center gap-1.5 ml-auto sm:ml-0">
            <span>{t('common.total')}:</span>
            <span className="font-bold text-foreground">{totalItemsCount.toLocaleString()}</span>
            <span>{totalItemsCount === 1 ? t('reports.record') : t('reports.records')}</span>
          </Badge>
        </div>
        )}
      </div>

      {/* Report Categories Tab Navigation */}
      <div
        role="tablist"
        aria-label={t('reports.tabs.label')}
        onKeyDown={handleTabKeyDown}
        className="flex overflow-x-auto sm:grid sm:grid-cols-4 gap-2 p-1.5 bg-muted/40 rounded-xl border border-border/50"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              id={`report-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls="report-tabpanel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 sm:shrink sm:w-auto min-w-0 flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold leading-snug transition-all cursor-pointer border whitespace-nowrap sm:whitespace-normal min-h-[44px] ${
                isActive
                  ? `${tab.activeClass} shadow-xs`
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? '' : 'opacity-70'}`} />
              <span className="min-w-0">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReportHeader;
