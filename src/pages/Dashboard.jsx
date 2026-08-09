import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, FolderKanban, ArrowUpFromLine, AlertCircle, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/components/theme-provider';
import DashboardStatCard from '@/components/dashboard/DashboardStatCard';

const Dashboard = () => {
  const { profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const [stats, setStats] = useState({
    projectCount: 0,
    itemCount: 0,
    pendingCount: 0,
    todayWithdrawals: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [stockBalance, setStockBalance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setHasError(false);

      const { count: projectCount, error: projErr } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: itemCount, error: itemErr } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true });

      const { count: pendingCount, error: pendingErr } = await supabase
        .from('withdrawal_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const today = new Date().toISOString().split('T')[0];
      const { count: todayWithdrawals, error: todayErr } = await supabase
        .from('withdrawal_orders')
        .select('*', { count: 'exact', head: true })
        .gte('requested_at', today);

      if (projErr || itemErr || pendingErr || todayErr) {
        setHasError(true);
      }

      setStats({
        projectCount: projectCount || 0,
        itemCount: itemCount || 0,
        pendingCount: pendingCount || 0,
        todayWithdrawals: todayWithdrawals || 0,
      });

      const { data: activityData } = await supabase
        .from('withdrawal_orders')
        .select('*, projects(name), profiles!withdrawal_orders_requested_by_fkey(full_name), withdrawal_items(items(name))')
        .order('requested_at', { ascending: false })
        .limit(6);
      setRecentActivity(activityData || []);

      const { data: balanceData } = await supabase
        .from('stock_balance')
        .select('*')
        .limit(10);
      setStockBalance(balanceData || []);

    } catch (error) {
      console.error('Dashboard fetch error:', error);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

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
      subtext: 'โครงการที่กำลังใช้งาน',
      icon: FolderKanban,
      tone: 'info',
      href: '/projects',
      permission: 'projects.view'
    },
    {
      id: 'items',
      label: 'รายการวัสดุ',
      value: stats.itemCount,
      subtext: 'วัสดุทั้งหมดในระบบ',
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
    <div className="space-y-8 pb-12">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-2">
          ยินดีต้อนรับกลับมา, <span className="font-semibold text-foreground">{profile?.full_name}</span>. นี่คือสรุปข้อมูล Stock วันนี้
        </p>
      </div>

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
        <Card className="lg:col-span-8 flex flex-col">
          <CardHeader className="border-b border-border/40 pb-4">
            <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-muted-foreground" />
              Stock คงเหลือแต่ละโครงการ
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pt-6">
            {stockBalance.length > 0 ? (
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stockBalance}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.grid} />
                    <XAxis 
                      dataKey="item_name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: chartTheme.tick, fontSize: 11 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: chartTheme.tick, fontSize: 11 }}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: chartTheme.cursor }}
                      contentStyle={{ backgroundColor: chartTheme.tooltipBackground, color: chartTheme.tooltipText, borderRadius: '8px', border: `1px solid ${chartTheme.tooltipBorder}`, boxShadow: chartTheme.tooltipShadow, fontSize: '12px' }}
                      labelStyle={{ color: chartTheme.tooltipText }}
                      itemStyle={{ color: chartTheme.tooltipText }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                    <Bar dataKey="total_in" name="รับเข้า (In)" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="total_out" name="เบิกจ่าย (Out)" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-30 stroke-1" />
                <p className="text-sm font-medium">ยังไม่มีข้อมูล Stock</p>
                <p className="text-xs mt-1">เริ่มจากเพิ่มวัสดุ แล้วรับเข้า Stock ก่อนครับ</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Recent Activity (4 columns wide) */}
        <Card className="lg:col-span-4 flex flex-col">
          <CardHeader className="border-b border-border/40 pb-4">
            <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              กิจกรรมล่าสุด
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {recentActivity.length > 0 ? (
              <div className="flex flex-col divide-y divide-border/40">
                {recentActivity.map((item, i) => {
                  const statusInfo = getStatusLabel(item.status);
                  return (
                    <div key={i} className="flex flex-col p-5 hover:bg-muted/10 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[11px] font-mono font-medium text-muted-foreground/80">
                          {format(new Date(item.requested_at), 'dd/MM HH:mm')}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-md shadow-sm ${statusInfo.cls}`}>
                          {statusInfo.text}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground leading-snug mb-1.5">
                        เบิก {item.withdrawal_items?.[0]?.items?.name} {item.withdrawal_items?.length > 1 ? `และอีก ${item.withdrawal_items.length - 1} รายการ` : ''}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"></span>
                        {item.projects?.name}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-muted-foreground p-6">
                <ArrowUpFromLine className="w-10 h-10 mb-3 opacity-30 stroke-1" />
                <p className="text-sm font-medium">ยังไม่มีกิจกรรม</p>
                <p className="text-xs mt-1 text-center">เมื่อมีการเบิกจ่าย จะแสดงผลที่นี่</p>
              </div>
            )}
          </CardContent>
        </Card>
        
      </div>
    </div>
  );
};

export default Dashboard;
