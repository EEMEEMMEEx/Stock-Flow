import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, Clock, AlertTriangle, CheckCircle2, RotateCcw, 
  FileText, Eye, User, Building2, Calendar, Phone, Layers
} from 'lucide-react';
import { format, isPast, isToday, addDays, differenceInDays } from 'date-fns';
import { th } from 'date-fns/locale';

const CheckoutActiveList = ({
  orders = [],
  loading = false,
  onOpenReturnModal,
  onOpenDetailModal
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'overdue' | 'due_soon' | 'active'

  const enrichedOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return orders.map(order => {
      const dueDate = new Date(order.expected_return_date);
      dueDate.setHours(0, 0, 0, 0);
      
      const isOverdue = dueDate < today && order.status !== 'completed';
      const daysDiff = differenceInDays(dueDate, today);
      const isDueSoon = daysDiff >= 0 && daysDiff <= 2 && order.status !== 'completed';

      const totalBorrowed = (order.checkout_items || []).reduce((sum, i) => sum + Number(i.quantity_borrowed || 0), 0);
      const totalReturned = (order.checkout_items || []).reduce((sum, i) => sum + Number(i.quantity_returned || 0) + Number(i.quantity_damaged || 0) + Number(i.quantity_lost || 0), 0);
      const remainingUnits = totalBorrowed - totalReturned;

      return {
        ...order,
        isOverdue,
        isDueSoon,
        daysDiff,
        totalBorrowed,
        totalReturned,
        remainingUnits
      };
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return enrichedOrders.filter(order => {
      // Filter by status
      if (statusFilter === 'overdue' && !order.isOverdue) return false;
      if (statusFilter === 'due_soon' && !order.isDueSoon) return false;
      if (statusFilter === 'active' && (order.isOverdue || order.status === 'completed')) return false;

      // Filter by search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        order.order_number?.toLowerCase().includes(q) ||
        order.borrower_name?.toLowerCase().includes(q) ||
        order.borrower_department?.toLowerCase().includes(q) ||
        order.projects?.name?.toLowerCase().includes(q) ||
        order.projects?.project_code?.toLowerCase().includes(q) ||
        order.checkout_items?.some(i => i.items?.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q))
      );
    });
  }, [enrichedOrders, statusFilter, searchQuery]);

  // Overall KPI metrics
  const overdueCount = enrichedOrders.filter(o => o.isOverdue).length;
  const dueSoonCount = enrichedOrders.filter(o => o.isDueSoon).length;
  const activeLoansCount = enrichedOrders.filter(o => o.status !== 'completed').length;
  const totalUnitsBorrowed = enrichedOrders.reduce((sum, o) => sum + o.remainingUnits, 0);

  return (
    <div className="space-y-6">
      
      {/* Top Filter & Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card 
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            statusFilter === 'all' ? 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30' : 'bg-card/70 hover:bg-accent/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">รายการยืมคงค้าง</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{activeLoansCount}</span>
            <span className="text-xs text-muted-foreground font-medium">คำสั่ง ({totalUnitsBorrowed} ชิ้น)</span>
          </div>
        </Card>

        <Card 
          onClick={() => setStatusFilter('due_soon')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            statusFilter === 'due_soon' ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30' : 'bg-card/70 hover:bg-accent/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">ใกล้ครบกำหนด (≤ 2 วัน)</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{dueSoonCount}</span>
            <span className="text-xs text-muted-foreground font-medium">คำสั่ง</span>
          </div>
        </Card>

        <Card 
          onClick={() => setStatusFilter('overdue')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            statusFilter === 'overdue' ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/30' : 'bg-card/70 hover:bg-accent/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">เกินกำหนดส่งคืน (Overdue)</span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">{overdueCount}</span>
            <span className="text-xs text-muted-foreground font-medium">คำสั่ง</span>
          </div>
        </Card>

        <Card 
          onClick={() => setStatusFilter('active')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            statusFilter === 'active' ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30' : 'bg-card/70 hover:bg-accent/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">สถานะปกติ</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {activeLoansCount - overdueCount}
            </span>
            <span className="text-xs text-muted-foreground font-medium">คำสั่ง</span>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="rounded-3xl glass border border-border/80 shadow-md">
        <CardHeader className="border-b border-border/40 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
            <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
            <span>รายการยืมที่ยังไม่ได้คืนครบ ({filteredOrders.length} รายการ)</span>
          </CardTitle>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ค้นหาเลขที่, ผู้ยืม, แผนก, S/N..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs rounded-xl"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground text-xs">
              กำลังโหลดข้อมูลการยืมพัสดุ...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-xs space-y-1">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60 stroke-1" />
              <p className="font-semibold text-foreground">ไม่พบรายการยืมคงค้างตามเงื่อนไข</p>
              <p className="text-[11px]">อุปกรณ์ทั้งหมดถูกส่งคืนครบถ้วน หรือไม่มีข้อมูลในตัวกรองนี้</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filteredOrders.map(order => {
                const projectDisplay = order.projects?.project_code 
                  ? `[${order.projects.project_code}] ${order.projects.name}` 
                  : (order.projects?.name || '-');

                return (
                  <div 
                    key={order.id}
                    className="p-4 sm:p-5 hover:bg-muted/15 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Left: Borrower & Order Info */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-lg">
                          {order.order_number}
                        </span>

                        {/* Status Badges */}
                        {order.isOverdue ? (
                          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            เกินกำหนดคืน {Math.abs(order.daysDiff)} วัน
                          </span>
                        ) : order.isDueSoon ? (
                          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {order.daysDiff === 0 ? 'ครบกำหนดคืนวันนี้' : `ครบกำหนดใน ${order.daysDiff} วัน`}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            กำลังยืม
                          </span>
                        )}

                        {order.status === 'partial_returned' && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                            คืนแล้วบางส่วน ({order.totalReturned}/{order.totalBorrowed})
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground font-semibold">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{order.borrower_name}</span>
                          {order.borrower_department && <span className="text-muted-foreground font-normal">({order.borrower_department})</span>}
                        </span>
                        {order.borrower_phone && (
                          <span className="text-muted-foreground font-normal flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {order.borrower_phone}
                          </span>
                        )}
                        <span className="text-muted-foreground font-normal flex items-center gap-1 truncate">
                          <Building2 className="w-3 h-3 text-indigo-500 shrink-0" /> {projectDisplay}
                        </span>
                      </div>

                      {/* Items Summary */}
                      <div className="text-[11px] text-muted-foreground pt-1 flex flex-wrap gap-1.5">
                        {order.checkout_items?.map((item, idx) => (
                          <span key={item.id || idx} className="bg-muted/60 px-2 py-0.5 rounded-md border border-border/40 font-mono text-[10px]">
                            {item.items?.name || 'อุปกรณ์'} ×{item.quantity_borrowed - (item.quantity_returned + item.quantity_damaged + item.quantity_lost)} {item.items?.unit || 'ชิ้น'}
                            {item.serial_number && <span className="text-indigo-600 dark:text-indigo-400"> (S/N: {item.serial_number})</span>}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right: Date & Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <div className="text-right mr-2 hidden sm:block">
                        <div className="text-[11px] text-muted-foreground">
                          ยืมเมื่อ: {format(new Date(order.checkout_date), 'dd/MM/yyyy')}
                        </div>
                        <div className={`text-xs font-bold ${order.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                          กำหนดคืน: {format(new Date(order.expected_return_date), 'dd/MM/yyyy')}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenDetailModal(order)}
                        className="rounded-xl h-9 text-xs gap-1.5 font-bold shadow-2xs cursor-pointer"
                        title="ดูรายละเอียดใบยืมและพิมพ์เอกสาร"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">ดูใบยืม</span>
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => onOpenReturnModal(order)}
                        className="rounded-xl h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-bold shadow-sm cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>รับคืนพัสดุ</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckoutActiveList;
