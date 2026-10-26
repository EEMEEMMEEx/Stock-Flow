import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PackageX,
  Search,
  Filter,
  RefreshCw,
  Download,
  Recycle,
  Trash2,
  Cpu,
  Wrench,
  CheckCircle2,
  Boxes,
  Loader2,
  AlertTriangle,
  AlertCircle,
  PackageCheck,
  Send,
  ExternalLink,
  Hash
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RepairResolutionModal from '@/components/checkouts/RepairResolutionModal';
import EditSerialModal from '@/components/checkouts/EditSerialModal';
import CaimClaimSubmitModal from '@/components/checkouts/CaimClaimSubmitModal';
import CaimInboundConfirmModal from '@/components/checkouts/CaimInboundConfirmModal';

const SCRAP_TABS = ['outbound_claim', 'inbound_caim', 'pending', 'disposed'];

const Scrap = () => {
  const { t, i18n } = useTranslation();
  const { can, isSuperAdmin, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab = SCRAP_TABS.includes(tabParam) ? tabParam : 'outbound_claim';

  const setActiveTab = useCallback((nextTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const canResolveRepair = can('checkouts.resolve_repair') || isAdmin || isSuperAdmin;
  const canSendClaim = can('checkouts.return') || can('checkouts.resolve_repair') || isAdmin || isSuperAdmin;
  const canConfirmInbound = can('stock_in.create') || can('checkouts.resolve_repair') || isAdmin || isSuperAdmin;
  const canEditSerial = can('checkouts.edit_serial') || can('checkouts.resolve_repair') || isAdmin || isSuperAdmin;

  // Data states
  const [outboundClaimItems, setOutboundClaimItems] = useState([]);
  const [inboundCaimItems, setInboundCaimItems] = useState([]);
  const [pendingItems, setPendingItems] = useState([]);
  const [disposedItems, setDisposedItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [selectedMethod, setSelectedMethod] = useState('all');

  // Modal states
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [selectedReturnLog, setSelectedReturnLog] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [isEditSerialModalOpen, setIsEditSerialModalOpen] = useState(false);
  const [selectedSerialLog, setSelectedSerialLog] = useState(null);

  const [isClaimSubmitModalOpen, setIsClaimSubmitModalOpen] = useState(false);
  const [selectedClaimSubmitLog, setSelectedClaimSubmitLog] = useState(null);

  const [isInboundConfirmModalOpen, setIsInboundConfirmModalOpen] = useState(false);
  const [selectedInboundLog, setSelectedInboundLog] = useState(null);

  // Fetch projects for filter dropdown
  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_code')
        .order('name');
      if (!error && data) {
        setProjects(data);
      }
    } catch (err) {
      console.warn('Fetch projects failed:', err);
    }
  }, []);

  // 1. Fetch Outbound Claims: returned items in consumed/damaged/needs_repair condition needing CAIM ticket
  const fetchOutboundClaims = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('checkout_return_logs')
        .select(`
          id,
          returned_at,
          returned_quantity,
          item_condition,
          damage_notes,
          repair_resolution_status,
          replaced_serial_number,
          caim_ticket_id,
          caim_sync_status,
          caim_sync_error,
          checkout_order_id,
          destination_project_id,
          checkout_orders (
            id,
            order_number,
            borrower_name,
            project_id,
            projects (id, name, project_code)
          ),
          checkout_items (
            id,
            serial_number,
            items (id, name, model, unit, sku, vendor)
          )
        `)
        .in('item_condition', ['consumed', 'damaged', 'needs_repair'])
        .is('caim_ticket_id', null)
        .neq('caim_sync_status', 'synced')
        .eq('repair_resolution_status', 'unresolved')
        .order('returned_at', { ascending: false });

      if (error) throw error;
      setOutboundClaimItems(data || []);
    } catch (err) {
      console.error('Fetch outbound claims failed:', err);
    }
  }, []);

  // 2. Fetch Inbound CAIM Results: closed tickets from CAIM awaiting user confirmation
  const fetchInboundCaim = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('checkout_return_logs')
        .select(`
          id,
          returned_at,
          returned_quantity,
          item_condition,
          damage_notes,
          repair_resolution_status,
          replaced_serial_number,
          caim_ticket_id,
          caim_ticket_url,
          caim_repair_result,
          caim_closed_at,
          caim_inbound_status,
          caim_inbound_payload,
          checkout_order_id,
          destination_project_id,
          checkout_orders (
            id,
            order_number,
            borrower_name,
            project_id,
            projects (id, name, project_code)
          ),
          checkout_items (
            id,
            serial_number,
            items (id, name, model, unit, sku)
          )
        `)
        .eq('caim_inbound_status', 'pending_confirmation')
        .order('caim_closed_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setInboundCaimItems(data || []);
    } catch (err) {
      console.error('Fetch inbound caim items failed:', err);
    }
  }, []);

  // 3. Fetch In-House Pending Repairs
  const fetchPendingDamaged = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('checkout_return_logs')
        .select(`
          id,
          returned_at,
          returned_quantity,
          item_condition,
          damage_notes,
          repair_resolution_status,
          replaced_serial_number,
          destination_project_id,
          caim_ticket_id,
          checkout_order_id,
          checkout_orders (
            id,
            order_number,
            borrower_name,
            project_id,
            projects (id, name, project_code)
          ),
          checkout_items (
            id,
            serial_number,
            items (id, name, model, unit, sku)
          )
        `)
        .in('item_condition', ['damaged', 'needs_repair'])
        .eq('repair_resolution_status', 'unresolved')
        .order('returned_at', { ascending: false });

      if (error) throw error;
      setPendingItems(data || []);
    } catch (err) {
      console.error('Fetch pending damaged returns failed:', err);
    }
  }, []);

  // 4. Fetch Disposed Scrap Items
  const fetchDisposedScrap = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('scrap_disposal_items')
        .select(`
          id,
          disposed_at,
          quantity,
          serial_number,
          reason,
          disposal_method,
          notes,
          closed_by,
          caim_ticket_id,
          is_reverted,
          items (id, name, model, unit, sku),
          projects (id, name, project_code),
          checkout_orders (id, order_number, borrower_name)
        `)
        .eq('is_reverted', false)
        .order('disposed_at', { ascending: false });

      if (error) throw error;
      setDisposedItems(data || []);
    } catch (err) {
      console.error('Fetch disposed scrap failed:', err);
    }
  }, []);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchProjects(),
      fetchOutboundClaims(),
      fetchInboundCaim(),
      fetchPendingDamaged(),
      fetchDisposedScrap()
    ]);
    setLoading(false);
  }, [fetchProjects, fetchOutboundClaims, fetchInboundCaim, fetchPendingDamaged, fetchDisposedScrap]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchOutboundClaims(),
      fetchInboundCaim(),
      fetchPendingDamaged(),
      fetchDisposedScrap()
    ]);
    setRefreshing(false);
    toast.success(t('common.dataRefreshed', 'Data refreshed'));
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle open repair modal
  const handleOpenRepairModal = (log) => {
    setSelectedReturnLog(log);
    setSelectedOrder(log.checkout_orders || { id: log.checkout_order_id });
    setIsRepairModalOpen(true);
  };

  // Handle open edit serial modal
  const handleOpenEditSerialModal = (log) => {
    setSelectedSerialLog(log);
    setSelectedOrder(log.checkout_orders || { id: log.checkout_order_id });
    setIsEditSerialModalOpen(true);
  };

  // Handle open claim submit modal
  const handleOpenClaimSubmitModal = (log) => {
    setSelectedClaimSubmitLog(log);
    setIsClaimSubmitModalOpen(true);
  };

  // Handle open inbound confirm modal
  const handleOpenInboundConfirmModal = (log) => {
    setSelectedInboundLog(log);
    setIsInboundConfirmModalOpen(true);
  };

  // Filtered lists
  const filteredOutbound = useMemo(() => {
    return outboundClaimItems.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (item.checkout_items?.items?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_items?.serial_number || item.replaced_serial_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.order_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.borrower_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const itemProjectId = item.destination_project_id || item.checkout_orders?.project_id;
      const matchesProject = selectedProjectId === 'all' || itemProjectId === selectedProjectId;

      return matchesSearch && matchesProject;
    });
  }, [outboundClaimItems, searchTerm, selectedProjectId]);

  const filteredInbound = useMemo(() => {
    return inboundCaimItems.filter((item) => {
      const payload = item.caim_inbound_payload || {};
      const serialNo = payload.newSerialNo || payload.serialNo || item.replaced_serial_number || item.checkout_items?.serial_number || '';

      const matchesSearch =
        !searchTerm.trim() ||
        (item.checkout_items?.items?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.caim_ticket_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        serialNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.order_number || '').toLowerCase().includes(searchTerm.toLowerCase());

      const itemProjectId = item.destination_project_id || item.checkout_orders?.project_id;
      const matchesProject = selectedProjectId === 'all' || itemProjectId === selectedProjectId;

      return matchesSearch && matchesProject;
    });
  }, [inboundCaimItems, searchTerm, selectedProjectId]);

  const filteredPending = useMemo(() => {
    return pendingItems.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (item.checkout_items?.items?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_items?.serial_number || item.replaced_serial_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.order_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.borrower_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const itemProjectId = item.destination_project_id || item.checkout_orders?.project_id;
      const matchesProject = selectedProjectId === 'all' || itemProjectId === selectedProjectId;

      return matchesSearch && matchesProject;
    });
  }, [pendingItems, searchTerm, selectedProjectId]);

  const filteredDisposed = useMemo(() => {
    return disposedItems.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (item.items?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.serial_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.order_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.borrower_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.reason || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProject = selectedProjectId === 'all' || item.project_id === selectedProjectId;
      const matchesMethod = selectedMethod === 'all' || item.disposal_method === selectedMethod;

      return matchesSearch && matchesProject && matchesMethod;
    });
  }, [disposedItems, searchTerm, selectedProjectId, selectedMethod]);

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(i18n.language === 'th' ? 'th-TH' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  // Render condition badge
  const renderConditionBadge = (condition) => {
    switch (condition) {
      case 'consumed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
            ใช้งานทดแทน
          </span>
        );
      case 'needs_repair':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
            ส่งซ่อม
          </span>
        );
      case 'damaged':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            ชำรุดเสียหาย
          </span>
        );
    }
  };

  // Disposal badge color and label
  const renderDisposalBadge = (method) => {
    switch (method) {
      case 'parts_harvest':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <Recycle className="w-3 h-3" />
            {t('scrap.disposalHarvest')}
          </span>
        );
      case 'electronic_waste':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            <Cpu className="w-3 h-3" />
            {t('scrap.disposalElectronic')}
          </span>
        );
      case 'recycle':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
            <Recycle className="w-3 h-3" />
            {t('scrap.disposalRecycle')}
          </span>
        );
      case 'dispose':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
            <Trash2 className="w-3 h-3" />
            {t('scrap.disposalDispose')}
          </span>
        );
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    let targetData = [];
    let sheetName = 'Scrap_Export';

    if (activeTab === 'outbound_claim') {
      targetData = filteredOutbound.map((row, idx) => ({
        '#': idx + 1,
        [t('scrap.orderNumber')]: row.checkout_orders?.order_number || '-',
        [t('scrap.borrower')]: row.checkout_orders?.borrower_name || '-',
        [t('scrap.itemName')]: row.checkout_items?.items?.name || '-',
        [t('scrap.serialNumber')]: row.checkout_items?.serial_number || row.replaced_serial_number || '-',
        [t('scrap.condition')]: row.item_condition || '-',
        [t('scrap.quantity')]: `${row.returned_quantity} ${row.checkout_items?.items?.unit || ''}`.trim(),
        [t('scrap.project')]: row.checkout_orders?.projects?.name || '-',
        [t('scrap.damagedDate')]: formatDate(row.returned_at),
        [t('scrap.damageNotes')]: row.damage_notes || '-'
      }));
      sheetName = 'Pending_CAIM_Claims';
    } else if (activeTab === 'inbound_caim') {
      targetData = filteredInbound.map((row, idx) => ({
        '#': idx + 1,
        [t('scrap.caimTicket')]: row.caim_ticket_id || '-',
        [t('scrap.orderNumber')]: row.checkout_orders?.order_number || '-',
        [t('scrap.itemName')]: row.checkout_items?.items?.name || '-',
        [t('scrap.serialNumber')]: row.caim_inbound_payload?.newSerialNo || row.caim_inbound_payload?.serialNo || row.replaced_serial_number || '-',
        [t('scrap.caimResult')]: row.caim_repair_result || '-',
        [t('scrap.project')]: row.checkout_orders?.projects?.name || '-',
        [t('scrap.disposedDate')]: formatDate(row.caim_closed_at),
        [t('scrap.damageNotes')]: row.caim_inbound_payload?.notes || '-'
      }));
      sheetName = 'CAIM_Inbound_Confirmations';
    } else if (activeTab === 'pending') {
      targetData = filteredPending.map((row, idx) => ({
        '#': idx + 1,
        [t('scrap.orderNumber')]: row.checkout_orders?.order_number || '-',
        [t('scrap.borrower')]: row.checkout_orders?.borrower_name || '-',
        [t('scrap.itemName')]: row.checkout_items?.items?.name || '-',
        [t('scrap.serialNumber')]: row.checkout_items?.serial_number || row.replaced_serial_number || '-',
        [t('scrap.quantity')]: `${row.returned_quantity} ${row.checkout_items?.items?.unit || ''}`.trim(),
        [t('scrap.project')]: row.checkout_orders?.projects?.name || '-',
        [t('scrap.damagedDate')]: formatDate(row.returned_at),
        [t('scrap.damageNotes')]: row.damage_notes || '-'
      }));
      sheetName = 'Pending_Inhouse_Repairs';
    } else {
      targetData = filteredDisposed.map((row, idx) => ({
        '#': idx + 1,
        [t('scrap.disposedDate')]: formatDate(row.disposed_at),
        [t('scrap.itemName')]: row.items?.name || '-',
        [t('scrap.serialNumber')]: row.serial_number || '-',
        [t('scrap.quantity')]: `${row.quantity} ${row.items?.unit || ''}`.trim(),
        [t('scrap.project')]: row.projects?.name || '-',
        [t('scrap.disposalMethod')]: row.disposal_method || '-',
        [t('scrap.orderNumber')]: row.checkout_orders?.order_number || '-',
        [t('scrap.caimTicket')]: row.caim_ticket_id || '-',
        [t('scrap.damageNotes')]: row.reason || row.notes || '-',
        [t('scrap.disposedBy')]: row.closed_by || '-'
      }));
      sheetName = 'Scrap_Register';
    }

    if (!targetData || targetData.length === 0) {
      toast.error(t('common.noDataToExport', 'No data to export'));
      return;
    }

    const { utils, writeFile } = await import('xlsx');
    const worksheet = utils.json_to_sheet(targetData);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, sheetName);

    const fileName = `StockFlow_${sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    writeFile(workbook, fileName);
    toast.success(t('common.exportSuccess', 'Exported successfully'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <PackageX className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {t('scrap.title')}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('scrap.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="h-9 gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{t('scrap.refresh')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={loading}
            className="h-9 gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('scrap.exportExcel')}</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-muted/60 dark:bg-muted/30 rounded-xl w-fit border border-border/50 flex-wrap">
        {/* Tab 1: Outbound CAIM Claims */}
        <button
          type="button"
          onClick={() => setActiveTab('outbound_claim')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer select-none ${
            activeTab === 'outbound_claim'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span>{t('scrap.outboundClaimTab', 'รอส่งเคลม CAIM')}</span>
          {outboundClaimItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-mono font-bold">
              {outboundClaimItems.length}
            </span>
          )}
        </button>

        {/* Tab 2: Inbound CAIM Confirmations */}
        <button
          type="button"
          onClick={() => setActiveTab('inbound_caim')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer select-none ${
            activeTab === 'inbound_caim'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <PackageCheck className="w-3.5 h-3.5 text-teal-500" />
          <span>{t('scrap.inboundCaimTab', 'ผลเคลมรอรับเข้า/ตัดจำหน่าย')}</span>
          {inboundCaimItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-teal-500/15 text-teal-700 dark:text-teal-400 text-xs font-mono font-bold">
              {inboundCaimItems.length}
            </span>
          )}
        </button>

        {/* Tab 3: Pending In-house Repairs */}
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer select-none ${
            activeTab === 'pending'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wrench className="w-3.5 h-3.5 text-blue-500" />
          <span>{t('scrap.pendingTab', 'ซ่อมภายในคลัง')}</span>
          {pendingItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-400 text-xs font-mono font-bold">
              {pendingItems.length}
            </span>
          )}
        </button>

        {/* Tab 4: Disposed Scrap Register */}
        <button
          type="button"
          onClick={() => setActiveTab('disposed')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer select-none ${
            activeTab === 'disposed'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <PackageX className="w-3.5 h-3.5 text-rose-500" />
          <span>{t('scrap.disposedTab', 'ทะเบียนของเสีย')}</span>
          {disposedItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-400 text-xs font-mono font-bold">
              {disposedItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-card border border-border/60 rounded-xl p-3 shadow-2xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('scrap.searchPlaceholder')}
            className="pl-9 h-9 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-[180px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">{t('scrap.filterProject')}</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} ({proj.project_code || proj.name})
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'disposed' && (
            <div className="min-w-[160px]">
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                className="w-full h-9 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">{t('scrap.filterMethod')}</option>
                <option value="parts_harvest">{t('scrap.disposalHarvest')}</option>
                <option value="electronic_waste">{t('scrap.disposalElectronic')}</option>
                <option value="recycle">{t('scrap.disposalRecycle')}</option>
                <option value="dispose">{t('scrap.disposalDispose')}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-card border border-border/60 rounded-xl">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">{t('scrap.loading', 'Loading...')}</p>
        </div>
      ) : activeTab === 'outbound_claim' ? (
        /* Tab 1: Outbound CAIM Claims */
        <div className="bg-card border border-border/60 rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">{t('scrap.orderNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.itemName')}</th>
                  <th className="py-3 px-4">{t('scrap.serialNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.condition')}</th>
                  <th className="py-3 px-4">{t('scrap.quantity')}</th>
                  <th className="py-3 px-4">{t('scrap.project')}</th>
                  <th className="py-3 px-4">{t('scrap.damagedDate')}</th>
                  <th className="py-3 px-4">{t('scrap.damageNotes')}</th>
                  <th className="py-3 px-4 text-right">{t('common.actions') || 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredOutbound.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                        <p className="text-xs font-medium">{t('scrap.noOutboundItems')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredOutbound.map((log) => {
                    const itemName = log.checkout_items?.items?.name || '-';
                    const itemUnit = log.checkout_items?.items?.unit || '';
                    const itemSerial = log.checkout_items?.serial_number || log.replaced_serial_number || '';
                    const orderNumber = log.checkout_orders?.order_number || '-';
                    const borrowerName = log.checkout_orders?.borrower_name || '';
                    const projectName = log.checkout_orders?.projects?.name || '-';
                    const hasSerial = Boolean(itemSerial && itemSerial.trim());

                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-foreground">
                          <div>
                            <span>{orderNumber}</span>
                            {borrowerName && (
                              <div className="text-xs text-muted-foreground">{borrowerName}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {itemName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {hasSerial ? (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/50">
                              {itemSerial}
                            </span>
                          ) : (
                            <span className="text-rose-500 italic text-[11px]">
                              ยังไม่มี S/N
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {renderConditionBadge(log.item_condition)}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {log.returned_quantity} {itemUnit}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {projectName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDate(log.returned_at)}
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-muted-foreground" title={log.damage_notes || ''}>
                          {log.damage_notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!hasSerial && canEditSerial && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenEditSerialModal(log)}
                                className="h-7 px-2 text-[11px] gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                              >
                                <Hash className="w-3 h-3" />
                                <span>ระบุ S/N</span>
                              </Button>
                            )}

                            {canSendClaim ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={!hasSerial}
                                onClick={() => handleOpenClaimSubmitModal(log)}
                                className="h-7 px-2.5 text-[11px] gap-1 font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                              >
                                <Send className="w-3 h-3" />
                                <span>{t('scrap.sendCaimAction')}</span>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                {t('common.viewOnly', 'View only')}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'inbound_caim' ? (
        /* Tab 2: Inbound CAIM Results */
        <div className="bg-card border border-border/60 rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">{t('scrap.caimTicket')}</th>
                  <th className="py-3 px-4">{t('scrap.orderNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.itemName')}</th>
                  <th className="py-3 px-4">{t('scrap.serialNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.caimResult')}</th>
                  <th className="py-3 px-4">{t('scrap.project')}</th>
                  <th className="py-3 px-4">วันที่ปิดเคส</th>
                  <th className="py-3 px-4">หมายเหตุจาก CAIM</th>
                  <th className="py-3 px-4 text-right">{t('common.actions') || 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredInbound.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                        <p className="text-xs font-medium">{t('scrap.noInboundItems')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInbound.map((log) => {
                    const itemName = log.checkout_items?.items?.name || '-';
                    const payload = log.caim_inbound_payload || {};
                    const serialNo = payload.newSerialNo || payload.serialNo || log.replaced_serial_number || log.checkout_items?.serial_number || '-';
                    const orderNumber = log.checkout_orders?.order_number || '-';
                    const projectName = log.checkout_orders?.projects?.name || '-';
                    const repairResult = log.caim_repair_result || '';
                    const isRestoration = repairResult === 'repaired' || repairResult === 'replaced_new';
                    const ticketId = log.caim_ticket_id || payload.ticketId || '-';
                    const ticketUrl = log.caim_ticket_url || `https://claims-nu-taupe.vercel.app/tickets?search=${encodeURIComponent(ticketId)}`;

                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold">
                          <a
                            href={ticketUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <span>{ticketId}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">
                          {orderNumber}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {itemName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/50">
                            {serialNo}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[11px] border ${
                              repairResult === 'repaired'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                : repairResult === 'replaced_new'
                                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                : repairResult === 'rejected'
                                ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {repairResult === 'repaired'
                              ? t('scrap.caimResultRepaired')
                              : repairResult === 'replaced_new'
                              ? t('scrap.caimResultReplaced')
                              : repairResult === 'rejected'
                              ? t('scrap.caimResultRejected', 'ปฏิเสธเคลม')
                              : t('scrap.caimResultUnrepairable')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {projectName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDate(log.caim_closed_at)}
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-muted-foreground" title={payload.notes || ''}>
                          {payload.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canConfirmInbound ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleOpenInboundConfirmModal(log)}
                              className={`h-7 px-2.5 text-[11px] gap-1 font-semibold text-white cursor-pointer shadow-2xs ${
                                isRestoration
                                  ? 'bg-emerald-600 hover:bg-emerald-700'
                                  : repairResult === 'rejected'
                                  ? 'bg-red-600 hover:bg-red-700'
                                  : 'bg-rose-600 hover:bg-rose-700'
                              }`}
                            >
                              {isRestoration ? (
                                <>
                                  <PackageCheck className="w-3 h-3" />
                                  <span>{t('scrap.confirmStockInAction')}</span>
                                </>
                              ) : repairResult === 'rejected' ? (
                                <>
                                  <AlertCircle className="w-3 h-3" />
                                  <span>{t('scrap.manageRejectedAction', 'จัดการรายการ')}</span>
                                </>
                              ) : (
                                <>
                                  <PackageX className="w-3 h-3" />
                                  <span>{t('scrap.confirmScrapAction')}</span>
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {t('common.viewOnly', 'View only')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'pending' ? (
        /* Tab 3: In-House Pending Repairs */
        <div className="bg-card border border-border/60 rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">{t('scrap.orderNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.itemName')}</th>
                  <th className="py-3 px-4">{t('scrap.serialNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.quantity')}</th>
                  <th className="py-3 px-4">{t('scrap.project')}</th>
                  <th className="py-3 px-4">{t('scrap.damagedDate')}</th>
                  <th className="py-3 px-4">{t('scrap.damageNotes')}</th>
                  <th className="py-3 px-4 text-right">{t('common.actions') || 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredPending.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                        <p className="text-xs font-medium">{t('scrap.noPendingItems')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredPending.map((log) => {
                    const itemName = log.checkout_items?.items?.name || '-';
                    const itemUnit = log.checkout_items?.items?.unit || '';
                    const itemSerial = log.checkout_items?.serial_number || log.replaced_serial_number || '-';
                    const orderNumber = log.checkout_orders?.order_number || '-';
                    const borrowerName = log.checkout_orders?.borrower_name || '';
                    const projectName = log.checkout_orders?.projects?.name || '-';

                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-foreground">
                          <div>
                            <span>{orderNumber}</span>
                            {borrowerName && (
                              <div className="text-xs text-muted-foreground">{borrowerName}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {itemName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {itemSerial !== '-' ? (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/50">
                              {itemSerial}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {log.returned_quantity} {itemUnit}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {projectName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDate(log.returned_at)}
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-muted-foreground" title={log.damage_notes || ''}>
                          {log.damage_notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!log.caim_ticket_id && canSendClaim && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenClaimSubmitModal(log)}
                                className="h-8 px-2.5 text-xs gap-1 font-semibold border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>{t('scrap.sendCaimAction')}</span>
                              </Button>
                            )}

                            {canResolveRepair ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleOpenRepairModal(log)}
                                className="h-8 px-2.5 text-xs gap-1.5 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs cursor-pointer"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                                <span>{t('scrap.resolveAction')}</span>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                {t('common.viewOnly', 'View only')}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Tab 4: Disposed Scrap Register */
        <div className="bg-card border border-border/60 rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">{t('scrap.disposedDate')}</th>
                  <th className="py-3 px-4">{t('scrap.itemName')}</th>
                  <th className="py-3 px-4">{t('scrap.serialNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.quantity')}</th>
                  <th className="py-3 px-4">{t('scrap.project')}</th>
                  <th className="py-3 px-4">{t('scrap.disposalMethod')}</th>
                  <th className="py-3 px-4">{t('scrap.orderNumber')}</th>
                  <th className="py-3 px-4">{t('scrap.damageNotes')}</th>
                  <th className="py-3 px-4">{t('scrap.disposedBy')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredDisposed.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Boxes className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-xs font-medium">{t('scrap.noDisposedItems')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDisposed.map((item) => {
                    const itemName = item.items?.name || '-';
                    const itemUnit = item.items?.unit || '';
                    const orderNumber = item.checkout_orders?.order_number || (item.caim_ticket_id ? `CAIM: ${item.caim_ticket_id}` : '-');
                    const projectName = item.projects?.name || '-';

                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDate(item.disposed_at)}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {itemName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {item.serial_number ? (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/50">
                              {item.serial_number}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {item.quantity} {itemUnit}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {projectName}
                        </td>
                        <td className="py-3 px-4">
                          {renderDisposalBadge(item.disposal_method)}
                        </td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">
                          {orderNumber}
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-muted-foreground" title={item.reason || item.notes || ''}>
                          {item.reason || item.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {item.closed_by || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Repair Resolution (In-house) */}
      {isRepairModalOpen && selectedReturnLog && (
        <RepairResolutionModal
          isOpen={isRepairModalOpen}
          onClose={() => {
            setIsRepairModalOpen(false);
            setSelectedReturnLog(null);
            setSelectedOrder(null);
          }}
          log={selectedReturnLog}
          order={selectedOrder}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Modal 2: Edit Serial Number */}
      {isEditSerialModalOpen && selectedSerialLog && (
        <EditSerialModal
          isOpen={isEditSerialModalOpen}
          onClose={() => {
            setIsEditSerialModalOpen(false);
            setSelectedSerialLog(null);
            setSelectedOrder(null);
          }}
          log={selectedSerialLog}
          order={selectedOrder}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Modal 3: Submit Claim to CAIM */}
      {isClaimSubmitModalOpen && selectedClaimSubmitLog && (
        <CaimClaimSubmitModal
          isOpen={isClaimSubmitModalOpen}
          onClose={() => {
            setIsClaimSubmitModalOpen(false);
            setSelectedClaimSubmitLog(null);
          }}
          log={selectedClaimSubmitLog}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Modal 4: Confirm Inbound CAIM Resolution */}
      {isInboundConfirmModalOpen && selectedInboundLog && (
        <CaimInboundConfirmModal
          isOpen={isInboundConfirmModalOpen}
          onClose={() => {
            setIsInboundConfirmModalOpen(false);
            setSelectedInboundLog(null);
          }}
          log={selectedInboundLog}
          onSuccess={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default Scrap;
