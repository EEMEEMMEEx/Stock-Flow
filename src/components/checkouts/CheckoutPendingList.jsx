import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, Clock, CheckCircle2, XCircle, Eye, 
  User, Building2, Phone, Calendar, Layers, 
  Infinity as InfinityIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/i18n';

const CheckoutPendingList = ({
  orders = [],
  loading = false,
  canApprove = false,
  onOpenApproveModal,
  onOpenRejectModal,
  onOpenDetailModal
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');

  // Filter only pending orders
  const pendingOrders = useMemo(() => {
    return orders.filter(o => o.status === 'pending');
  }, [orders]);

  // Unique projects for filtering
  const projectOptions = useMemo(() => {
    const map = new Map();
    pendingOrders.forEach(o => {
      if (o.projects?.id) {
        map.set(o.projects.id, o.projects.name || o.projects.project_code || 'Project');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [pendingOrders]);

  const filteredOrders = useMemo(() => {
    return pendingOrders.filter(order => {
      if (projectFilter !== 'all' && order.project_id !== projectFilter) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        order.order_number?.toLowerCase().includes(q) ||
        order.borrower_name?.toLowerCase().includes(q) ||
        order.borrower_department?.toLowerCase().includes(q) ||
        order.projects?.name?.toLowerCase().includes(q) ||
        order.projects?.project_code?.toLowerCase().includes(q) ||
        order.purpose?.toLowerCase().includes(q) ||
        order.checkout_items?.some(i => 
          i.items?.name?.toLowerCase().includes(q) || 
          i.serial_number?.toLowerCase().includes(q)
        )
      );
    });
  }, [pendingOrders, projectFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <Card className="rounded-xl bg-card border border-border shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>{t('checkouts.pendingTitle', 'คำขอยืมที่รออนุมัติ (Pending Requisitions)')}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-xs font-bold">
                  {pendingOrders.length}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {canApprove 
                  ? t('checkouts.pendingAdminSubtitle', 'ตรวจสอบคำขอและกดยืนยันจ่ายอุปกรณ์เพื่อตัดสต็อกจริง')
                  : t('checkouts.pendingStaffSubtitle', 'ติดตามสถานะคำขอยืมพัสดุของคุณที่รอเจ้าหน้าที่ตรวจสอบ')}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            {projectOptions.length > 1 && (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-full sm:w-44 h-9 px-3 rounded-lg border border-input bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">{t('checkouts.allProjects', 'ทุกโครงการ/คลัง')}</option>
                {projectOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('checkouts.searchPendingPlaceholder', 'ค้นหาคำขอ, ชื่อผู้ยืม, โครงการ...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8.5 h-9 text-xs rounded-lg bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Grid / Cards */}
      {loading ? (
        <Card className="rounded-xl border border-border p-8 text-center text-xs text-muted-foreground">
          <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
          <span>{t('common.loading', 'กำลังโหลดข้อมูล...')}</span>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-muted/10">
          <div className="max-w-xs mx-auto space-y-2 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {pendingOrders.length === 0 
                ? t('checkouts.noPendingRequisitions', 'ไม่มีคำขอยืมพัสดุที่รออนุมัติ')
                : t('checkouts.noMatchingPending', 'ไม่พบคำขอยืมที่ตรงกับเงื่อนไขการค้นหา')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('checkouts.allCaughtUp', 'คำขอยืมทั้งหมดได้รับการตรวจสอบและจัดการเรียบร้อยแล้ว')}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredOrders.map(order => {
            const items = order.checkout_items || [];
            const totalUnits = items.reduce((s, i) => s + Number(i.quantity_borrowed || 0), 0);
            const isIndefinite = order.borrow_type === 'indefinite';

            return (
              <Card 
                key={order.id}
                className="rounded-xl bg-card border border-border/70 hover:border-border hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
              >
                <div>
                  {/* Top Card Badge Header */}
                  <div className="p-3.5 border-b border-border/50 flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-foreground">
                        {order.order_number}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{t('checkouts.statusPending', 'รอตรวจสอบ')}</span>
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="p-3.5 space-y-3 text-xs">
                    {/* Borrower Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{order.borrower_name}</span>
                      </div>
                      {(order.borrower_department || order.borrower_phone) && (
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-5">
                          {order.borrower_department && (
                            <span className="truncate">{order.borrower_department}</span>
                          )}
                          {order.borrower_phone && (
                            <span className="flex items-center gap-1 shrink-0">
                              <Phone className="w-3 h-3" />
                              <span>{order.borrower_phone}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Project & Dates */}
                    <div className="space-y-1.5 pt-1 border-t border-border/40 text-[11px]">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span>{t('checkouts.project', 'โครงการ')}:</span>
                        </span>
                        <span className="font-medium text-foreground truncate max-w-[160px]">
                          {order.projects?.name || order.projects?.project_code || '—'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{t('checkouts.requestedDate', 'วันที่ยื่นขอ')}:</span>
                        </span>
                        <span className="font-medium text-foreground">
                          {order.checkout_date ? format(new Date(order.checkout_date), 'dd/MM/yyyy HH:mm') : '—'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{t('checkouts.expectedReturnDate', 'กำหนดส่งคืน')}:</span>
                        <span className="font-medium text-foreground">
                          {isIndefinite ? (
                            <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold">
                              <InfinityIcon className="w-3 h-3" />
                              <span>{t('checkouts.indefinite', 'ไม่มีกำหนด')}</span>
                            </span>
                          ) : (
                            order.expected_return_date ? format(new Date(order.expected_return_date), 'dd/MM/yyyy') : '—'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Purpose preview if available */}
                    {order.purpose && (
                      <div className="p-2 rounded-lg bg-muted/40 text-[11px] text-muted-foreground line-clamp-2">
                        <span className="font-semibold text-foreground mr-1">{t('checkouts.purpose', 'วัตถุประสงค์')}:</span>
                        {order.purpose}
                      </div>
                    )}

                    {/* Items Summary */}
                    <div className="p-2.5 rounded-lg bg-background border border-border/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-muted-foreground" />
                          <span>{t('checkouts.itemsList', 'รายการวัสดุ')} ({items.length})</span>
                        </span>
                        <span className="text-muted-foreground font-normal">
                          {totalUnits} {t('checkouts.units', 'หน่วย')}
                        </span>
                      </div>

                      <ul className="divide-y divide-border/30 text-[11px] max-h-24 overflow-y-auto pr-1">
                        {items.slice(0, 3).map((item, idx) => (
                          <li key={item.id || idx} className="py-1 flex justify-between items-center">
                            <span className="truncate pr-2 text-foreground">
                              {item.items?.name || item.item_name || 'วัสดุ'}
                              {item.serial_number && (
                                <span className="ml-1 text-[10px] text-muted-foreground font-mono">
                                  ({item.serial_number})
                                </span>
                              )}
                            </span>
                            <span className="font-bold shrink-0 text-foreground">
                              {item.quantity_borrowed} {item.items?.unit || ''}
                            </span>
                          </li>
                        ))}
                        {items.length > 3 && (
                          <li className="pt-1 text-[10px] text-muted-foreground italic text-center">
                            + {items.length - 3} {t('checkouts.moreItems', 'รายการเพิ่มเติม')}
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="p-3 bg-muted/30 border-t border-border/50 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenDetailModal(order)}
                    className="h-8 px-2.5 text-xs font-medium cursor-pointer rounded-lg text-muted-foreground hover:text-foreground"
                    title={t('checkouts.viewDetail', 'ดูรายละเอียด')}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    <span>{t('checkouts.detailsBtn', 'รายละเอียด')}</span>
                  </Button>

                  {canApprove ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenRejectModal(order)}
                        className="h-8 px-2.5 text-xs font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive rounded-lg cursor-pointer transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        <span>{t('checkouts.rejectBtn', 'ปฏิเสธ')}</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onOpenApproveModal(order)}
                        className="h-8 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer shadow-xs transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        <span>{t('checkouts.approveAndDispenseBtn', 'อนุมัติจ่ายของ')}</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">
                      {t('checkouts.waitingApproval', 'รอเจ้าหน้าที่ตรวจสอบ')}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CheckoutPendingList;
