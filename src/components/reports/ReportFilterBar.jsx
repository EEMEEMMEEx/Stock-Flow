import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Filter, Search, RotateCcw, Calendar, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import { useTranslation } from '@/i18n';

const ReportFilterBar = ({
  activeTab,
  filters,
  onFilterChange,
  onResetFilters,
  onApplyFilters,
  projects = [],
  categories = [],
  showCharts,
  onToggleCharts,
  loading = false
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [searchInput, setSearchInput] = React.useState(filters.search);

  // Debounce search keystrokes so the parent state (and its client-side filtering) updates once typing pauses.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFilterChange({ target: { name: 'search', value: searchInput } });
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Keep the local input in sync when filters are reset or the tab changes.
  React.useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Quick Date Presets helper
  const handleApplyPreset = (presetKey) => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    let startStr = '';

    if (presetKey === 'today') {
      startStr = todayStr;
    } else if (presetKey === '7days') {
      startStr = format(subDays(today, 7), 'yyyy-MM-dd');
    } else if (presetKey === '30days') {
      startStr = format(subDays(today, 30), 'yyyy-MM-dd');
    } else if (presetKey === 'month') {
      startStr = format(startOfMonth(today), 'yyyy-MM-dd');
    }

    onFilterChange({ target: { name: 'start_date', value: startStr } });
    onFilterChange({ target: { name: 'end_date', value: todayStr } });
  };

  const hasActiveFilters = Boolean(
    filters.project_id || filters.start_date || filters.end_date || filters.search || filters.status || filters.category_id
  );

  return (
    <Card className="border border-border/60 shadow-xs">
      <CardContent className="p-4 sm:p-5">
        {/* Filter Bar Header & Expand/Collapse Toggle */}
        <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Filter className="w-4 h-4" />
            </div>
            <span>{t('reports.filters.title')}</span>
            {hasActiveFilters && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                {t('reports.filters.active')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleCharts}
              aria-label={showCharts ? t('reports.filters.hideVisuals') : t('reports.filters.showVisuals')}
              className={`h-11 sm:h-8 px-2.5 rounded-lg text-xs font-medium gap-1.5 border-border transition-all cursor-pointer ${
                showCharts ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showCharts ? t('reports.filters.hideVisuals') : t('reports.filters.showVisuals')}</span>
            </Button>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onResetFilters}
                className="h-11 sm:h-8 px-2.5 text-xs text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('reports.filters.clearFilters')}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? t('reports.filters.hideFilters') : t('reports.filters.showFilters')}
              aria-expanded={isExpanded}
              aria-controls="report-filters-panel"
              className="h-11 w-11 sm:h-8 sm:w-8 p-0 text-muted-foreground cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Filter Form Controls */}
        {isExpanded && (
          <div id="report-filters-panel" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
              {/* Project & Storage Location Filter */}
              <div className="space-y-1.5">
                <Label htmlFor="report-filter-project" className="text-xs font-semibold text-foreground flex items-center gap-1">
                  {t('reports.filters.projectAndLocation')} {activeTab === 'balance' && <span className="text-rose-500">*</span>}
                </Label>
                <select
                  id="report-filter-project"
                  name="project_id"
                  value={filters.project_id}
                  onChange={onFilterChange}
                  className="flex h-11 sm:h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium cursor-pointer"
                >
                  {activeTab !== 'balance' && <option value="">{t('reports.filters.allProjectsAndLocations')}</option>}
                  {(() => {
                    const map = new Map();
                    projects.forEach(p => {
                      const key = `${(p.name || '').trim()}|||${(p.project_code || '').trim()}`;
                      if (!map.has(key)) map.set(key, { key, name: p.name, project_code: p.project_code, locations: [p] });
                      else map.get(key).locations.push(p);
                    });
                    return Array.from(map.values()).map(group => (
                      <optgroup key={group.key} label={`${t('common.project')}: ${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}>
                        {group.locations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.location || t('reports.filters.mainStorage')} {loc.description ? `— ${loc.description}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ));
                  })()}
                </select>
              </div>

              {/* Date Filters (Stock-In & Withdrawals) */}
              {activeTab !== 'balance' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="report-filter-start-date" className="text-xs font-semibold text-foreground">{t('reports.filters.startDate')}</Label>
                    <div className="relative">
                      <Input
                        id="report-filter-start-date"
                        type="date"
                        name="start_date"
                        value={filters.start_date}
                        onChange={onFilterChange}
                        className="h-11 sm:h-9 text-xs rounded-xl pr-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="report-filter-end-date" className="text-xs font-semibold text-foreground">{t('reports.filters.endDate')}</Label>
                    <div className="relative">
                      <Input
                        id="report-filter-end-date"
                        type="date"
                        name="end_date"
                        value={filters.end_date}
                        onChange={onFilterChange}
                        className="h-11 sm:h-9 text-xs rounded-xl pr-2"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Search Filter (Stock-In) */}
              {activeTab === 'stock_in' && (
                <div className="space-y-1.5">
                  <Label htmlFor="report-filter-search" className="text-xs font-semibold text-foreground">{t('reports.filters.searchStockIn')}</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-3.5 sm:top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="report-filter-search"
                      name="search"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder={t('reports.filters.searchStockInPlaceholder')}
                      className="pl-8 h-11 sm:h-9 text-xs rounded-xl"
                    />
                  </div>
                </div>
              )}

              {/* Status Filter (Withdrawals) */}
              {activeTab === 'withdrawals' && (
                <div className="space-y-1.5">
                  <Label htmlFor="report-filter-status" className="text-xs font-semibold text-foreground">{t('reports.filters.withdrawalStatus')}</Label>
                  <select
                    id="report-filter-status"
                    name="status"
                    value={filters.status}
                    onChange={onFilterChange}
                    className="flex h-11 sm:h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">{t('reports.filters.allStatuses')}</option>
                    <option value="pending">{t('status.pending')}</option>
                    <option value="approved">{t('status.approved')}</option>
                    <option value="completed">{t('status.completed')}</option>
                    <option value="rejected">{t('status.rejected')}</option>
                  </select>
                </div>
              )}

              {/* Category Filter (Stock Balance) */}
              {activeTab === 'balance' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="report-filter-category" className="text-xs font-semibold text-foreground">{t('reports.filters.category')}</Label>
                    <select
                      id="report-filter-category"
                      name="category_id"
                      value={filters.category_id}
                      onChange={onFilterChange}
                      className="flex h-11 sm:h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">{t('reports.filters.allCategories')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="report-filter-search-balance" className="text-xs font-semibold text-foreground">{t('reports.filters.searchBalance')}</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-3.5 sm:top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="report-filter-search-balance"
                        name="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder={t('reports.filters.searchBalancePlaceholder')}
                        className="pl-8 h-11 sm:h-9 text-xs rounded-xl"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Apply Filter Button */}
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 justify-end">
                <Button
                  onClick={() => onApplyFilters(searchInput)}
                  disabled={loading}
                  size="sm"
                  className="w-full h-11 sm:h-9 rounded-xl font-semibold text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{loading ? t('reports.filters.fetching') : t('reports.filters.apply')}</span>
                </Button>
              </div>
            </div>

            {/* Quick Date Presets */}
            {activeTab !== 'balance' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-xs">
                <span className="text-muted-foreground font-medium flex items-center gap-1 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-primary" /> {t('reports.filters.quickRanges')}
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('today')}
                  className="px-3 sm:px-2.5 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-xs sm:text-[11px] font-medium transition-colors border border-border/40 cursor-pointer inline-flex items-center justify-center"
                >
                  {t('reports.filters.today')}
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('7days')}
                  className="px-3 sm:px-2.5 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-xs sm:text-[11px] font-medium transition-colors border border-border/40 cursor-pointer inline-flex items-center justify-center"
                >
                  {t('reports.filters.last7Days')}
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('30days')}
                  className="px-3 sm:px-2.5 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-xs sm:text-[11px] font-medium transition-colors border border-border/40 cursor-pointer inline-flex items-center justify-center"
                >
                  {t('reports.filters.last30Days')}
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('month')}
                  className="px-3 sm:px-2.5 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-xs sm:text-[11px] font-medium transition-colors border border-border/40 cursor-pointer inline-flex items-center justify-center"
                >
                  {t('reports.filters.thisMonth')}
                </button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportFilterBar;
