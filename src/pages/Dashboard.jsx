import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, FolderKanban, ArrowUpFromLine, AlertCircle, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

const Dashboard = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    projectCount: 0,
    itemCount: 0,
    pendingCount: 0,
    todayWithdrawals: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [stockBalance, setStockBalance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Count active projects
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Count items
      const { count: itemCount } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true });

      // Count pending withdrawals
      const { count: pendingCount } = await supabase
        .from('withdrawals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Count today's withdrawals
      const today = new Date().toISOString().split('T')[0];
      const { count: todayWithdrawals } = await supabase
        .from('withdrawals')
        .select('*', { count: 'exact', head: true })
        .gte('requested_at', today);

      setStats({
        projectCount: projectCount || 0,
        itemCount: itemCount || 0,
        pendingCount: pendingCount || 0,
        todayWithdrawals: todayWithdrawals || 0,
      });

      // Fetch recent activity (last 6 withdrawals)
      const { data: activityData } = await supabase
        .from('withdrawals')
        .select('*, projects(name), items(name, unit), profiles!withdrawals_requested_by_fkey(full_name)')
        .order('requested_at', { ascending: false })
        .limit(6);
      setRecentActivity(activityData || []);

      // Fetch stock balance
      const { data: balanceData } = await supabase
        .from('stock_balance')
        .select('*')
        .limit(10);
      setStockBalance(balanceData || []);

    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: 'โครงการ Active', value: stats.projectCount, icon: FolderKanban, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'รายการวัสดุ', value: stats.itemCount, icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { title: 'รออนุมัติเบิกจ่าย', value: stats.pendingCount, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { title: 'เบิกจ่ายวันนี้', value: stats.todayWithdrawals, icon: ArrowUpFromLine, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return { text: 'รออนุมัติ', cls: 'text-amber-600 bg-amber-50' };
      case 'approved': return { text: 'อนุมัติ', cls: 'text-blue-600 bg-blue-50' };
      case 'completed': return { text: 'รับของแล้ว', cls: 'text-emerald-600 bg-emerald-50' };
      case 'rejected': return { text: 'ปฏิเสธ', cls: 'text-red-600 bg-red-50' };
      default: return { text: status, cls: 'text-gray-600 bg-gray-50' };
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-4 w-[350px] mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Skeleton className="col-span-4 h-[400px] rounded-xl" />
          <Skeleton className="col-span-3 h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h2>
        <p className="text-muted-foreground mt-2">
          ยินดีต้อนรับกลับมา, <span className="font-semibold text-foreground">{profile?.full_name}</span>. นี่คือสรุปข้อมูล Stock วันนี้
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="glass-card overflow-hidden relative group">
            <div className={`absolute right-[-16px] top-[-16px] opacity-[0.07] ${stat.color}`}>
              <stat.icon className="w-28 h-28" strokeWidth={1.5} />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Stock Balance Table */}
        <Card className="col-span-4 glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-indigo-500" />
              Stock คงเหลือแต่ละโครงการ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stockBalance.length > 0 ? (
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stockBalance}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="item_name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dx={-10}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="total_in" name="รับเข้า (In)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="total_out" name="เบิกจ่าย (Out)" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">ยังไม่มีข้อมูล Stock</p>
                <p className="text-xs mt-1">เริ่มจากเพิ่มวัสดุ แล้วรับเข้า Stock ก่อนครับ</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="col-span-3 glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              กิจกรรมล่าสุด
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((item, i) => {
                  const statusInfo = getStatusLabel(item.status);
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight truncate">
                          เบิก {item.items?.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.projects?.name} • <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.cls}`}>{statusInfo.text}</span>
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {format(new Date(item.requested_at), 'dd/MM HH:mm')}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ArrowUpFromLine className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">ยังไม่มีกิจกรรม</p>
                <p className="text-xs mt-1">เมื่อมีการเบิกจ่าย จะแสดงผลที่นี่</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
