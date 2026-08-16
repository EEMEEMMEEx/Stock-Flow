import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Search, Package, Layers, Tag, Building2, Edit3, Trash2, 
  LayoutGrid, List, Filter, RefreshCw, ImageIcon, Box, Hash, 
  SlidersHorizontal, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

const Items = () => {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Layout States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [pageInput, setPageInput] = useState('1');

  // Modals & Forms
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', model: '', sku: '', category_id: '', unit: 'ชิ้น', description: '', image_url: '' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      let { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      
      if (!data || data.length === 0) {
        const defaultCats = [
          { name: 'วัสดุก่อสร้าง', description: 'ปูน, หิน, ดิน, ทราย, เหล็ก' },
          { name: 'งานไฟฟ้าและแสงสว่าง', description: 'สายไฟ, สวิตช์, หลอดไฟ' },
          { name: 'งานประปาและสุขภัณฑ์', description: 'ท่อ PVC, ก๊อกน้ำ, ข้อต่อ' },
          { name: 'เครื่องมือช่างและอุปกรณ์', description: 'สว่าน, ค้อน, คีม, ตะปู' },
          { name: 'สีและเคมีภัณฑ์', description: 'สีทาบ้าน, กาว, น้ำยา' },
          { name: 'เบ็ดเตล็ด', description: 'อุปกรณ์ทั่วไป' }
        ];
        const { data: seeded } = await supabase.from('categories').insert(defaultCats).select();
        if (seeded && seeded.length > 0) data = seeded;
      }
      setCategories(data || []);
    } catch (error) {
      console.error("Fetch Categories Error:", error);
    }
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      // Fetch Master Items
      const { data: iData, error: iError } = await supabase
        .from('items')
        .select('*, categories(name)')
        .order('name');
      if (iError) throw iError;

      // Fetch Stock Balance per project-item relationship
      const { data: bData } = await supabase
        .from('stock_balance')
        .select('*');

      // Fetch Projects for code & name resolution - only active projects
      const { data: pData } = await supabase
        .from('projects')
        .select('id, name, project_code, location, status')
        .eq('status', 'active');

      setProjectsList(pData || []);

      const projectMap = {};
      (pData || []).forEach(p => { projectMap[p.id] = p; });

      const itemMap = {};
      (iData || []).forEach(i => { itemMap[i.id] = i; });

      const itemsWithBalanceSet = new Set();
      const records = [];

      // Construct project-specific stock balance records (only for active projects)
      (bData || []).forEach(b => {
        const project = projectMap[b.project_id];
        // Exclude stock balance records belonging to deleted or inactive projects
        if (!project || project.status === 'inactive') {
          return;
        }

        const item = itemMap[b.item_id] || { id: b.item_id, name: b.item_name, unit: b.unit };

        itemsWithBalanceSet.add(b.item_id);

        const projectCode = project.project_code || '';
        const projectName = project.name || b.project_name || '';
        const projectDisplay = projectCode ? `${projectCode} — ${projectName}` : (projectName || '-');

        records.push({
          recordKey: `${b.item_id}_${b.project_id}`,
          id: item.id,
          project_id: b.project_id,
          name: item.name || b.item_name || 'รายการวัสดุ',
          model: item.model || b.model || '-',
          sku: item.sku || '-',
          item_type: item.item_type || 'PARENT',
          parent_sku: item.parent_sku || '',
          category_name: item.categories?.name || '-',
          category_id: item.category_id,
          project_code: projectCode,
          project_name: projectName,
          project_location: project.location || '',
          project_display: projectDisplay,
          balance: b.balance !== undefined ? b.balance : 0,
          unit: item.unit || b.unit || 'ชิ้น',
          description: item.description || item.notes || '',
          image_url: item.image_url || '',
          originalItem: item
        });
      });

      // Include master items that don't have stock balance records yet (Balance: 0)
      (iData || []).forEach(item => {
        if (!itemsWithBalanceSet.has(item.id)) {
          records.push({
            recordKey: `${item.id}_none`,
            id: item.id,
            project_id: null,
            name: item.name || 'รายการวัสดุ',
            model: item.model || '-',
            sku: item.sku || '-',
            item_type: item.item_type || 'PARENT',
            parent_sku: item.parent_sku || '',
            category_name: item.categories?.name || '-',
            category_id: item.category_id,
            project_code: '',
            project_name: '-',
            project_location: '',
            project_display: '-',
            balance: 0,
            unit: item.unit || 'ชิ้น',
            description: item.description || item.notes || '',
            image_url: item.image_url || '',
            originalItem: item
          });
        }
      });

      // Sort by item name then project name
      records.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setItems(records);
    } catch (error) {
      console.error("Fetch Items Error:", error);
      toast.error('ไม่สามารถโหลดข้อมูลรายการวัสดุได้: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      return toast.error('ขนาดไฟล์รูปภาพต้องไม่เกิน 3MB');
    }

    setUploadingImage(true);
    const toastId = toast.loading('กำลังประมวลผลรูปภาพ...');
    const reader = new FileReader();

    reader.onload = () => {
      setFormData(prev => ({ ...prev, image_url: reader.result }));
      toast.success('อัปโหลดรูปภาพสำเร็จ', { id: toastId });
      setUploadingImage(false);
    };

    reader.onerror = () => {
      toast.error('ไม่สามารถอ่านไฟล์รูปภาพได้', { id: toastId });
      setUploadingImage(false);
    };

    reader.readAsDataURL(file);
  };

  const handleEditItem = async (e) => {
    e.preventDefault();
    try {
      // Build payload with only valid items columns (no updated_at — column doesn't exist)
      const updatePayload = {
        name: formData.name,
        model: formData.model || null,
        sku: formData.sku || null,
        category_id: formData.category_id || null,
        unit: formData.unit,
        description: formData.description || null,
        notes: formData.description || null,
        image_url: formData.image_url || null,
      };

      const { error } = await supabase
        .from('items')
        .update(updatePayload)
        .eq('id', selectedItem.id);

      if (error) throw error;
      toast.success('อัปเดตวัสดุสำเร็จ');
      setIsEditOpen(false);
      fetchItems();
    } catch (error) {
      // Log full error for debugging
      console.error('[Items] Update error:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        status: error?.status,
      });

      // Provide actionable Thai error messages based on actual error type
      const code = error?.code;
      if (code === '23505') {
        // Unique constraint violation
        const detail = error?.details || '';
        if (detail.includes('sku')) {
          toast.error('รหัส SKU นี้ซ้ำกับรายการอื่นในระบบ กรุณาใช้รหัส SKU ที่ไม่ซ้ำกัน');
        } else {
          toast.error('ข้อมูลซ้ำกับรายการที่มีอยู่: ' + (error?.message || ''));
        }
      } else if (code === '23503') {
        // Foreign key violation
        toast.error('หมวดหมู่ที่เลือกไม่มีอยู่ในระบบ กรุณาเลือกหมวดหมู่ใหม่อีกครั้ง');
      } else if (code === '23502') {
        // NOT NULL violation
        toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อรายการและหน่วยนับ)');
      } else if (code === '23514') {
        // CHECK constraint violation
        toast.error('ข้อมูลที่กรอกไม่ผ่านเงื่อนไขที่กำหนด: ' + (error?.message || ''));
      } else if (error?.status === 403 || code === '42501') {
        // RLS / permission error
        toast.error('คุณไม่มีสิทธิ์แก้ไขรายการวัสดุ กรุณาติดต่อผู้ดูแลระบบ');
      } else if (error?.message) {
        toast.error('เกิดข้อผิดพลาด: ' + error.message);
      } else {
        toast.error('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุในการบันทึกข้อมูล');
      }
    }
  };

  const handleDeleteItem = async () => {
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', selectedItem.id);

      if (error) throw error;
      toast.success('ลบวัสดุสำเร็จ');
      setIsDeleteOpen(false);
      fetchItems();
    } catch (error) {
      if (error.code === '23503') {
        toast.error('ไม่สามารถลบได้ เนื่องจากมีการรับเข้า/เบิกจ่ายวัสดุนี้ไปแล้ว');
      } else {
        toast.error('เกิดข้อผิดพลาดในการลบวัสดุ');
      }
    }
  };

  const openEditDialog = (item) => {
    setSelectedItem(item);
    setFormData({ 
      name: item.name, 
      model: item.model !== '-' ? (item.model || '') : '',
      sku: item.sku !== '-' ? (item.sku || '') : '', 
      category_id: item.category_id || '',
      unit: item.unit || 'ชิ้น', 
      description: item.description || item.notes || '',
      image_url: item.image_url || ''
    });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (item) => {
    setSelectedItem(item);
    setIsDeleteOpen(true);
  };

  // Filtered items logic
  const filteredItems = items.filter(i => {
    const matchesSearch = 
      !searchQuery ||
      (i.name && i.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.model && i.model.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.sku && i.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.description && i.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.project_display && i.project_display.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || i.category_id === categoryFilter;
    const matchesProject = projectFilter === 'all' || (projectFilter === 'none' ? !i.project_id : i.project_id === projectFilter);

    return matchesSearch && matchesCategory && matchesProject;
  });

  // Pagination calculations
  const totalRecords = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRecords);
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
    setPageInput('1');
  }, [searchQuery, categoryFilter, projectFilter, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
      setPageInput(String(totalPages));
    }
  }, [totalPages, currentPage]);

  const handlePageInputChange = (e) => {
    const val = e.target.value;
    setPageInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      setCurrentPage(num);
    }
  };

  const handlePageInputBlur = () => {
    const num = parseInt(pageInput, 10);
    if (isNaN(num) || num < 1) {
      setCurrentPage(1);
      setPageInput('1');
    } else if (num > totalPages) {
      setCurrentPage(totalPages);
      setPageInput(String(totalPages));
    } else {
      setCurrentPage(num);
      setPageInput(String(num));
    }
  };

  // Master KPI Summary Calculations
  const uniqueMasterItemsCount = new Set(items.map(i => i.id)).size;
  const totalStockQuantity = items.reduce((acc, i) => acc + (parseInt(i.balance, 10) || 0), 0);
  const totalCategoriesCount = categories.length;
  const activeLocationsWithStockCount = new Set(items.filter(i => i.balance > 0 && i.project_id).map(i => i.project_id)).size;

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <Package className="w-7 h-7" />
            </div>
            <span>รายการวัสดุ (Items Master)</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            คลังข้อมูลวัสดุกลางและยอดคงเหลือแยกตามโครงการจัดเก็บปลายทางจริง
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchItems}
            className="rounded-xl h-10 gap-1.5 border-input hover:bg-accent text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรชข้อมูล
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/5 via-background to-background border border-indigo-500/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">รายการ Master ทั้งหมด</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Box className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">{uniqueMasterItemsCount}</span>
            <span className="text-xs text-muted-foreground font-medium">รายการ</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/5 via-background to-background border border-emerald-500/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">รวมยอดคงเหลือสะสม</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {totalStockQuantity.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-medium">หน่วย</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/5 via-background to-background border border-blue-500/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">พื้นที่จัดเก็บที่มีสต็อก</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">{activeLocationsWithStockCount}</span>
            <span className="text-xs text-muted-foreground font-medium">แห่ง</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/5 via-background to-background border border-violet-500/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">หมวดหมู่จัดกลุ่ม</span>
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">{totalCategoriesCount}</span>
            <span className="text-xs text-muted-foreground font-medium">หมวดหมู่</span>
          </div>
        </Card>
      </div>

      {/* Filter, Search & Layout Control Toolbar */}
      <Card className="p-4 rounded-2xl glass border border-border/60 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ค้นหาชื่อรายการ, รุ่น, รหัส SKU, โครงการ หรือรายละเอียด..."
              className="pl-9 pr-4 h-10 rounded-xl text-xs bg-background/80 focus:bg-background transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 min-w-[150px]">
              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <select
                className="h-10 w-full rounded-xl border border-input bg-background/80 px-3 py-1 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-sm"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">ทุกหมวดหมู่ ({categories.length})</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-1.5 min-w-[170px]">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <select
                className="h-10 w-full rounded-xl border border-input bg-background/80 px-3 py-1 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-sm"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
              >
                <option value="all">ทุกโครงการปลายทาง</option>
                <option value="none">ยังไม่มีสต็อกในโครงการ (0 สต็อก)</option>
                {(() => {
                  const map = new Map();
                  projectsList.forEach(p => {
                    const key = `${(p.name || '').trim()}|||${(p.project_code || '').trim()}`;
                    if (!map.has(key)) map.set(key, { key, name: p.name, project_code: p.project_code, locations: [p] });
                    else map.get(key).locations.push(p);
                  });
                  return Array.from(map.values()).map(group => (
                    <optgroup key={group.key} label={`${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}>
                      {group.locations.map(loc => (
                        <option key={loc.id} value={loc.id}>
                          {loc.location || 'คลังหลัก'}
                        </option>
                      ))}
                    </optgroup>
                  ));
                })()}
              </select>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-muted/60 p-1 rounded-xl border shrink-0">
              <Button
                type="button"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className={`h-8 px-2.5 rounded-lg text-xs gap-1 font-semibold ${viewMode === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                <List className="w-3.5 h-3.5" /> ตาราง
              </Button>
              <Button
                type="button"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`h-8 px-2.5 rounded-lg text-xs gap-1 font-semibold ${viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> การ์ด (Grid)
              </Button>
            </div>
          </div>
        </div>

        {/* Status Count Summary Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
          <span>แสดงรายการที่กรอง: <strong className="text-foreground font-semibold">{filteredItems.length}</strong> จากทั้งหมด <strong className="text-foreground font-semibold">{items.length}</strong> รายการสต็อก</span>
          {(searchQuery || categoryFilter !== 'all' || projectFilter !== 'all') && (
            <button
              onClick={() => { setSearchQuery(''); setCategoryFilter('all'); setProjectFilter('all'); }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      </Card>

      {/* Main Content Area: Table View vs Grid View */}
      {loading ? (
        <Card className="p-12 text-center rounded-2xl glass">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">กำลังดึงข้อมูลรายการวัสดุMaster...</p>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card className="p-12 text-center rounded-2xl glass space-y-3">
          <AlertCircle className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <h3 className="font-bold text-lg text-foreground">ไม่พบรายการวัสดุที่ค้นหา</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            ลองปรับเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองหมวดหมู่/โครงการเพื่อแสดงผลรายการทั้งหมดอีกครั้ง
          </p>
        </Card>
      ) : viewMode === 'table' ? (
        /* Table View */
        <Card className="overflow-hidden rounded-2xl border border-border/60 shadow-sm glass">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="text-xs hover:bg-transparent">
                  <TableHead className="w-14">รูปภาพ</TableHead>
                  <TableHead className="min-w-[180px]">รายการวัสดุ (Item Name) *</TableHead>
                  <TableHead className="min-w-[120px]">รุ่น (Model) *</TableHead>
                  <TableHead className="min-w-[130px]">รหัส SKU / Code</TableHead>
                  <TableHead className="min-w-[180px] font-bold text-indigo-600 dark:text-indigo-400">
                    โครงการปลายทาง (Destination Project)
                  </TableHead>
                  <TableHead className="min-w-[120px]">หมวดหมู่</TableHead>
                  <TableHead className="text-center w-[100px] font-bold">สต็อกปัจจุบัน</TableHead>
                  <TableHead className="w-[70px]">หน่วย</TableHead>
                  <TableHead className="min-w-[160px] hidden lg:table-cell">รายละเอียด</TableHead>
                  <TableHead className="text-right w-[90px]">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {paginatedItems.map((item) => {
                  const isChild = item.item_type === 'CHILD';
                  return (
                    <TableRow 
                      key={item.recordKey} 
                      className={`transition-colors hover:bg-muted/50 ${isChild ? "bg-blue-500/5 dark:bg-blue-950/20" : ""}`}
                    >
                      {/* Image Thumbnail */}
                      <TableCell>
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-10 h-10 object-cover rounded-xl border border-border/60 shadow-sm" />
                        ) : (
                          <div className="w-10 h-10 bg-muted/60 rounded-xl flex items-center justify-center border border-border/40 text-muted-foreground/60">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </TableCell>

                      {/* Name & Parent/Child Badge */}
                      <TableCell className="font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          {isChild && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">
                              └─ CHILD
                            </span>
                          )}
                          <span className="line-clamp-2">{item.name}</span>
                        </div>
                      </TableCell>

                      {/* Model */}
                      <TableCell className="font-medium text-muted-foreground">
                        {item.model && item.model !== '-' ? (
                          <span className="px-2 py-0.5 rounded bg-muted/60 font-mono text-[11px] text-foreground font-medium">
                            {item.model}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </TableCell>

                      {/* SKU */}
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.sku && item.sku !== '-' ? (
                          <span className="font-semibold text-foreground">{item.sku}</span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </TableCell>

                      {/* Destination Project */}
                      <TableCell>
                        {item.project_display !== '-' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300">
                              <Building2 className="w-3 h-3 shrink-0" />
                              {item.project_display}
                            </span>
                            {item.project_location && (
                              <span className="block text-[10px] text-muted-foreground font-medium">
                                {item.project_location}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 font-italic text-[11px]">ไม่ระบุโครงการ</span>
                        )}
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 border">
                          <Tag className="w-2.5 h-2.5 text-muted-foreground" />
                          {item.category_name}
                        </span>
                      </TableCell>

                      {/* Balance Badge */}
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-xl text-xs font-extrabold font-mono shadow-2xs ${
                          item.balance > 0 
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                        }`}>
                          {item.balance}
                        </span>
                      </TableCell>

                      {/* Unit */}
                      <TableCell className="text-muted-foreground font-medium">{item.unit}</TableCell>

                      {/* Description */}
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-[11px]">
                        <span className="line-clamp-2">{item.description || '-'}</span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {can('items.update') && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40" 
                              onClick={() => openEditDialog(item.originalItem || item)} 
                              title="แก้ไขข้อมูลวัสดุ Master"
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                          )}
                          {can('items.delete') && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" 
                              onClick={() => openDeleteDialog(item.originalItem || item)} 
                              title="ลบรายการวัสดุ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        /* Grid Bento Card View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedItems.map((item) => {
            const isChild = item.item_type === 'CHILD';
            return (
              <Card 
                key={item.recordKey} 
                className={`p-4 rounded-2xl glass border border-border/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3 relative overflow-hidden ${
                  isChild ? "bg-blue-500/5 dark:bg-blue-950/20" : ""
                }`}
              >
                <div>
                  {/* Top Badge Row */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300 border">
                      <Tag className="w-2.5 h-2.5" />
                      {item.category_name}
                    </span>

                    {isChild && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        └─ CHILD
                      </span>
                    )}
                  </div>

                  {/* Image & Title Header */}
                  <div className="flex items-start gap-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-12 h-12 object-cover rounded-xl border border-border/60 shadow-sm shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-muted/60 rounded-xl flex items-center justify-center border border-border/40 text-muted-foreground/60 shrink-0">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-foreground line-clamp-2 leading-tight">
                        {item.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                        {item.model && item.model !== '-' && <span>รุ่น: {item.model}</span>}
                        {item.sku && item.sku !== '-' && <span>SKU: {item.sku}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Project Location Pill */}
                  <div className="mt-3 p-2.5 rounded-xl bg-muted/40 border border-border/40 text-xs space-y-0.5">
                    <div className="font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 truncate">
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.project_display}</span>
                    </div>
                    {item.project_location && (
                      <div className="text-[10px] text-muted-foreground truncate pl-5">
                        {item.project_location}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Stock Balance & Actions */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-muted-foreground">สต็อก:</span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold font-mono ${
                      item.balance > 0 
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      {item.balance} {item.unit}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {can('items.update') && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-lg text-blue-600 hover:bg-blue-50"
                        onClick={() => openEditDialog(item.originalItem || item)}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {can('items.delete') && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-lg text-red-500 hover:bg-red-50"
                        onClick={() => openDeleteDialog(item.originalItem || item)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Supabase-Style Compact Pagination Footer Bar */}
      {filteredItems.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-muted/40 rounded-2xl border border-border/60 glass shadow-2xs text-xs text-muted-foreground select-none">
          {/* Left Controls: Navigation & Page Input */}
          <div className="flex items-center gap-2">
            {/* Previous Page Button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage <= 1}
              onClick={() => {
                const p = Math.max(1, currentPage - 1);
                setCurrentPage(p);
                setPageInput(String(p));
              }}
              className="h-8 w-8 rounded-lg border-border/80 text-foreground hover:bg-accent disabled:opacity-30 transition-all cursor-pointer shadow-2xs"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {/* Page Counter & Editable Numeric Input */}
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <span>Page</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={handlePageInputChange}
                onBlur={handlePageInputBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePageInputBlur(); }}
                className="h-8 w-12 text-center font-mono text-xs font-bold rounded-lg border border-input bg-background focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all shadow-2xs"
                aria-label="Current Page Number"
              />
              <span>of</span>
              <span className="font-mono font-bold text-foreground">{totalPages}</span>
            </div>

            {/* Next Page Button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages}
              onClick={() => {
                const p = Math.min(totalPages, currentPage + 1);
                setCurrentPage(p);
                setPageInput(String(p));
              }}
              className="h-8 w-8 rounded-lg border-border/80 text-foreground hover:bg-accent disabled:opacity-30 transition-all cursor-pointer shadow-2xs"
              aria-label="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Right Controls: Rows per Page Selector & Total Records Count */}
          <div className="flex items-center gap-3">
            {/* Rows per page selector */}
            <div className="flex items-center gap-1.5">
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                }}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs transition-all"
                aria-label="Rows per page"
              >
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={200}>200 rows</option>
              </select>
            </div>

            {/* Total Records Counter */}
            <span className="font-mono text-xs text-muted-foreground font-semibold">
              {totalRecords.toLocaleString()} records
            </span>
          </div>
        </div>
      )}

      {/* Edit Master Item Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl glass">
          <form onSubmit={handleEditItem}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-600" />
                <span>แก้ไขรายการวัสดุ Master</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold">รายการวัสดุ (Item Name) <span className="text-destructive">*</span></Label>
                <Input id="edit-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-xl font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-model" className="text-xs font-semibold">รุ่น (Model) <span className="text-destructive">*</span></Label>
                  <Input id="edit-model" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} placeholder="ระบุรุ่น" className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sku" className="text-xs font-semibold">รหัส SKU / Code</Label>
                  <Input id="edit-sku" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="rounded-xl font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-category" className="text-xs font-semibold">หมวดหมู่จัดกลุ่ม</Label>
                  <select id="edit-category" className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold" value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}>
                    <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-unit" className="text-xs font-semibold">หน่วยนับ <span className="text-destructive">*</span></Label>
                  <Input id="edit-unit" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="rounded-xl" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-description" className="text-xs font-semibold">รายละเอียดเพิ่มเติม / หมายเหตุ</Label>
                <Input id="edit-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-xl" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-image" className="text-xs font-semibold">รูปภาพวัสดุ</Label>
                <div className="flex items-center gap-3">
                  {formData.image_url ? (
                    <img src={formData.image_url} alt="Preview" className="w-14 h-14 object-cover rounded-xl border shadow-sm shrink-0" />
                  ) : (
                    <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center border text-muted-foreground shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <Input id="edit-image" type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="rounded-xl text-xs" />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsEditOpen(false)}>ยกเลิก</Button>
              <Button type="submit" className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">อัปเดตวัสดุ</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Master Item Modal */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl glass">
          <DialogHeader>
            <DialogTitle className="text-red-600 font-bold text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>ยืนยันการลบรายการวัสดุ</span>
            </DialogTitle>
            <DialogDescription className="pt-2">
              คุณแน่ใจหรือไม่ว่าต้องการลบรายการ <strong>{selectedItem?.name}</strong>? การกระทำนี้ไม่สามารถย้อนกลับได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsDeleteOpen(false)}>ยกเลิก</Button>
            <Button type="button" variant="destructive" className="rounded-xl font-semibold" onClick={handleDeleteItem}>ยืนยันการลบ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Items;
