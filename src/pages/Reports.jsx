import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { utils, writeFile } from 'xlsx';
import toast from 'react-hot-toast';
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
  const [activeTab, setActiveTab] = useState('stock_in'); // 'stock_in', 'withdrawals', 'balance'

  // Data State
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
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

  const fetchReportData = useCallback(async () => {
    const currentTab = activeTabRef.current;
    const currentFilters = filtersRef.current;
    const currentProjects = projectsRef.current;
    setLoading(true);
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

        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;

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
              items: item.items
            });
          });
        });
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
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
            (row.projects?.name && row.projects.name.toLowerCase().includes(searchLower))
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
      toast.error('You do not have permission to export Excel reports (reports.export required)');
      return;
    }
    try {
      let exportData = [];
      let sheetName = '';

      if (activeTab === 'stock_in') {
        sheetName = 'Stock_In';
        exportData = processedData.map((r) => ({
          'Received Date': r.received_date,
          'Project': r.projects?.name,
          'Item Name': r.items?.name,
          'Quantity': r.quantity,
          'Unit': r.items?.unit,
          'Supplier': r.supplier || '-',
          'PO Number': r.po_number || '-'
        }));
      } else if (activeTab === 'withdrawals') {
        sheetName = 'Withdrawals';
        exportData = processedData.map((r) => ({
          'Requested Date': r.requested_at ? new Date(r.requested_at).toLocaleDateString() : '—',
          'Project': r.projects?.name,
          'Item Name': r.items?.name,
          'Requested Qty': r.quantity,
          'Stock Deducted': r.deducted_quantity,
          'Shortage': r.shortage_quantity,
          'Unit': r.items?.unit,
          'Requester': r.profiles?.full_name,
          'Status': r.has_shortage ? `${r.status} (Shortage)` : r.status,
          'Shortage Override Reason': r.override_reason || '-'
        }));
      } else if (activeTab === 'balance') {
        sheetName = 'Stock_Balance';
        exportData = processedData.map((r) => ({
          'Project': r.project_name,
          'Item Name': r.item_name,
          'Total In': r.total_in,
          'Total Out': r.total_out,
          'Balance': r.balance,
          'Unit': r.unit
        }));
      } else if (activeTab === 'site_kits') {
        const { fetchSiteKitsAvailability } = await import('@/lib/siteKits');
        const siteKitsData = await fetchSiteKitsAvailability(filters.project_id || null);
        let itemsList = [];
        (siteKitsData || []).forEach(cat => {
          (cat.items || []).forEach(item => {
            const isLimiting = item.is_mandatory && item.sets_possible === cat.complete_sets;
            itemsList.push({
              ...item,
              category_id: cat.category_id,
              category_name: cat.category_name,
              category_complete_sets: cat.complete_sets,
              isLimiting
            });
          });
        });
        sheetName = 'Site_Kits_BOM';
        exportData = itemsList.map((item, index) => ({
          'No.': index + 1,
          'Equipment Category': item.category_name,
          'Part Number': item.part_number || '-',
          'BOM Item Name': item.bom_name,
          'Qty Per Site': item.qty_per_site,
          'Unit': item.unit || t('common.defaultUnit', 'ชิ้น'),
          'Current Stock': item.total_stock,
          'Kits Possible': item.sets_possible,
          'Missing For Next Set': item.missing_for_next_set || 0,
          'Status': item.total_stock === 0 
            ? 'Out of Stock' 
            : item.isLimiting 
            ? 'Limiting Stock' 
            : 'Ready'
        }));
      }

      if (exportData.length === 0) {
        toast.error('No data to export');
        return;
      }

      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, sheetName);
      writeFile(wb, `${sheetName}_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel report exported successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to export Excel report');
    }
  };

  const handleExportPDF = async () => {
    if (!canExport) {
      toast.error('You do not have permission to export PDF reports (reports.export required)');
      return;
    }
    try {
      setPdfLoading(true);
      const toastId = toast.loading('Generating PDF report...');

      const { StockReportPDF, SiteKitsReportPDF } = await import('@/lib/pdf-templates.jsx');
      const { pdf } = await import('@react-pdf/renderer');

      let doc;
      let downloadFileName = `${activeTab}_Report_${new Date().toISOString().split('T')[0]}.pdf`;

      if (activeTab === 'site_kits') {
        const { fetchSiteKitsAvailability } = await import('@/lib/siteKits');
        const siteKitsData = await fetchSiteKitsAvailability(filters.project_id || null);
        let itemsList = [];
        (siteKitsData || []).forEach(cat => {
          (cat.items || []).forEach(item => {
            const isLimiting = item.is_mandatory && item.sets_possible === cat.complete_sets;
            itemsList.push({
              ...item,
              category_id: cat.category_id,
              category_name: cat.category_name,
              category_complete_sets: cat.complete_sets,
              isLimiting
            });
          });
        });
        const selectedProj = projects.find(p => p.id === filters.project_id);
        const projectName = selectedProj ? (selectedProj.location ? `${selectedProj.name} (${selectedProj.location})` : selectedProj.name) : 'All Storage Locations';

        doc = (
          <SiteKitsReportPDF
            items={itemsList}
            siteKits={siteKitsData || []}
            projectName={projectName}
            categoryName="All 4 Categories"
          />
        );
        downloadFileName = `Site_Kits_BOM_Availability_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        doc = <StockReportPDF data={processedData} type={activeTab} />;
      }

      const blob = await pdf(doc).toBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('PDF report exported successfully', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate PDF report');
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
        onRefresh={fetchReportData}
        totalItemsCount={processedData.length}
        loading={loading}
        pdfLoading={pdfLoading}
        canExport={canExport}
      />

      {activeTab === 'site_kits' ? (
        <ReportSiteKits projects={projects} />
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
            onApplyFilters={fetchReportData}
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
  );
};

export default Reports;
