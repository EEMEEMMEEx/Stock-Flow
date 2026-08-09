import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowUpFromLine, CheckCircle2, XCircle, Clock, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import PosTerminal from '@/components/ui/PosTerminal';
import { dispatchWithdrawalNotification } from '@/lib/notificationDispatcher';

const Withdrawals = () => {
  const { isAdmin, can, profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // POS Mode State
  const [isPosMode, setIsPosMode] = useState(false);
  
  // Data for POS & Form
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [rawBalances, setRawBalances] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  
  // Checkout State
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [checkoutCart, setCheckoutCart] = useState([]);
  const [checkoutResetFn, setCheckoutResetFn] = useState(() => () => {});
  const [formData, setFormData] = useState({ project_id: '', purpose: '', delivery_address: '' });
  
  // Details Dialog
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);

  // Shortage Warning & Override Modal State
  const [isShortageModalOpen, setIsShortageModalOpen] = useState(false);
  const [shortageData, setShortageData] = useState(null);
  const [shortageOverrideReason, setShortageOverrideReason] = useState('');

  // Reject Dialog State
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [orderToReject, setOrderToReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchData();
  }, [profile]);

  const mapItemsForProject = (allItems, allBalances, projectId) => {
    if (!allItems) return [];
    return allItems.map(item => {
      const bRecord = (allBalances || []).find(
        b => b.project_id === projectId && b.item_id === item.id
      );
      const projectBalance = bRecord ? (Number(bRecord.balance) || 0) : 0;
      return {
        ...item,
        balance: projectBalance
      };
    });
  };

  const handleProjectChange = (projectId) => {
    setSelectedProjectId(projectId);
    setFormData(prev => ({ ...prev, project_id: projectId }));
    const updatedItems = mapItemsForProject(rawItems, rawBalances, projectId);
    setItems(updatedItems);
  };

  const fetchData = async () => {
    if (!profile) return;
    try {
      setLoading(true);
      // Fetch withdrawal orders
      let query = supabase
        .from('withdrawal_orders')
        .select('*, projects(name, project_code), profiles!withdrawal_orders_requested_by_fkey(full_name)')
        .order('requested_at', { ascending: false });
        
      if (!isAdmin) {
        query = query.eq('requested_by', profile.id);
      }
      
      const { data: wData, error: wError } = await query;
      if (wError && wError.code !== '42P01') throw wError;
      setOrders(wData || []);

      // Fetch projects, items, categories, and stock_balance
      const { data: pData } = await supabase
        .from('projects')
        .select('id, name, project_code')
        .eq('status', 'active')
        .order('name');
      const { data: iData } = await supabase.from('items').select('id, name, unit, sku, image_url, category_id');
      const { data: cData } = await supabase.from('categories').select('*');
      const { data: bData } = await supabase.from('stock_balance').select('*');
      
      setProjects(pData || []);
      setCategories(cData || []);
      setRawItems(iData || []);
      setRawBalances(bData || []);

      const targetProjectId = selectedProjectId || (pData && pData.length > 0 ? pData[0].id : '');
      if (targetProjectId && !selectedProjectId) {
        setSelectedProjectId(targetProjectId);
      }

      // Combine project-specific stock balance with items
      if (iData) {
        const mappedItems = mapItemsForProject(iData, bData, targetProjectId);
        setItems(mappedItems);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCheckout = (cart, resetCart) => {
    setCheckoutCart(cart);
    setCheckoutResetFn(() => resetCart);
    setFormData(prev => ({ 
      ...prev, 
      project_id: selectedProjectId,
      purpose: prev.purpose || '',
      delivery_address: prev.delivery_address || ''
    }));
    setIsCheckoutDialogOpen(true);
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (checkoutCart.length === 0) return;
    const targetProject = formData.project_id || selectedProjectId;
    if (!targetProject) {
      toast.error('กรุณาเลือกโครงการปลายทางที่จะนำไปใช้');
      return;
    }
    
    try {
      // 1. Create request with status = 'pending' (DO NOT deduct stock here)
      const { data: orderData, error: orderError } = await supabase
        .from('withdrawal_orders')
        .insert([{
          project_id: targetProject,
          purpose: formData.purpose,
          delivery_address: formData.delivery_address,
          requested_by: profile.id,
          status: 'pending'
        }])
        .select()
        .single();
        
      if (orderError) throw orderError;
      
      // 2. Insert items
      const itemsToInsert = checkoutCart.map(item => ({
        order_id: orderData.id,
        item_id: item.id,
        quantity: item.quantity,
        delivery_to: item.delivery_to || null,
        serial_number: item.serial_number || null,
        part_number: item.part_number || null
      }));
      
      const { error: itemsError } = await supabase.from('withdrawal_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;
      
      toast.success('สร้างบิลคำขอเบิกจ่ายสำเร็จ (สถานะ: รออนุมัติ)');

      // Dispatch background transactional notification email to approvers (ADMIN / SUPERVISOR)
      dispatchWithdrawalNotification({
        eventType: 'withdrawal_submitted',
        orderId: orderData.id,
        orderData: {
          ...orderData,
          projects: projects.find(p => p.id === targetProject),
          profiles: profile
        }
      }).catch(err => console.warn('[Notification Dispatch Warning]:', err));

      checkoutResetFn();
      setIsCheckoutDialogOpen(false);
      setIsPosMode(false);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error('เกิดข้อผิดพลาดในการสร้างคำขอ');
    }
  };

  // Atomic Approve via Supabase RPC with Shortage Override support
  const handleApproveOrder = async (orderId, allowShortage = false, overrideReason = '') => {
    if (!isAdmin || isProcessing) return;
    setIsProcessing(true);
    const toastId = toast.loading('กำลังอนุมัติบิลและตัดสต็อกแบบ Atomic...');
    try {
      const { data, error } = await supabase.rpc('approve_inventory_request', {
        p_request_id: orderId,
        p_allow_shortage: allowShortage,
        p_override_reason: overrideReason || null
      });
      if (error) throw error;

      toast.success(data?.message || 'อนุมัติคำขอเบิกจ่ายสำเร็จ', { id: toastId });

      // Dispatch background transactional notification email to STAFF requester
      dispatchWithdrawalNotification({
        eventType: 'withdrawal_approved',
        orderId: orderId,
        approverName: profile?.full_name || 'ผู้ดูแลระบบ (Admin)',
        overrideReason: overrideReason
      }).catch(err => console.warn('[Notification Dispatch Warning]:', err));

      setIsShortageModalOpen(false);
      setShortageData(null);
      setShortageOverrideReason('');
      fetchData();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({ 
          ...prev, 
          status: 'approved', 
          has_shortage: data?.has_shortage,
          is_shortage_override: allowShortage,
          override_reason: overrideReason
        }));
      }
    } catch (error) {
      console.error('Approve Error:', error);
      const rawMsg = error.message || '';

      if (rawMsg.includes('SHORTAGE_DETECTED')) {
        toast.dismiss(toastId);
        try {
          const jsonStr = rawMsg.replace(/.*SHORTAGE_DETECTED:\s*/, '');
          const parsed = JSON.parse(jsonStr);
          setShortageData({
            orderId: orderId,
            shortages: parsed.shortages || []
          });
          setShortageOverrideReason('');
          setIsShortageModalOpen(true);
        } catch (parseErr) {
          toast.error('จำนวนวัสดุในโครงการไม่เพียงพอสำหรับอนุมัติ');
        }
      } else {
        let cleanErrMsg = rawMsg.replace(/.*(?:EXCEPTION|Error|P0001):\s*/i, '') || 'เกิดข้อผิดพลาดในการอนุมัติบิล';
        if (cleanErrMsg.includes('Insufficient stock for this project')) {
          cleanErrMsg = cleanErrMsg.replace(
            /Insufficient stock for this project:\s*Available\s*(\d+),\s*Requested\s*(\d+)/i,
            'จำนวนวัสดุในโครงการนี้ไม่เพียงพอ: คงเหลือ $1 ชิ้น, ขอเบิก $2 ชิ้น'
          );
        }
        toast.error(cleanErrMsg, { id: toastId, duration: 6000 });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Open Reject Modal
  const openRejectModal = (order) => {
    setOrderToReject(order);
    setRejectReason('');
    setIsRejectDialogOpen(true);
  };

  // Reject Order via Supabase RPC
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin || !orderToReject || isProcessing) return;
    if (!rejectReason.trim()) {
      toast.error('กรุณาระบุเหตุผลการปฏิเสธ');
      return;
    }
    
    setIsProcessing(true);
    const toastId = toast.loading('กำลังปฏิเสธคำขอ...');
    try {
      const { data, error } = await supabase.rpc('reject_inventory_request', {
        p_request_id: orderToReject.id,
        p_reject_reason: rejectReason.trim()
      });
      if (error) throw error;

      toast.success('ปฏิเสธคำขอเรียบร้อยแล้ว', { id: toastId });

      // Dispatch background transactional notification email to STAFF requester
      dispatchWithdrawalNotification({
        eventType: 'withdrawal_rejected',
        orderId: orderToReject.id,
        rejectionReason: rejectReason.trim()
      }).catch(err => console.warn('[Notification Dispatch Warning]:', err));

      setIsRejectDialogOpen(false);
      setOrderToReject(null);
      setRejectReason('');
      fetchData();
      if (selectedOrder?.id === orderToReject.id) {
        setSelectedOrder(prev => ({ ...prev, status: 'rejected', reject_reason: rejectReason.trim() }));
      }
    } catch (error) {
      console.error('Reject Error:', error);
      const cleanErrMsg = error.message
        ? error.message.replace(/.*(?:EXCEPTION|Error|P0001):\s*/i, '')
        : 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ';
      toast.error(cleanErrMsg, { id: toastId, duration: 6000 });
    } finally {
      setIsProcessing(false);
    }
  };

  // Complete Order via Supabase RPC
  const handleCompleteOrder = async (orderId) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const toastId = toast.loading('กำลังยืนยันการรับของ...');
    try {
      const { data, error } = await supabase.rpc('complete_inventory_request', {
        p_request_id: orderId
      });
      if (error) throw error;

      toast.success('ยืนยันการรับของสำเร็จ (สถานะ: รับของแล้ว)', { id: toastId });
      fetchData();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: 'completed' }));
      }
    } catch (error) {
      console.error('Complete Error:', error);
      const cleanErrMsg = error.message
        ? error.message.replace(/.*(?:EXCEPTION|Error|P0001):\s*/i, '')
        : 'เกิดข้อผิดพลาดในการยืนยันการรับของ';
      toast.error(cleanErrMsg, { id: toastId, duration: 6000 });
    } finally {
      setIsProcessing(false);
    }
  };

  const viewOrderDetails = async (order) => {
    try {
      const { data, error } = await supabase
        .from('withdrawal_items')
        .select('*, items(name, unit)')
        .eq('order_id', order.id);
      if (error) throw error;
      setOrderDetails(data || []);
      setSelectedOrder(order);
    } catch (error) {
      toast.error('ไม่สามารถโหลดรายละเอียดบิลได้');
    }
  };

  const StatusBadge = ({ status, has_shortage, is_shortage_override }) => {
    switch(status) {
      case 'pending': return <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-amber-500/20"><Clock className="w-3 h-3"/> รออนุมัติ</span>;
      case 'approved': 
        if (has_shortage || is_shortage_override) {
          return <span className="flex items-center gap-1 text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-500/30"><AlertTriangle className="w-3 h-3"/> อนุมัติแล้ว (ของไม่ครบ)</span>;
        }
        return <span className="flex items-center gap-1 text-blue-500 bg-blue-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-500/20"><CheckCircle2 className="w-3 h-3"/> อนุมัติแล้ว</span>;
      case 'completed': return <span className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-green-500/20"><CheckCircle2 className="w-3 h-3"/> รับของแล้ว</span>;
      case 'rejected': return <span className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-red-500/20"><XCircle className="w-3 h-3"/> ไม่อนุมัติ</span>;
      default: return null;
    }
  };

  if (isPosMode) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border shadow-sm">
          <Button variant="ghost" onClick={() => setIsPosMode(false)} className="-ml-2">
            <ChevronLeft className="w-4 h-4 mr-1" /> กลับไปหน้าประวัติเบิกจ่าย
          </Button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              โครงการเบิกสินค้า (Target Project) <span className="text-destructive">*</span>
            </label>
            <select
              className="flex h-9 w-full sm:w-72 rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.project_code ? `${p.project_code} — ` : ''}{p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <PosTerminal 
          title="สร้างคำขอเบิกจ่าย (POS)"
          icon={ArrowUpFromLine}
          items={items}
          categories={categories}
          onSubmit={handleOpenCheckout}
          allowDeliveryDetails={true}
        />
        
        {/* Checkout Dialog */}
        <Dialog open={isCheckoutDialogOpen} onOpenChange={setIsCheckoutDialogOpen}>
          <DialogContent>
            <form onSubmit={handleSubmitOrder}>
              <DialogHeader>
                <DialogTitle>ยืนยันการขอเบิกจ่าย ({checkoutCart.reduce((acc, i) => acc + i.quantity, 0)} ชิ้น)</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">นำไปใช้โครงการ (Target Project) <span className="text-destructive">*</span></label>
                  <select required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium" value={formData.project_id} onChange={e => setFormData({...formData, project_id: e.target.value})}>
                    <option value="" disabled>-- เลือกโครงการ --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_code ? `${p.project_code} — ` : ''}{p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">วัตถุประสงค์การเบิก</label>
                  <Input value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} placeholder="เช่น ใช้สำหรับซ่อมบำรุงอาคาร A" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">สถานที่จัดส่ง (Delivery Address)</label>
                  <Input value={formData.delivery_address} onChange={e => setFormData({...formData, delivery_address: e.target.value})} placeholder="กรอกชื่อผู้รับ หรือสถานที่จัดส่งแบบละเอียด (ถ้ามี)" />
                </div>
                
                <div className="mt-4 border rounded-md p-3 bg-muted/50 max-h-[200px] overflow-y-auto">
                  <h4 className="text-sm font-semibold mb-2">รายการที่เลือก:</h4>
                  <ul className="space-y-1">
                    {checkoutCart.map(item => (
                      <li key={item.id} className="text-sm flex justify-between">
                        <span>{item.name}</span>
                        <span className="font-medium">{item.quantity} {item.unit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={() => setIsCheckoutDialogOpen(false)}>ยกเลิก</Button>
                <Button type="submit">ส่งคำขอบิลเบิกจ่าย</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ArrowUpFromLine className="w-8 h-8 text-primary" />
            การเบิกจ่าย (Withdrawals)
          </h2>
          <p className="text-muted-foreground mt-2">
            จัดการรายการเบิกจ่ายวัสดุและอุปกรณ์ออกจากคลัง
          </p>
        </div>
        
        <Button onClick={() => setIsPosMode(true)} className="shadow-lg shadow-primary/20">
          + สร้างคำขอเบิกจ่าย (POS)
        </Button>
      </div>

      {/* Orders Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>วันที่ขอเบิก</TableHead>
              <TableHead>โครงการ</TableHead>
              <TableHead>ผู้ขอเบิก</TableHead>
              <TableHead>วัตถุประสงค์</TableHead>
              <TableHead className="text-center">สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  กำลังโหลดข้อมูล...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  ไม่พบรายการเบิกจ่าย
                </TableCell>
              </TableRow>
            ) : (
              orders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium text-xs">
                    {order.requested_at ? format(new Date(order.requested_at), 'dd/MM/yyyy HH:mm') : '-'}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-xs">
                      {order.projects?.project_code ? `${order.projects.project_code} — ` : ''}{order.projects?.name || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{order.profiles?.full_name || 'ผู้ใช้งาน'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{order.purpose || '-'}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={order.status} has_shortage={order.has_shortage || order.is_shortage_override} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => viewOrderDetails(order)}>
                        ดูรายละเอียด
                      </Button>
                      
                      {isAdmin && order.status === 'pending' && (
                        <>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproveOrder(order.id)}>
                            อนุมัติ
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => openRejectModal(order)}>
                            ปฏิเสธ
                          </Button>
                        </>
                      )}
                      
                      {order.status === 'approved' && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleCompleteOrder(order.id)}>
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

      {/* View Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>รายละเอียดคำขอเบิกจ่าย #{selectedOrder?.id?.slice(0, 8)}</span>
              {selectedOrder && <StatusBadge status={selectedOrder.status} has_shortage={selectedOrder.has_shortage || selectedOrder.is_shortage_override} />}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-xs bg-muted/30 p-3 rounded-lg">
                <div>
                  <p className="text-muted-foreground">โครงการปลายทาง:</p>
                  <p className="font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {selectedOrder.projects?.project_code ? `${selectedOrder.projects.project_code} — ` : ''}{selectedOrder.projects?.name}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">ผู้ขอเบิก:</p>
                  <p className="font-semibold mt-0.5">{selectedOrder.profiles?.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">วันที่ขอเบิก:</p>
                  <p className="font-semibold mt-0.5">{format(new Date(selectedOrder.requested_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">วัตถุประสงค์:</p>
                  <p className="font-semibold mt-0.5">{selectedOrder.purpose || '-'}</p>
                </div>
                {selectedOrder.delivery_address && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">สถานที่จัดส่ง:</p>
                    <p className="font-semibold mt-0.5">{selectedOrder.delivery_address}</p>
                  </div>
                )}
                {(selectedOrder.is_shortage_override || selectedOrder.override_reason) && (
                  <div className="col-span-2 bg-amber-50 border border-amber-200 p-2 rounded text-amber-800">
                    <p className="font-bold">หมายเหตุอนุมัติกรณีของไม่ครบ (Shortage Override):</p>
                    <p className="mt-0.5">{selectedOrder.override_reason || 'อนุมัติกรณีของไม่ครบตามการตัดสินใจของแอดมิน'}</p>
                  </div>
                )}
                {selectedOrder.reject_reason && (
                  <div className="col-span-2 bg-red-50 border border-red-200 p-2 rounded text-red-700">
                    <p className="font-bold">เหตุผลที่ปฏิเสธ:</p>
                    <p>{selectedOrder.reject_reason}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold mb-2">รายการวัสดุที่ขอเบิก:</h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="text-xs">
                        <TableHead>ชื่อวัสดุ</TableHead>
                        <TableHead className="text-center">ขอเบิก</TableHead>
                        <TableHead className="text-center">ตัดสต็อกจริง</TableHead>
                        <TableHead className="text-center text-amber-600">ขาดส่ง (Shortage)</TableHead>
                        <TableHead>สถานที่ส่ง</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {orderDetails.map(item => {
                        const deducted = item.deducted_quantity !== undefined ? item.deducted_quantity : (selectedOrder.status === 'approved' || selectedOrder.status === 'completed' ? item.quantity : 0);
                        const shortage = item.shortage_quantity !== undefined ? item.shortage_quantity : 0;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-semibold">{item.items?.name}</TableCell>
                            <TableCell className="text-center font-bold">{item.quantity} {item.items?.unit}</TableCell>
                            <TableCell className="text-center font-bold text-emerald-600">{deducted} {item.items?.unit}</TableCell>
                            <TableCell className="text-center font-bold text-amber-600">{shortage > 0 ? `${shortage} ${item.items?.unit}` : '-'}</TableCell>
                            <TableCell>{item.delivery_to || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {isAdmin && selectedOrder.status === 'pending' && (
                  <>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproveOrder(selectedOrder.id)}>
                      อนุมัติบิลนี้
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => openRejectModal(selectedOrder)}>
                      ปฏิเสธบิลนี้
                    </Button>
                  </>
                )}
                {selectedOrder.status === 'approved' && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleCompleteOrder(selectedOrder.id)}>
                    ยืนยันรับของเสร็จสิ้น
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Shortage Warning & Override Dialog */}
      <Dialog open={isShortageModalOpen} onOpenChange={setIsShortageModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              อนุมัติคำขอเบิกจ่ายกรณีของไม่ครบ (Shortage Override)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-3 rounded-lg text-xs leading-relaxed">
              <p className="font-bold">⚠️ พบรายการวัสดุในคลังโครงการไม่เพียงพอสำหรับคำขอนี้</p>
              <p className="mt-1">
                หากยืนยันอนุมัติ ระบบจะทำการตัดสต็อกตามจำนวนที่มีอยู่จริง (`MIN(มีอยู่, ขอเบิก)`) และบันทึกยอดขาดส่ง 
                โดย **ยอดสต็อกคงเหลือจะอยู่ที่ 0 ชิ้น และไม่ติดลบ**
              </p>
            </div>

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="text-xs">
                    <TableHead>รายการวัสดุ</TableHead>
                    <TableHead className="text-center">ขอเบิก</TableHead>
                    <TableHead className="text-center">มีในคลัง</TableHead>
                    <TableHead className="text-center text-emerald-600 font-bold">จะตัดสต็อก</TableHead>
                    <TableHead className="text-center text-amber-600 font-bold">ขาดส่ง</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {shortageData?.shortages?.map(item => (
                    <TableRow key={item.request_item_id || item.item_id}>
                      <TableCell className="font-semibold">{item.item_name}</TableCell>
                      <TableCell className="text-center">{item.requested} {item.unit}</TableCell>
                      <TableCell className="text-center">{item.available} {item.unit}</TableCell>
                      <TableCell className="text-center font-bold text-emerald-600">{item.deducted} {item.unit}</TableCell>
                      <TableCell className="text-center font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20">{item.shortage} {item.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                ระบุเหตุผลการอนุมัติกรณีของไม่ครบ (Override Reason)
              </label>
              <Input 
                placeholder="เช่น เบิกของที่มีอยู่ในคลังไปใช้งานก่อน ส่วนที่เหลือจะรับเข้าเพิ่มในภายหลัง"
                value={shortageOverrideReason}
                onChange={e => setShortageOverrideReason(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setIsShortageModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button 
              type="button" 
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              onClick={() => handleApproveOrder(shortageData.orderId, true, shortageOverrideReason)}
            >
              ยืนยันอนุมัติกรณีของไม่ครบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleRejectSubmit}>
            <DialogHeader>
              <DialogTitle className="text-red-600">ปฏิเสธคำขอเบิกจ่าย</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <label className="text-sm font-medium">ระบุเหตุผลในการปฏิเสธ <span className="text-destructive">*</span></label>
              <textarea 
                required
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="เช่น สินค้าในคลังโครงการไม่เพียงพอ หรือข้อมูลไม่ถูกต้อง..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsRejectDialogOpen(false)}>ยกเลิก</Button>
              <Button type="submit" variant="destructive">ยืนยันปฏิเสธ</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Withdrawals;
