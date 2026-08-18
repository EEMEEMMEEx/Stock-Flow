import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { utils, writeFile } from 'xlsx';
import toast from 'react-hot-toast';

// Subcomponents
import ReportHeader from '@/components/reports/ReportHeader';
import ReportKpiGrid from '@/components/reports/ReportKpiGrid';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import ReportCharts from '@/components/reports/ReportCharts';
import ReportDataTable from '@/components/reports/ReportDataTable';
import ReportPagination from '@/components/reports/ReportPagination';

const Reports = () => {
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

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  const fetchFilterOptions = async () => {
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
  };

  useEffect(() => {
    fetchReportData();
  }, [activeTab]);

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

  const fetchReportData = async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      if (activeTab === 'stock_in') {
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

        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.start_date) query = query.gte('received_date', filters.start_date);
        if (filters.end_date) query = query.lte('received_date', filters.end_date);
        if (filters.search) {
          query = query.or(`supplier.ilike.%${filters.search}%,po_number.ilike.%${filters.search}%`);
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
      } else if (activeTab === 'withdrawals') {
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

        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.start_date) query = query.gte('requested_at', `${filters.start_date}T00:00:00`);
        if (filters.end_date) query = query.lte('requested_at', `${filters.end_date}T23:59:59`);
        if (filters.status) query = query.eq('status', filters.status);

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
      } else if (activeTab === 'balance') {
        if (!filters.project_id && projects.length > 0) {
          setFilters((prev) => ({ ...prev, project_id: projects[0].id }));
          setLoading(false);
          return;
        }

        let query = supabase.from('stock_balance').select(`
            *,
            items!inner(category_id),
            projects:project_id(name, project_code, location, description)
          `);

        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.category_id) query = query.eq('items.category_id', filters.category_id);

        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;
        setReportData(data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'balance' && filters.project_id) {
      fetchReportData();
    }
  }, [filters.project_id, activeTab]);

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

  const handleExportExcel = () => {
    try {
      let exportData = [];
      let sheetName = '';

      if (activeTab === 'stock_in') {
        sheetName = 'Stock_In';
        exportData = processedData.map((r) => ({
          'วันที่รับเข้า': r.received_date,
          'โครงการ': r.projects?.name,
          'รายการวัสดุ': r.items?.name,
          'จำนวน': r.quantity,
          'หน่วย': r.items?.unit,
          'Supplier': r.supplier || '-',
          'เลข PO': r.po_number || '-'
        }));
      } else if (activeTab === 'withdrawals') {
        sheetName = 'Withdrawals';
        exportData = processedData.map((r) => ({
          'วันที่เบิก': new Date(r.requested_at).toLocaleDateString('th-TH'),
          'โครงการ': r.projects?.name,
          'รายการวัสดุ': r.items?.name,
          'ขอเบิก': r.quantity,
          'ตัดสต็อกจริง': r.deducted_quantity,
          'ขาดส่ง (Shortage)': r.shortage_quantity,
          'หน่วย': r.items?.unit,
          'ผู้เบิก': r.profiles?.full_name,
          'สถานะ': r.has_shortage ? `${r.status} (ของไม่ครบ)` : r.status,
          'เหตุผลอนุมัติของไม่ครบ': r.override_reason || '-'
        }));
      } else if (activeTab === 'balance') {
        sheetName = 'Stock_Balance';
        exportData = processedData.map((r) => ({
          'โครงการ': r.project_name,
          'รายการวัสดุ': r.item_name,
          'รับเข้าทั้งหมด': r.total_in,
          'เบิกออกทั้งหมด': r.total_out,
          'คงเหลือ': r.balance,
          'หน่วย': r.unit
        }));
      }

      if (exportData.length === 0) {
        toast.error('ไม่มีข้อมูลให้ Export');
        return;
      }

      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, sheetName);
      writeFile(wb, `${sheetName}_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export Excel สำเร็จ');
    } catch (error) {
      console.error(error);
      toast.error('Export Excel ผิดพลาด');
    }
  };

  const handleExportPDF = async () => {
    try {
      setPdfLoading(true);
      const toastId = toast.loading('กำลังสร้างไฟล์ PDF...');

      const { StockReportPDF } = await import('@/lib/pdf-templates.jsx');
      const { pdf } = await import('@react-pdf/renderer');

      const doc = <StockReportPDF data={processedData} type={activeTab} />;
      const blob = await pdf(doc).toBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export PDF สำเร็จ', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('ไม่สามารถสร้าง PDF ได้');
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
      />

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
    </div>
  );
};

export default Reports;
