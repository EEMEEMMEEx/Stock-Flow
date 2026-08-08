import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Download, Filter, Search } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import toast from 'react-hot-toast';

const Reports = () => {
  const [activeTab, setActiveTab] = useState('stock_in'); // 'stock_in', 'withdrawals', 'balance'
  
  // Data State
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filter State
  const [filters, setFilters] = useState({
    project_id: '',
    start_date: '',
    end_date: '',
    search: '', // Supplier / PO
    status: '', // Withdrawals status
    category_id: '' // Balance category
  });

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  const fetchFilterOptions = async () => {
    try {
      const [projRes, catRes] = await Promise.all([
        supabase.from('projects').select('id, name, project_code').order('name'),
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
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'stock_in') {
        let query = supabase.from('stock_in_orders')
          .select(`
            received_date, supplier, po_number, project_id,
            projects!inner(name, project_code),
            stock_in_items!inner(
              quantity, unit_price,
              items(name, unit)
            )
          `)
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
        data?.forEach(order => {
          order.stock_in_items?.forEach(item => {
            flatData.push({
              received_date: order.received_date,
              projects: order.projects,
              supplier: order.supplier,
              po_number: order.po_number,
              quantity: item.quantity,
              items: item.items
            });
          });
        });
        setReportData(flatData);

      } else if (activeTab === 'withdrawals') {
        let query = supabase.from('withdrawal_orders')
          .select(`
            status, requested_at, project_id, has_shortage, is_shortage_override, override_reason,
            projects!inner(name, project_code),
            profiles!withdrawal_orders_requested_by_fkey(full_name),
            withdrawal_items!inner(
              quantity, available_at_approval, deducted_quantity, shortage_quantity,
              items(name, unit)
            )
          `)
          .order('requested_at', { ascending: false });
        
        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.start_date) query = query.gte('requested_at', `${filters.start_date}T00:00:00`);
        if (filters.end_date) query = query.lte('requested_at', `${filters.end_date}T23:59:59`);
        if (filters.status) query = query.eq('status', filters.status);

        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;
        
        const flatData = [];
        data?.forEach(order => {
          order.withdrawal_items?.forEach(item => {
            flatData.push({
              requested_at: order.requested_at,
              projects: order.projects,
              profiles: order.profiles,
              status: order.status,
              has_shortage: order.has_shortage || order.is_shortage_override,
              override_reason: order.override_reason,
              quantity: item.quantity,
              deducted_quantity: item.deducted_quantity !== undefined ? item.deducted_quantity : (order.status === 'approved' || order.status === 'completed' ? item.quantity : 0),
              shortage_quantity: item.shortage_quantity !== undefined ? item.shortage_quantity : 0,
              items: item.items
            });
          });
        });
        setReportData(flatData);

      } else if (activeTab === 'balance') {
        if (!filters.project_id && projects.length > 0) {
          setFilters(prev => ({ ...prev, project_id: projects[0].id }));
          setLoading(false);
          return;
        }

        let query = supabase.from('stock_balance')
          .select(`
            *,
            items!inner(category_id)
          `);
        
        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.category_id) query = query.eq('items.category_id', filters.category_id);

        const { data, error } = await query;
        if (error && error.code !== '42P01') throw error;
        setReportData(data || []);
      }
    } catch (error) {
      console.error(error);
      // Ignore missing relation errors before migration is run
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'balance' && filters.project_id) {
      fetchReportData();
    }
  }, [filters.project_id, activeTab]);

  const handleExportExcel = () => {
    try {
      let exportData = [];
      let sheetName = "";

      if (activeTab === 'stock_in') {
        sheetName = "Stock_In";
        exportData = reportData.map(r => ({
          'วันที่รับเข้า': r.received_date,
          'โครงการ': r.projects?.name,
          'รายการวัสดุ': r.items?.name,
          'จำนวน': r.quantity,
          'หน่วย': r.items?.unit,
          'Supplier': r.supplier || '-',
          'เลข PO': r.po_number || '-'
        }));
      } else if (activeTab === 'withdrawals') {
        sheetName = "Withdrawals";
        exportData = reportData.map(r => ({
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
        sheetName = "Stock_Balance";
        exportData = reportData.map(r => ({
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
      const toastId = toast.loading('กำลังสร้างไฟล์ PDF...');
      
      const { StockReportPDF } = await import('@/lib/pdf-templates.jsx');
      const { pdf } = await import('@react-pdf/renderer');
      
      const doc = <StockReportPDF data={reportData} type={activeTab} />;
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
      toast.error('ไม่สามารถสร้าง PDF ได้', { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-8 h-8 text-blue-500" />
            รายงาน (Reports)
          </h2>
          <p className="text-muted-foreground mt-2">ดูประวัติการรับเข้า เบิกจ่าย และสถานะยอดคงเหลือ</p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleExportPDF} variant="outline" className="shadow-sm gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
            <FileText className="w-4 h-4" /> Export PDF
          </Button>
          <Button onClick={handleExportExcel} className="shadow-sm gap-2 bg-green-600 hover:bg-green-700 text-white">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex space-x-2 border-b">
        <button
          onClick={() => { setActiveTab('stock_in'); setFilters({ project_id: '', start_date: '', end_date: '', search: '', status: '', category_id: '' }); }}
          className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'stock_in' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          1. รายงานรับเข้า
        </button>
        <button
          onClick={() => { setActiveTab('withdrawals'); setFilters({ project_id: '', start_date: '', end_date: '', search: '', status: '', category_id: '' }); }}
          className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'withdrawals' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          2. รายงานเบิกจ่าย
        </button>
        <button
          onClick={() => { setActiveTab('balance'); setFilters({ project_id: projects[0]?.id || '', start_date: '', end_date: '', search: '', status: '', category_id: '' }); }}
          className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'balance' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          3. รายงานยอดคงเหลือ
        </button>
      </div>

      {/* FILTERS */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" /> ตัวกรองข้อมูล
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            
            {/* Common Project Filter */}
            <div className="space-y-1">
              <Label>โครงการ {activeTab === 'balance' && <span className="text-red-500">*</span>}</Label>
              <select 
                name="project_id" 
                value={filters.project_id} 
                onChange={handleFilterChange}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {activeTab !== 'balance' && <option value="">ทุกโครงการ</option>}
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.project_code ? `${p.project_code} — ` : ''}{p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Filters (Stock In & Withdrawals) */}
            {activeTab !== 'balance' && (
              <>
                <div className="space-y-1">
                  <Label>ตั้งแต่วันที่</Label>
                  <Input type="date" name="start_date" value={filters.start_date} onChange={handleFilterChange} />
                </div>
                <div className="space-y-1">
                  <Label>ถึงวันที่</Label>
                  <Input type="date" name="end_date" value={filters.end_date} onChange={handleFilterChange} />
                </div>
              </>
            )}

            {/* Specific Filters */}
            {activeTab === 'stock_in' && (
              <div className="space-y-1">
                <Label>ค้นหา (Supplier / PO)</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input name="search" value={filters.search} onChange={handleFilterChange} placeholder="พิมพ์คำค้นหา..." className="pl-8" />
                </div>
              </div>
            )}

            {activeTab === 'withdrawals' && (
              <div className="space-y-1">
                <Label>สถานะ</Label>
                <select 
                  name="status" 
                  value={filters.status} 
                  onChange={handleFilterChange}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">ทุกสถานะ</option>
                  <option value="pending">รออนุมัติ</option>
                  <option value="approved">อนุมัติแล้ว</option>
                  <option value="completed">เสร็จสิ้น</option>
                  <option value="rejected">ปฏิเสธ</option>
                </select>
              </div>
            )}

            {activeTab === 'balance' && (
              <div className="space-y-1">
                <Label>หมวดหมู่สินค้า</Label>
                <select 
                  name="category_id" 
                  value={filters.category_id} 
                  onChange={handleFilterChange}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">ทุกหมวดหมู่</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Search Button */}
            <div className="md:col-span-4 flex justify-end">
              <Button onClick={fetchReportData} className="w-full md:w-auto">
                ดึงข้อมูลรายงาน
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TABLE DATA */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 whitespace-nowrap">
              {activeTab === 'stock_in' && (
                <TableRow>
                  <TableHead>วันที่รับเข้า</TableHead>
                  <TableHead>โครงการ</TableHead>
                  <TableHead>รายการวัสดุ</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>เลข PO</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                </TableRow>
              )}
              {activeTab === 'withdrawals' && (
                <TableRow>
                  <TableHead>วันที่เบิก</TableHead>
                  <TableHead>โครงการ</TableHead>
                  <TableHead>รายการวัสดุ</TableHead>
                  <TableHead>ผู้เบิก</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-center">ขอเบิก</TableHead>
                  <TableHead className="text-center text-emerald-600">ตัดสต็อกจริง</TableHead>
                  <TableHead className="text-center text-amber-600">ขาดส่ง (Shortage)</TableHead>
                </TableRow>
              )}
              {activeTab === 'balance' && (
                <TableRow>
                  <TableHead>โครงการ</TableHead>
                  <TableHead>รายการวัสดุ</TableHead>
                  <TableHead className="text-right">ยอดรับเข้า (In)</TableHead>
                  <TableHead className="text-right">ยอดเบิกจ่าย (Out)</TableHead>
                  <TableHead className="text-right">คงเหลือ (Balance)</TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">กำลังโหลด...</TableCell></TableRow>
              ) : reportData.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">ไม่พบข้อมูล</TableCell></TableRow>
              ) : (
                reportData.map((row, i) => (
                  <TableRow key={i}>
                    {activeTab === 'stock_in' && (
                      <>
                        <TableCell>{row.received_date}</TableCell>
                        <TableCell className="font-medium">
                          {row.projects?.project_code ? `${row.projects.project_code} — ` : ''}{row.projects?.name}
                        </TableCell>
                        <TableCell>{row.items?.name}</TableCell>
                        <TableCell>{row.supplier || '-'}</TableCell>
                        <TableCell>{row.po_number || '-'}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">+{row.quantity} {row.items?.unit}</TableCell>
                      </>
                    )}
                    {activeTab === 'withdrawals' && (
                      <>
                        <TableCell>{new Date(row.requested_at).toLocaleDateString('th-TH')}</TableCell>
                        <TableCell className="font-medium">
                          {row.projects?.project_code ? `${row.projects.project_code} — ` : ''}{row.projects?.name}
                        </TableCell>
                        <TableCell>{row.items?.name}</TableCell>
                        <TableCell>{row.profiles?.full_name}</TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            row.has_shortage ? 'bg-amber-100 text-amber-800' :
                            row.status === 'approved' || row.status === 'completed' ? 'bg-green-100 text-green-700' :
                            row.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {row.has_shortage ? `${row.status} (ของไม่ครบ)` : row.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{row.quantity} {row.items?.unit}</TableCell>
                        <TableCell className="text-center font-bold text-emerald-600">{row.deducted_quantity} {row.items?.unit}</TableCell>
                        <TableCell className="text-center font-bold text-amber-600 bg-amber-50/50 dark:bg-amber-950/20">{row.shortage_quantity > 0 ? `${row.shortage_quantity} ${row.items?.unit}` : '-'}</TableCell>
                      </>
                    )}
                    {activeTab === 'balance' && (
                      <>
                        <TableCell className="font-medium">{row.project_name}</TableCell>
                        <TableCell>{row.item_name}</TableCell>
                        <TableCell className="text-right text-green-500">+{row.total_in}</TableCell>
                        <TableCell className="text-right text-amber-500">-{row.total_out}</TableCell>
                        <TableCell className="text-right font-bold">{row.balance} {row.unit}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default Reports;
