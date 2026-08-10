import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { BarChart3, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover/95 backdrop-blur border border-border p-2.5 rounded-xl shadow-md text-xs space-y-1">
        <p className="font-semibold text-popover-foreground">{label}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} className="flex items-center gap-2" style={{ color: entry.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.name}:</span>
            <span className="font-bold">{Number(entry.value).toLocaleString('th-TH')}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const ReportCharts = ({ activeTab, reportData = [] }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const chartTextColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

  // Process data for Project Breakdown Chart
  const projectChartData = useMemo(() => {
    const projectMap = {};

    reportData.forEach((row) => {
      let pName = '';
      let qty = 0;

      if (activeTab === 'stock_in') {
        pName = row.projects?.name || 'ไม่ระบุโครงการ';
        qty = Number(row.quantity) || 0;
      } else if (activeTab === 'withdrawals') {
        pName = row.projects?.name || 'ไม่ระบุโครงการ';
        qty = Number(row.deducted_quantity !== undefined ? row.deducted_quantity : row.quantity) || 0;
      } else if (activeTab === 'balance') {
        pName = row.project_name || 'ไม่ระบุโครงการ';
        qty = Number(row.balance) || 0;
      }

      if (!projectMap[pName]) {
        projectMap[pName] = 0;
      }
      projectMap[pName] += qty;
    });

    return Object.keys(projectMap)
      .map((key) => ({
        name: key.length > 15 ? `${key.substring(0, 15)}...` : key,
        fullName: key,
        value: projectMap[key]
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [reportData, activeTab]);

  // Process data for Status / Breakdown Pie Chart
  const statusPieData = useMemo(() => {
    if (activeTab === 'withdrawals') {
      let approvedCount = 0;
      let completedCount = 0;
      let pendingCount = 0;
      let rejectedCount = 0;
      let shortageCount = 0;

      reportData.forEach((row) => {
        if (row.has_shortage) shortageCount++;
        if (row.status === 'approved') approvedCount++;
        else if (row.status === 'completed') completedCount++;
        else if (row.status === 'pending') pendingCount++;
        else if (row.status === 'rejected') rejectedCount++;
      });

      return [
        { name: 'อนุมัติแล้ว', value: approvedCount, color: '#10b981' },
        { name: 'เสร็จสิ้น', value: completedCount, color: '#3b82f6' },
        { name: 'รออนุมัติ', value: pendingCount, color: '#f59e0b' },
        { name: 'ของไม่ครบ', value: shortageCount, color: '#f97316' },
        { name: 'ปฏิเสธ', value: rejectedCount, color: '#ef4444' }
      ].filter((d) => d.value > 0);
    } else if (activeTab === 'balance') {
      let normalCount = 0;
      let lowCount = 0;

      reportData.forEach((row) => {
        if ((Number(row.balance) || 0) <= 0) lowCount++;
        else normalCount++;
      });

      return [
        { name: 'มีคงเหลือ', value: normalCount, color: '#10b981' },
        { name: 'สินค้าเป็น 0/เหลือน้อย', value: lowCount, color: '#ef4444' }
      ].filter((d) => d.value > 0);
    } else {
      // Stock In supplier breakdown
      const supplierMap = {};
      reportData.forEach((row) => {
        const sup = row.supplier || 'ไม่ระบุ Supplier';
        supplierMap[sup] = (supplierMap[sup] || 0) + (Number(row.quantity) || 0);
      });
      return Object.keys(supplierMap)
        .map((key, idx) => ({
          name: key,
          value: supplierMap[key],
          color: COLORS[idx % COLORS.length]
        }))
        .slice(0, 5);
    }
  }, [reportData, activeTab]);

  if (reportData.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Chart 1: Project Distribution Bar Chart */}
      <Card className="lg:col-span-2 border border-border/60 shadow-xs">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span>
              {activeTab === 'stock_in'
                ? 'สัดส่วนรับเข้าแยกตามโครงการ (Top Projects)'
                : activeTab === 'withdrawals'
                ? 'สัดส่วนเบิกจ่ายแยกตามโครงการ (Top Withdrawals)'
                : 'สัดส่วนยอดคงเหลือแยกตามโครงการ (Top Balance)'}
            </span>
          </CardTitle>
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" /> หน่วยปริมาณ
          </span>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="h-[220px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis
                  dataKey="name"
                  stroke={chartTextColor}
                  fontSize={11}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis stroke={chartTextColor} fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="value"
                  name={activeTab === 'stock_in' ? 'รับเข้า' : activeTab === 'withdrawals' ? 'เบิกออก' : 'คงเหลือ'}
                  fill={activeTab === 'stock_in' ? '#10b981' : activeTab === 'withdrawals' ? '#f59e0b' : '#3b82f6'}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={45}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Chart 2: Status / Breakdown Pie Chart */}
      <Card className="border border-border/60 shadow-xs">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-primary" />
            <span>
              {activeTab === 'stock_in'
                ? 'สัดส่วนตาม Supplier'
                : activeTab === 'withdrawals'
                ? 'สัดส่วนสถานะการเบิกจ่าย'
                : 'สัดส่วนสถานะคลังสินค้า'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="h-[220px] w-full flex items-center justify-center">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground">ไม่มีข้อมูลแสดงกราฟ</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportCharts;
