import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Filter, Search, RotateCcw, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';

const HistoryFilterBar = ({
  filters,
  onFilterChange,
  onResetFilters,
  projectsList = [],
  requestersList = []
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);

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
    filters.project_id || filters.status || filters.requester_id || filters.start_date || filters.end_date || filters.search
  );

  return (
    <Card className="border border-border/60 shadow-xs">
      <CardContent className="p-4 sm:p-5">
        {/* Filter Bar Header */}
        <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Filter className="w-4 h-4" />
            </div>
            <span>ตัวกรองประวัติการเบิกจ่าย (History Filters)</span>
            {hasActiveFilters && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onResetFilters}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 gap-1 cursor-pointer"
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
              className="h-8 w-8 p-0 text-muted-foreground cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Filter Form Controls */}
        {isExpanded && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
              {/* Search Text */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs font-semibold text-foreground">ค้นหา (เลขที่บิล / โครงการ / วัสดุ / ผู้เบิก)</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="search"
                    value={filters.search}
                    onChange={onFilterChange}
                    placeholder="พิมพ์รหัสบิล, โครงการ, ชื่อวัสดุ..."
                    className="pl-8 h-9 text-xs rounded-xl"
                  />
                </div>
              </div>

              {/* Project Filter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">โครงการ (Project)</Label>
                <select
                  name="project_id"
                  value={filters.project_id}
                  onChange={onFilterChange}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <option value="">ทุกโครงการ (All Projects)</option>
                  {projectsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_code ? `[${p.project_code}] ` : ''}{p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">สถานะ (Status)</Label>
                <select
                  name="status"
                  value={filters.status}
                  onChange={onFilterChange}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <option value="">ทุกสถานะ (All Statuses)</option>
                  <option value="approved">อนุมัติแล้ว (Approved)</option>
                  <option value="completed">รับของเสร็จสิ้น (Completed)</option>
                  <option value="rejected">ไม่อนุมัติ (Rejected)</option>
                  <option value="shortage">มีรายการค้างส่ง / ขาดส่ง (Shortages)</option>
                </select>
              </div>

              {/* Requester Filter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">ผู้ขอเบิก (Requester)</Label>
                <select
                  name="requester_id"
                  value={filters.requester_id}
                  onChange={onFilterChange}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <option value="">ทุกคน (All Requesters)</option>
                  {requestersList.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filters */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">ตั้งแต่วันที่ (Start Date)</Label>
                <Input
                  type="date"
                  name="start_date"
                  value={filters.start_date}
                  onChange={onFilterChange}
                  className="h-9 text-xs rounded-xl pr-2"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">ถึงวันที่ (End Date)</Label>
                <Input
                  type="date"
                  name="end_date"
                  value={filters.end_date}
                  onChange={onFilterChange}
                  className="h-9 text-xs rounded-xl pr-2"
                />
              </div>
            </div>

            {/* Quick Date Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-xs">
              <span className="text-muted-foreground font-medium flex items-center gap-1 mr-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> ช่วงวันที่ด่วน:
              </span>
              <button
                type="button"
                onClick={() => handleApplyPreset('today')}
                className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40 cursor-pointer"
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('7days')}
                className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40 cursor-pointer"
              >
                7 วันล่าสุด
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('30days')}
                className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40 cursor-pointer"
              >
                30 วันล่าสุด
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('month')}
                className="px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-[11px] font-medium transition-colors border border-border/40 cursor-pointer"
              >
                เดือนนี้
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HistoryFilterBar;
