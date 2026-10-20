import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Zap, ClipboardList } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { MaterialWithdrawalPDF, MaterialDispatchPDF } from '@/lib/pdf-templates';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { toSafeFileToken } from '@/lib/utils';
import { isSchemaMismatchError } from '@/lib/rpcErrors';
import { ALL_WAREHOUSES, buildCartKey, buildWarehouseMap, clampQuantity, getWarehouseBalance, getWarehouseLabel, getWarehousesForItem, pickDefaultWarehouse, resolveSourceWarehouse } from '@/lib/withdrawalStock';
import toast from 'react-hot-toast';
import { dispatchWithdrawalNotification, dispatchLowStockAlertNotification, dispatchRevertNotification } from '@/lib/notificationDispatcher';

// Modular Withdrawal Subcomponents
import WithdrawalPosTerminal from '@/components/withdrawals/WithdrawalPosTerminal';
import WithdrawalOrdersList from '@/components/withdrawals/WithdrawalOrdersList';
import WithdrawalDetailModal from '@/components/withdrawals/WithdrawalDetailModal';
import WithdrawalShortageModal from '@/components/withdrawals/WithdrawalShortageModal';
import WithdrawalRejectModal from '@/components/withdrawals/WithdrawalRejectModal';
import WithdrawalCancelModal from '@/components/withdrawals/WithdrawalCancelModal';
import SignatureRequiredModal from '@/components/common/SignatureRequiredModal';
import SuperRevertActionModal from '@/components/common/SuperRevertActionModal';

// Shared helpers for withdrawal PDF documents
const resolveWithdrawalItems = async (order, existingItems = null) => {
  if (existingItems?.length) return existingItems;
  const { data, error } = await supabase
    .from('withdrawal_items')
    .select('*, items(name, unit, sku)')
    .eq('order_id', order.id);
  if (error) throw error;
  return data || [];
};

const WITHDRAWAL_TABS = ['pos', 'orders'];

