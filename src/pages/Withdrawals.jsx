import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Zap, ClipboardList } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { MaterialWithdrawalPDF } from '@/lib/pdf-templates';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import toast from 'react-hot-toast';
import { dispatchWithdrawalNotification } from '@/lib/notificationDispatcher';

// Modular Withdrawal Subcomponents
import WithdrawalPosTerminal from '@/components/withdrawals/WithdrawalPosTerminal';
import WithdrawalOrdersList from '@/components/withdrawals/WithdrawalOrdersList';
import WithdrawalDetailModal from '@/components/withdrawals/WithdrawalDetailModal';
import WithdrawalShortageModal from '@/components/withdrawals/WithdrawalShortageModal';
import WithdrawalRejectModal from '@/components/withdrawals/WithdrawalRejectModal';

const Withdrawals = () => {
  const { isAdmin, can, profile } = useAuth();
  const { t } = useTranslation();
  
  const canCreate = can('withdrawals.create');
  const canApprove = can('withdrawals.approve');
  const canReject = can('withdrawals.reject');
  const canComplete = can('withdrawals.complete');

  // Navigation Tab: 'pos' (Terminal) | 'orders' (Requisition Tracking)
  const [activeTab, setActiveTab] = useState(() => (canCreate ? 'pos' : 'orders'));

  // Core Data States
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Master Data & Stock Balances
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [rawBalances, setRawBalances] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('all');

  // Unified Cart State
  const [cart, setCart] = useState([]);

  // Details Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Shortage Warning & Override Modal State
  const [isShortageModalOpen, setIsShortageModalOpen] = useState(false);
  const [shortageData, setShortageData] = useState(null);
  const [shortageOverrideReason, setShortageOverrideReason] = useState('');

  // Reject Modal State
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [orderToReject, setOrderToReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Aggregate item balances based on selected project location
  const mapItemsForProject = (allItems, allBalances, projectId) => {
    if (!allItems) return [];
    return allItems.map(item => {
      // Total across all locations
      const totalSystemBalance = (allBalances || [])
        .filter(b => b.item_id === item.id)
        .reduce((sum, b) => sum + (Number(b.balance) || 0), 0);

      // Specific location
      if (projectId && projectId !== 'all') {
        const bRecord = (allBalances || []).find(
          b => b.project_id === projectId && b.item_id === item.id
        );
        const projectBalance = bRecord ? (Number(bRecord.balance) || 0) : 0;
        return {
          ...item,
          balance: projectBalance,
          totalSystemBalance
        };
      }

      // Default 'all': total balance
      return {
        ...item,
        balance: totalSystemBalance,
        totalSystemBalance
      };
    });
  };

  const handleProjectChange = (projectId) => {
    setSelectedProjectId(projectId);
    const updatedItems = mapItemsForProject(rawItems, rawBalances, projectId);
    setItems(updatedItems);

    // Re-verify cart quantities against new warehouse balance
    if (projectId && projectId !== 'all') {
      setCart(prev => prev.map(cItem => {
        const matching = updatedItems.find(i => i.id === cItem.id);
        const avail = matching?.balance !== undefined ? matching.balance : Infinity;
        let newQ = cItem.quantity;
        if (newQ > avail && avail > 0) newQ = avail;
        return {
          ...cItem,
          balance: avail,
          quantity: newQ,
          quantityInput: String(newQ)
        };
      }));
    }
  };

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      // 1. Fetch withdrawal orders
      let ordersQuery = supabase
        .from('withdrawal_orders')
        .select(`
          *,
          projects (*),
          profiles:requested_by (*),
          withdrawal_items (
            *,
            items (*)
          )
        `)
        .order('requested_at', { ascending: false });

      if (!isAdmin) {
        ordersQuery = ordersQuery.eq('requested_by', profile.id);
      }

      // Parallelize fetching orders, active projects, items, categories, and stock balances
      const [wRes, pRes, iRes, cRes, bRes] = await Promise.all([
        ordersQuery,
        supabase
          .from('projects')
          .select('id, name, project_code, location, description')
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('items')
          .select('id, name, unit, sku, image_url, category_id, model'),
        supabase
          .from('categories')
          .select('id, name, description')
          .order('name'),
        supabase
          .from('stock_balance')
          .select('project_id, item_id, item_name, unit, project_name, balance')
      ]);

      const wData = wRes.data;
      const wError = wRes.error;
      if (wError && wError.code !== '42P01') throw wError;
      setOrders(wData || []);

      const pData = pRes.data;
      const iData = iRes.data;
      const cData = cRes.data;
      const bData = bRes.data;

      const activeProjects = pData || [];
      const activeProjectIds = new Set(activeProjects.map(p => p.id));
      const activeBalances = (bData || []).filter(b => activeProjectIds.has(b.project_id));

      setProjects(activeProjects);
      setCategories(cData || []);
      setRawItems(iData || []);
      setRawBalances(activeBalances);

      const targetProjectId = selectedProjectId || 'all';
      if (iData) {
        const mappedItems = mapItemsForProject(iData, activeBalances, targetProjectId);
        setItems(mappedItems);
      }
    } catch (error) {
      console.error('FetchData Error:', error);
      toast.error(t('withdrawals.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, selectedProjectId]);

  useEffect(() => {
    fetchData();

    // Live Realtime synchronization on projects and orders
    const channel = supabase
      .channel('withdrawals-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_orders' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transactions' }, () => {
        fetchData();
      })
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  // Cart Operations
  const handleAddToCart = (item) => {
    const availableStock = item.balance !== undefined ? item.balance : Infinity;
    const totalSys = item.totalSystemBalance !== undefined ? item.totalSystemBalance : availableStock;

    if (availableStock <= 0) {
      if (totalSys > 0) {
        toast.error(
          t('withdrawals.noStockInLocation', {
            count: totalSys,
            unit: item.unit || t('common.defaultUnit', 'ชิ้น')
          }, `This item has no stock in selected location, but has ${totalSys} ${item.unit || 'ชิ้น'} across other locations.\nPlease select another location or project.`)
        );
      } else {
        toast.error(t('common.outOfStock', 'This item is out of stock'));
      }
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        if (existing.quantity >= availableStock) {
          toast.error(
            t('withdrawals.cannotExceedStock', {
              available: availableStock,
              unit: item.unit || t('common.defaultUnit', 'ชิ้น')
            }, `Cannot request more than available stock in this location (${availableStock} ${item.unit || 'ชิ้น'})`)
          );
          return prev;
        }
        const newQ = existing.quantity + 1;
        return prev.map(i => i.id === item.id ? { ...i, quantity: newQ, quantityInput: String(newQ) } : i);
      }
      return [
        ...prev,
        {
          ...item,
          quantity: 1,
          quantityInput: '1',
          delivery_to: '',
          serial_number: '',
          part_number: ''
        }
      ];
    });
  };

  const handleUpdateQuantity = (id, delta) => {
    setCart(prev => prev.reduce((acc, item) => {
      if (item.id === id) {
        const availableStock = item.balance !== undefined ? item.balance : Infinity;
        const currentQ = typeof item.quantity === 'number' && !isNaN(item.quantity)
          ? item.quantity
          : (parseInt(item.quantityInput, 10) || 1);
        let newQ = currentQ + delta;

        if (newQ <= 0) {
          // Remove if reduced below 1
          return acc;
        }

        if (newQ > availableStock) {
          toast.error(
            t('withdrawals.maxQtyLimited', {
              available: availableStock,
              unit: item.unit || t('common.defaultUnit', 'ชิ้น')
            }, `Maximum quantity limited to available stock (${availableStock} ${item.unit || 'ชิ้น'})`)
          );
          newQ = availableStock;
        }

        acc.push({ ...item, quantity: newQ, quantityInput: String(newQ) });
      } else {
        acc.push(item);
      }
      return acc;
    }, []));
  };

  const handleDirectQuantityChange = (id, val) => {
    const cleanVal = val.replace(/\D/g, '');
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const availableStock = item.balance !== undefined ? item.balance : Infinity;

        if (cleanVal === '') {
          return { ...item, quantityInput: '', quantity: 1 };
        }

        let num = parseInt(cleanVal, 10);
        if (isNaN(num) || num < 1) num = 1;

        if (num > availableStock) {
          toast.error(
            t('withdrawals.maxQtyLimited', {
              available: availableStock,
              unit: item.unit || t('common.defaultUnit', 'ชิ้น')
            }, `Maximum quantity limited to available stock (${availableStock} ${item.unit || 'ชิ้น'})`)
          );
          num = availableStock;
        }

        return { ...item, quantityInput: String(num), quantity: num };
      }
      return item;
    }));
  };

  const handleQuantityBlur = (id) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const availableStock = item.balance !== undefined ? item.balance : Infinity;
        let num = typeof item.quantity === 'number' && !isNaN(item.quantity)
          ? item.quantity
          : parseInt(item.quantityInput, 10);

        if (isNaN(num) || num < 1) num = 1;
        if (num > availableStock) num = availableStock;

        return { ...item, quantityInput: String(num), quantity: num };
      }
      return item;
    }));
  };

  const handleRemoveFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleUpdateItemDetails = (id, field, value) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // Submit Requisition Order
  const handleSubmitOrder = async ({ projectId, purpose, deliveryAddress }) => {
    if (cart.length === 0) return;

    if (!projectId || projectId === 'all') {
      toast.error(t('withdrawals.toasts.selectLocation'));
      return;
    }

    try {
      setIsSubmitting(true);
      const toastId = toast.loading(t('withdrawals.toasts.submitting'));

      // 1. Create order with status = 'pending'
      const { data: orderData, error: orderError } = await supabase
        .from('withdrawal_orders')
        .insert([{
          project_id: projectId,
          purpose: purpose || null,
          delivery_address: deliveryAddress || null,
          requested_by: profile.id,
          status: 'pending'
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Insert line items
      const itemsToInsert = cart.map(item => ({
        order_id: orderData.id,
        item_id: item.id,
        quantity: item.quantity,
        delivery_to: item.delivery_to || deliveryAddress || null,
        serial_number: item.serial_number || null,
        part_number: item.part_number || null
      }));

      const { error: itemsError } = await supabase.from('withdrawal_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      toast.success(t('withdrawals.toasts.submitted'), { id: toastId });

      // 3. Dispatch transactional notification email
      dispatchWithdrawalNotification({
        eventType: 'withdrawal_submitted',
        orderId: orderData.id,
        orderData: {
          ...orderData,
          projects: projects.find(p => p.id === projectId),
          profiles: profile
        }
      }).catch(err => console.warn('[Notification Dispatch Warning]:', err));

      // Reset cart and switch to tracking tab
      setCart([]);
      fetchData();
      setActiveTab('orders');
    } catch (error) {
      console.error('Submit Requisition Error:', error);
      toast.error(t('withdrawals.toasts.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Atomic Approve via Supabase RPC with Shortage Override support
  const handleApproveOrder = async (orderId, allowShortage = false, overrideReason = '') => {
    if (!canApprove || isProcessing) return;
    setIsProcessing(true);
    const toastId = toast.loading(t('withdrawals.toasts.approving'));
    try {
      const { data, error } = await supabase.rpc('approve_inventory_request', {
        p_request_id: orderId,
        p_allow_shortage: allowShortage,
        p_override_reason: overrideReason || null
      });
      if (error) throw error;

      toast.success(data?.message || t('withdrawals.toasts.approved'), { id: toastId });

      // Dispatch notification email
      dispatchWithdrawalNotification({
        eventType: 'withdrawal_approved',
        orderId: orderId,
        approverName: profile?.full_name || 'Admin',
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
        } catch {
          toast.error(t('withdrawals.toasts.insufficientInventory'));
        }
      } else {
        let cleanErrMsg = rawMsg.replace(/.*(?:EXCEPTION|Error|P0001):\s*/i, '') || 'Failed to approve requisition';
        if (cleanErrMsg.includes('Insufficient stock for this project')) {
          cleanErrMsg = cleanErrMsg.replace(
            /Insufficient stock for this project:\s*Available\s*(\d+),\s*Requested\s*(\d+)/i,
            'Insufficient inventory in this project: Available $1 pcs, Requested $2 pcs'
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
    if (!canReject || !orderToReject || isProcessing) return;
    if (!rejectReason.trim()) {
      toast.error(t('withdrawals.toasts.rejectReasonRequired'));
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading(t('withdrawals.toasts.rejecting'));
    try {
      const { error } = await supabase.rpc('reject_inventory_request', {
        p_request_id: orderToReject.id,
        p_reject_reason: rejectReason.trim()
      });
      if (error) throw error;

      toast.success(t('withdrawals.toasts.rejected'), { id: toastId });

      // Dispatch rejection notification
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
        : 'Failed to reject requisition';
      toast.error(cleanErrMsg, { id: toastId, duration: 6000 });
    } finally {
      setIsProcessing(false);
    }
  };

  // Complete Order via Supabase RPC
  const handleCompleteOrder = async (orderId) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const toastId = toast.loading(t('withdrawals.toasts.completing'));
    try {
      const { error } = await supabase.rpc('complete_inventory_request', {
        p_request_id: orderId
      });
      if (error) throw error;

      toast.success(t('withdrawals.toasts.completed'), { id: toastId });

      dispatchWithdrawalNotification({
        eventType: 'withdrawal_completed',
        orderId
      }).catch(err => console.warn('[Notification Dispatch Warning]:', err));

      fetchData();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: 'completed' }));
      }
    } catch (error) {
      console.error('Complete Error:', error);
      const cleanErrMsg = error.message
        ? error.message.replace(/.*(?:EXCEPTION|Error|P0001):\s*/i, '')
        : 'Failed to confirm receipt of items';
      toast.error(cleanErrMsg, { id: toastId, duration: 6000 });
    } finally {
      setIsProcessing(false);
    }
  };

  // View Order Details
  const viewOrderDetails = async (order) => {
    try {
      const { data, error } = await supabase
        .from('withdrawal_items')
        .select('*, items(name, unit, sku)')
        .eq('order_id', order.id);
      if (error) throw error;
      setOrderDetails(data || []);
      setSelectedOrder(order);
      setIsDetailsModalOpen(true);
    } catch {
      toast.error('Failed to load requisition details');
    }
  };

  // Download PDF
  const handleDownloadPDF = async (order, existingItems = null) => {
    if (!order) return;
    const toastId = toast.loading('Generating requisition PDF document...');
    try {
      let itemsList = existingItems;
      if (!itemsList || itemsList.length === 0) {
        const { data, error } = await supabase
          .from('withdrawal_items')
          .select('*, items(name, unit, sku)')
          .eq('order_id', order.id);
        if (error) throw error;
        itemsList = data || [];
      }

      const docBlob = await pdf(
        <MaterialWithdrawalPDF order={order} items={itemsList} profile={profile} />
      ).toBlob();

      const url = URL.createObjectURL(docBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MaterialWithdrawal_${order.id?.slice(0, 8) || 'order'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Requisition PDF downloaded successfully', { id: toastId });
    } catch (err) {
      console.error('PDF Download Error:', err);
      toast.error('Failed to download PDF document', { id: toastId });
    }
  };

  const pendingOrdersCount = orders.filter(o => o.status === 'pending').length;
  const totalCartUnits = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Top Requisition Hub Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-2 sm:p-2.5 rounded-xl bg-card border border-border shadow-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Tab 1: POS Terminal */}
          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex-1 sm:flex-none justify-center ${
              activeTab === 'pos'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
            <span>{t('withdrawals.posTab')}</span>
            {cart.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${
                activeTab === 'pos' ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'
              }`}>
                {cart.length} {t('common.items')} ({totalCartUnits} {t('common.unit')})
              </span>
            )}
          </button>

          {/* Tab 2: Orders Tracking */}
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex-1 sm:flex-none justify-center ${
              activeTab === 'orders'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('withdrawals.requisitionsTab')}</span>
            {pendingOrdersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500 text-slate-950 animate-pulse">
                {pendingOrdersCount} {t('common.pending')}
              </span>
            )}
          </button>
        </div>

        {/* Status Indicator */}
        <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-muted-foreground pr-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>{t('withdrawals.systemReady')}</span>
        </div>
      </div>

      {/* Main View Area */}
      {activeTab === 'pos' ? (
        <WithdrawalPosTerminal
          items={items}
          rawItems={rawItems}
          rawBalances={rawBalances}
          categories={categories}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={handleProjectChange}
          cart={cart}
          onAddToCart={handleAddToCart}
          onUpdateQuantity={handleUpdateQuantity}
          onDirectQuantityChange={handleDirectQuantityChange}
          onQuantityBlur={handleQuantityBlur}
          onRemoveFromCart={handleRemoveFromCart}
          onClearCart={handleClearCart}
          onUpdateItemDetails={handleUpdateItemDetails}
          onSubmitOrder={handleSubmitOrder}
          isLoading={loading}
          isSubmitting={isSubmitting}
        />
      ) : (
        <WithdrawalOrdersList
          orders={orders}
          loading={loading}
          isAdmin={isAdmin}
          canApprove={canApprove}
          canReject={canReject}
          canComplete={canComplete}
          onOpenPosMode={() => setActiveTab('pos')}
          onViewOrderDetails={viewOrderDetails}
          onDownloadPDF={handleDownloadPDF}
          onApproveOrder={handleApproveOrder}
          onOpenRejectModal={openRejectModal}
          onCompleteOrder={handleCompleteOrder}
        />
      )}

      {/* View Order Details Modal */}
      <WithdrawalDetailModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        order={selectedOrder}
        orderDetails={orderDetails}
        isAdmin={isAdmin}
        canApprove={canApprove}
        canReject={canReject}
        canComplete={canComplete}
        onApproveOrder={(orderId) => {
          handleApproveOrder(orderId);
          setIsDetailsModalOpen(false);
        }}
        onOpenRejectModal={(order) => {
          openRejectModal(order);
          setIsDetailsModalOpen(false);
        }}
        onCompleteOrder={(orderId) => {
          handleCompleteOrder(orderId);
          setIsDetailsModalOpen(false);
        }}
        onDownloadPDF={handleDownloadPDF}
      />

      {/* Shortage Warning & Override Modal */}
      <WithdrawalShortageModal
        isOpen={isShortageModalOpen}
        onClose={() => setIsShortageModalOpen(false)}
        shortageData={shortageData}
        overrideReason={shortageOverrideReason}
        onOverrideReasonChange={setShortageOverrideReason}
        onConfirmApprove={handleApproveOrder}
      />

      {/* Reject Reason Modal */}
      <WithdrawalRejectModal
        isOpen={isRejectDialogOpen}
        onClose={() => setIsRejectDialogOpen(false)}
        orderToReject={orderToReject}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onConfirmReject={handleRejectSubmit}
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default Withdrawals;
