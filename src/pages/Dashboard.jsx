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

      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: itemCount } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true });

      const { count: pendingCount } = await supabase
        .from('withdrawal_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const today = new Date().toISOString().split('T')[0];
      const { count: todayWithdrawals } = await supabase
        .from('withdrawal_orders')
        .select('*', { count: 'exact', head: true })
        .gte('requested_at', today);

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
      case 'pending': return { text: 'รออนุมัติ', cls: 'text-amber-600 bg-amber-50 border-amber-200' };
      case 'approved': return { text: 'อนุมัติ', cls: 'text-blue-600 bg-blue-50 border-blue-200' };
      case 'completed': return { text: 'รับของแล้ว', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
      case 'rejected': return { text: 'ปฏิเสธ', cls: 'text-red-600 bg-red-50 border-red-200' };
      default: return { text: status, cls: 'text-gray-600 bg-gray-50 border-gray-200' };
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-4 w-[350px] mt-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
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

      {/* Stats Cards (Neumorphic with Gridgeist Typography) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <Card key={i} className="overflow-hidden relative border-none">
            {/* Background Icon Watermark */}
            <div className={`absolute right-[-16px] top-[-16px] opacity-[0.05] ${stat.color}`}>
              <stat.icon className="w-32 h-32" strokeWidth={1.5} />
            </div>
            
            <CardContent className="p-6 flex flex-col h-full justify-between relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.title}
                </span>
                <div className={`p-2 rounded-xl ${stat.bg} shadow-inner`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} strokeWidth={2.5} />
                </div>
              </div>
              <div>
                <span className={`text-5xl font-light tracking-tight ${stat.color}`}>
                  {stat.value}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Stock Balance Chart (8 columns wide) */}
        <Card className="lg:col-span-8 border-none flex flex-col">
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
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="item_name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 11 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 11 }}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -4px -4px 10px rgba(255,255,255,0.8)', fontSize: '12px' }}
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
        <Card className="lg:col-span-4 border-none flex flex-col">
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
