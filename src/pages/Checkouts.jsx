import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  RotateCcw, Plus, Clock, History, RefreshCw,
  
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

import CheckoutPosTerminal from '@/components/checkouts/CheckoutPosTerminal';
import CheckoutActiveList from '@/components/checkouts/CheckoutActiveList';
import CheckoutReturnModal from '@/components/checkouts/CheckoutReturnModal';
import CheckoutDetailModal from '@/components/checkouts/CheckoutDetailModal';
import CheckoutExtendModal from '@/components/checkouts/CheckoutExtendModal';
import CheckoutHistoryList from '@/components/checkouts/CheckoutHistoryList';

const Checkouts = () => {
  const { can } = useAuth();

  const canCreate = can('checkouts.create');
  const canReturn = can('checkouts.return');
  const canExtend = can('checkouts.extend') || can('checkouts.update');

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
        setOrders(ordRes.data || []);
      }
    } catch (err) {
      console.error('Error fetching checkout data:', err);
      toast.error('Failed to load checkout/return data');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.error('You do not have permission to return items (checkouts.return required)');
      return;
    }
    setSelectedOrderForReturn(order);
    setIsReturnModalOpen(true);
  };

  const handleOpenExtendModal = (order) => {
    if (!canExtend) {
      toast.error('You do not have permission to extend return due dates (checkouts.extend required)');
      return;
    }
    setSelectedOrderForExtend(order);
    setIsExtendModalOpen(true);
  };

  const handleOpenDetailModal = (order) => {
    setSelectedOrderForDetail(order);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">

      {/* Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                <span>Equipment & Tool Checkouts</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Manage tool and equipment loans, track return due dates, extend loan durations, and log asset conditions
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
            <span>Refresh</span>
          </Button>

          {activeTab !== 'pos' && canCreate && (
            <Button
              size="sm"
              onClick={() => setActiveTab('pos')}
              className="rounded-lg h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-semibold cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Checkout</span>
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer select-none ${activeTab === 'active'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Active Loans</span>
          {orders.filter(o => o.status !== 'completed').length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono font-bold">
              {orders.filter(o => o.status !== 'completed').length}
            </span>
          )}
        </button>

        {canCreate && (
          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer select-none ${activeTab === 'pos'
                ? 'bg-background text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Checkout (POS)</span>
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
          <span>History</span>
        </button>
      </div>

      {/* Tab Content */}
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
          onCheckoutSuccess={() => {
            fetchCheckoutData();
            setActiveTab('active');
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
