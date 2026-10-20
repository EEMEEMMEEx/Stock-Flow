import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/i18n';

// Subcomponents
import ReportHeader from '@/components/reports/ReportHeader';
import ReportKpiGrid from '@/components/reports/ReportKpiGrid';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import ReportCharts from '@/components/reports/ReportCharts';
import ReportDataTable from '@/components/reports/ReportDataTable';
import ReportPagination from '@/components/reports/ReportPagination';
import ReportSiteKits from '@/components/reports/ReportSiteKits';

const Reports = () => {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canExport = can('reports.export');
  const [activeTab, setActiveTab] = useState('stock_in'); // 'stock_in', 'withdrawals', 'balance', 'site_kits', 'site_kits'

  // Data State
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [showCharts, setShowCharts] = useState(true);

  // Filter State
  const [filters, setFilters] = useState({
    project_id: '',
    start_date: '',
    end_date: '',
    search: '', // Supplier / PO / Item Name
    status: '', // Withdrawals status
    category_id: '' // Balance category
  });

  // Sorting & Pagination State
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [projRes, catRes] = await Promise.all([
        supabase.from('projects').select('id, name, project_code, location, description').eq('status', 'active').order('name'),
        supabase.from('categories').select('id, name').order('name')
      ]);
      if (projRes.data) setProjects(projRes.data);
      if (catRes.data) setCategories(catRes.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  const fetchReportData = useCallback(async (overrides) => {
    const currentTab = activeTabRef.current;
    const currentFilters = overrides ? { ...filtersRef.current, ...overrides } : filtersRef.current;
    const currentProjects = projectsRef.current;
    setLoading(true);
    setFetchError(false);
    setCurrentPage(1);
    try {
      if (currentTab === 'stock_in') {
        let query = supabase
          .from('stock_in_orders')
          .select(
            `
            received_date, supplier, po_number, project_id,
            projects!inner(name, project_code, location, description),
            stock_in_items!inner(
              quantity, unit_price, model, item_type, parent_sku,
              items!item_id(name, model, unit)
            )
          `
          )
          .order('received_date', { ascending: false });

        if (currentFilters.project_id) query = query.eq('project_id', currentFilters.project_id);
        if (currentFilters.start_date) query = query.gte('received_date', currentFilters.start_date);
        if (currentFilters.end_date) query = query.lte('received_date', currentFilters.end_date);
        if (currentFilters.search) {
          query = query.or(`supplier.ilike.%${currentFilters.search}%,po_number.ilike.%${currentFilters.search}%`);
        }

        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;

        const flatData = [];
        data?.forEach((order) => {
          order.stock_in_items?.forEach((item) => {
            flatData.push({
              received_date: order.received_date,
              projects: order.projects,
              supplier: order.supplier,
              po_number: order.po_number,
              quantity: item.quantity,
              model: item.model || item.items?.model || '',
              item_type: item.item_type,
              parent_sku: item.parent_sku,
              items: item.items
            });
          });
        });
        setReportData(flatData);
      } else if (currentTab === 'withdrawals') {
        let query = supabase
          .from('withdrawal_orders')
          .select(
            `
            status, requested_at, project_id, has_shortage, is_shortage_override, override_reason,
            projects!inner(name, project_code, location, description),
            profiles!withdrawal_orders_requested_by_fkey(full_name),
            withdrawal_items!inner(
              quantity, available_at_approval, deducted_quantity, shortage_quantity,
              items(name, unit)
            )
          `
          )
          .order('requested_at', { ascending: false });

        if (currentFilters.project_id) query = query.eq('project_id', currentFilters.project_id);
        if (currentFilters.start_date) query = query.gte('requested_at', `${currentFilters.start_date}T00:00:00`);
        if (currentFilters.end_date) query = query.lte('requested_at', `${currentFilters.end_date}T23:59:59`);
        if (currentFilters.status) query = query.eq('status', currentFilters.status);

        // "ยืม → ใช้ทดแทน" (checkout consumed) rows are read through a guarded RPC because
        // checkout_return_logs is readable only with checkouts.return (RLS blocks reports.view).
        const [withdrawalRes, consumedRes] = await Promise.all([
          query,
          supabase.rpc('get_checkout_consumed_usage', {
            p_project_id: currentFilters.project_id || null,
            p_start_date: currentFilters.start_date || null,
            p_end_date: currentFilters.end_date || null
          })
        ]);

        const { data, error } = withdrawalRes;
        if (error && error.code !== '42P01') throw error;

        // Consumed rows are always 'completed', so they are hidden for any other status filter.
        const includeConsumed = !currentFilters.status || currentFilters.status === 'completed';

        if (consumedRes.error) {
          // Migration 77 not deployed yet, or the caller lacks reports.view — keep the report usable.
          console.warn('Checkout consumed usage fetch notice:', consumedRes.error.message);
        }

        const flatData = [];
        data?.forEach((order) => {
          order.withdrawal_items?.forEach((item) => {
            flatData.push({
              requested_at: order.requested_at,
              projects: order.projects,
              profiles: order.profiles,
              status: order.status,
              has_shortage: order.has_shortage || order.is_shortage_override,
              override_reason: order.override_reason,
              quantity: item.quantity,
              deducted_quantity:
                item.deducted_quantity !== undefined
                  ? item.deducted_quantity
                  : order.status === 'approved' || order.status === 'completed'
                  ? item.quantity
                  : 0,
              shortage_quantity: item.shortage_quantity !== undefined ? item.shortage_quantity : 0,
              items: item.items,
              source: 'withdrawal',
              reference: null
            });
          });
        });

        if (includeConsumed && Array.isArray(consumedRes.data)) {
          consumedRes.data.forEach((row) => {
            flatData.push({
              // วันที่บันทึกใช้ทดแทน (ไม่ใช่วันที่ยืม) — ระบุความต่างใน tooltip/คอลัมน์
              requested_at: row.returned_at,
              projects: {
                name: row.project_name,
                project_code: row.project_code,
                location: row.project_location,
                description: row.project_description
              },
              profiles: { full_name: row.borrower_name },
              status: 'completed',
              has_shortage: false,
              override_reason: null,
              quantity: row.quantity,
              deducted_quantity: row.quantity,
              shortage_quantity: 0,
              items: { name: row.item_name, unit: row.unit },
              source: 'checkout_consumed',
              reference: row.order_number
            });
          });
        }

        // Keep the merged list in the same newest-first order as the withdrawal query.
        flatData.sort((a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0));

        setReportData(flatData);
      } else if (currentTab === 'balance') {
        if (!currentFilters.project_id && currentProjects.length > 0) {
          setFilters((prev) => ({ ...prev, project_id: currentProjects[0].id }));
          setLoading(false);
          return;
        }

        let query = supabase.from('stock_balance').select(`
            *,
            items!inner(category_id),
            projects:project_id(name, project_code, location, description)
          `);

        if (currentFilters.project_id) query = query.eq('project_id', currentFilters.project_id);
        if (currentFilters.category_id) query = query.eq('items.category_id', currentFilters.category_id);

        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;
        setReportData(data || []);
      }
    } catch (error) {
      console.error(error);
      setFetchError(true);
      toast.error(t('reports.error.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // On the balance tab the project_id effect below fires in the same commit
    // (handleTabChange sets both at once) — skip here to avoid a duplicate fetch.
    if (activeTab === 'balance' && filtersRef.current.project_id) return;
    fetchReportData();
  }, [activeTab, fetchReportData]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      project_id: activeTab === 'balance' && projects.length > 0 ? projects[0].id : '',
      start_date: '',
      end_date: '',
      search: '',
      status: '',
      category_id: ''
    });
    setSortConfig({ key: '', direction: 'asc' });
    setCurrentPage(1);
  };

  useEffect(() => {
    if (activeTab === 'balance' && filters.project_id) {
      fetchReportData();
    }
  }, [filters.project_id, activeTab, fetchReportData]);

  // FilterBar debounces search input locally; Apply passes the latest value explicitly
  // so the fetch never races the debounced state update.
  const handleApplyFilters = (searchValue) => {
    if (typeof searchValue === 'string' && searchValue !== filtersRef.current.search) {
      setFilters((prev) => ({ ...prev, search: searchValue }));
    }
    fetchReportData(typeof searchValue === 'string' ? { search: searchValue } : undefined);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setReportData([]);
    setFilters({
      project_id: tabId === 'balance' ? projects[0]?.id || '' : '',
      start_date: '',
      end_date: '',
      search: '',
      status: '',
      category_id: ''
    });
    setSortConfig({ key: '', direction: 'asc' });
    setCurrentPage(1);
  };

  // Helper for sorting nested values
  const getValueByPath = (obj, path) => {
    if (!obj || !path) return '';
    return path.split('.').reduce((o, i) => (o ? o[i] : ''), obj);
  };

  // Client-side Filtered and Sorted Data
  const processedData = useMemo(() => {
    let result = [...reportData];

    // Client-side text search (Item Name / Model / Supplier)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter((row) => {
        if (activeTab === 'stock_in') {
          return (
            (row.supplier && row.supplier.toLowerCase().includes(searchLower)) ||
            (row.po_number && row.po_number.toLowerCase().includes(searchLower)) ||
            (row.items?.name && row.items.name.toLowerCase().includes(searchLower)) ||
            (row.model && row.model.toLowerCase().includes(searchLower))
          );
        } else if (activeTab === 'withdrawals') {
          return (
            (row.items?.name && row.items.name.toLowerCase().includes(searchLower)) ||
            (row.profiles?.full_name && row.profiles.full_name.toLowerCase().includes(searchLower)) ||
            (row.projects?.name && row.projects.name.toLowerCase().includes(searchLower)) ||
            (row.reference && String(row.reference).toLowerCase().includes(searchLower))
          );
        } else if (activeTab === 'balance') {
          return (
            (row.item_name && row.item_name.toLowerCase().includes(searchLower)) ||
            (row.project_name && row.project_name.toLowerCase().includes(searchLower))
          );
        }
        return true;
      });
    }

    // Client-side Sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = getValueByPath(a, sortConfig.key);
        let valB = getValueByPath(b, sortConfig.key);

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [reportData, filters.search, sortConfig, activeTab]);

  // Client-side Pagination
  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return processedData.slice(startIndex, startIndex + pageSize);
  }, [processedData, currentPage, pageSize]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleExportExcel = async () => {
    if (!canExport) {
      toast.error(t('reports.export.permissionDeniedExcel'));
      return;
    }
    setExcelLoading(true);
    try {
      const { utils, writeFile } = await import('xlsx');
      let exportData = [];
      let sheetName = '';

      if (activeTab === 'stock_in') {
        sheetName = t('reports.export.sheetStockIn');
        exportData = processedData.map((r) => ({
          [t('reports.export.colReceivedDate')]: r.received_date,
          [t('reports.export.colProject')]: r.projects?.name,
          [t('reports.export.colItemName')]: r.items?.name,
          [t('reports.export.colQuantity')]: r.quantity,
          [t('reports.export.colUnit')]: r.items?.unit,
          [t('reports.export.colSupplier')]: r.supplier || '-',
          [t('reports.export.colPoNumber')]: r.po_number || '-'
        }));
      } else if (activeTab === 'withdrawals') {
        sheetName = t('reports.export.sheetWithdrawals');
        exportData = processedData.map((r) => ({
          [t('reports.export.colRequestedDate')]: r.requested_at ? new Date(r.requested_at).toLocaleDateString() : '—',
          [t('reports.export.colProject')]: r.projects?.name,
          [t('reports.export.colItemName')]: r.items?.name,
          [t('reports.export.colRequestedQty')]: r.quantity,
          [t('reports.export.colStockDeducted')]: r.deducted_quantity,
          [t('reports.export.colShortage')]: r.shortage_quantity,
          [t('reports.export.colUnit')]: r.items?.unit,
          [t('reports.export.colRequester')]: r.profiles?.full_name,
          [t('reports.export.colStatus')]: r.has_shortage ? `${t(`status.${r.status}`)} ${t('reports.table.shortageSuffix', { shortage: t('reports.charts.shortage') })}` : t(`status.${r.status}`),
          [t('reports.export.colShortageOverrideReason')]: r.override_reason || '-',
          [t('reports.export.colSource')]: r.source === 'checkout_consumed' ? t('reports.table.sourceCheckoutConsumed') : t('reports.table.sourceWithdrawal'),
          [t('reports.export.colReference')]: r.reference || '-'
        }));
      } else if (activeTab === 'balance') {
        sheetName = t('reports.export.sheetBalance');
        exportData = processedData.map((r) => ({
          [t('reports.export.colProject')]: r.project_name,
          [t('reports.export.colItemName')]: r.item_name,
          [t('reports.export.colTotalIn')]: r.total_in,
          [t('reports.export.colTotalOut')]: r.total_out,
          [t('reports.export.colBalance')]: r.balance,
          [t('reports.export.colUnit')]: r.unit
        }));
      }

      if (exportData.length === 0) {
        toast.error(t('reports.export.noData'));
        return;
      }

      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, sheetName);
      writeFile(wb, `${sheetName}_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(t('reports.export.excelSuccess'));
    } catch (error) {
      console.error(error);
      toast.error(t('reports.export.excelFailed'));
    }
  };

  const handleExportPDF = async () => {
    if (!canExport) {
      toast.error(t('reports.export.permissionDeniedPdf'));
      return;
    }
    try {
      setPdfLoading(true);
      const toastId = toast.loading(t('reports.export.generatingPdf'));

      const { StockReportPDF } = await import('@/lib/pdf-templates.jsx');
      const { pdf } = await import('@react-pdf/renderer');

      let doc;
      const downloadFileName = `${activeTab}_Report_${new Date().toISOString().split('T')[0]}.pdf`;

      const selectedProj = projects.find(p => p.id === filters.project_id);
      const projectName = selectedProj
        ? (selectedProj.project_code ? `[${selectedProj.project_code}] ${selectedProj.name}` : selectedProj.name)
        : '';
      const warehouseName = selectedProj?.location || (selectedProj ? t('reports.export.mainStorage') : '');
      const selectedCat = categories.find(c => c.id === filters.category_id);
      const categoryName = selectedCat?.name || '';

      doc = (
        <StockReportPDF
          data={processedData}
          type={activeTab}
          projectName={projectName}
          warehouseName={warehouseName}
          categoryName={categoryName}
          startDate={filters.start_date}
          endDate={filters.end_date}
          searchQuery={filters.search}
        />
      );

      const blob = await pdf(doc).toBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(t('reports.export.pdfSuccess'), { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error(t('reports.export.pdfFailed'));
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header & Tab Navigation */}
      <ReportHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onExportPDF={handleExportPDF}
        onExportExcel={handleExportExcel}
        onRefresh={() => fetchReportData()}
        totalItemsCount={processedData.length}
        loading={loading}
        pdfLoading={pdfLoading}
        excelLoading={excelLoading}
        canExport={canExport}
      />

      <div role="tabpanel" id="report-tabpanel" aria-labelledby={`report-tab-${activeTab}`} className="space-y-6">
      {activeTab === 'site_kits' ? (
        <ReportSiteKits projects={projects} />
      ) : fetchError && reportData.length === 0 ? (
        <Card className="border border-dashed border-rose-300 dark:border-rose-900/60 shadow-xs">
          <CardContent className="p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="p-4 rounded-full bg-rose-500/10 ring-1 ring-rose-500/20 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-8 h-8 stroke-1.5" />
            </div>
            <h3 className="text-lg font-bold text-foreground tracking-tight">{t('reports.error.title')}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
              {t('reports.error.description')}
            </p>
            <Button
              onClick={fetchReportData}
              disabled={loading}
              variant="outline"
              size="sm"
              className="mt-2 rounded-xl text-xs font-semibold gap-1.5 border-border hover:bg-accent cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('reports.error.retry')}</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 2. Operational Summary KPI Grid */}
          <ReportKpiGrid
            activeTab={activeTab}
            reportData={processedData}
            projects={projects}
            selectedProjectId={filters.project_id}
          />

          {/* 3. Smart Filter Toolbar */}
          <ReportFilterBar
            activeTab={activeTab}
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            onApplyFilters={handleApplyFilters}
            projects={projects}
            categories={categories}
            showCharts={showCharts}
            onToggleCharts={() => setShowCharts(!showCharts)}
            loading={loading}
          />

          {/* 4. Visual Analytics Section (Recharts) */}
          {showCharts && <ReportCharts activeTab={activeTab} reportData={processedData} />}

          {/* 5. Detailed Data Table */}
          <ReportDataTable
            activeTab={activeTab}
            reportData={paginatedData}
            sortConfig={sortConfig}
            onSort={handleSort}
            onResetFilters={handleResetFilters}
            loading={loading}
          />

          {/* 6. Pagination Controls */}
          {!loading && processedData.length > 0 && (
            <ReportPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={processedData.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
            />
          )}
        </>
      )}
      </div>
    </div>
  );
};

export default Reports;
