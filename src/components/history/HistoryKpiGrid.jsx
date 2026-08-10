import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, CheckCircle2, PackageCheck, XCircle, AlertTriangle, TrendingUp } from 'lucide-react';

const HistoryKpiGrid = ({ historyData = [] }) => {
  const metrics = React.useMemo(() => {
    let total = historyData.length;
    let approved = 0;
    let completed = 0;
    let rejected = 0;
    let shortages = 0;

    historyData.forEach(item => {
      if (item.status === 'approved') approved++;
      if (item.status === 'completed') completed++;
      if (item.status === 'rejected') rejected++;
      if (item.has_shortage || item.is_shortage_override || (item.withdrawal_items && item.withdrawal_items.some(i => (i.shortage_quantity || 0) > 0))) {
        shortages++;
      }
    });

    return { total, approved, completed, rejected, shortages };
  }, [historyData]);

  const cards = [
    {
      id: 'total',
      title: 'ประวัติการเบิกจ่ายทั้งหมด',
      value: metrics.total.toLocaleString('th-TH'),
      unit: 'บิล',
      subtext: 'รายการประวัติทั้งหมดในระบบ',
      icon: ClipboardList,
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      badge: 'Total',
      badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-300'
    },
    {
      id: 'approved',
      title: 'อนุมัติแล้ว (รอรับของ)',
      value: metrics.approved.toLocaleString('th-TH'),
      unit: 'บิล',
      subtext: 'อนุมัติคำขอแล้ว พร้อมส่งมอบ',
      icon: CheckCircle2,
      iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      badge: 'Approved',
      badgeBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
    },
    {
      id: 'completed',
      title: 'รับของเสร็จสิ้น (Completed)',
      value: metrics.completed.toLocaleString('th-TH'),
      unit: 'บิล',
      subtext: 'ผู้ขอเบิกตรวจรับสินค้าเรียบร้อย',
      icon: PackageCheck,
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      badge: 'Completed',
      badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
    },
    {
      id: 'rejected',
      title: 'ปฏิเสธ / ไม่อนุมัติ',
      value: metrics.rejected.toLocaleString('th-TH'),
      unit: 'บิล',
      subtext: 'คำขอถูกปฏิเสธโดยแอดมิน',
      icon: XCircle,
      iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      badge: 'Rejected',
      badgeBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
    },
    {
      id: 'shortages',
      title: 'รายการมีค้างส่ง (Shortages)',
      value: metrics.shortages.toLocaleString('th-TH'),
      unit: 'บิล',
      subtext: metrics.shortages > 0 ? 'พบของไม่ครบหรือตัดจ่ายบางส่วน' : 'ไม่มีรายการค้างส่ง',
      icon: AlertTriangle,
      iconBg: metrics.shortages > 0 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
      badge: metrics.shortages > 0 ? 'Attention' : 'Normal',
      badgeBg: metrics.shortages > 0 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
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

export default HistoryKpiGrid;
