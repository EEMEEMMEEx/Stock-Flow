import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ArrowUpFromLine, CheckCircle2, XCircle, Clock, 
  AlertTriangle, FileText, Search, Filter, Copy, 
  Check, Eye, Download, Building2, User, ChevronRight, RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const WithdrawalOrdersList = ({
  orders = [],
  loading = false,
  isAdmin = false,
  canApprove = false,
  canReject = false,
  canComplete = false,
  onOpenPosMode,
  onViewOrderDetails,
  onDownloadPDF,
  onApproveOrder,
  onOpenRejectModal,
  onCompleteOrder
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        (order.id && order.id.toLowerCase().includes(q)) ||
        (order.purpose && order.purpose.toLowerCase().includes(q)) ||
        (order.projects?.name && order.projects.name.toLowerCase().includes(q)) ||
        (order.projects?.project_code && order.projects.project_code.toLowerCase().includes(q)) ||
        (order.profiles?.full_name && order.profiles.full_name.toLowerCase().includes(q)) ||
        (order.delivery_address && order.delivery_address.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'all' || order.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const handleCopyOrderId = (id, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success('คัดลอกรหัสคำขอเรียบร้อย');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Stats calculation
  const totalOrdersCount = orders.length;
  const pendingOrdersCount = orders.filter(o => o.status === 'pending').length;
  const approvedOrdersCount = orders.filter(o => o.status === 'approved').length;
  const completedOrdersCount = orders.filter(o => o.status === 'completed').length;
  const rejectedOrdersCount = orders.filter(o => o.status === 'rejected').length;

  const StatusBadge = ({ status, has_shortage, is_shortage_override }) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full text-xs font-bold border border-amber-500/30 animate-pulse">
            <Clock className="w-3.5 h-3.5" /> รออนุมัติ
          </span>
        );
      case 'approved':
        if (has_shortage || is_shortage_override) {
          return (
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/15 px-3 py-1 rounded-full text-xs font-extrabold border border-amber-500/40">
              <AlertTriangle className="w-3.5 h-3.5" /> อนุมัติแล้ว (ของไม่ครบ)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full text-xs font-bold border border-blue-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> อนุมัติแล้ว
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> รับของแล้ว
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30">
            <XCircle className="w-3.5 h-3.5" /> ไม่อนุมัติ
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2.5 text-foreground">
            <div className="p-2 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FileText className="w-6 h-6" />
            </div>
            <span>รายการคำขอเบิกจ่าย (Requisitions Tracking)</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            ติดตามสถานะคำขอเบิกจ่ายวัสดุ อนุมัติตัดสต็อก และพิมพ์เอกสารใบเบิกนำส่ง
          </p>
        </div>

        <Button
          type="button"
          onClick={onOpenPosMode}
          className="h-11 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/25 gap-2 transition-all cursor-pointer"
        >
          <ArrowUpFromLine className="w-4 h-4" />
          <span>+ สร้างคำขอเบิกจ่าย (POS)</span>
        </Button>
      </div>

      {/* Stats KPI Header Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-3xl glass border border-border/60 shadow-2xs space-y-1 hover:border-indigo-500/30 transition-colors">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>คำขอทั้งหมด</span>
            <FileText className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-foreground">{loading ? '-' : totalOrdersCount}</p>
        </Card>

        <Card className="p-4 rounded-3xl glass border border-amber-500/30 bg-amber-500/5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-semibold">
            <span>รออนุมัติ</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-amber-600 dark:text-amber-400">{loading ? '-' : pendingOrdersCount}</p>
        </Card>

        <Card className="p-4 rounded-3xl glass border border-blue-500/30 bg-blue-500/5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 font-semibold">
            <span>อนุมัติแล้ว</span>
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-blue-600 dark:text-blue-400">{loading ? '-' : approvedOrdersCount}</p>
        </Card>

        <Card className="p-4 rounded-3xl glass border border-emerald-500/30 bg-emerald-500/5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
            <span>รับของแล้ว</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">{loading ? '-' : completedOrdersCount}</p>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-4 rounded-3xl glass border border-border/60 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาบิล... (รหัสคำขอ, โครงการ, ชื่อผู้ขอ, วัตถุประสงค์)"
              className="pl-9 h-11 rounded-2xl bg-background border-border/60 focus:ring-2 focus:ring-indigo-500 text-xs shadow-2xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin shrink-0">
            <Button
              type="button"
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
              className={`h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-slate-50 dark:bg-slate-50 dark:text-slate-900'
                  : 'border-border/60 text-muted-foreground hover:bg-accent'
              }`}
            >
              ทั้งหมด ({orders.length})
            </Button>

            <Button
              type="button"
              variant={statusFilter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('pending')}
              className={`h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              รออนุมัติ ({pendingOrdersCount})
            </Button>

            <Button
              type="button"
              variant={statusFilter === 'approved' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('approved')}
              className={`h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'approved'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10'
              }`}
            >
              อนุมัติแล้ว ({approvedOrdersCount})
            </Button>

            <Button
              type="button"
              variant={statusFilter === 'completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('completed')}
              className={`h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'completed'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10'
              }`}
            >
              รับของแล้ว ({completedOrdersCount})
            </Button>

            <Button
              type="button"
              variant={statusFilter === 'rejected' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('rejected')}
              className={`h-9 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'rejected'
                  ? 'bg-red-600 text-white shadow-2xs'
                  : 'border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/10'
              }`}
            >
              ไม่อนุมัติ ({rejectedOrdersCount})
            </Button>

            {(search || statusFilter !== 'all') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="h-9 px-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl shrink-0 gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> รีเซ็ต
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Orders Table Card */}
      <Card className="overflow-hidden glass border border-border/60 rounded-3xl shadow-sm">
        <Table>
          <TableHeader className="bg-muted/50 text-xs">
            <TableRow>
              <TableHead className="w-32">วันที่ขอเบิก</TableHead>
              <TableHead>รหัสคำขอ / โครงการ</TableHead>
              <TableHead>ผู้ขอเบิก</TableHead>
              <TableHead>วัตถุประสงค์</TableHead>
              <TableHead className="text-center">สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs">
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground animate-pulse">
                  กำลังโหลดข้อมูลคำขอเบิกจ่าย...
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <FileText className="w-10 h-10 opacity-30 stroke-1" />
                    <p className="font-bold text-foreground">ไม่พบรายการคำขอเบิกจ่าย</p>
                    <p className="text-xs text-muted-foreground">กดปุ่ม &quot;+ สร้างคำขอเบิกจ่าย (POS)&quot; ด้านบนเพื่อสร้างรายการใหม่</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map(order => (
                <TableRow
                  key={order.id}
                  className="hover:bg-accent/40 transition-colors cursor-pointer"
                  onClick={() => onViewOrderDetails(order)}
                >
                  {/* Date Column */}
                  <TableCell className="font-medium text-xs whitespace-nowrap">
                    <div className="font-bold text-foreground">
                      {order.requested_at ? format(new Date(order.requested_at), 'dd/MM/yyyy') : '-'}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {order.requested_at ? format(new Date(order.requested_at), 'HH:mm:ss') : ''}
                    </div>
                  </TableCell>

                  {/* Project & Order ID Column */}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground">
                        {order.projects?.project_code ? `[${order.projects.project_code}] ` : ''}{order.projects?.name || '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mt-0.5">
                      <span>ID: #{order.id?.slice(0, 8)}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyOrderId(order.id, e)}
                        title="คัดลอก Order ID"
                        className="hover:text-foreground p-0.5 rounded cursor-pointer"
                      >
                        {copiedId === order.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </TableCell>

                  {/* Requester Column */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-[10px]">
                        {order.profiles?.full_name?.charAt(0) || 'U'}
                      </div>
                      <span className="font-semibold text-foreground">{order.profiles?.full_name || 'ผู้ใช้งาน'}</span>
                    </div>
                  </TableCell>

                  {/* Purpose Column */}
                  <TableCell className="max-w-[200px]">
                    <p className="text-foreground truncate">{order.purpose || '-'}</p>
                    {order.delivery_address && (
                      <p className="text-[10px] text-muted-foreground truncate">ส่ง: {order.delivery_address}</p>
                    )}
                  </TableCell>

                  {/* Status Column */}
                  <TableCell className="text-center">
                    <StatusBadge
                      status={order.status}
                      has_shortage={order.has_shortage}
                      is_shortage_override={order.is_shortage_override}
                    />
                  </TableCell>

                  {/* Action Buttons Column */}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => onViewOrderDetails(order)}
                        className="h-8 px-2.5 rounded-xl text-xs font-semibold gap-1 hover:bg-accent cursor-pointer"
                        title="ดูรายละเอียดคำขอ"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>รายละเอียด</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        title="พิมพ์/ดาวน์โหลด ใบเบิกของ (PDF)"
                        onClick={() => onDownloadPDF(order)}
                        className="h-8 px-2.5 rounded-xl text-xs font-semibold text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>PDF</span>
                      </Button>

                      {order.status === 'pending' && (
                        <>
                          {canApprove && (
                            <Button
                              type="button"
                              size="xs"
                              className="h-8 px-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
                              onClick={() => onApproveOrder(order.id)}
                            >
                              อนุมัติ
                            </Button>
                          )}
                          {canReject && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="xs"
                              className="h-8 px-2.5 rounded-xl text-xs font-bold cursor-pointer"
                              onClick={() => onOpenRejectModal(order)}
                            >
                              ปฏิเสธ
                            </Button>
                          )}
                        </>
                      )}

                      {order.status === 'approved' && canComplete && (
                        <Button
                          type="button"
                          size="xs"
                          className="h-8 px-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-2xs"
                          onClick={() => onCompleteOrder(order.id)}
                        >
                          ยืนยันรับของ
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default WithdrawalOrdersList;
