import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Package, FolderKanban, ArrowUpFromLine, AlertCircle, 
  ArrowDownToLine, CheckCircle2, RefreshCw, BarChart3, 
  Layers, Building2, TrendingUp 
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/components/theme-provider';
import DashboardStatCard from '@/components/dashboard/DashboardStatCard';
import SiteKitAvailabilityCards from '@/components/dashboard/SiteKitAvailabilityCards';
import { fetchSiteKitsAvailability } from '@/lib/siteKits';

// Custom Rotated & Truncated X-Axis Tick Component
const CustomXAxisTick = ({ x, y, payload, isItemMode, theme }) => {
  if (!payload || payload.value === undefined) return null;
  const val = String(payload.value);

  if (isItemMode) {
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="end"
          fill={theme.tick}
          fontSize={11}
          fontWeight={500}
          transform="rotate(-30)"
          className="select-none"
        >
          {val}
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill={theme.tick}
        fontSize={11}
        fontWeight={500}
        className="select-none"
      >
        {val}
      </text>
    </g>
  );
};

const Dashboard = () => {
  const { profile } = useAuth();
  const { resolvedTheme } = useTheme();
  
  const [stats, setStats] = useState({
    projectCount: 0,
    logicalProjectCount: 0,
    itemCount: 0,
    pendingCount: 0,
    todayWithdrawals: 0,
    totalStockUnits: 0,
  });
  
  const [recentActivity, setRecentActivity] = useState([]);
  const [stockByProjects, setStockByProjects] = useState([]);
  const [topItemsStock, setTopItemsStock] = useState([]);
  const [siteKits, setSiteKits] = useState([]);
  const [chartViewMode, setChartViewMode] = useState('project'); // 'project' | 'item'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchDashboardData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      setHasError(false);

      // 1. Fetch Active Projects
      const { data: pData, error: projErr } = await supabase
        .from('projects')
        .select('id, name, project_code, location, status')
        .eq('status', 'active');

      // 2. Fetch Master Items Count
      const { count: itemCount, error: itemErr } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true });

      // 3. Fetch Pending Orders Count
      const { count: pendingCount, error: pendingErr } = await supabase
        .from('withdrawal_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 4. Fetch Today's Orders Count
      const today = new Date().toISOString().split('T')[0];
      const { count: todayWithdrawals, error: todayErr } = await supabase
        .from('withdrawal_orders')
        .select('*', { count: 'exact', head: true })
        .gte('requested_at', today);

      // 5. Fetch Stock Balance
      const { data: balanceData, error: balanceErr } = await supabase
        .from('stock_balance')
        .select('*');

      // 6. Fetch Recent Activity
      const { data: activityData, error: actErr } = await supabase
        .from('withdrawal_orders')
        .select('*, projects(name), profiles!withdrawal_orders_requested_by_fkey(full_name), withdrawal_items(items(name))')
        .order('requested_at', { ascending: false })
        .limit(6);

      if (projErr || itemErr || pendingErr || todayErr) {
        setHasError(true);
      }

      const activeProjects = pData || [];
      const activeProjectIds = new Set(activeProjects.map(p => p.id));
      
      // Calculate logical project count (unique canonical names/codes)
      const logicalProjectNames = new Set(activeProjects.map(p => (p.name || '').trim().toLowerCase()));

      // Filter stock balance to ONLY active projects
      const activeStockBalances = (balanceData || []).filter(b => activeProjectIds.has(b.project_id));
      const totalUnits = activeStockBalances.reduce((sum, b) => sum + (Number(b.balance) || 0), 0);

      // Process Stock by Project
      const projectStockMap = new Map();
      activeProjects.forEach(p => {
        const label = p.location ? `${p.name} (${p.location})` : p.name;
        const short = p.location || p.name;
        const shortTruncated = short.length > 16 ? `${short.slice(0, 15)}…` : short;
        projectStockMap.set(p.id, {
          projectId: p.id,
          name: label,
          fullName: label,
          shortName: shortTruncated,
          total_in: 0,
          total_out: 0,
          balance: 0,
          itemCount: 0
        });
      });

      activeStockBalances.forEach(b => {
        const group = projectStockMap.get(b.project_id);
        if (group) {
          group.total_in += (Number(b.total_in) || 0);
          group.total_out += (Number(b.total_out) || 0);
          group.balance += (Number(b.balance) || 0);
          if ((Number(b.balance) || 0) > 0) group.itemCount += 1;
        }
      });

      setStockByProjects(Array.from(projectStockMap.values()));

      // Process Top 10 Items by Balance
      const itemStockAgg = new Map();
      activeStockBalances.forEach(b => {
        if (!itemStockAgg.has(b.item_id)) {
          itemStockAgg.set(b.item_id, {
            item_id: b.item_id,
            item_name: b.item_name || 'วัสดุ',
            unit: b.unit || 'ชิ้น',
            total_in: 0,
            total_out: 0,
            balance: 0
          });
        }
        const itemAgg = itemStockAgg.get(b.item_id);
        itemAgg.total_in += (Number(b.total_in) || 0);
        itemAgg.total_out += (Number(b.total_out) || 0);
        itemAgg.balance += (Number(b.balance) || 0);
      });

      const topItems = Array.from(itemStockAgg.values())
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10)
        .map(item => {
          const raw = item.item_name || 'วัสดุ';
          const truncated = raw.length > 15 ? `${raw.slice(0, 14)}…` : raw;
          return {
            ...item,
            fullName: raw,
            shortName: truncated
          };
        });

      setTopItemsStock(topItems);

      setStats({
        projectCount: activeProjects.length,
        logicalProjectCount: logicalProjectNames.size,
        itemCount: itemCount || 0,
        pendingCount: pendingCount || 0,
        todayWithdrawals: todayWithdrawals || 0,
        totalStockUnits: totalUnits,
      });

      setRecentActivity(activityData || []);

      // 7. Fetch Site Kits BOM Availability
      const kitsData = await fetchSiteKitsAvailability();
      setSiteKits(kitsData || []);

    } catch (error) {
      console.error('Dashboard fetch error:', error);
      setHasError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial Load + Auto Realtime Synchronization
  useEffect(() => {
    fetchDashboardData(true);

    // Set up Realtime subscriptions for live dashboard sync
    const channel = supabase
      .channel('dashboard-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchDashboardData(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_orders' }, () => {
        fetchDashboardData(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_in_orders' }, () => {
        fetchDashboardData(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transactions' }, () => {
        fetchDashboardData(false);
      })
      .subscribe();

    // Also auto-refresh when tab gains focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchDashboardData]);

  // Prioritized KPI Stat Cards Configuration
  const statCards = [
    {
      id: 'pending',
      label: 'รออนุมัติเบิกจ่าย',
      value: stats.pendingCount,
      subtext: 'คำขอที่รอการพิจารณา',
      icon: AlertCircle,
      tone: 'warning',
      href: '/withdrawals',
      permission: 'withdrawals.view'
    },
    {
      id: 'projects',
      label: 'โครงการ Active',
      value: stats.projectCount,
      subtext: `${stats.logicalProjectCount} โครงการ (${stats.projectCount} สถานที่)`,
      icon: FolderKanban,
      tone: 'info',
      href: '/projects',
      permission: 'projects.view'
    },
    {
      id: 'items',
      label: 'รายการวัสดุ',
      value: stats.itemCount,
      subtext: `คงเหลือรวม ${stats.totalStockUnits.toLocaleString()} หน่วย`,
      icon: Package,
      tone: 'indigo',
      href: '/items',
      permission: 'items.view'
    },
    {
      id: 'today_withdrawals',
      label: 'เบิกจ่ายวันนี้',
      value: stats.todayWithdrawals,
      subtext: 'คำขอเบิกจ่ายวันนี้',
      icon: ArrowUpFromLine,
      tone: 'success',
      href: '/withdrawals',
      permission: 'withdrawals.view'
    },
  ];

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return { text: 'รออนุมัติ', cls: 'text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300 dark:bg-amber-400/15' };
      case 'approved': return { text: 'อนุมัติ', cls: 'text-blue-700 bg-blue-500/10 border-blue-500/30 dark:text-blue-300 dark:bg-blue-400/15' };
      case 'completed': return { text: 'รับของแล้ว', cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300 dark:bg-emerald-400/15' };
      case 'rejected': return { text: 'ปฏิเสธ', cls: 'text-red-700 bg-red-500/10 border-red-500/30 dark:text-red-300 dark:bg-red-400/15' };
      default: return { text: status, cls: 'text-muted-foreground bg-muted/70 border-border' };
    }
  };

  const chartTheme = resolvedTheme === 'dark'
    ? {
        grid: 'rgba(148, 163, 184, 0.22)',
        tick: '#a8b4c7',
        cursor: 'rgba(99, 102, 241, 0.16)',
        tooltipBackground: '#20293a',
        tooltipBorder: 'rgba(203, 213, 225, 0.16)',
        tooltipText: '#f1f5f9',
        tooltipShadow: '0 12px 28px rgba(0, 0, 0, 0.34)',
      }
    : {
        grid: '#cbd5e1',
        tick: '#52627a',
        cursor: '#dbe4f0',
        tooltipBackground: '#eef2f7',
        tooltipBorder: 'rgba(148, 163, 184, 0.3)',
        tooltipText: '#172033',
        tooltipShadow: '4px 4px 10px rgba(0, 0, 0, 0.05), -4px -4px 10px rgba(255, 255, 255, 0.8)',
      };

  const currentChartData = chartViewMode === 'project' ? stockByProjects : topItemsStock;

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-4 w-[350px] mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="col-span-8 h-[450px] rounded-2xl" />
          <Skeleton className="col-span-4 h-[450px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-in fade-in-50 duration-200">
      
      {/* Header with Live Status & Manual Refresh */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <span>Dashboard</span>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            ยินดีต้อนรับกลับมา, <span className="font-semibold text-foreground">{profile?.full_name}</span>. สรุปภาพรวมและสต็อกคงเหลือแบบเรียลไทม์
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDashboardData(false)}
          disabled={refreshing}
          className="rounded-xl h-10 px-3.5 gap-2 text-xs font-bold border-border/80 hover:bg-accent cursor-pointer shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
          <span>{refreshing ? 'กำลังซิงค์...' : 'รีเฟรชข้อมูล'}</span>
        </Button>
      </div>

      {/* Real-time Site Installation Kits Availability (BOM) */}
      <SiteKitAvailabilityCards siteKits={siteKits} loading={loading} />

      {/* Redesigned Actionable KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statCards.map((stat) => (
          <DashboardStatCard
            key={stat.id}
            label={stat.label}
            value={stat.value}
            subtext={stat.subtext}
            icon={stat.icon}
            tone={stat.tone}
            href={stat.href}
            permission={stat.permission}
            loading={loading}
            error={hasError}
          />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Stock Balance Chart (8 columns wide) */}
        <Card className="lg:col-span-8 flex flex-col rounded-3xl glass border border-border/80 shadow-md">
          <CardHeader className="border-b border-border/40 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {chartViewMode === 'project' 
                    ? 'สรุปยอดสต็อกแยกตามโครงการ Active' 
                    : 'TOP 10 วัสดุคงเหลือสูงสุด'}
                </span>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                {chartViewMode === 'project' 
                  ? `แสดงยอดรับเข้า เบิกจ่าย และคงเหลือใน ${stockByProjects.length} สถานที่จัดเก็บ`
                  : 'แสดงยอดรับเข้า เบิกจ่าย และคงเหลือแยกตามรายการวัสดุ (ชี้เมาส์เพื่อดูชื่อเต็ม)'}
              </p>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border/60 shrink-0 self-start sm:self-auto">
              <Button
                type="button"
                variant={chartViewMode === 'project' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setChartViewMode('project')}
                className={`h-7 px-2.5 rounded-lg text-xs gap-1.5 font-bold cursor-pointer transition-all ${
                  chartViewMode === 'project' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <Building2 className="w-3 h-3" /> ตามโครงการ
              </Button>
              <Button
                type="button"
                variant={chartViewMode === 'item' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setChartViewMode('item')}
                className={`h-7 px-2.5 rounded-lg text-xs gap-1.5 font-bold cursor-pointer transition-all ${
                  chartViewMode === 'item' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <Package className="w-3 h-3" /> Top วัสดุ
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 pt-6">
            {currentChartData.length > 0 ? (
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={currentChartData}
                    margin={{ 
                      top: 10, 
                      right: 10, 
                      left: -15, 
                      bottom: chartViewMode === 'item' ? 48 : 22 
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.grid} />
                    <XAxis 
                      dataKey="shortName" 
                      axisLine={false} 
                      tickLine={false} 
                      interval={0}
                      tick={<CustomXAxisTick isItemMode={chartViewMode === 'item'} theme={chartTheme} />}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: chartTheme.tick, fontSize: 11 }}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: chartTheme.cursor }}
                      contentStyle={{ 
                        backgroundColor: chartTheme.tooltipBackground, 
                        color: chartTheme.tooltipText, 
                        borderRadius: '14px', 
                        border: `1px solid ${chartTheme.tooltipBorder}`, 
                        boxShadow: chartTheme.tooltipShadow, 
                        fontSize: '12px',
                        padding: '10px 14px'
                      }}
                      labelStyle={{ color: chartTheme.tooltipText, fontWeight: 'bold', marginBottom: '6px', maxWidth: '320px', wordBreak: 'break-word' }}
                      labelFormatter={(_, payload) => {
                        if (payload && payload.length > 0 && payload[0]?.payload) {
                          const p = payload[0].payload;
                          return p.fullName || p.name || p.item_name || '-';
                        }
                        return '';
                      }}
                      formatter={(val, name) => [`${Number(val).toLocaleString()} ชิ้น`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: chartViewMode === 'item' ? '24px' : '15px', fontSize: '12px' }} />
                    <Bar dataKey="total_in" name="รับเข้า (Total In)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="total_out" name="เบิกจ่าย (Total Out)" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="balance" name="คงเหลือ (Balance)" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-30 stroke-1" />
                <p className="text-sm font-semibold">ยังไม่มีข้อมูลสต็อกในโครงการ Active</p>
                <p className="text-xs mt-1">เมื่อมีการรับเข้าสต็อก ข้อมูลกราฟจะแสดงผลที่นี่โดยอัตโนมัติ</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Recent Activity (4 columns wide) */}
        <Card className="lg:col-span-4 flex flex-col rounded-3xl glass border border-border/80 shadow-md">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>กิจกรรมล่าสุด</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {recentActivity.length > 0 ? (
              <div className="flex flex-col divide-y divide-border/40">
                {recentActivity.map((item, i) => {
                  const statusInfo = getStatusLabel(item.status);
                  return (
                    <div key={i} className="flex flex-col p-4 hover:bg-muted/10 transition-colors">
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-[11px] font-mono font-medium text-muted-foreground/80">
                          {format(new Date(item.requested_at), 'dd/MM HH:mm')}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-md shadow-2xs ${statusInfo.cls}`}>
                          {statusInfo.text}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-foreground leading-snug mb-1">
                        เบิก {item.withdrawal_items?.[0]?.items?.name || 'รายการวัสดุ'} {item.withdrawal_items?.length > 1 ? `และอีก ${item.withdrawal_items.length - 1} รายการ` : ''}
                      </p>
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {item.projects?.name || 'คลังส่วนกลาง'}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-muted-foreground p-6">
                <ArrowUpFromLine className="w-10 h-10 mb-3 opacity-30 stroke-1" />
                <p className="text-sm font-semibold">ยังไม่มีกิจกรรม</p>
                <p className="text-xs mt-1 text-center">เมื่อมีการเบิกจ่าย จะแสดงผลที่นี่แบบเรียลไทม์</p>
              </div>
            )}
          </CardContent>
        </Card>
        
      </div>
    </div>
  );
};

export default Dashboard;
