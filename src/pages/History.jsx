import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { History as HistoryIcon, Search, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

const History = () => {
  const { isAdmin, profile } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, [profile]);

  const fetchHistory = async () => {
    if (!profile) return;
    try {
      setLoading(true);
      let query = supabase
        .from('withdrawal_orders')
        .select(`
          *,
          projects(name, project_code),
          profiles!withdrawal_orders_requested_by_fkey(full_name),
          withdrawal_items(
            id,
            quantity,
            available_at_approval,
            deducted_quantity,
            shortage_quantity,
            items(name, unit)
          )
        `)
        .in('status', ['completed', 'rejected', 'approved'])
        .order('requested_at', { ascending: false })
        .limit(100);
        
      if (!isAdmin) {
        query = query.eq('requested_by', profile.id);
      }
      
      const { data, error } = await query;
      if (error && error.code !== '42P01') throw error;
      setHistory(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = history.filter(h => {
    const search = searchQuery.toLowerCase();
    const matchProject = h.projects?.name?.toLowerCase().includes(search);
    const matchItems = h.withdrawal_items?.some(i => i.items?.name?.toLowerCase().includes(search));
    return matchProject || matchItems;
  });

  const StatusBadge = ({ status, has_shortage, is_shortage_override }) => {
    switch(status) {
      case 'pending': 
        return <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-amber-500/20"><Clock className="w-3 h-3"/> รออนุมัติ</span>;
      case 'approved': 
        if (has_shortage || is_shortage_override) {
          return <span className="flex items-center gap-1 text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-500/30"><AlertTriangle className="w-3 h-3"/> อนุมัติแล้ว (ของไม่ครบ)</span>;
        }
        return <span className="flex items-center gap-1 text-blue-500 bg-blue-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-500/20"><CheckCircle2 className="w-3 h-3"/> อนุมัติแล้ว</span>;
      case 'completed': 
        if (has_shortage || is_shortage_override) {
          return <span className="flex items-center gap-1 text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-500/30"><AlertTriangle className="w-3 h-3"/> รับของแล้ว (มีค้างส่ง)</span>;
        }
        return <span className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-green-500/20"><CheckCircle2 className="w-3 h-3"/> รับของแล้ว</span>;
      case 'rejected': 
        return <span className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-red-500/20"><XCircle className="w-3 h-3"/> ไม่อนุมัติ</span>;
      default: 
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <HistoryIcon className="w-8 h-8 text-indigo-500" />
            ประวัติการเบิกจ่าย
          </h2>
          <p className="text-muted-foreground mt-2">ประวัติบิลการขอเบิกจ่ายที่อนุมัติหรือปฏิเสธแล้ว</p>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="ค้นหาโครงการ, วัสดุ..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>วันที่อัพเดทล่าสุด</TableHead>
              <TableHead>โครงการ</TableHead>
              <TableHead>รายการในบิล</TableHead>
              <TableHead>ผู้ขอเบิก</TableHead>
              <TableHead className="text-center">สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">กำลังโหลด...</TableCell></TableRow>
            ) : filteredHistory.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">ไม่มีข้อมูลประวัติ</TableCell></TableRow>
            ) : (
              filteredHistory.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {format(new Date(w.completed_at || w.approved_at || w.requested_at), 'dd/MM/yy HH:mm')}
                  </TableCell>
                  <TableCell className="font-medium text-xs">
                    {w.projects?.project_code ? `${w.projects.project_code} — ` : ''}{w.projects?.name}
                  </TableCell>
                  <TableCell className="text-xs">
                    {w.withdrawal_items && w.withdrawal_items.length > 0 ? (
                      <div className="space-y-1">
                        <div className="font-medium">{w.withdrawal_items[0].items?.name}</div>
                        <div className="text-xs text-muted-foreground">
                          ขอเบิก: {w.withdrawal_items[0].quantity} {w.withdrawal_items[0].items?.unit}
                          {(w.withdrawal_items[0].shortage_quantity > 0) && (
                            <span className="ml-2 text-amber-600 font-bold">(ขาดส่ง {w.withdrawal_items[0].shortage_quantity})</span>
                          )}
                        </div>
                        {w.withdrawal_items.length > 1 && (
                          <div className="text-xs text-primary bg-primary/10 inline-block px-1.5 py-0.5 rounded font-medium">
                            +{w.withdrawal_items.length - 1} รายการ
                          </div>
                        )}
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-xs">{w.profiles?.full_name}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={w.status} has_shortage={w.has_shortage} is_shortage_override={w.is_shortage_override} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelectedOrder(w)}>ดูรายละเอียด</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      
      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>รายละเอียดบิลคำขอเบิกจ่าย #{selectedOrder?.id?.slice(0, 8)}</span>
              {selectedOrder && <StatusBadge status={selectedOrder.status} has_shortage={selectedOrder.has_shortage} is_shortage_override={selectedOrder.is_shortage_override} />}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-2 gap-4 mb-6 text-xs bg-muted/30 p-3 rounded-lg">
              <div>
                <span className="text-muted-foreground">โครงการ:</span>{' '}
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                  {selectedOrder?.projects?.project_code ? `${selectedOrder.projects.project_code} — ` : ''}{selectedOrder?.projects?.name}
                </span>
              </div>
              <div><span className="text-muted-foreground">ผู้ขอเบิก:</span> <span className="font-semibold">{selectedOrder?.profiles?.full_name}</span></div>
              <div><span className="text-muted-foreground">สถานที่จัดส่ง:</span> <span className="font-semibold">{selectedOrder?.delivery_address || '—'}</span></div>
              <div><span className="text-muted-foreground">วันที่อัพเดทล่าสุด:</span> <span className="font-semibold">{selectedOrder && format(new Date(selectedOrder.completed_at || selectedOrder.approved_at || selectedOrder.requested_at), 'dd/MM/yy HH:mm')}</span></div>
              
              {selectedOrder?.purpose && <div className="col-span-2"><span className="text-muted-foreground">วัตถุประสงค์:</span> <span className="font-semibold">{selectedOrder.purpose}</span></div>}
              
              {(selectedOrder?.is_shortage_override || selectedOrder?.override_reason) && (
                <div className="col-span-2 bg-amber-50 border border-amber-200 p-2 rounded text-amber-800">
                  <p className="font-bold">หมายเหตุอนุมัติกรณีของไม่ครบ (Shortage Override):</p>
                  <p className="mt-0.5">{selectedOrder.override_reason || 'อนุมัติกรณีของไม่ครบตามการตัดสินใจของแอดมิน'}</p>
                </div>
              )}
              {selectedOrder?.reject_reason && (
                <div className="col-span-2 bg-red-50 border border-red-200 p-2 rounded text-red-700">
                  <p className="font-bold">เหตุผลที่ปฏิเสธ:</p>
                  <p>{selectedOrder.reject_reason}</p>
                </div>
              )}
            </div>
            
            <h4 className="font-semibold text-sm mb-2">รายการวัสดุ ({selectedOrder?.withdrawal_items?.length} รายการ)</h4>
            <div className="border rounded-md max-h-[50vh] overflow-y-auto relative">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="text-xs">
                    <TableHead>ชื่อวัสดุ</TableHead>
                    <TableHead className="text-center">ขอเบิก</TableHead>
                    <TableHead className="text-center text-emerald-600 font-bold">ตัดสต็อกจริง</TableHead>
                    <TableHead className="text-center text-amber-600 font-bold">ขาดส่ง (Shortage)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {selectedOrder?.withdrawal_items?.map((item, idx) => {
                    const deducted = item.deducted_quantity !== undefined ? item.deducted_quantity : (selectedOrder.status === 'approved' || selectedOrder.status === 'completed' ? item.quantity : 0);
                    const shortage = item.shortage_quantity !== undefined ? item.shortage_quantity : 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.items?.name}</TableCell>
                        <TableCell className="text-center font-semibold">{item.quantity} {item.items?.unit}</TableCell>
                        <TableCell className="text-center font-bold text-emerald-600">{deducted} {item.items?.unit}</TableCell>
                        <TableCell className="text-center font-bold text-amber-600 bg-amber-50/50 dark:bg-amber-950/20">{shortage > 0 ? `${shortage} ${item.items?.unit}` : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>ปิด</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default History;
