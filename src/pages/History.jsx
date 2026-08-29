import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileText, Building2, User, Calendar, MapPin, Target } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { MaterialWithdrawalPDF } from '@/lib/pdf-templates';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

// Import Modular Components
import HistoryHeader from '@/components/history/HistoryHeader';
import HistoryKpiGrid from '@/components/history/HistoryKpiGrid';
import HistoryFilterBar from '@/components/history/HistoryFilterBar';
import HistoryDataTable, { StatusBadge } from '@/components/history/HistoryDataTable';
import HistoryPagination from '@/components/history/HistoryPagination';
import HistoryEmptyState, { HistoryLoadingSkeleton, HistoryErrorState } from '@/components/history/HistoryEmptyState';

const History = () => {
  const { isAdmin, profile } = useAuth();
  
  // Data State
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Selected Order for Dialog
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Filter State
  const [filters, setFilters] = useState({
    search: '',
    project_id: '',
    status: '',
    requester_id: '',
    start_date: '',
    end_date: ''
  });

  // Sorting State
  const [sortField, setSortField] = useState('requested_at');
  const [sortDirection, setSortDirection] = useState('desc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchHistory = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      setError(null);
      
      let query = supabase
        .from('withdrawal_orders')
        .select(`
          id,
          project_id,
          status,
          purpose,
          notes,
          delivery_address,
          requested_by,
          approved_by,
          reject_reason,
          rejected_by,
          rejected_at,
          requested_at,
          approved_at,
          completed_at,
          completed_by,
          projects (
            id,
            name,
            project_code
          ),
          profiles:requested_by (
            id,
            full_name
          ),
          withdrawal_items (
            id,
            quantity,
            delivery_to,
            serial_number,
            part_number,
            items (
              id,
              name,
              unit,
              sku
            )
          )
        `)
        .in('status', ['completed', 'rejected', 'approved'])
        .order('requested_at', { ascending: false })
        .limit(500);
        
      if (!isAdmin) {
        query = query.eq('requested_by', profile.id);
      }
      
      const { data, error: err } = await query;
      if (err && err.code !== '42P01') throw err;
      setHistory(data || []);
    } catch (err) {
      console.error('Fetch History Error:', err);
      setError(err.message || 'ไม่สามารถโหลดข้อมูลประวัติการเบิกจ่ายได้');
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Distinct Projects & Requesters for Filter Dropdowns
  const { projectsList, requestersList } = useMemo(() => {
    const pMap = new Map();
    const rMap = new Map();

    history.forEach(item => {
      if (item.projects && item.projects.id) {
        pMap.set(item.projects.id, item.projects);
      }
      if (item.profiles && item.profiles.id) {
        rMap.set(item.profiles.id, item.profiles);
      }
    });

    return {
      projectsList: Array.from(pMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      requestersList: Array.from(rMap.values()).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    };
  }, [history]);

  // Filter Handlers
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      project_id: '',
      status: '',
      requester_id: '',
      start_date: '',
      end_date: ''
    });
    setCurrentPage(1);
  };

  // Sort Handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filtered Data Computation
  const filteredData = useMemo(() => {
    return history.filter(item => {
      // 1. Search Query
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchId = item.id?.toLowerCase().includes(query);
        const matchProject = item.projects?.name?.toLowerCase().includes(query) || item.projects?.project_code?.toLowerCase().includes(query);
        const matchRequester = item.profiles?.full_name?.toLowerCase().includes(query);
        const matchItems = item.withdrawal_items?.some(i => i.items?.name?.toLowerCase().includes(query) || i.items?.sku?.toLowerCase().includes(query));
        if (!matchId && !matchProject && !matchRequester && !matchItems) return false;
      }

      // 2. Project
      if (filters.project_id && item.projects?.id !== filters.project_id) {
        return false;
      }

      // 3. Status
      if (filters.status) {
        if (filters.status === 'shortage') {
          const hasShortage = item.has_shortage || item.is_shortage_override || item.withdrawal_items?.some(i => (i.shortage_quantity || 0) > 0);
          if (!hasShortage) return false;
        } else if (item.status !== filters.status) {
          return false;
        }
      }

      // 4. Requester
      if (filters.requester_id && item.profiles?.id !== filters.requester_id) {
        return false;
      }

      // 5. Date Range
      const itemDate = item.completed_at || item.approved_at || item.requested_at;
      if (itemDate) {
        const itemDateStr = format(new Date(itemDate), 'yyyy-MM-dd');
        if (filters.start_date && itemDateStr < filters.start_date) return false;
        if (filters.end_date && itemDateStr > filters.end_date) return false;
      }

      return true;
    });
  }, [history, filters]);

  // Sorted Data Computation
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let valA, valB;

      if (sortField === 'requested_at') {
        valA = new Date(a.completed_at || a.approved_at || a.requested_at || 0).getTime();
        valB = new Date(b.completed_at || b.approved_at || b.requested_at || 0).getTime();
      } else if (sortField === 'project') {
        valA = a.projects?.name || '';
        valB = b.projects?.name || '';
      } else if (sortField === 'requester') {
        valA = a.profiles?.full_name || '';
        valB = b.profiles?.full_name || '';
      } else if (sortField === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDirection]);

  // Paginated Data Computation
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // PDF Export Handler
  const handleDownloadPDF = async (order) => {
    if (!order) return;
    const toastId = toast.loading('กำลังสร้างเอกสาร PDF ใบเบิกของ...');
    try {
      const itemsList = order.withdrawal_items || [];
      const docBlob = await pdf(
        <MaterialWithdrawalPDF order={order} items={itemsList} profile={profile} />
      ).toBlob();

      const url = URL.createObjectURL(docBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MaterialWithdrawal_${order.id?.slice(0, 8) || 'history'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('ดาวน์โหลดเอกสาร PDF ใบเบิกของสำเร็จ', { id: toastId });
    } catch (err) {
      console.error('PDF Download Error:', err);
      toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร PDF', { id: toastId });
    }
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header Section */}
      <HistoryHeader
        totalCount={history.length}
        loading={loading}
        onRefresh={fetchHistory}
      />

      {/* 2. KPI Summary Grid */}
      <HistoryKpiGrid historyData={history} />

      {/* 3. Filter Bar */}
      <HistoryFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        projectsList={projectsList}
        requestersList={requestersList}
      />

      {/* 4. Main Data Table / States */}
      {loading ? (
        <HistoryLoadingSkeleton />
      ) : error ? (
        <HistoryErrorState error={error} onRetry={fetchHistory} />
      ) : sortedData.length === 0 ? (
        <HistoryEmptyState onResetFilters={handleResetFilters} />
      ) : (
        <>
          <HistoryDataTable
            data={paginatedData}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            onViewDetails={setSelectedOrder}
            onDownloadPDF={handleDownloadPDF}
          />

          {/* 5. Pagination */}
          <HistoryPagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={sortedData.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </>
      )}

      {/* 6. Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg">
                  รายละเอียดบิลคำขอเบิกจ่าย #{selectedOrder?.id?.slice(0, 8)}
                </span>
              </div>
              {selectedOrder && (
                <StatusBadge
                  status={selectedOrder.status}
                  has_shortage={selectedOrder.has_shortage}
                  is_shortage_override={selectedOrder.is_shortage_override}
                />
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Meta Information Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted/40 p-4 rounded-xl border border-border/50">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <span className="text-muted-foreground block">โครงการ (Project):</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-300">
                    {selectedOrder?.projects?.project_code ? `[${selectedOrder.projects.project_code}] ` : ''}
                    {selectedOrder?.projects?.name || '—'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <span className="text-muted-foreground block">ผู้ขอเบิก (Requester):</span>
                  <span className="font-semibold text-foreground">{selectedOrder?.profiles?.full_name || '—'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <span className="text-muted-foreground block">สถานที่จัดส่ง:</span>
                  <span className="font-medium text-foreground">{selectedOrder?.delivery_address || '—'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <span className="text-muted-foreground block">วันที่อัพเดทล่าสุด:</span>
                  <span className="font-medium text-foreground">
                    {selectedOrder && format(new Date(selectedOrder.completed_at || selectedOrder.approved_at || selectedOrder.requested_at), 'dd/MM/yy HH:mm')}
                  </span>
                </div>
              </div>

              {selectedOrder?.purpose && (
                <div className="col-span-1 sm:col-span-2 pt-2 border-t border-border/40 flex items-start gap-2">
                  <Target className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-muted-foreground block">วัตถุประสงค์การใช้:</span>
                    <span className="font-medium text-foreground">{selectedOrder.purpose}</span>
                  </div>
                </div>
              )}

              {(selectedOrder?.is_shortage_override || selectedOrder?.override_reason) && (
                <div className="col-span-1 sm:col-span-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-3 rounded-lg text-amber-800 dark:text-amber-300">
                  <p className="font-bold flex items-center gap-1.5 text-xs">
                    หมายเหตุอนุมัติกรณีของไม่ครบ (Shortage Override):
                  </p>
                  <p className="mt-1 text-xs">{selectedOrder.override_reason || 'อนุมัติกรณีของไม่ครบตามการตัดสินใจของแอดมิน'}</p>
                </div>
              )}

              {selectedOrder?.reject_reason && (
                <div className="col-span-1 sm:col-span-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3 rounded-lg text-rose-800 dark:text-rose-300">
                  <p className="font-bold text-xs">เหตุผลที่ปฏิเสธ (Reject Reason):</p>
                  <p className="mt-1 text-xs">{selectedOrder.reject_reason}</p>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div>
              <h4 className="font-bold text-xs sm:text-sm mb-2 text-foreground flex items-center justify-between">
                <span>รายการวัสดุในบิล ({selectedOrder?.withdrawal_items?.length || 0} รายการ)</span>
              </h4>

              <div className="border border-border/60 rounded-xl overflow-hidden max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur z-10">
                    <TableRow className="text-xs">
                      <TableHead className="font-bold">ชื่อวัสดุ</TableHead>
                      <TableHead className="text-center font-bold">ขอเบิก</TableHead>
                      <TableHead className="text-center text-emerald-600 dark:text-emerald-400 font-bold">ตัดสต็อกจริง</TableHead>
                      <TableHead className="text-center text-amber-600 dark:text-amber-400 font-bold">ขาดส่ง (Shortage)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {selectedOrder?.withdrawal_items?.map((item, idx) => {
                      const isApprovedOrCompleted = selectedOrder.status === 'approved' || selectedOrder.status === 'completed';
                      const isPending = selectedOrder.status === 'pending';
                      const deducted = item.deducted_quantity !== undefined && item.deducted_quantity !== null
                        ? item.deducted_quantity
                        : (isApprovedOrCompleted ? item.quantity : 0);
                      const shortage = item.shortage_quantity !== undefined && item.shortage_quantity !== null ? item.shortage_quantity : 0;

                      return (
                        <TableRow key={idx} className="hover:bg-muted/20">
                          <TableCell className="font-medium text-foreground">
                            {item.items?.name || '—'}
                            {item.items?.sku && (
                              <span className="block text-[10px] text-muted-foreground font-mono">
                                SKU: {item.items.sku}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-semibold">
                            {item.quantity} {item.items?.unit || ''}
                          </TableCell>
                          <TableCell className="text-center">
                            {isPending ? (
                              <span className="text-muted-foreground italic font-normal">- (รออนุมัติ)</span>
                            ) : isApprovedOrCompleted ? (
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">{deducted} {item.items?.unit || ''}</span>
                            ) : (
                              <span className="text-muted-foreground italic font-normal">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-bold text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
                            {shortage > 0 ? `${shortage} ${item.items?.unit || ''}` : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Dialog Footer Actions */}
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDownloadPDF(selectedOrder)}
              className="text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900/60 hover:bg-purple-50 dark:hover:bg-purple-950/40 font-semibold cursor-pointer gap-1.5"
            >
              <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>พิมพ์/ดาวน์โหลด ใบเบิกของ (PDF)</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedOrder(null)}
              className="rounded-xl cursor-pointer"
            >
              ปิด
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default History;
