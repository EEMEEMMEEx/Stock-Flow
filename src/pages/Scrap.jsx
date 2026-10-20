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
  Loader2
} from 'lucide-react';
// Dynamic import used in handleExportExcel
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RepairResolutionModal from '@/components/checkouts/RepairResolutionModal';

const SCRAP_TABS = ['pending', 'disposed'];

const Scrap = () => {
  const { t, i18n } = useTranslation();
  const { can, isSuperAdmin, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab = SCRAP_TABS.includes(tabParam) ? tabParam : 'pending';

  const setActiveTab = useCallback((nextTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const canResolveRepair = can('checkouts.resolve_repair') || isAdmin || isSuperAdmin;

  // Data states
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

  // Fetch pending damaged items from checkout_return_logs
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
      toast.error(t('common.errorLoadData', 'Failed to load pending items'));
    }
  }, [t]);

  // Fetch disposed scrap items from scrap_disposal_items
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
      toast.error(t('common.errorLoadData', 'Failed to load scrap records'));
    }
  }, [t]);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchProjects(), fetchPendingDamaged(), fetchDisposedScrap()]);
    setLoading(false);
  }, [fetchProjects, fetchPendingDamaged, fetchDisposedScrap]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPendingDamaged(), fetchDisposedScrap()]);
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

  // Filtered pending items
  const filteredPending = useMemo(() => {
    return pendingItems.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (item.checkout_items?.items?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_items?.serial_number || item.replaced_serial_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.order_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.borrower_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const itemProjectId = item.destination_project_id || item.checkout_orders?.project_id;
      const matchesProject =
        selectedProjectId === 'all' || itemProjectId === selectedProjectId;

      return matchesSearch && matchesProject;
    });
  }, [pendingItems, searchTerm, selectedProjectId]);

  // Filtered disposed items
  const filteredDisposed = useMemo(() => {
    return disposedItems.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (item.items?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.serial_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.order_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.checkout_orders?.borrower_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.reason || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProject =
        selectedProjectId === 'all' || item.project_id === selectedProjectId;

      const matchesMethod =
        selectedMethod === 'all' || item.disposal_method === selectedMethod;

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
    const isPending = activeTab === 'pending';
    const targetData = isPending ? filteredPending : filteredDisposed;

    if (!targetData || targetData.length === 0) {
      toast.error(t('common.noDataToExport', 'No data to export'));
      return;
    }

    const exportRows = isPending
      ? targetData.map((row, idx) => ({
          '#': idx + 1,
          [t('scrap.orderNumber')]: row.checkout_orders?.order_number || '-',
          [t('scrap.borrower')]: row.checkout_orders?.borrower_name || '-',
          [t('scrap.itemName')]: row.checkout_items?.items?.name || '-',
          [t('scrap.serialNumber')]: row.checkout_items?.serial_number || row.replaced_serial_number || '-',
          [t('scrap.quantity')]: `${row.returned_quantity} ${row.checkout_items?.items?.unit || ''}`.trim(),
          [t('scrap.project')]: row.checkout_orders?.projects?.name || '-',
          [t('scrap.damagedDate')]: formatDate(row.returned_at),
          [t('scrap.damageNotes')]: row.damage_notes || '-'
        }))
      : targetData.map((row, idx) => ({
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

    const { utils, writeFile } = await import('xlsx');
    const worksheet = utils.json_to_sheet(exportRows);
    const workbook = utils.book_new();
    const sheetName = isPending ? 'Pending_Repairs' : 'Scrap_Register';
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
      <div className="flex items-center gap-1.5 p-1 bg-muted/60 dark:bg-muted/30 rounded-xl w-fit border border-border/50">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer select-none ${
            activeTab === 'pending'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wrench className="w-3.5 h-3.5 text-amber-500" />
          <span>{t('scrap.pendingTab')}</span>
          {pendingItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-mono font-bold">
              {pendingItems.length}
            </span>
          )}
        </button>

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
          <span>{t('scrap.disposedTab')}</span>
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
          <p className="text-xs text-muted-foreground">{t('scrap.loading')}</p>
        </div>
      ) : activeTab === 'pending' ? (
        /* Tab 1: Pending Repairs */
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
        /* Tab 2: Disposed Scrap Register */
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
                    const itemSerial = item.serial_number || '-';
                    const orderNumber = item.checkout_orders?.order_number || '-';
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
                          {itemSerial !== '-' ? (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/50">
                              {itemSerial}
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
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {orderNumber !== '-' ? (
                            <span>{orderNumber}</span>
                          ) : item.caim_ticket_id ? (
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">
                              CAIM: {item.caim_ticket_id}
                            </span>
                          ) : (
                            '-'
                          )}
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

      {/* Repair Resolution Modal */}
      <RepairResolutionModal
        isOpen={isRepairModalOpen}
        onClose={() => {
          setIsRepairModalOpen(false);
          setSelectedReturnLog(null);
          setSelectedOrder(null);
        }}
        returnLog={selectedReturnLog}
        order={selectedOrder}
        onResolved={async () => {
          await Promise.all([fetchPendingDamaged(), fetchDisposedScrap()]);
        }}
      />
    </div>
  );
};

export default Scrap;
