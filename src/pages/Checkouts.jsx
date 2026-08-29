import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  RotateCcw, Plus, Clock, History, RefreshCw,
  Layers, Package, CheckCircle2, AlertTriangle, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

import CheckoutPosTerminal from '@/components/checkouts/CheckoutPosTerminal';
import CheckoutActiveList from '@/components/checkouts/CheckoutActiveList';
import CheckoutReturnModal from '@/components/checkouts/CheckoutReturnModal';
import CheckoutDetailModal from '@/components/checkouts/CheckoutDetailModal';
import CheckoutHistoryList from '@/components/checkouts/CheckoutHistoryList';

const Checkouts = () => {
  const { can, user } = useAuth();

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
      toast.error('ไม่สามารถโหลดข้อมูลการยืม-คืนได้');
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
    setSelectedOrderForReturn(order);
    setIsReturnModalOpen(true);
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
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                <span>ระบบยืม-คืนเครื่องมือและพัสดุ</span>
                <span className="text-[10px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  Checkout & Return
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                ควบคุมการยืมเครื่องมือช่าง อุปกรณ์ราคาสูง ติดตามวันส่งคืน และตรวจสอบสภาพความเสียหาย
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
            className="rounded-xl h-10 gap-1.5 border-input hover:bg-accent text-xs font-semibold cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรชข้อมูล</span>
          </Button>

          {activeTab !== 'pos' && can('checkouts.create') && (
            <Button
              size="sm"
              onClick={() => setActiveTab('pos')}
              className="rounded-xl h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-bold cursor-pointer shadow-sm active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>สร้างรายการยืมใหม่</span>
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center p-1.5 bg-muted/60 rounded-2xl border border-border/60 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${activeTab === 'active'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>รายการยืมคงค้าง (Active Loans)</span>
          {orders.filter(o => o.status !== 'completed').length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono font-bold">
              {orders.filter(o => o.status !== 'completed').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${activeTab === 'pos'
              ? 'bg-background text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>ขอยืมพัสดุ (Checkout POS)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${activeTab === 'history'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>ประวัติยืม-คืน (History)</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'active' && (
        <CheckoutActiveList
          orders={orders}
          loading={loading}
          onOpenReturnModal={handleOpenReturnModal}
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

      {/* Detail & Print Modal */}
      <CheckoutDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedOrderForDetail(null);
        }}
        order={selectedOrderForDetail}
        onOpenReturnModal={handleOpenReturnModal}
      />
    </div>
  );
};

export default Checkouts;
