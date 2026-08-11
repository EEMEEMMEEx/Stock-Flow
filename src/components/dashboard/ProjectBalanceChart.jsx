import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Package, AlertTriangle, RefreshCw, Table2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';

/**
 * Reusable Dashboard chart: "ยอดคงเหลือแยกตามโครงการ"
 *
 * - Aggregates raw `stock_balance` rows client-side by `project_id` (sums `balance`)
 * - Sorts projects ascending by total balance (lowest / most actionable first)
 * - Horizontal bars with the value always visible (no hover required)
 * - Desktop shows up to `maxItemsDesktop` projects, mobile up to `maxItemsMobile`
 * - Toggle between chart and full data table (accessible fallback)
 * - Own loading / empty / error states with retry
 */
const ProjectBalanceChart = ({
  data = [],
  status = 'loading', // 'loading' | 'success' | 'empty' | 'error'
  error = null,
  onRetry = null,
  maxItemsDesktop = 10,
  maxItemsMobile = 5,
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const [view, setView] = useState('chart'); // 'chart' | 'table'
  const [maxItems, setMaxItems] = useState(maxItemsDesktop);

  // Resolve chart colors from the project's design tokens (no hardcoded colors)
  const tokens = useMemo(() => {
    const read = (name, fallback) => {
      if (typeof window === 'undefined') return fallback;
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value ? `hsl(${value})` : fallback;
    };
    const fg = read('--foreground', 'hsl(222.2 84% 15%)');
    return {
      bar: read('--chart-1', 'hsl(242 82% 64%)'),
      tick: read('--muted-foreground', 'hsl(215.4 16.3% 46.9%)'),
      grid: `hsl(${fg.slice(4, -1)} / 0.14)`,
      tooltipBg: read('--card', 'hsl(214 26% 90%)'),
      tooltipBorder: read('--border', 'hsl(214 26% 90%)'),
    };
  }, [resolvedTheme]);

  // Responsive cap: fewer bars on small screens
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setMaxItems(mq.matches ? maxItemsDesktop : maxItemsMobile);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxItemsDesktop, maxItemsMobile]);

  // Aggregate by project_id (client-side, no API/schema change) & sort ascending
  const aggregated = useMemo(() => {
    const map = new Map();
    for (const row of data || []) {
      if (!row || !row.project_id) continue;
      const entry = map.get(row.project_id) || {
        project_id: row.project_id,
        project_name: row.project_name || 'ไม่ระบุโครงการ',
        balance: 0,
      };
      entry.balance += Number(row.balance) || 0;
      map.set(row.project_id, entry);
    }
    return Array.from(map.values()).sort(
      (a, b) => a.balance - b.balance || String(a.project_name).localeCompare(String(b.project_name), 'th')
    );
  }, [data]);

  const chartRows = aggregated.slice(0, maxItems);
  const chartHeight = Math.min(Math.max(240, chartRows.length * 46 + 64), 620);

  const truncateName = (name) => (name && name.length > 26 ? `${name.slice(0, 26)}…` : name);
  const formatValue = (value) => Number(value || 0).toLocaleString('th-TH');

  const chartAriaLabel =
    chartRows.length === 0
      ? 'ไม่มีข้อมูลยอดคงเหลือรายโครงการ'
      : `แผนภูมิแท่งแสดงยอดคงเหลือรายโครงการ เรียงจากยอดน้อยสุด: ${chartRows
          .map((r) => `${r.project_name} ยอดคงเหลือ ${formatValue(r.balance)}`)
          .join(', ')}`;

  const hasMore = aggregated.length > chartRows.length;

  return (
    <section
      aria-label="ยอดคงเหลือแยกตามโครงการ"
      className={cn(
        'flex flex-col neu-flat border-0 text-card-foreground',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-muted/30 border-b border-foreground/10 px-4 py-3.5 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase text-foreground">
          <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ยอดคงเหลือแยกตามโครงการ
        </h2>

        {status === 'success' && aggregated.length > 0 && (
          <button
            type="button"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            aria-pressed={view === 'table'}
            className="neu-button inline-flex h-11 shrink-0 items-center gap-2 px-3.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {view === 'chart' ? (
              <Table2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {view === 'chart' ? 'ดูข้อมูลแบบตาราง' : 'ดูแผนภูมิแท่ง'}
            </span>
            <span className="sm:hidden">{view === 'chart' ? 'ตาราง' : 'แผนภูมิ'}</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 p-4 sm:p-5">
        {status === 'loading' && (
          <div className="space-y-3" aria-hidden="true">
            {[0.92, 0.68, 0.8, 0.5, 0.62, 0.42].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-24 animate-pulse rounded-md bg-foreground/10" />
                <div className="h-4 animate-pulse rounded-md bg-foreground/10" style={{ width: `${w * 55}%` }} />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="flex min-h-[240px] flex-col items-center justify-center text-center px-6">
            <div className="p-4 rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
              <AlertTriangle className="h-8 w-8 stroke-1.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">โหลดยอดคงเหลือไม่สำเร็จ</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {error || 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง'}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="neu-button mt-4 inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                ลองใหม่อีกครั้ง
              </button>
            )}
          </div>
        )}

        {status === 'empty' && (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center px-6">
            <div className="p-4 rounded-2xl bg-muted/60 text-muted-foreground ring-1 ring-foreground/10">
              <Package className="h-8 w-8 stroke-1.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">ยังไม่มีข้อมูลยอดคงเหลือ</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              เมื่อมีการรับเข้า Stock วัสดุเข้าสู่โครงการ ยอดคงเหลือจะแสดงที่นี่
            </p>
          </div>
        )}

        {status === 'success' && aggregated.length === 0 && (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center px-6">
            <div className="p-4 rounded-2xl bg-muted/60 text-muted-foreground ring-1 ring-foreground/10">
              <Package className="h-8 w-8 stroke-1.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">ยังไม่มีข้อมูลยอดคงเหลือ</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              เมื่อมีการรับเข้า Stock วัสดุเข้าสู่โครงการ ยอดคงเหลือจะแสดงที่นี่
            </p>
          </div>
        )}

        {status === 'success' && aggregated.length > 0 && (
          <>
            {view === 'chart' ? (
              <div
                role="img"
                aria-label={chartAriaLabel}
                className="w-full"
                style={{ height: chartHeight }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartRows}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                    barCategoryGap="26%"
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={tokens.grid} />
                    <XAxis
                      type="number"
                      dataKey="balance"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: tokens.tick, fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="project_name"
                      width={168}
                      interval={0}
                      tickFormatter={truncateName}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: tokens.tick, fontSize: 12 }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{
                        backgroundColor: tokens.tooltipBg,
                        color: tokens.tick,
                        borderRadius: '12px',
                        border: `1px solid ${tokens.tooltipBorder}`,
                        fontSize: '13px',
                        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
                      }}
                      labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                      formatter={(value, name) => [formatValue(value), name]}
                    />
                    <Bar dataKey="balance" name="ยอดคงเหลือ" fill={tokens.bar} radius={[0, 6, 6, 0]} maxBarSize={22}>
                      <LabelList
                        dataKey="balance"
                        position="right"
                        formatter={formatValue}
                        fill={tokens.tick}
                        fontSize={12}
                        fontWeight={600}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-foreground/10">
                <table className="w-full min-w-[320px] text-sm">
                  <caption className="sr-only">ตารางยอดคงเหลือรายโครงการ เรียงจากยอดน้อยสุด</caption>
                  <thead>
                    <tr className="border-b border-foreground/10 bg-foreground/[0.04] text-left">
                      <th scope="col" className="px-4 py-3 font-bold text-foreground">โครงการ</th>
                      <th scope="col" className="px-4 py-3 text-right font-bold text-foreground">ยอดคงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/10">
                    {aggregated.map((row) => (
                      <tr key={row.project_id} className="hover:bg-foreground/[0.03]">
                        <td className="px-4 py-3 font-medium text-foreground">{row.project_name}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                          {formatValue(row.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {aggregated.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {view === 'chart' && hasMore
                  ? `แสดง ${chartRows.length} จาก ${aggregated.length} โครงการ — เรียงจากยอดคงเหลือน้อยสุด`
                  : 'เรียงจากยอดคงเหลือน้อยสุด (มาก่อน)'}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default ProjectBalanceChart;
