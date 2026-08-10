import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Package, ArrowDownToLine, ArrowUpFromLine, Layers, AlertTriangle, FolderKanban, TrendingUp } from 'lucide-react';

const ReportKpiGrid = ({ activeTab, reportData = [], projects = [], selectedProjectId = '' }) => {
  // Compute KPI metrics dynamically based on active tab and report data
  const metrics = React.useMemo(() => {
    let totalItems = reportData.length;
    let stockInTotal = 0;
    let stockOutTotal = 0;
    let balanceTotal = 0;
    let shortageCount = 0;
    let pendingCount = 0;

    if (activeTab === 'stock_in') {
      reportData.forEach(row => {
        stockInTotal += (Number(row.quantity) || 0);
      });
    } else if (activeTab === 'withdrawals') {
      reportData.forEach(row => {
        stockOutTotal += (Number(row.deducted_quantity !== undefined ? row.deducted_quantity : row.quantity) || 0);
        if (row.has_shortage || (row.shortage_quantity && Number(row.shortage_quantity) > 0)) shortageCount++;
        if (row.status === 'pending') pendingCount++;
      });
    } else if (activeTab === 'balance') {
      reportData.forEach(row => {
        stockInTotal += (Number(row.total_in) || 0);
        stockOutTotal += (Number(row.total_out) || 0);
        balanceTotal += (Number(row.balance) || 0);
        if ((Number(row.balance) || 0) <= 0) shortageCount++;
      });
    }

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const projectName = selectedProject ? selectedProject.name : 'ทุกโครงการ';

    return {
      totalItems,
      stockInTotal,
      stockOutTotal,
      balanceTotal,
      shortageCount,
      pendingCount,
      projectName
    };
  }, [activeTab, reportData, projects, selectedProjectId]);

  const cards = [
    {
      id: 'total_records',
      title: 'รายการทั้งหมดในรายงาน',
      value: metrics.totalItems.toLocaleString('th-TH'),
      unit: 'รายการ',
      subtext: `ขอบเขต: ${metrics.projectName}`,
      icon: Package,
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      badge: 'Filtered',
      badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-300'
    },
    {
      id: 'stock_in',
      title: 'ปริมาณรับเข้ารวม (Stock In)',
      value: activeTab === 'withdrawals' ? '-' : metrics.stockInTotal.toLocaleString('th-TH'),
      unit: 'หน่วย',
      subtext: activeTab === 'stock_in' ? 'รวมตามเงื่อนไขตัวกรอง' : 'ยอดรับเข้าสะสม',
      icon: ArrowDownToLine,
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      badge: activeTab === 'stock_in' ? '+Receiving' : 'Total In',
      badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
    },
    {
      id: 'stock_out',
      title: 'ปริมาณเบิกจ่ายรวม (Stock Out)',
      value: activeTab === 'stock_in' ? '-' : metrics.stockOutTotal.toLocaleString('th-TH'),
      unit: 'หน่วย',
      subtext: activeTab === 'withdrawals' ? 'ยอดตัดสต็อกจริง' : 'ยอดเบิกจ่ายสะสม',
      icon: ArrowUpFromLine,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      badge: activeTab === 'withdrawals' ? '-Dispatched' : 'Total Out',
      badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
    },
    {
      id: 'balance',
      title: 'คงเหลือสุทธิ (Current Balance)',
      value: activeTab === 'balance' ? metrics.balanceTotal.toLocaleString('th-TH') : 'ดูที่แท็บคงเหลือ',
      unit: activeTab === 'balance' ? 'หน่วย' : '',
      subtext: activeTab === 'balance' ? 'ยอดคงเหลือพร้อมใช้งาน' : 'เลือกแท็บ 3 เพื่อดูรายละเอียด',
      icon: Layers,
      iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      badge: 'Balance',
      badgeBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
    },
    {
      id: 'shortage',
      title: activeTab === 'withdrawals' ? 'รายการของไม่ครบ (Shortages)' : 'รายการต้องเฝ้าระวัง',
      value: (activeTab === 'withdrawals' ? metrics.shortageCount : metrics.shortageCount).toLocaleString('th-TH'),
      unit: 'รายการ',
      subtext: activeTab === 'withdrawals' ? `รออนุมัติ: ${metrics.pendingCount} รายการ` : 'สินค้าคลังต่ำหรือเป็น 0',
      icon: AlertTriangle,
      iconBg: metrics.shortageCount > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
      badge: metrics.shortageCount > 0 ? 'Attention' : 'Normal',
      badgeBg: metrics.shortageCount > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
    },
    {
      id: 'scope',
      title: 'โครงการที่กำลังดูข้อมูล',
      value: metrics.projectName,
      unit: '',
      subtext: `${projects.length} โครงการทั้งหมดในระบบ`,
      icon: FolderKanban,
      iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      badge: 'Project',
      badgeBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-300'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.id} className="relative overflow-hidden border border-border/60 hover:border-border transition-all duration-200 shadow-xs hover:shadow-sm group">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className={`p-2 rounded-xl border ${card.iconBg} transition-transform group-hover:scale-105`}>
                  <Icon className="w-4 h-4 shrink-0" />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.badgeBg}`}>
                  {card.badge}
                </span>
              </div>

              <div>
                <p className="text-[11px] font-medium text-muted-foreground line-clamp-1">
                  {card.title}
                </p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                    {card.value}
                  </h2>
                  {card.unit && (
                    <span className="text-xs font-semibold text-muted-foreground">{card.unit}</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-1 flex items-center gap-1">
                  <TrendingUp className="w-2.5 h-2.5 shrink-0 opacity-60" />
                  {card.subtext}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default ReportKpiGrid;
