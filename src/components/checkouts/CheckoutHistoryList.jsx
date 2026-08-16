import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, History, CheckCircle2, Eye, User, 
  Building2, Calendar, Phone, Layers, FileText
} from 'lucide-react';
import { format } from 'date-fns';

const CheckoutHistoryList = ({
  orders = [],
  loading = false,
  onOpenDetailModal
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const completedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'completed' || o.actual_returned_date);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return completedOrders;
    const q = searchQuery.toLowerCase();
    return completedOrders.filter(order => (
      order.order_number?.toLowerCase().includes(q) ||
      order.borrower_name?.toLowerCase().includes(q) ||
      order.borrower_department?.toLowerCase().includes(q) ||
      order.projects?.name?.toLowerCase().includes(q) ||
      order.projects?.project_code?.toLowerCase().includes(q) ||
      order.checkout_items?.some(i => i.items?.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q))
    ));
  }, [completedOrders, searchQuery]);

  return (
    <Card className="rounded-3xl glass border border-border/80 shadow-md">
      <CardHeader className="border-b border-border/40 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
          <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <History className="w-4 h-4" />
          </div>
          <span>ประวัติรายการยืม-คืนที่เสร็จสมบูรณ์แล้ว ({filteredOrders.length} รายการ)</span>
        </CardTitle>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="ค้นหาประวัติ, เลขที่, ผู้ยืม..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-xs rounded-xl"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-xs">
            กำลังโหลดประวัติการยืม-คืน...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-xs space-y-1">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-1" />
            <p className="font-semibold text-foreground">ยังไม่มีประวัติรายการยืม-คืนที่เสร็จสิ้น</p>
            <p className="text-[11px]">เมื่อรับคืนอุปกรณ์ครบถ้วน รายการจะแสดงที่นี่โดยอัตโนมัติ</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {filteredOrders.map(order => {
              const projectDisplay = order.projects?.project_code 
                ? `[${order.projects.project_code}] ${order.projects.name}` 
                : (order.projects?.name || '-');

              const totalBorrowed = (order.checkout_items || []).reduce((s, i) => s + Number(i.quantity_borrowed || 0), 0);

              return (
                <div 
                  key={order.id}
                  className="p-4 sm:p-5 hover:bg-muted/15 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-lg">
                        {order.order_number}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        คืนครบแล้ว ({totalBorrowed} ชิ้น)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-foreground font-semibold">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{order.borrower_name}</span>
                        {order.borrower_department && <span className="text-muted-foreground font-normal">({order.borrower_department})</span>}
                      </span>
                      <span className="text-muted-foreground font-normal flex items-center gap-1 truncate">
                        <Building2 className="w-3 h-3 text-indigo-500 shrink-0" /> {projectDisplay}
                      </span>
                    </div>

                    <div className="text-[11px] text-muted-foreground pt-1 flex flex-wrap gap-1.5">
                      {order.checkout_items?.map((item, idx) => (
                        <span key={item.id || idx} className="bg-muted/60 px-2 py-0.5 rounded-md border border-border/40 font-mono text-[10px]">
                          {item.items?.name || 'อุปกรณ์'} ×{item.quantity_borrowed} {item.items?.unit || 'ชิ้น'}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    <div className="text-right text-xs">
                      <div className="text-muted-foreground text-[11px]">
                        ยืม: {format(new Date(order.checkout_date), 'dd/MM/yyyy')}
                      </div>
                      <div className="font-bold text-emerald-600 dark:text-emerald-400">
                        คืน: {order.actual_returned_date ? format(new Date(order.actual_returned_date), 'dd/MM/yyyy') : '-'}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDetailModal(order)}
                      className="rounded-xl h-9 text-xs gap-1.5 font-bold shadow-2xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>ดูเอกสาร / พิมพ์</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CheckoutHistoryList;