const Withdrawals = () => {
  const { isAdmin, isSuperAdmin, can, canAny, canRevertAction, profile } = useAuth();
  const { t } = useTranslation();
  
  const canCreate = can('withdrawals.create');
  const canApprove = can('withdrawals.approve');
  const canReject = can('withdrawals.reject');
  const canComplete = can('withdrawals.complete');
  const canCancel = can('withdrawals.cancel');

  // Navigation Tab: 'pos' (Terminal) | 'orders' (Requisition Tracking)
  // The URL query string drives the tab; the permission-based default is captured
  // once so the tab does not jump when permissions finish loading.
  const [initialTab] = useState(() => (canCreate ? 'pos' : 'orders'));
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const idParam = searchParams.get('id');
  const activeTab = WITHDRAWAL_TABS.includes(tabParam) ? tabParam : initialTab;
  const setActiveTab = useCallback((nextTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      next.delete('id');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

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

  // Per-line source warehouse is enabled only when the database actually has
  // withdrawal_items.project_id (migration 80). The capability is probed once so
  // this frontend stays safe to deploy before the migration is applied.
  const [lineSourceEnabled, setLineSourceEnabled] = useState(false);
  const lineSourceCapabilityRef = useRef(null);

  // Details Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [orderStockRows, setOrderStockRows] = useState([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Shortage Warning & Override Modal State
  const [isShortageModalOpen, setIsShortageModalOpen] = useState(false);
  const [shortageData, setShortageData] = useState(null);
  const [shortageOverrideReason, setShortageOverrideReason] = useState('');

  // Reject Modal State
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [orderToReject, setOrderToReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showSigModal, setShowSigModal] = useState(false);

  // Cancel Modal State (SUPER Role)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);

  // Revert Modal State (SUPER Role)
  const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);
  const [revertTarget, setRevertTarget] = useState(null);

  // Aggregate item balances based on selected project location
  const mapItemsForProject = (allItems, allBalances, projectId, projectList = []) => {
    if (!allItems) return [];
    // Warehouses are identified by their physical location (projects.location),
    // because several projects can share the same project name.
    const warehouseLabelById = new Map((projectList || []).map(p => [p.id, getWarehouseLabel(p)]));
    const warehouseMap = buildWarehouseMap(allBalances, warehouseLabelById);
    return allItems.map(item => {
      // Warehouses that can actually supply this item (balance > 0)
      const warehouses = getWarehousesForItem(warehouseMap, item.id);

      // Total across all locations
      const totalSystemBalance = (allBalances || [])
        .filter(b => b.item_id === item.id)
        .reduce((sum, b) => sum + (Number(b.balance) || 0), 0);

      // Specific location
      if (projectId && projectId !== ALL_WAREHOUSES) {
        return {
          ...item,
          balance: getWarehouseBalance(warehouses, projectId),
          totalSystemBalance,
          warehouses
        };
      }

      // Default 'all': total balance
      return {
        ...item,
        balance: totalSystemBalance,
        totalSystemBalance,
        warehouses
      };
    });
  };

  const handleProjectChange = (projectId) => {
    setSelectedProjectId(projectId);
    const updatedItems = mapItemsForProject(rawItems, rawBalances, projectId, projects);
    setItems(updatedItems);

    setCart(prev => prev.map(cItem => {
      const matching = updatedItems.find(i => i.id === cItem.id);
      const warehouses = matching?.warehouses || cItem.warehouses || [];

      // The header project is only the requisition destination: never overwrite a
      // line whose own source warehouse still has stock.
      const currentBalance = getWarehouseBalance(warehouses, cItem.source_project_id);
      const hasOwnSource = Boolean(cItem.source_project_id)
        && cItem.source_project_id !== ALL_WAREHOUSES
        && currentBalance > 0;

      if (hasOwnSource) {
        let newQ = cItem.quantity;
        if (newQ > currentBalance) newQ = currentBalance;
        return {
          ...cItem,
          balance: currentBalance,
          warehouses,
          quantity: newQ,
          quantityInput: String(newQ)
        };
      }

      // Source missing / "all" / out of stock -> point the line at a stocked warehouse.
      const picked = pickDefaultWarehouse(warehouses);
      if (!picked) {
        return { ...cItem, balance: currentBalance, warehouses };
      }

      const newKey = buildCartKey(cItem.id, picked.project_id);
      const keyTaken = prev.some(i => lineKeyOf(i) !== lineKeyOf(cItem) && lineKeyOf(i) === newKey);
      if (keyTaken) {
        return { ...cItem, balance: currentBalance, warehouses };
      }

      const newQ = clampQuantity(cItem.quantity, picked.balance) || 1;
      return {
        ...cItem,
        cartKey: newKey,
        source_project_id: picked.project_id,
        source_project_name: picked.project_name || '',
        source_warehouse_name: picked.warehouse_name || picked.project_name || '',
        source_is_fallback: true,
        balance: Number(picked.balance) || 0,
        warehouses,
        quantity: newQ,
        quantityInput: String(newQ)
      };
    }));
  };

  const detectLineSourceCapability = useCallback(async () => {
    if (lineSourceCapabilityRef.current !== null) return lineSourceCapabilityRef.current;
    const { error } = await supabase
      .from('withdrawal_items')
      .select('project_id')
      .limit(1);
    const supported = !error;
    lineSourceCapabilityRef.current = supported;
    return supported;
  }, []);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);

      // Probe once so the line -> project join is only requested on a schema that
      // actually has withdrawal_items.project_id (migration 80).
      const supportsLineSource = await detectLineSourceCapability();

      // 1. Fetch withdrawal orders
      let ordersQuery = supabase
        .from('withdrawal_orders')
        .select(`
          *,
          projects (*),
          profiles:requested_by (*),
          approver:approved_by (id, full_name, signature_url),
          withdrawal_items (
            *,
            items (*)${supportsLineSource ? ', projects (*)' : ''}
          )
        `)
        .order('requested_at', { ascending: false });

      const canViewAllWithdrawals = isAdmin || canAny(['withdrawals.approve', 'withdrawals.update', 'withdrawals.reject', 'withdrawals.complete']);
      if (!canViewAllWithdrawals) {
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

      // Resolve the SUPER actor name for the "reverted by ..." badge. Reading the
      // optional last_reverted_by column from the * payload keeps this query
      // valid before migration 83 is applied.
      const reverterIds = [...new Set((wData || []).map(o => o.last_reverted_by).filter(Boolean))];
      let ordersWithReverter = wData || [];
      if (reverterIds.length > 0) {
        const { data: reverterProfiles, error: reverterError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', reverterIds);
        if (reverterError) {
          console.warn('[Withdrawals] Reverter profile lookup failed:', reverterError.message);
        }
        const reverterById = new Map((reverterProfiles || []).map(p => [p.id, p]));
        ordersWithReverter = ordersWithReverter.map(o => (
          o.last_reverted_by && reverterById.has(o.last_reverted_by)
            ? { ...o, reverter: reverterById.get(o.last_reverted_by) }
            : o
        ));
      }
      setOrders(ordersWithReverter);

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
        const mappedItems = mapItemsForProject(iData, activeBalances, targetProjectId, activeProjects);
        setItems(mappedItems);
      }

      // Enables per-line source warehouse once migration 80 is live.
      setLineSourceEnabled(supportsLineSource);
    } catch (error) {
      console.error('FetchData Error:', error);
      toast.error(t('withdrawals.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, selectedProjectId, detectLineSourceCapability, canAny, t]);

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

  // Cart Operations — every line is identified by cartKey (item + source warehouse)
  const lineKeyOf = (line) => line.cartKey || line.id;

  const handleAddToCart = (item) => {
    const warehouses = item.warehouses || [];
    const resolved = resolveSourceWarehouse({ selectedProjectId, warehouses });
    // Pre-migration keeps the legacy semantics: the selected project is the source.
    const legacyWarehouse = warehouses.find(w => w.project_id === selectedProjectId);
    const source = lineSourceEnabled
      ? resolved
      : {
          project_id: selectedProjectId,
          project_name: legacyWarehouse?.project_name || '',
          warehouse_name: legacyWarehouse?.warehouse_name || '',
          balance: item.balance
        };

    if (!source || !source.project_id) {
      toast.error(t('common.outOfStock', 'This item is out of stock'));
      return;
    }

    // The selected warehouse had no stock: tell the user another one was chosen.
    if (source.isFallback) {
      toast(t('withdrawals.sourceWarehouseFallback', {
        warehouse: source.warehouse_name || source.project_name || ''
      }, `คลังที่เลือกไว้ไม่มีสต็อก — เบิกจาก ${source.warehouse_name || source.project_name} แทน`));
    }

    const availableStock = source.balance !== undefined && source.balance !== null
      ? source.balance
      : Infinity;
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

    const cartKey = buildCartKey(item.id, source.project_id);

    setCart(prev => {
      const existing = lineSourceEnabled
        ? prev.find(i => lineKeyOf(i) === cartKey)
        : prev.find(i => i.id === item.id);

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
        return prev.map(i => lineKeyOf(i) === lineKeyOf(existing)
          ? {
              ...i,
              ...item,
              cartKey,
              source_project_id: source.project_id,
              source_project_name: source.project_name || '',
              source_warehouse_name: source.warehouse_name || source.project_name || '',
              source_is_fallback: Boolean(source.isFallback),
              warehouses,
              quantity: newQ,
              quantityInput: String(newQ)
            }
          : i);
      }

      return [
        ...prev,
        {
          ...item,
          cartKey,
          source_project_id: source.project_id,
          source_project_name: source.project_name || '',
          source_warehouse_name: source.warehouse_name || source.project_name || '',
          source_is_fallback: Boolean(source.isFallback),
          warehouses,
          quantity: 1,
          quantityInput: '1',
          delivery_to: '',
          serial_number: '',
          part_number: ''
        }
      ];
    });
  };

  const handleUpdateQuantity = (key, delta) => {
    setCart(prev => prev.reduce((acc, item) => {
      if (lineKeyOf(item) === key) {
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

  const handleDirectQuantityChange = (key, val) => {
    const cleanVal = val.replace(/\D/g, '');
    setCart(prev => prev.map(item => {
      if (lineKeyOf(item) === key) {
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

  const handleQuantityBlur = (key) => {
    setCart(prev => prev.map(item => {
      if (lineKeyOf(item) === key) {
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

  const handleRemoveFromCart = (key) => {
    setCart(prev => prev.filter(item => lineKeyOf(item) !== key));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleUpdateItemDetails = (key, field, value) => {
    setCart(prev => prev.map(item => lineKeyOf(item) === key ? { ...item, [field]: value } : item));
  };

  /**
   * Move a cart line to another source warehouse (multi-warehouse mode only).
   * Quantities are clamped to the destination warehouse; when the same item
   * already sits in that warehouse the two lines are merged.
   */
  const handleChangeSourceWarehouse = (key, projectId) => {
    if (!lineSourceEnabled) return;

    setCart(prev => {
      const current = prev.find(i => lineKeyOf(i) === key);
      if (!current) return prev;

      const warehouses = current.warehouses || [];
      const source = warehouses.find(w => w.project_id === projectId);
      const available = source ? Number(source.balance) || 0 : 0;
      const newKey = buildCartKey(current.id, projectId);
      const movedQty = clampQuantity(current.quantity, available) || 1;

      const collision = prev.find(i => lineKeyOf(i) === newKey && lineKeyOf(i) !== key);
      if (collision) {
        const mergedQty = clampQuantity(collision.quantity + movedQty, available) || collision.quantity;
        return prev
          .filter(i => lineKeyOf(i) !== key && lineKeyOf(i) !== newKey)
          .concat({
            ...collision,
            source_project_name: source?.project_name || collision.source_project_name || '',
            source_warehouse_name: source?.warehouse_name || source?.project_name || collision.source_warehouse_name || '',
            balance: available,
            warehouses,
            quantity: mergedQty,
            quantityInput: String(mergedQty)
          });
      }

      return prev.map(i => lineKeyOf(i) === key
        ? {
            ...i,
            cartKey: newKey,
            source_project_id: projectId,
            source_project_name: source?.project_name || '',
            source_warehouse_name: source?.warehouse_name || source?.project_name || '',
            balance: available,
            quantity: movedQty,
            quantityInput: String(movedQty)
          }
        : i);
    });
  };

  /**
   * Reorder-point alert (event 6).
   *
   * Stock is deducted when a requisition is APPROVED (not when it is later
   * completed), so this runs right after a successful approve. It reads the
   * post-deduction project balance and compares it against the item reorder point
   * (`items.min_stock`), falling back to the global `low_stock_threshold` when the
   * item has none. Items with no balance row are skipped rather than treated as 0.
   */
  const notifyLowStockItems = async ({ orderId, fallbackProjectId, approvedByName }) => {
    if (!orderId) return;

    try {
      // Read the lines that were actually approved. In multi-warehouse mode each
      // line deducts from its own source project, so the alert is evaluated per
      // (project_id, item_id) pair instead of one balance for the whole order.
      const lineSelect = lineSourceEnabled
        ? 'item_id, project_id, deducted_quantity'
        : 'item_id, deducted_quantity';
      const [linesRes, orderRes, thresholdRes] = await Promise.all([
        supabase
          .from('withdrawal_items')
          .select(lineSelect)
          .eq('order_id', orderId),
        supabase
          .from('withdrawal_orders')
          .select('project_id')
          .eq('id', orderId)
          .maybeSingle(),
        supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'low_stock_threshold')
          .maybeSingle()
      ]);

      const headerProjectId = orderRes.data?.project_id || fallbackProjectId || null;
      const pairMap = new Map();
      for (const line of linesRes.data || []) {
        const deducted = Number(line.deducted_quantity);
        if (!Number.isFinite(deducted) || deducted <= 0) continue;

        const projectId = (lineSourceEnabled && line.project_id) || headerProjectId;
        if (!projectId || !line.item_id) continue;
        pairMap.set(`${projectId}::${line.item_id}`, { projectId, itemId: line.item_id });
      }

      const pairs = [...pairMap.values()];
      if (!pairs.length) return;

      const itemIds = [...new Set(pairs.map(pair => pair.itemId))];
      const [balanceRes, itemRes] = await Promise.all([
        supabase
          .from('stock_balance')
          .select('project_id, item_id, balance, project_name, unit')
          .in('item_id', itemIds),
        supabase
          .from('items')
          .select('id, name, sku, unit, min_stock')
          .in('id', itemIds)
      ]);

      const balanceByPair = new Map((balanceRes.data || []).map(row => [`${row.project_id}::${row.item_id}`, row]));
      const itemById = new Map((itemRes.data || []).map(row => [row.id, row]));
      const globalThreshold = Number(thresholdRes.data?.value);
      const fallbackThreshold = Number.isFinite(globalThreshold) ? globalThreshold : 10;

      for (const pair of pairs) {
        const balanceRow = balanceByPair.get(`${pair.projectId}::${pair.itemId}`);
        if (!balanceRow || balanceRow.balance === null || balanceRow.balance === undefined) continue;

        const itemRow = itemById.get(pair.itemId) || {};
        const itemThreshold = Number(itemRow.min_stock);
        const effectiveThreshold = itemThreshold > 0 ? itemThreshold : fallbackThreshold;
        const currentStock = Number(balanceRow.balance);

        if (!(currentStock <= effectiveThreshold)) continue;

        const projectRow = projects.find(p => p.id === pair.projectId);
        const projectName = projectRow?.name || balanceRow.project_name || 'โครงการทั่วไป';
        const warehouseName = getWarehouseLabel(projectRow) || balanceRow.project_name || 'คลังโครงการ';

        const result = await dispatchLowStockAlertNotification({
          itemId: pair.itemId,
          itemName: itemRow.name || 'วัสดุ',
          itemCode: itemRow.sku || '-',
          currentStock,
          threshold: effectiveThreshold,
          projectName,
          warehouseName,
          projectId: pair.projectId,
          triggeredBy: approvedByName
        });

        if (result?.dispatched) {
          toast.success(t('withdrawals.toasts.lowStockAlerted', { item: itemRow.name || '' }));
        }
      }
    } catch (lowStockError) {
      console.warn('[Withdrawals] Low stock alert notice:', lowStockError?.message);
      toast.error(t('withdrawals.toasts.lowStockAlertFailed'));
    }
  };

  // Submit Requisition Order
  const handleSubmitOrder = async ({ projectId, purpose, deliveryAddress }) => {
    if (cart.length === 0) return;

    if (!profile?.signature_url) {
      toast.error(t('profile.signatureRequired', 'กรุณาเพิ่มลายเซ็นก่อนทำรายการ'));
      setShowSigModal(true);
      return;
    }

    const targetProjectId = (projectId && projectId !== 'all')
      ? projectId
      : (cart[0]?.source_project_id || projects[0]?.id);

    if (!targetProjectId) {
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
          project_id: targetProjectId,
          purpose: purpose || null,
          delivery_address: deliveryAddress || null,
          requested_by: profile.id,
          status: 'pending'
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Insert line items. When migration 80 is live each line carries its own
      //    source warehouse; otherwise the DB trigger inherits the order's project.
      const itemsToInsert = cart.map(item => {
        const line = {
          order_id: orderData.id,
          item_id: item.id,
          quantity: item.quantity,
          delivery_to: item.delivery_to || deliveryAddress || null,
          serial_number: item.serial_number || null,
          part_number: item.part_number || null
        };
        if (lineSourceEnabled && item.source_project_id && item.source_project_id !== ALL_WAREHOUSES) {
          line.project_id = item.source_project_id;
        }
        return line;
      });

      const { error: itemsError } = await supabase.from('withdrawal_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      toast.success(t('withdrawals.toasts.submitted'), { id: toastId });

      // 3. Dispatch transactional notification email
      dispatchWithdrawalNotification({
        eventType: 'withdrawal_submitted',
        orderId: orderData.id,
        orderData: {
          ...orderData,
          projects: projects.find(p => p.id === targetProjectId),
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
    if (!canApprove || isProcessing) return false;

    if (!profile?.signature_url) {
      toast.error(t('profile.signatureRequired', 'กรุณาเพิ่มลายเซ็นก่อนทำรายการ'));
      setShowSigModal(true);
      return;
    }

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

      // Reorder-point alerts for the source warehouses this approval deducted from
      notifyLowStockItems({
        orderId,
        fallbackProjectId: selectedOrder?.project_id
          || (selectedProjectId !== ALL_WAREHOUSES ? selectedProjectId : null),
        approvedByName: profile?.full_name || 'Admin'
      }).catch(err => console.warn('[Low Stock Notification Warning]:', err));

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

      return true;
    } catch (error) {
      console.error('Approve Error:', error);
      const rawMsg = error.message || '';

      if (rawMsg.includes('SHORTAGE_DETECTED')) {
        toast.dismiss(toastId);
        try {
          const marker = 'SHORTAGE_DETECTED:';
          const markerIndex = rawMsg.indexOf(marker);
          const jsonStr = rawMsg.slice(markerIndex + marker.length).trim();
          const parsed = JSON.parse(jsonStr);
          const shortages = Array.isArray(parsed?.shortages) ? parsed.shortages : [];
          if (!shortages.length) throw new Error('SHORTAGE_DETECTED without a usable shortage list');
          setShortageData({ orderId, shortages });
          setShortageOverrideReason('');
          setIsShortageModalOpen(true);
        } catch {
          toast.error(t('withdrawals.toasts.insufficientStock', 'พัสดุในคลังมีไม่เพียงพอสำหรับการอนุมัติ'));
        }
      } else if (isSchemaMismatchError(error)) {
        // 42703 / PGRST202 etc: the RPC references a column the deployed schema
        // does not have (migration not applied yet). Show an actionable message
        // instead of the raw Postgres sentence.
        toast.error(
          t('withdrawals.toasts.approveFailedSchema', 'Approval failed: the database schema is out of date (pending migration). Please contact an administrator.'),
          { id: toastId, duration: 8000 }
        );
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
      return false;
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
        approverName: profile?.full_name || 'Admin',
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
  const handleCompleteOrder = async (orderId, remarks = null) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const toastId = toast.loading(t('withdrawals.toasts.completing'));
    try {
      const { error } = await supabase.rpc('complete_inventory_request', {
        p_request_id: orderId,
        p_remarks: remarks || null
      });
      if (error) throw error;

      toast.success(t('withdrawals.toasts.completed'), { id: toastId });

      dispatchWithdrawalNotification({
        eventType: 'withdrawal_completed',
        orderId,
        approverName: profile?.full_name || 'Admin'
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

  // Open Revert Modal (SUPER Role)
  const openRevertModal = (order, kind) => {
    if (!canRevertAction || !order || !kind) return;
    setRevertTarget({ order, kind });
    setIsRevertModalOpen(true);
  };

  // Open Cancel Modal (SUPER Role)
  const openCancelModal = (order) => {
    setOrderToCancel(order);
    setIsCancelModalOpen(true);
  };

  // Cancel Order via Supabase RPC (SUPER / withdrawals.cancel)
  const handleCancelSubmit = async (orderId, reason) => {
    if (!canCancel || isProcessing) return;
    setIsProcessing(true);
    const toastId = toast.loading(t('withdrawals.toasts.cancelling', 'กำลังยกเลิกคำขอเบิก...'));
    try {
      const { data, error } = await supabase.rpc('super_cancel_withdrawal_order', {
        p_order_id: orderId,
        p_reason: reason.trim() || null
      });
      if (error) throw error;

      toast.success(data?.message || t('withdrawals.toasts.cancelled', 'ยกเลิกคำขอเบิกเรียบร้อยแล้ว'), { id: toastId });

      setIsCancelModalOpen(false);
      setOrderToCancel(null);
      fetchData();

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          status: 'cancelled',
          cancellation_reason: reason.trim(),
          cancelled_at: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Cancel Error:', error);
      const cleanErrMsg = error.message
        ? error.message.replace(/.*(?:EXCEPTION|Error|P0001):\s*/i, '')
        : 'Failed to cancel requisition';
      toast.error(cleanErrMsg, { id: toastId, duration: 6000 });
    } finally {
      setIsProcessing(false);
    }
  };

  // View Order Details
  const viewOrderDetails = useCallback(async (order) => {
    try {
      const { data, error } = await supabase
        .from('withdrawal_items')
        .select('*, items(name, unit, sku)')
        .eq('order_id', order.id);
      if (error) throw error;
      setOrderDetails(data || []);

      // Current balance per (source warehouse, item) so the approval screen can show
      // the real remaining quantity instead of only the warehouse name.
      const itemIds = [...new Set((data || []).map(row => row.item_id).filter(Boolean))];
      let stockRows = [];
      if (itemIds.length) {
        const { data: stockData } = await supabase
          .from('stock_balance')
          .select('project_id, item_id, balance')
          .in('item_id', itemIds);
        stockRows = stockData || [];
      }
      setOrderStockRows(stockRows);

      setSelectedOrder(order);
      setIsDetailsModalOpen(true);
    } catch {
      toast.error('Failed to load requisition details');
    }
  }, []);

  // Deep-link support: open the detail modal for ?tab=orders&id=<order>
  const handledNotificationIdRef = useRef(null);
  useEffect(() => {
    if (!idParam || orders.length === 0) return;
    if (handledNotificationIdRef.current === idParam) return;

    const targetOrder = orders.find(o => o.id === idParam || o.work_order_no === idParam);
    if (!targetOrder) return;

    handledNotificationIdRef.current = idParam;
    viewOrderDetails(targetOrder);
  }, [idParam, orders, viewOrderDetails]);

  // Download PDF
  const handleDownloadPDF = async (order, existingItems = null) => {
    if (!order) return;

    // Strict Policy: PDF is generated only for approved or completed requests
    if (order.status !== 'approved' && order.status !== 'completed') {
      toast.error(t('withdrawals.toasts.pdfNotAllowed', 'PDF is available only for approved or completed requests'));
      return;
    }

    const toastId = toast.loading('Generating requisition PDF document...');
    try {
      const itemsList = await resolveWithdrawalItems(order, existingItems);

      const docBlob = await pdf(
        <MaterialWithdrawalPDF order={order} items={itemsList} profile={profile} projects={projects} />
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

  // Download Material Dispatch Note (ใบนำส่งเบิกของ)
  const handleDownloadDispatchPDF = async (order, existingItems = null) => {
    if (!order) return;

    // Strict Policy: dispatch notes are generated only for approved or completed requests
    if (order.status !== 'approved' && order.status !== 'completed') {
      toast.error(t('withdrawals.toasts.pdfNotAllowed', 'PDF is available only for approved or completed requests'));
      return;
    }

    const toastId = toast.loading(t('withdrawals.toasts.dispatchNoteGenerating', 'Generating dispatch note PDF...'));
    try {
      const itemsList = await resolveWithdrawalItems(order, existingItems);

      const docBlob = await pdf(
        <MaterialDispatchPDF order={order} items={itemsList} profile={profile} mode="withdrawal" projects={projects} />
      ).toBlob();

      const url = URL.createObjectURL(docBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Dispatch_Note_${toSafeFileToken(order.work_order_no || order.id?.slice(0, 8))}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(t('withdrawals.toasts.dispatchNoteDownloaded', 'Dispatch note downloaded'), { id: toastId });
    } catch (err) {
      console.error('Dispatch Note PDF Error:', err);
      toast.error(t('withdrawals.toasts.dispatchNotePdfFailed', 'Failed to generate dispatch note PDF'), { id: toastId });
    }
  };

  const pendingOrdersCount = orders.filter(o => o.status === 'pending').length;
  const totalCartUnits = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <ClipboardList className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <span>{t('withdrawals.title', 'คำขอเบิกและจ่ายพัสดุ')}</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('withdrawals.subtitle', 'ทำรายการเบิกและจ่ายวัสดุสำหรับงานติดตั้งในโครงการ')}
            </p>
          </div>
        </div>
      </div>

      {/* Top Requisition Hub Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-2 sm:p-2.5 rounded-xl bg-card border border-border shadow-xs">
        <div
          role="tablist"
          aria-label={t('withdrawals.title', 'Requisition Navigation Tabs')}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          {/* Tab 1: POS Terminal */}
          <button
            type="button"
            role="tab"
            id="tab-pos"
            aria-selected={activeTab === 'pos'}
            aria-controls="panel-pos"
            tabIndex={activeTab === 'pos' ? 0 : -1}
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all cursor-pointer flex-1 sm:flex-none justify-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none ${
              activeTab === 'pos'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" aria-hidden="true" />
            <span>{t('withdrawals.posTab')}</span>
            {cart.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-extrabold ${
                activeTab === 'pos' ? 'bg-white text-primary shadow-xs' : 'bg-primary text-primary-foreground'
              }`}>
                {cart.length} {t('common.items')} ({totalCartUnits} {t('common.unit')})
              </span>
            )}
          </button>

          {/* Tab 2: Orders Tracking */}
          <button
            type="button"
            role="tab"
            id="tab-orders"
            aria-selected={activeTab === 'orders'}
            aria-controls="panel-orders"
            tabIndex={activeTab === 'orders' ? 0 : -1}
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all cursor-pointer flex-1 sm:flex-none justify-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none ${
              activeTab === 'orders'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>{t('withdrawals.requisitionsTab')}</span>
            {pendingOrdersCount > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-mono font-extrabold bg-amber-500 text-slate-950 animate-pulse motion-reduce:animate-none"
                title={`${pendingOrdersCount} ${t('common.pending')}`}
                aria-label={`${pendingOrdersCount} ${t('common.pending')}`}
              >
                {pendingOrdersCount}
              </span>
            )}
          </button>
        </div>

        {/* Status Indicator */}
        <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-muted-foreground pr-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping motion-reduce:animate-none" aria-hidden="true" />
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
          lineSourceEnabled={lineSourceEnabled}
          onAddToCart={handleAddToCart}
          onChangeSourceWarehouse={handleChangeSourceWarehouse}
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
          projects={projects}
          loading={loading}
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          canApprove={canApprove}
          canReject={canReject}
          canComplete={canComplete}
          canCancel={canCancel}
          onOpenPosMode={() => setActiveTab('pos')}
          onViewOrderDetails={viewOrderDetails}
          onDownloadPDF={handleDownloadPDF}
          onDownloadDispatchPDF={handleDownloadDispatchPDF}
          onApproveOrder={handleApproveOrder}
          onOpenRejectModal={openRejectModal}
          onOpenCancelModal={openCancelModal}
          onCompleteOrder={handleCompleteOrder}
          canRevertAction={canRevertAction}
          onOpenRevertModal={openRevertModal}
        />
      )}

      {/* View Order Details Modal */}
      <WithdrawalDetailModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        order={selectedOrder}
        orderDetails={orderDetails}
        stockRows={orderStockRows}
        projects={projects}
        showSourceWarehouse={lineSourceEnabled}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        canApprove={canApprove}
        canReject={canReject}
        canComplete={canComplete}
        canCancel={canCancel}
        onApproveOrder={async (orderId) => {
          // Keep the modal open when approval fails so the error stays visible
          // next to the request that failed.
          const approved = await handleApproveOrder(orderId);
          if (approved) setIsDetailsModalOpen(false);
        }}
        onOpenRejectModal={(order) => {
          openRejectModal(order);
          setIsDetailsModalOpen(false);
        }}
        onOpenCancelModal={openCancelModal}
        onCompleteOrder={(orderId) => {
          handleCompleteOrder(orderId);
          setIsDetailsModalOpen(false);
        }}
        onDownloadPDF={handleDownloadPDF}
        onDownloadDispatchPDF={handleDownloadDispatchPDF}
        canRevertAction={canRevertAction}
        onOpenRevertModal={(order, kind) => {
          openRevertModal(order, kind);
          setIsDetailsModalOpen(false);
        }}
      />

      {/* Shortage Warning & Override Modal */}
      <WithdrawalShortageModal
        isOpen={isShortageModalOpen}
        onClose={() => setIsShortageModalOpen(false)}
        shortageData={shortageData}
        projects={projects}
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

      {/* SUPER Role Cancel Modal */}
      <WithdrawalCancelModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        order={orderToCancel}
        onConfirmCancel={handleCancelSubmit}
        isProcessing={isProcessing}
      />

      {/* SUPER Revert / Undo Modal */}
      <SuperRevertActionModal
        isOpen={isRevertModalOpen}
        onClose={() => {
          setIsRevertModalOpen(false);
          setRevertTarget(null);
        }}
        kind={revertTarget?.kind}
        order={revertTarget?.order}
        onSuccess={(data, reason) => {
          if (data?.order_id) {
            dispatchRevertNotification({
              eventType: 'withdrawal_reverted',
              orderId: data.order_id,
              kind: 'withdrawal',
              actorName: profile?.full_name || 'SUPER',
              reason,
              previousStatus: data.previous_status,
              newStatus: data.new_status
            }).catch(err => console.warn('[Revert Notification Warning]:', err));
          }
          setIsDetailsModalOpen(false);
          fetchData();
        }}
      />

      {/* Signature Required Gate Modal */}
      <SignatureRequiredModal
        isOpen={showSigModal}
        onClose={() => setShowSigModal(false)}
      />
    </div>
  );
};

export default Withdrawals;
