import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  RotateCcw, Plus, Clock, History, RefreshCw,
  
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';

import CheckoutPosTerminal from '@/components/checkouts/CheckoutPosTerminal';
import CheckoutActiveList from '@/components/checkouts/CheckoutActiveList';
import CheckoutPendingList from '@/components/checkouts/CheckoutPendingList';
import CheckoutReturnModal from '@/components/checkouts/CheckoutReturnModal';
import CheckoutDetailModal from '@/components/checkouts/CheckoutDetailModal';
import CheckoutExtendModal from '@/components/checkouts/CheckoutExtendModal';
import CheckoutHistoryList from '@/components/checkouts/CheckoutHistoryList';
import CheckoutApproveModal from '@/components/checkouts/CheckoutApproveModal';
import CheckoutRejectModal from '@/components/checkouts/CheckoutRejectModal';
import { dispatchCheckoutNotification } from '@/lib/notificationDispatcher';

const Checkouts = () => {
  const { can, user, profile, isAdmin, isSuperAdmin } = useAuth();
  const { t } = useTranslation();

  const canCreate = can('checkouts.create');
  const canReturn = can('checkouts.return');
  const canExtend = can('checkouts.extend') || can('checkouts.update');
  const canApprove = can('checkouts.approve') || isAdmin || isSuperAdmin;

  // Navigation Tabs: 'active' | 'pos' | 'history'
  const [activeTab, setActiveTab] = useState('active');
  const [loading, setLoading] = useState(true);

  // Master Data
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [rawBalances, setRawBalances] = useState([]);
  const [orders, setOrders] = useState([]);

  // Modal states
  const [selectedOrderForReturn, setSelectedOrderForReturn] = useState(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedOrderForExtend, setSelectedOrderForExtend] = useState(null);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Approval & Rejection states
  const [selectedOrderForApprove, setSelectedOrderForApprove] = useState(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  const [selectedOrderForReject, setSelectedOrderForReject] = useState(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Fetch all checkout orders with line items
  const fetchCheckoutData = useCallback(async () => {
    try {
      setLoading(true);

      // Parallelize queries for projects, items, stock balance, and checkout orders
      const [projRes, itemRes, balRes, ordRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, project_code, location, description, status')
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('items')
          .select('id, name, model, sku, item_type, parent_sku, unit, description, notes, image_url, category_id')
          .order('name'),
        supabase
          .from('stock_balance')
          .select('project_id, item_id, item_name, unit, project_name, balance'),
        supabase
          .from('checkout_orders')
          .select(`
            *,
            projects (*),
            profiles:created_by (*),
            checkout_items (
              *,
              items (*)
            )
          `)
          .order('created_at', { ascending: false })
      ]);

      if (projRes.error) throw projRes.error;
      setProjects(projRes.data || []);

      if (itemRes.error) throw itemRes.error;
      setItems(itemRes.data || []);

      if (!balRes.error) {
        setRawBalances(balRes.data || []);
      }

      if (ordRes.error) {
        console.warn('Checkout orders fetch notice:', ordRes.error.message);
        setOrders([]);
      } else {
        let loadedOrders = ordRes.data || [];

        // Enrich creator profiles if PostgREST embedding returned null or empty array
        const unmappedCreatorIds = [
          ...new Set(
            loadedOrders
              .filter(o => o.created_by && (!o.profiles || (Array.isArray(o.profiles) && o.profiles.length === 0)))
              .map(o => o.created_by)
          )
        ];

        if (unmappedCreatorIds.length > 0) {
          try {
            const { data: profs } = await supabase
              .from('profiles')
              .select('id, full_name, email, role')
              .in('id', unmappedCreatorIds);

            if (profs && profs.length > 0) {
              const profMap = new Map(profs.map(p => [p.id, p]));
              loadedOrders = loadedOrders.map(o => {
                if (o.created_by && profMap.has(o.created_by)) {
                  return {
                    ...o,
                    profiles: profMap.get(o.created_by)
                  };
                }
                return o;
              });
            }
          } catch (profErr) {
            console.warn('Enrich creator profiles notice:', profErr);
          }
        }

        // Normalize order.profiles: if it's an array, extract the first object
        loadedOrders = loadedOrders.map(o => {
          if (Array.isArray(o.profiles)) {
            return {
              ...o,
              profiles: o.profiles[0] || null
            };
          }
          return o;
        });

        setOrders(loadedOrders);
      }
    } catch (err) {
      console.error('Error fetching checkout data:', err);
      toast.error(t('checkouts.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCheckoutData();
  }, [fetchCheckoutData]);

  // Supabase Realtime Live Sync & Visibility Auto-Refresh
  useEffect(() => {
    const channel = supabase
      .channel('checkouts-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkout_orders' },
        () => fetchCheckoutData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkout_return_logs' },
        () => fetchCheckoutData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkout_extension_logs' },
        () => fetchCheckoutData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_transactions' },
        () => fetchCheckoutData()
      )
      .subscribe();

  const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCheckoutData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchCheckoutData]);

  // Modal triggers
  const handleOpenReturnModal = (order) => {
    if (!canReturn) {
      toast.error(t('checkouts.toasts.noReturnPermission'));
      return;
    }
    setSelectedOrderForReturn(order);
    setIsReturnModalOpen(true);
  };

  const handleOpenExtendModal = (order) => {
    setSelectedOrderForExtend(order);
    setIsExtendModalOpen(true);
  };

  const handleOpenDetailModal = (order) => {
    setSelectedOrderForDetail(order);
    setIsDetailModalOpen(true);
  };

  const handleOpenApproveModal = (order) => {
    setSelectedOrderForApprove(order);
    setIsApproveModalOpen(true);
  };

  const handleOpenRejectModal = (order) => {
    setSelectedOrderForReject(order);
    setIsRejectModalOpen(true);
  };

  const handleConfirmApprove = async (order, notes) => {
    try {
      setApproving(true);
      const { data, error } = await supabase.rpc('approve_checkout_order', {
        p_payload: {
          order_id: order.id,
          notes: notes || null
        }
      });

      if (error) throw error;

      toast.success(data?.message || t('checkouts.approveSuccess', 'อนุมัติและจ่ายพัสดุเรียบร้อยแล้ว'));
      setIsApproveModalOpen(false);
      setSelectedOrderForApprove(null);

      // Async notification dispatch
      dispatchCheckoutNotification({
        eventType: 'checkout_approved',
        orderId: order.id,
        orderData: order,
        approverName: profile?.full_name || user?.email || 'Admin'
      }).catch(err => console.warn('Checkout approval notification notice:', err));

      await fetchCheckoutData();
    } catch (err) {
      console.error('Approve checkout error:', err);
      toast.error(err.message || t('checkouts.approveFailed', 'เกิดข้อผิดพลาดในการอนุมัติคำขอ'));
    } finally {
      setApproving(false);
    }
  };

  const handleConfirmReject = async (order, rejectionReason) => {
    try {
      setRejecting(true);
      const { data, error } = await supabase.rpc('reject_checkout_order', {
        p_payload: {
          order_id: order.id,
          rejection_reason: rejectionReason
        }
      });

      if (error) throw error;

      toast.success(data?.message || t('checkouts.rejectSuccess', 'ปฏิเสธคำขอยืมเรียบร้อยแล้ว'));
      setIsRejectModalOpen(false);
      setSelectedOrderForReject(null);

      // Async notification dispatch
      dispatchCheckoutNotification({
        eventType: 'checkout_rejected',
        orderId: order.id,
        orderData: order,
        approverName: profile?.full_name || user?.email || 'Admin',
        rejectionReason
      }).catch(err => console.warn('Checkout rejection notification notice:', err));

      await fetchCheckoutData();
    } catch (err) {
      console.error('Reject checkout error:', err);
      toast.error(err.message || t('checkouts.rejectFailed', 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ'));
    } finally {
      setRejecting(false);
    }
  };

  const pendingOrdersCount = useMemo(() => {
    return orders.filter(o => o.status === 'pending').length;
  }, [orders]);

  const activeOrdersCount = useMemo(() => {
    return orders.filter(o => {
      if (o.status === 'completed' || o.status === 'pending' || o.status === 'rejected' || o.status === 'cancelled' || o.actual_returned_date) return false;
      const items = o.checkout_items || [];
      if (items.length === 0) return true;
      const totalBorrowed = items.reduce((s, i) => s + Number(i.quantity_borrowed || 0), 0);
      const totalReturned = items.reduce((s, i) => s + Number(i.quantity_returned || 0) + Number(i.quantity_damaged || 0) + Number(i.quantity_lost || 0), 0);
      return (totalBorrowed - totalReturned) > 0;
    }).length;
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Top Header with Quick Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <div className="space-y-0.5">
              <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                <span>{t('checkouts.title')}</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                {t('checkouts.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCheckoutData}
            disabled={loading}
            className="rounded-lg h-9 px-3 gap-1.5 border-input hover:bg-accent text-xs font-semibold cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? t('common.loading') : t('common.refresh')}</span>
          </Button>

          {activeTab !== 'pos' && canCreate && (
            <Button
              size="sm"
              onClick={() => setActiveTab('pos')}
              className="rounded-lg h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-semibold cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('checkouts.newCheckout')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border w-fit flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer select-none ${activeTab === 'pending'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span>{t('checkouts.pendingTab', 'รออนุมัติ')}</span>
          {pendingOrdersCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-mono font-bold">
              {pendingOrdersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer select-none ${activeTab === 'active'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t('checkouts.activeTab')}</span>
          {activeOrdersCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-primary/15 text-primary text-[10px] font-mono font-bold">
              {activeOrdersCount}
            </span>
          )}
        </button>

        {canCreate && (
          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer select-none ${activeTab === 'pos'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('checkouts.posTab')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer select-none ${activeTab === 'history'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>{t('checkouts.historyTab')}</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'pending' && (
        <CheckoutPendingList
          orders={orders}
          loading={loading}
          canApprove={canApprove}
          onOpenApproveModal={handleOpenApproveModal}
          onOpenRejectModal={handleOpenRejectModal}
          onOpenDetailModal={handleOpenDetailModal}
        />
      )}

      {activeTab === 'active' && (
        <CheckoutActiveList
          orders={orders}
          loading={loading}
          canReturn={canReturn}
          canExtend={canExtend}
          onOpenReturnModal={handleOpenReturnModal}
          onOpenExtendModal={handleOpenExtendModal}
          onOpenDetailModal={handleOpenDetailModal}
        />
      )}

      {activeTab === 'pos' && (
        <CheckoutPosTerminal
          projects={projects}
          items={items}
          rawBalances={rawBalances}
          onCheckoutSuccess={(data) => {
            fetchCheckoutData();
            if (data?.status === 'pending') {
              setActiveTab('pending');
            } else {
              setActiveTab('active');
            }
          }}
        />
      )}

      {activeTab === 'history' && (
        <CheckoutHistoryList
          orders={orders}
          loading={loading}
          onOpenDetailModal={handleOpenDetailModal}
        />
      )}

      {/* Approve Modal */}
      <CheckoutApproveModal
        isOpen={isApproveModalOpen}
        onClose={() => {
          setIsApproveModalOpen(false);
          setSelectedOrderForApprove(null);
        }}
        order={selectedOrderForApprove}
        onConfirmApprove={handleConfirmApprove}
        loading={approving}
      />

      {/* Reject Modal */}
      <CheckoutRejectModal
        isOpen={isRejectModalOpen}
        onClose={() => {
          setIsRejectModalOpen(false);
          setSelectedOrderForReject(null);
        }}
        order={selectedOrderForReject}
        onConfirmReject={handleConfirmReject}
        loading={rejecting}
      />

      {/* Return Modal */}
      <CheckoutReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => {
          setIsReturnModalOpen(false);
          setSelectedOrderForReturn(null);
        }}
        order={selectedOrderForReturn}
        projects={projects}
        onReturnSuccess={() => {
          fetchCheckoutData();
        }}
      />

      {/* Extend Return Due Date Modal */}
      <CheckoutExtendModal
        isOpen={isExtendModalOpen}
        onClose={() => {
          setIsExtendModalOpen(false);
          setSelectedOrderForExtend(null);
        }}
        order={selectedOrderForExtend}
        onExtendSuccess={() => {
          fetchCheckoutData();
        }}
      />

      {/* Detail & Print Modal */}
      <CheckoutDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedOrderForDetail(null);
        }}
        order={selectedOrderForDetail}
        canReturn={canReturn}
        canExtend={canExtend}
        onOpenReturnModal={handleOpenReturnModal}
        onOpenExtendModal={handleOpenExtendModal}
      />
    </div>
  );
};

export default Checkouts;
