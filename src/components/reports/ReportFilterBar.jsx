import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Filter, Search, RotateCcw, Calendar, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';

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
  const [isExpanded, setIsExpanded] = React.useState(true);

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
            <span>ตัวกรองข้อมูลรายงาน (Report Filters)</span>
            {hasActiveFilters && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleCharts}
              className={`h-8 px-2.5 rounded-lg text-xs font-medium gap-1.5 border-border transition-all ${
                showCharts ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showCharts ? 'ซ่อนกราฟ' : 'แสดงกราฟ Visuals'}</span>
            </Button>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onResetFilters}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>ล้างตัวกรอง</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8 p-0 text-muted-foreground"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Filter Form Controls */}
        {isExpanded && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
              {/* Project & Storage Location Filter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  โครงการ & คลังจัดเก็บ {activeTab === 'balance' && <span className="text-rose-500">*</span>}
                </Label>
                <select
                  name="project_id"
                  value={filters.project_id}
                  onChange={onFilterChange}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium cursor-pointer"
                >
                  {activeTab !== 'balance' && <option value="">-- ทุกโครงการ & ทุกคลังจัดเก็บ (All Locations) --</option>}
                  {(() => {
                    const map = new Map();
                    projects.forEach(p => {
                      const key = `${(p.name || '').trim()}|||${(p.project_code || '').trim()}`;
                      if (!map.has(key)) map.set(key, { key, name: p.name, project_code: p.project_code, locations: [p] });
                      else map.get(key).locations.push(p);
                    });
                    return Array.from(map.values()).map(group => (
                      <optgroup key={group.key} label={`โครงการ: ${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}>
                        {group.locations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.location || 'คลังหลัก'} {loc.description ? `— ${loc.description}` : ''}
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
                    <Label className="text-xs font-semibold text-foreground">ตั้งแต่วันที่ (Start Date)</Label>
                    <div className="relative">
                      <Input
                        type="date"
                        name="start_date"
                        value={filters.start_date}
                        onChange={onFilterChange}
                        className="h-9 text-xs rounded-xl pr-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">ถึงวันที่ (End Date)</Label>
                    <div className="relative">
                      <Input
                        type="date"
                        name="end_date"
                        value={filters.end_date}
                        onChange={onFilterChange}
                        className="h-9 text-xs rounded-xl pr-2"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Search Filter (Stock-In) */}
              {activeTab === 'stock_in' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">ค้นหา (Supplier / PO / วัสดุ)</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      name="search"
                      value={filters.search}
                      onChange={onFilterChange}
                      placeholder="พิมพ์ชื่อ Supplier, เลข PO..."
                      className="pl-8 h-9 text-xs rounded-xl"
                    />
                  </div>
                </div>
              )}

              {/* Status Filter (Withdrawals) */}
              {activeTab === 'withdrawals' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">สถานะการเบิกจ่าย</Label>
                  <select
                    name="status"
                    value={filters.status}
                    onChange={onFilterChange}
                    className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">ทุกสถานะ (All Statuses)</option>
                    <option value="pending">รออนุมัติ (Pending)</option>
                    <option value="approved">อนุมัติแล้ว (Approved)</option>
                    <option value="completed">เสร็จสิ้น (Completed)</option>
                    <option value="rejected">ปฏิเสธ (Rejected)</option>
                  </select>
                </div>
              )}

              {/* Category Filter (Stock Balance) */}
              {activeTab === 'balance' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">หมวดหมู่สินค้า</Label>
                    <select
                      name="category_id"
                      value={filters.category_id}
                      onChange={onFilterChange}
                      className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">ทุกหมวดหมู่ (All Categories)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">ค้นหาชื่อวัสดุ / รหัส</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="search"
                        value={filters.search}
                        onChange={onFilterChange}
                        placeholder="พิมพ์ชื่อวัสดุ..."
                        className="pl-8 h-9 text-xs rounded-xl"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Apply Filter Button */}
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 justify-end">
                <Button
                  onClick={onApplyFilters}
                  disabled={loading}
                  size="sm"
                  className="w-full h-9 rounded-xl font-semibold text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{loading ? 'กำลังดึงข้อมูล...' : 'ค้นหา / ดึงรายงาน'}</span>
                </Button>
              </div>
            </div>

            {/* Quick Date Presets */}
            {activeTab !== 'balance' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-xs">
                <span className="text-muted-foreground font-medium flex items-center gap-1 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-primary" /> เลือกด่วน:
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('today')}
                  className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('7days')}
                  className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40"
                >
                  7 วันล่าสุด
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('30days')}
                  className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40"
                >
                  30 วันล่าสุด
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('month')}
                  className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40"
                >
                  เดือนนี้
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
