import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Search, Package, Tag, Building2, Edit3, Trash2, 
  LayoutGrid, List, RefreshCw, ImageIcon, Box, 
  SlidersHorizontal, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
  ArrowRightLeft, Lock, Sparkles, History,
  ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, CornerDownRight, FolderTree
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ProjectLocationSelector } from '@/components/common/ProjectLocationSelector';
import { TransferItemDialog } from '@/components/items/TransferItemDialog';
import { uploadFileToR2 } from '@/lib/r2Storage';

const Items = () => {
  const { can, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [rawStockBalances, setRawStockBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Layout States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

  // Hierarchical & Sorting States
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState(new Set());

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [pageInput, setPageInput] = useState('1');

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [allowItemDeletion, setAllowItemDeletion] = useState(true);
  const [allowDirectStockAdjustment, setAllowDirectStockAdjustment] = useState(false);
  const [hasTransactionConflict, setHasTransactionConflict] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [itemToTransfer, setItemToTransfer] = useState(null);
  const [formData, setFormData] = useState({ name: '', model: '', sku: '', category_id: '', unit: 'ชิ้น', description: '', image_url: '' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const realtimeTimeoutRef = useRef(null);

  // Direct Stock Adjustment States in Edit Dialog
  const [adjustProjectId, setAdjustProjectId] = useState('');
  const [currentStockQty, setCurrentStockQty] = useState(0);
  const [newStockQty, setNewStockQty] = useState('');
  const [stockAdjustReason, setStockAdjustReason] = useState('');
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);

  // Stock Adjustment History Dialog States
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState(null);
  const [adjustmentHistoryLogs, setAdjustmentHistoryLogs] = useState([]);
  const [loadingHistoryLogs, setLoadingHistoryLogs] = useState(false);

  const canAdjustStock = can('items.adjust_stock') && allowDirectStockAdjustment;

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['allow_item_deletion', 'allow_direct_stock_adjustment']);

      if (!error && data) {
        data.forEach(setting => {
          if (setting.key === 'allow_item_deletion') {
            setAllowItemDeletion(Boolean(setting.value));
          } else if (setting.key === 'allow_direct_stock_adjustment') {
            setAllowDirectStockAdjustment(Boolean(setting.value));
          }
        });
      }
    } catch (err) {
      console.warn('[Items] Failed to fetch system_settings:', err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      let { data, error } = await supabase.from('categories').select('id, name, description').order('name');
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
  }, []);

  const fetchItems = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      // Parallelize Supabase requests across items, stock_balance, and active projects
      const [itemsRes, stockRes, projectsRes] = await Promise.all([
        supabase
          .from('items')
          .select('id, name, model, sku, item_type, parent_sku, parent_id, seq_no, unit, description, notes, image_url, category_id, categories(name)')
          .order('name'),
        supabase
          .from('stock_balance')
          .select('project_id, item_id, item_name, unit, project_name, balance'),
        supabase
          .from('projects')
          .select('id, name, project_code, location, description, status')
          .eq('status', 'active')
      ]);

      if (itemsRes.error) throw itemsRes.error;

      const iData = itemsRes.data || [];
      const bData = stockRes.data || [];
      const pData = projectsRes.data || [];

      setProjectsList(pData);
      setRawStockBalances(bData);

      const projectMap = {};
      pData.forEach(p => { projectMap[p.id] = p; });

      const itemMap = {};
      iData.forEach(i => { itemMap[i.id] = i; });

      const itemsWithBalanceSet = new Set();
      const records = [];

      // Construct project-specific stock balance records (only for active projects)
      bData.forEach(b => {
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
          parent_id: item.parent_id || null,
          seq_no: item.seq_no || null,
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
      iData.forEach(item => {
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
            parent_id: item.parent_id || null,
            seq_no: item.seq_no || null,
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
      setRefreshing(false);
    }
  }, []);

  const triggerDebouncedFetch = useCallback(() => {
    if (realtimeTimeoutRef.current) {
      clearTimeout(realtimeTimeoutRef.current);
    }
    realtimeTimeoutRef.current = setTimeout(() => {
      fetchItems(false);
    }, 300);
  }, [fetchItems]);

  useEffect(() => {
    fetchItems(true);
    fetchCategories();
    fetchSettings();

    // Live Realtime synchronization on projects, items, transactions, and system_settings with debouncing
    const channel = supabase
      .channel('items-master-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_in_orders' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_in_items' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transactions' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => {
        fetchSettings();
      })
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerDebouncedFetch();
        fetchSettings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleSettingsUpdated = () => void fetchSettings();
    window.addEventListener('stockflow:settings-updated', handleSettingsUpdated);

    return () => {
      if (realtimeTimeoutRef.current) {
        clearTimeout(realtimeTimeoutRef.current);
      }
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('stockflow:settings-updated', handleSettingsUpdated);
    };
  }, [fetchItems, fetchCategories, fetchSettings, triggerDebouncedFetch]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error('ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB');
    }

    setUploadingImage(true);
    const toastId = toast.loading('กำลังอัปโหลดรูปภาพสู่ Cloudflare R2...');

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const safeItemName = (selectedItem?.sku || selectedItem?.id || 'item').replace(/[^a-zA-Z0-9_-]/g, '_');
      const customFileName = `item-${safeItemName}-${Date.now()}.${fileExt}`;

      const publicUrl = await uploadFileToR2(file, 'items', customFileName);
      if (publicUrl) {
        setFormData(prev => ({ ...prev, image_url: publicUrl }));
        toast.success('อัปโหลดรูปภาพสู่ Cloudflare R2 สำเร็จ', { id: toastId });
      } else {
        toast.error('ไม่สามารถอัปโหลดรูปภาพได้', { id: toastId });
      }
    } catch (err) {
      console.error('[Items] Image upload error:', err);
      toast.error('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + (err.message || ''));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleProjectChangeForAdjustment = (projId) => {
    setAdjustProjectId(projId);
    if (!selectedItem) return;
    const foundBalance = rawStockBalances.find(b => b.item_id === selectedItem.id && b.project_id === projId);
    const qty = foundBalance && foundBalance.balance !== undefined ? foundBalance.balance : 0;
    setCurrentStockQty(qty);
    setNewStockQty(String(qty));
    setStockAdjustReason('');
  };

  const openAdjustmentHistoryDialog = async (item) => {
    setSelectedItemForHistory(item);
    setIsHistoryDialogOpen(true);
    setLoadingHistoryLogs(true);
    try {
      const { data, error } = await supabase
        .from('stock_adjustment_logs')
        .select(`
          id,
          previous_quantity,
          new_quantity,
          difference,
          reason,
          created_at,
          projects:project_id (name, location, project_code),
          profiles:created_by (full_name)
        `)
        .eq('item_id', item.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAdjustmentHistoryLogs(data);
      } else {
        setAdjustmentHistoryLogs([]);
      }
    } catch (err) {
      console.warn('[Items] Failed to fetch stock adjustment logs:', err);
      setAdjustmentHistoryLogs([]);
    } finally {
      setLoadingHistoryLogs(false);
    }
  };

  const handleEditItem = async (e) => {
    e.preventDefault();
    try {
      setIsAdjustingStock(true);

      // Check stock adjustment first if requested
      const parsedNewStock = parseInt(newStockQty, 10);
      const isStockChanged = !isNaN(parsedNewStock) && parsedNewStock >= 0 && parsedNewStock !== currentStockQty;

      if (isStockChanged) {
        if (!allowDirectStockAdjustment) {
          toast.error('ระบบถูกปิดการแก้ไขยอดสต็อกคงเหลือในการตั้งค่าระบบ');
          setIsAdjustingStock(false);
          return;
        }
        if (!canAdjustStock) {
          toast.error('คุณไม่มีสิทธิ์ปรับปรุงยอดสต็อกสินค้า (ต้องการสิทธิ์ items.adjust_stock)');
          setIsAdjustingStock(false);
          return;
        }
        if (!adjustProjectId) {
          toast.error('กรุณาเลือกคลัง/โครงการที่ต้องการปรับปรุงยอดสต็อก');
          setIsAdjustingStock(false);
          return;
        }
        if (!stockAdjustReason.trim()) {
          toast.error('กรุณาระบุเหตุผลในการปรับปรุงยอดสต็อก (Adjustment Reason is required)');
          setIsAdjustingStock(false);
          return;
        }
      }

      // 1. Build payload with only valid items columns (no updated_at — column doesn't exist)
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

      const { error: itemErr } = await supabase
        .from('items')
        .update(updatePayload)
        .eq('id', selectedItem.id);

      if (itemErr) throw itemErr;

      // 2. Execute Stock Adjustment if changed
      if (isStockChanged) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('adjust_item_current_stock', {
          p_item_id: selectedItem.id,
          p_project_id: adjustProjectId,
          p_new_quantity: parsedNewStock,
          p_reason: stockAdjustReason.trim(),
          p_actor_id: profile?.id || null
        });

        if (rpcError) {
          console.warn('[Items] RPC adjust_item_current_stock error, attempting fallback:', rpcError);
          const diff = parsedNewStock - currentStockQty;
          if (diff > 0) {
            const { data: inOrder, error: inOrderErr } = await supabase
              .from('stock_in_orders')
              .insert([{
                project_id: adjustProjectId,
                created_by: profile?.id || null,
                received_date: new Date().toISOString().split('T')[0],
                notes: `ปรับยอดสต็อกคงเหลือ (+${diff} ${formData.unit}) | เหตุผล: ${stockAdjustReason.trim()}`
              }])
              .select().single();
            if (!inOrderErr && inOrder) {
              await supabase.from('stock_in_items').insert([{
                order_id: inOrder.id,
                item_id: selectedItem.id,
                quantity: diff,
                notes: `ปรับยอดสต็อกคงเหลือเพิ่ม | เหตุผล: ${stockAdjustReason.trim()}`
              }]);
              await supabase.from('stock_transactions').insert([{
                project_id: adjustProjectId,
                item_id: selectedItem.id,
                quantity: diff,
                transaction_type: 'stock_in',
                notes: `ปรับยอดสต็อกคงเหลือเพิ่ม (+${diff} ${formData.unit}) | เหตุผล: ${stockAdjustReason.trim()}`,
                created_by: profile?.id || null
              }]);
            }
          } else if (diff < 0) {
            await supabase.from('stock_transactions').insert([{
              project_id: adjustProjectId,
              item_id: selectedItem.id,
              quantity: Math.abs(diff),
              transaction_type: 'stock_out',
              notes: `ปรับยอดสต็อกคงเหลือลดลง (-${Math.abs(diff)} ${formData.unit}) | เหตุผล: ${stockAdjustReason.trim()}`,
              created_by: profile?.id || null
            }]);
          }

          // Insert audit log
          await supabase.from('stock_adjustment_logs').insert([{
            item_id: selectedItem.id,
            project_id: adjustProjectId,
            previous_quantity: currentStockQty,
            new_quantity: parsedNewStock,
            difference: diff,
            reason: stockAdjustReason.trim(),
            created_by: profile?.id || null
          }]);
        }
        toast.success(rpcData?.message || `ปรับยอดสต็อกสำเร็จ: ${currentStockQty} ➔ ${parsedNewStock} ${formData.unit}`);
      } else {
        toast.success('อัปเดตวัสดุสำเร็จ');
      }

      setIsEditOpen(false);
      fetchItems();
    } catch (error) {
      console.error('[Items] Update error:', error);
      const code = error?.code;
      if (code === '23505') {
        const detail = error?.details || '';
        if (detail.includes('sku')) {
          toast.error('รหัส SKU นี้ซ้ำกับรายการอื่นในระบบ กรุณาใช้รหัส SKU ที่ไม่ซ้ำกัน');
        } else {
          toast.error('ข้อมูลซ้ำกับรายการที่มีอยู่: ' + (error?.message || ''));
        }
      } else if (code === '23503') {
        toast.error('หมวดหมู่ที่เลือกไม่มีอยู่ในระบบ กรุณาเลือกหมวดหมู่ใหม่อีกครั้ง');
      } else if (code === '23502') {
        toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อรายการและหน่วยนับ)');
      } else if (code === '23514') {
        toast.error('ข้อมูลที่กรอกไม่ผ่านเงื่อนไขที่กำหนด: ' + (error?.message || ''));
      } else if (error?.status === 403 || code === '42501') {
        toast.error('คุณไม่มีสิทธิ์แก้ไขรายการวัสดุ กรุณาติดต่อผู้ดูแลระบบ');
      } else if (error?.message) {
        toast.error('เกิดข้อผิดพลาด: ' + error.message);
      } else {
        toast.error('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุในการบันทึกข้อมูล');
      }
    } finally {
      setIsAdjustingStock(false);
    }
  };

  const handleDeleteItem = async (force = false) => {
    if (!selectedItem || isDeleting) return;
    if (!allowItemDeletion) {
      toast.error('ระบบถูกตั้งค่าไม่อนุญาตให้ลบรายการวัสดุ');
      return;
    }
    setIsDeleting(true);
    try {
      if (force || hasTransactionConflict) {
        // Attempt atomic force delete RPC (Migration 48)
        const { data, error: rpcError } = await supabase.rpc('admin_force_delete_item', {
          p_item_id: selectedItem.id
        });

        if (rpcError) {
          if (rpcError.code === 'PGRST202' || rpcError.status === 404) {
            throw new Error('ฟังก์ชัน Force Delete ยังไม่ได้ติดตั้งในฐานข้อมูล กรุณารัน Migration 48 ใน Supabase SQL Editor');
          }
          throw rpcError;
        }

        toast.success(data?.message || 'บังคับลบรายการวัสดุและประวัติธุรกรรมสำเร็จ');
        setIsDeleteOpen(false);
        setHasTransactionConflict(false);
        fetchItems();
        return;
      }

      // Standard delete
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', selectedItem.id);

      if (error) {
        if (error.code === '23503') {
          // Foreign key violation: switch dialog to Force Delete mode
          setHasTransactionConflict(true);
          return;
        }
        throw error;
      }

      toast.success('ลบวัสดุสำเร็จ');
      setIsDeleteOpen(false);
      setHasTransactionConflict(false);
      fetchItems();
    } catch (error) {
      console.error('Delete Item Error:', error);
      toast.error('เกิดข้อผิดพลาดในการลบ: ' + (error.message || ''));
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (item) => {
    if (!can('items.update')) {
      toast.error('คุณไม่มีสิทธิ์แก้ไขข้อมูลวัสดุ (ต้องการสิทธิ์ items.update)');
      return;
    }
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

    // Initialize stock adjustment states
    const targetProjId = item.project_id || (projectsList[0]?.id || '');
    setAdjustProjectId(targetProjId);
    
    let currentQty = 0;
    if (item.balance !== undefined && item.project_id === targetProjId) {
      currentQty = item.balance;
    } else {
      const foundBalance = rawStockBalances.find(b => b.item_id === item.id && b.project_id === targetProjId);
      currentQty = foundBalance && foundBalance.balance !== undefined ? foundBalance.balance : 0;
    }
    setCurrentStockQty(currentQty);
    setNewStockQty(String(currentQty));
    setStockAdjustReason('');
    setIsEditOpen(true);
  };

  const openDeleteDialog = (item) => {
    if (!can('items.delete')) {
      toast.error('คุณไม่มีสิทธิ์ลบรายการวัสดุ (ต้องการสิทธิ์ items.delete)');
      return;
    }
    setSelectedItem(item);
    setHasTransactionConflict(false);
    setIsDeleteOpen(true);
  };

  const openTransferDialog = (item) => {
    if (!can('items.transfer')) {
      toast.error('คุณไม่มีสิทธิ์โอนย้ายสต็อกวัสดุ (ต้องการสิทธิ์ items.transfer)');
      return;
    }
    setItemToTransfer(item);
    setIsTransferOpen(true);
  };

  // Interactive Column Sorting Handler
  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  // Expand / Collapse group handlers
  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Build hierarchical groups
  const hierarchicalGroups = useMemo(() => {
    const childRecords = [];
    const parentRecords = [];

    items.forEach(r => {
      const isChild = r.item_type === 'CHILD' || Boolean(r.parent_sku) || Boolean(r.parent_id);
      if (isChild) {
        childRecords.push(r);
      } else {
        parentRecords.push(r);
      }
    });

    const parentMapBySku = new Map();
    const parentMapById = new Map();

    const groups = parentRecords.map(p => {
      const group = {
        key: p.recordKey,
        parent: p,
        children: []
      };
      if (p.sku && p.sku !== '-') {
        const normSku = p.sku.trim().toLowerCase();
        if (!parentMapBySku.has(normSku)) {
          parentMapBySku.set(normSku, []);
        }
        parentMapBySku.get(normSku).push(group);
      }
      if (p.id) {
        if (!parentMapById.has(p.id)) {
          parentMapById.set(p.id, []);
        }
        parentMapById.get(p.id).push(group);
      }
      return group;
    });

    const orphanGroups = [];
    childRecords.forEach(c => {
      let matchedGroup = null;
      const pSku = c.parent_sku ? c.parent_sku.trim().toLowerCase() : null;

      if (pSku && parentMapBySku.has(pSku)) {
        const candidates = parentMapBySku.get(pSku);
        matchedGroup = candidates.find(g => g.parent.project_id === c.project_id) || candidates[0];
      } else if (c.parent_id && parentMapById.has(c.parent_id)) {
        const candidates = parentMapById.get(c.parent_id);
        matchedGroup = candidates.find(g => g.parent.project_id === c.project_id) || candidates[0];
      }

      if (matchedGroup) {
        // Prevent accidental duplicate child entries
        if (!matchedGroup.children.some(existing => existing.recordKey === c.recordKey)) {
          matchedGroup.children.push(c);
        }
      } else {
        orphanGroups.push({
          key: c.recordKey,
          parent: { ...c, isOrphanChild: true },
          children: []
        });
      }
    });

    return [...groups, ...orphanGroups];
  }, [items]);

  // Filter groups according to search, category, and project
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const matchesItemSearch = (item) => {
      if (!q) return true;
      return (
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.model && item.model.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.project_display && item.project_display.toLowerCase().includes(q)) ||
        (item.category_name && item.category_name.toLowerCase().includes(q))
      );
    };

    const matchesItemCategory = (item) => {
      return categoryFilter === 'all' || item.category_id === categoryFilter;
    };

    const matchesItemProject = (item) => {
      if (projectFilter === 'all') return true;
      if (projectFilter === 'none') return !item.project_id;
      return item.project_id === projectFilter;
    };

    return hierarchicalGroups.reduce((acc, group) => {
      const parentMatchesProj = matchesItemProject(group.parent);
      const parentMatchesCat = matchesItemCategory(group.parent);
      const parentMatchesSearch = matchesItemSearch(group.parent);

      // Filter children by project and category
      const validChildren = group.children.filter(c => {
        return matchesItemProject(c) && (categoryFilter === 'all' || matchesItemCategory(c));
      });

      const hasChildMatchingSearch = validChildren.some(c => matchesItemSearch(c));

      // Case 1: Parent matches project & category & search -> include parent and its valid children
      if (parentMatchesProj && parentMatchesCat && parentMatchesSearch) {
        acc.push({
          ...group,
          children: validChildren
        });
      }
      // Case 2: Parent doesn't match search text directly, but a child does -> keep parent as context + matching children
      else if ((parentMatchesProj || validChildren.length > 0) && hasChildMatchingSearch) {
        acc.push({
          ...group,
          children: q ? validChildren.filter(c => matchesItemSearch(c)) : validChildren
        });
      }

      return acc;
    }, []);
  }, [hierarchicalGroups, searchQuery, categoryFilter, projectFilter]);

  // Sort groups (Preserves parent-child hierarchy by sorting at root/parent level)
  const sortedGroups = useMemo(() => {
    return [...filteredGroups].sort((groupA, groupB) => {
      const pA = groupA.parent;
      const pB = groupB.parent;
      let valA, valB;

      switch (sortConfig.key) {
        case 'name':
          valA = pA.name || '';
          valB = pB.name || '';
          break;
        case 'model':
          valA = pA.model || '';
          valB = pB.model || '';
          break;
        case 'sku':
          valA = pA.sku || '';
          valB = pB.sku || '';
          break;
        case 'project_display':
          valA = pA.project_display || '';
          valB = pB.project_display || '';
          break;
        case 'category_name':
          valA = pA.category_name || '';
          valB = pB.category_name || '';
          break;
        case 'balance':
          valA = Number(pA.balance) || 0;
          valB = Number(pB.balance) || 0;
          break;
        default:
          valA = pA.name || '';
          valB = pB.name || '';
      }

      let comp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comp = valA - valB;
      } else {
        comp = String(valA).localeCompare(String(valB), 'th', { numeric: true, sensitivity: 'base' });
      }

      return sortConfig.direction === 'asc' ? comp : -comp;
    });
  }, [filteredGroups, sortConfig]);

  // Pagination calculations based on Parent Groups
  const totalRootGroups = sortedGroups.length;
  const totalFilteredRecords = useMemo(() => {
    return sortedGroups.reduce((sum, g) => sum + 1 + g.children.length, 0);
  }, [sortedGroups]);

  const totalPages = Math.max(1, Math.ceil(totalRootGroups / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRootGroups);
  const paginatedGroups = sortedGroups.slice(startIndex, endIndex);

  // Flatten active page groups into display rows for rendering
  const paginatedItems = useMemo(() => {
    const rows = [];
    paginatedGroups.forEach(group => {
      const isCollapsed = collapsedGroupKeys.has(group.key);
      const hasChildren = group.children.length > 0;

      // Add parent row
      rows.push({
        ...group.parent,
        isParentRow: true,
        isChildRow: false,
        hasChildren: hasChildren,
        childCount: group.children.length,
        isCollapsed: isCollapsed,
        groupKey: group.key,
      });

      // Add children if not collapsed
      if (hasChildren && !isCollapsed) {
        const sortedChildren = [...group.children].sort((cA, cB) => {
          if (cA.seq_no && cB.seq_no && cA.seq_no !== cB.seq_no) {
            return cA.seq_no - cB.seq_no;
          }
          return (cA.name || '').localeCompare(cB.name || '', 'th', { numeric: true });
        });

        sortedChildren.forEach((child, idx) => {
          rows.push({
            ...child,
            isParentRow: false,
            isChildRow: true,
            parentName: group.parent.name,
            parentSku: group.parent.sku,
            parentModel: group.parent.model,
            isLastChild: idx === sortedChildren.length - 1,
            groupKey: group.key,
          });
        });
      }
    });
    return rows;
  }, [paginatedGroups, collapsedGroupKeys]);

  const expandAllGroups = () => setCollapsedGroupKeys(new Set());
  const collapseAllGroups = () => {
    const allKeys = new Set(filteredGroups.filter(g => g.children.length > 0).map(g => g.key));
    setCollapsedGroupKeys(allKeys);
  };

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
  const parentKitsCount = useMemo(() => new Set(items.filter(i => i.item_type !== 'CHILD' && !i.parent_sku).map(i => i.id)).size, [items]);
  const childKitsCount = useMemo(() => new Set(items.filter(i => i.item_type === 'CHILD' || Boolean(i.parent_sku)).map(i => i.id)).size, [items]);
  const totalStockQuantity = items.reduce((acc, i) => acc + (parseInt(i.balance, 10) || 0), 0);
  const totalCategoriesCount = categories.length;
  const activeLocationsWithStockCount = new Set(items.filter(i => i.balance > 0 && i.project_id).map(i => i.project_id)).size;

  // Sort Icon Renderer
  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" />
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
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
            onClick={() => fetchItems(false)}
            disabled={loading || refreshing}
            className="rounded-lg h-9 px-3 gap-1.5 border-input hover:bg-accent text-xs font-medium cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || refreshing) ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{refreshing ? 'กำลังซิงค์...' : 'รีเฟรชข้อมูล'}</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">รายการ Master ทั้งหมด</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Box className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">{uniqueMasterItemsCount}</span>
            <span className="text-xs text-muted-foreground font-medium">รายการ</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
            {parentKitsCount} แม่ • {childKitsCount} ชิ้นส่วนย่อย
          </div>
        </Card>

        <Card className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">รวมยอดคงเหลือสะสม</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
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

        <Card className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">พื้นที่จัดเก็บที่มีสต็อก</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">{activeLocationsWithStockCount}</span>
            <span className="text-xs text-muted-foreground font-medium">แห่ง</span>
          </div>
        </Card>

        <Card className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">หมวดหมู่จัดกลุ่ม</span>
            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
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
      <Card className="p-4 rounded-xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ค้นหาชื่อรายการ, รุ่น, รหัส SKU, โครงการ หรือรายละเอียด..."
              className="pl-9 pr-4 h-9 rounded-lg text-xs bg-background border-input shadow-xs"
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
                className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs font-medium focus:ring-2 focus:ring-primary transition-colors cursor-pointer shadow-xs"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">ทุกหมวดหมู่ ({categories.length})</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Project & Storage Location Filter */}
            <div className="min-w-[260px] flex-1 sm:flex-initial">
              <ProjectLocationSelector
                projects={projectsList}
                value={projectFilter}
                onChange={(val) => setProjectFilter(val)}
                allowAll={true}
                allLabel="-- ทุกโครงการ & ทุกคลังจัดเก็บ (All Locations) --"
                mode="unified"
                size="sm"
                showSummaryCard={false}
              />
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border shrink-0">
              <Button
                type="button"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className={`h-8 px-2.5 rounded-md text-xs gap-1 font-medium cursor-pointer ${viewMode === 'table' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <List className="w-3.5 h-3.5" /> ตาราง
              </Button>
              <Button
                type="button"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`h-8 px-2.5 rounded-md text-xs gap-1 font-medium cursor-pointer ${viewMode === 'grid' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> การ์ด (Grid)
              </Button>
            </div>
          </div>
        </div>

        {/* Status Count Summary Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
          <div className="flex items-center gap-3">
            <span>
              แสดงรายการที่กรอง: <strong className="text-foreground font-semibold">{totalRootGroups}</strong> กลุ่มหลัก 
              (<strong className="text-foreground font-semibold">{totalFilteredRecords}</strong> รายการทั้งหมด)
            </span>

            {/* Expand / Collapse All Controls for Table Mode */}
            {viewMode === 'table' && (
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/60">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={expandAllGroups}
                  className="h-6 px-2 text-[11px] font-medium text-foreground hover:bg-background rounded shadow-xs cursor-pointer"
                  title="ขยายรายการลูกทั้งหมด (Expand All)"
                >
                  <ChevronDown className="w-3 h-3 mr-1 text-indigo-600 dark:text-indigo-400" />
                  <span>ขยายทั้งหมด</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={collapseAllGroups}
                  className="h-6 px-2 text-[11px] font-medium text-foreground hover:bg-background rounded shadow-xs cursor-pointer"
                  title="ยุบรายการลูกทั้งหมด (Collapse All)"
                >
                  <ChevronRight className="w-3 h-3 mr-1 text-indigo-600 dark:text-indigo-400" />
                  <span>ยุบทั้งหมด</span>
                </Button>
              </div>
            )}
          </div>

          {(searchQuery || categoryFilter !== 'all' || projectFilter !== 'all') && (
            <button
              onClick={() => { setSearchQuery(''); setCategoryFilter('all'); setProjectFilter('all'); }}
              className="text-xs text-primary hover:underline font-semibold cursor-pointer"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      </Card>

      {/* Main Content Area: Table View vs Grid View */}
      {loading ? (
        <Card className="p-12 text-center rounded-xl bg-card border border-border shadow-xs">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">กำลังดึงข้อมูลรายการวัสดุMaster...</p>
        </Card>
      ) : totalRootGroups === 0 ? (
        <Card className="p-12 text-center rounded-xl bg-card border border-border shadow-xs space-y-3">
          <AlertCircle className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <h3 className="font-bold text-lg text-foreground">ไม่พบรายการวัสดุที่ค้นหา</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            ลองปรับเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองหมวดหมู่/โครงการเพื่อแสดงผลรายการทั้งหมดอีกครั้ง
          </p>
        </Card>
      ) : viewMode === 'table' ? (
        /* Table View */
        <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40 select-none">
                <TableRow className="text-xs hover:bg-transparent">
                  <TableHead className="w-14 text-center">รูปภาพ</TableHead>
                  <TableHead 
                    className="min-w-[200px] cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('name')}
                    title="คลิกเพื่อเรียงลำดับตามชื่อวัสดุ"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">รายการวัสดุ (Item Name)</span>
                      {renderSortIcon('name')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="min-w-[120px] cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('model')}
                    title="คลิกเพื่อเรียงลำดับตามรุ่น"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">รุ่น (Model)</span>
                      {renderSortIcon('model')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="min-w-[130px] cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('sku')}
                    title="คลิกเพื่อเรียงลำดับตามรหัส SKU"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">รหัส SKU / Code</span>
                      {renderSortIcon('sku')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="min-w-[180px] cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('project_display')}
                    title="คลิกเพื่อเรียงลำดับตามสถานที่จัดเก็บ"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                      <span>สถานที่จัดเก็บ (Location)</span>
                      {renderSortIcon('project_display')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="min-w-[120px] cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('category_name')}
                    title="คลิกเพื่อเรียงลำดับตามหมวดหมู่"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">หมวดหมู่</span>
                      {renderSortIcon('category_name')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-center w-[110px] cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('balance')}
                    title="คลิกเพื่อเรียงลำดับตามยอดสต็อกคงเหลือ"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="font-bold">สต็อกปัจจุบัน</span>
                      {renderSortIcon('balance')}
                    </div>
                  </TableHead>
                  <TableHead className="w-[70px]">หน่วย</TableHead>
                  <TableHead className="min-w-[160px] hidden lg:table-cell">รายละเอียด</TableHead>
                  <TableHead className="text-right w-[90px]">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {paginatedItems.map((item) => {
                  const isChild = item.isChildRow;

                  return (
                    <TableRow 
                      key={`${item.recordKey}_${isChild ? 'child' : 'parent'}`} 
                      className={`transition-colors ${
                        isChild 
                          ? "bg-blue-500/[0.03] dark:bg-blue-950/25 border-l-4 border-l-blue-500 hover:bg-blue-500/[0.07] dark:hover:bg-blue-950/40" 
                          : item.hasChildren
                            ? "hover:bg-muted/60 font-medium bg-card"
                            : "hover:bg-muted/50 bg-card"
                      }`}
                    >
                      {/* Image Thumbnail */}
                      <TableCell className="w-14">
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt={item.name} 
                            className={`object-cover rounded-lg border border-border shadow-xs ${
                              isChild ? "w-8 h-8 ml-2" : "w-10 h-10"
                            }`} 
                          />
                        ) : (
                          <div className={`bg-muted/60 rounded-lg flex items-center justify-center border border-border/60 text-muted-foreground/60 ${
                            isChild ? "w-8 h-8 ml-2" : "w-10 h-10"
                          }`}>
                            <ImageIcon className={isChild ? "w-3.5 h-3.5" : "w-4 h-4"} />
                          </div>
                        )}
                      </TableCell>

                      {/* Name & Parent/Child Badge */}
                      <TableCell className="font-semibold text-foreground">
                        {isChild ? (
                          /* CHILD Row Layout with Tree Branch Guide */
                          <div className="flex items-start gap-2 pl-2">
                            <div className="flex items-center gap-1 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0 font-mono font-bold select-none">
                              <CornerDownRight className="w-4 h-4 stroke-[2.25]" />
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                                CHILD
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-foreground/95 line-clamp-2">{item.name}</span>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground font-mono">
                                <span>แม่:</span>
                                <span className="font-semibold text-foreground/80 truncate max-w-[200px]" title={item.parentName}>
                                  {item.parentName || item.parentSku}
                                </span>
                                {item.parentSku && item.parentSku !== '-' && (
                                  <span className="text-muted-foreground/60 font-mono">({item.parentSku})</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* PARENT / Standard Row Layout */
                          <div className="flex items-center gap-2">
                            {item.hasChildren && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleGroupCollapse(item.groupKey)}
                                className="h-6 w-6 p-0 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 cursor-pointer shadow-none"
                                title={item.isCollapsed ? "ขยายรายการลูก (Expand Children)" : "ยุบรายการลูก (Collapse Children)"}
                              >
                                {item.isCollapsed ? (
                                  <ChevronRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                )}
                              </Button>
                            )}

                            {item.hasChildren ? (
                              <button
                                type="button"
                                onClick={() => toggleGroupCollapse(item.groupKey)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 shrink-0 hover:bg-indigo-500/20 transition-colors cursor-pointer"
                                title="คลิกเพื่อย่อ/ขยายรายการลูก"
                              >
                                <FolderTree className="w-3 h-3" />
                                <span>PARENT ({item.childCount})</span>
                              </button>
                            ) : item.isOrphanChild ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25 shrink-0">
                                CHILD (เดี่ยว)
                              </span>
                            ) : null}

                            <span className="line-clamp-2 text-sm font-bold text-foreground">
                              {item.name}
                            </span>
                          </div>
                        )}
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

                      {/* Destination Project & Storage Location */}
                      <TableCell>
                        {item.project_display !== '-' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 font-semibold text-primary text-xs">
                              <Building2 className="w-3 h-3 shrink-0" />
                              {item.project_display}
                            </span>
                            {item.project_location && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                <Building2 className="w-3 h-3 shrink-0 inline" />
                                <span>{item.project_location}</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 font-italic text-[11px]">ไม่ระบุโครงการ</span>
                        )}
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-muted-foreground border">
                          <Tag className="w-2.5 h-2.5 text-muted-foreground" />
                          {item.category_name}
                        </span>
                      </TableCell>

                      {/* Balance Badge */}
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold font-mono shadow-xs ${
                          item.balance > 0 
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                            : 'bg-muted text-muted-foreground border border-border'
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
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40" 
                            onClick={() => openAdjustmentHistoryDialog(item)} 
                            title="ดูประวัติการปรับปรุงยอดสต็อก (Stock Adjustment History)"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          {can('items.transfer') && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-30 disabled:cursor-not-allowed" 
                              onClick={() => openTransferDialog(item)} 
                              disabled={!item.project_id || (parseInt(item.balance, 10) || 0) <= 0}
                              title={
                                !item.project_id || (parseInt(item.balance, 10) || 0) <= 0 
                                  ? "ไม่สามารถโอนย้ายได้ (ไม่มีสต็อกในคลังนี้)" 
                                  : "โอนย้ายสถานที่จัดเก็บ / คลัง"
                              }
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </Button>
                          )}
                          {can('items.update') && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40" 
                              onClick={() => openEditDialog(item)} 
                              title="แก้ไขข้อมูลวัสดุ Master"
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                          )}
                          {can('items.delete') && allowItemDeletion && (
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
            const isChild = item.isChildRow;
            return (
              <Card 
                key={item.recordKey} 
                className={`p-4 rounded-xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-xs transition-all flex flex-col justify-between space-y-3 relative overflow-hidden ${
                  isChild ? "bg-blue-500/5 dark:bg-blue-950/20" : ""
                }`}
              >
                <div>
                  {/* Top Badge Row */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[10px] font-medium text-muted-foreground border">
                      <Tag className="w-2.5 h-2.5" />
                      {item.category_name}
                    </span>

                    {isChild ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                        <CornerDownRight className="w-3 h-3" />
                        CHILD (แม่: {item.parentSku || item.parentName})
                      </span>
                    ) : item.hasChildren ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 flex items-center gap-1">
                        <FolderTree className="w-3 h-3" />
                        PARENT ({item.childCount} ลูก)
                      </span>
                    ) : null}
                  </div>

                  {/* Image & Title Header */}
                  <div className="flex items-start gap-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-12 h-12 object-cover rounded-lg border border-border shadow-xs shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-muted/60 rounded-lg flex items-center justify-center border border-border/60 text-muted-foreground/60 shrink-0">
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
                  <div className="mt-3 p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-0.5">
                    <div className="font-semibold text-primary flex items-center gap-1.5 truncate">
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
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold font-mono ${
                      item.balance > 0 
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                        : 'bg-muted text-muted-foreground border border-border'
                    }`}>
                      {item.balance} {item.unit}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-lg text-amber-600 hover:bg-amber-50"
                      onClick={() => openAdjustmentHistoryDialog(item)}
                      title="ดูประวัติการปรับปรุงยอดสต็อก (Stock Adjustment History)"
                    >
                      <History className="w-3.5 h-3.5" />
                    </Button>
                    {can('items.transfer') && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => openTransferDialog(item)}
                        disabled={!item.project_id || (parseInt(item.balance, 10) || 0) <= 0}
                        title={
                          !item.project_id || (parseInt(item.balance, 10) || 0) <= 0 
                            ? "ไม่สามารถโอนย้ายได้ (ไม่มีสต็อกในคลังนี้)" 
                            : "โอนย้ายสถานที่จัดเก็บ / คลัง"
                        }
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {can('items.update') && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-lg text-blue-600 hover:bg-blue-50"
                        onClick={() => openEditDialog(item)}
                        title="แก้ไขข้อมูลวัสดุ Master"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {can('items.delete') && allowItemDeletion && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-lg text-red-500 hover:bg-red-50"
                        onClick={() => openDeleteDialog(item.originalItem || item)}
                        title="ลบรายการวัสดุ"
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
      {totalRootGroups > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-card rounded-xl border border-border shadow-xs text-xs text-muted-foreground select-none">
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
              className="h-8 w-8 rounded-lg border-border text-foreground hover:bg-accent disabled:opacity-30 transition-colors cursor-pointer shadow-xs"
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
                className="h-8 w-12 text-center font-mono text-xs font-bold rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-none transition-colors shadow-xs"
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
              className="h-8 w-8 rounded-lg border-border text-foreground hover:bg-accent disabled:opacity-30 transition-colors cursor-pointer shadow-xs"
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
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary cursor-pointer shadow-xs transition-colors"
                aria-label="Rows per page"
              >
                <option value={25}>25 กลุ่มหลัก</option>
                <option value={50}>50 กลุ่มหลัก</option>
                <option value={100}>100 กลุ่มหลัก</option>
                <option value={200}>200 กลุ่มหลัก</option>
              </select>
            </div>

            {/* Total Records Counter */}
            <span className="font-mono text-xs text-muted-foreground font-medium">
              {totalRootGroups.toLocaleString()} กลุ่มหลัก ({totalFilteredRecords.toLocaleString()} รายการ)
            </span>
          </div>
        </div>
      )}

      {/* Edit Master Item Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-xl border-border bg-card shadow-lg">
          <form onSubmit={handleEditItem}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-primary" />
                <span>แก้ไขรายการวัสดุ Master</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold">รายการวัสดุ (Item Name) <span className="text-destructive">*</span></Label>
                <Input id="edit-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-lg font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-model" className="text-xs font-semibold">รุ่น (Model) <span className="text-destructive">*</span></Label>
                  <Input id="edit-model" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} placeholder="ระบุรุ่น" className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sku" className="text-xs font-semibold">รหัส SKU / Code</Label>
                  <Input id="edit-sku" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="rounded-lg font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-category" className="text-xs font-semibold">หมวดหมู่จัดกลุ่ม</Label>
                  <select id="edit-category" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium" value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}>
                    <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-unit" className="text-xs font-semibold">หน่วยนับ <span className="text-destructive">*</span></Label>
                  <Input id="edit-unit" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="rounded-lg" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-description" className="text-xs font-semibold">รายละเอียดเพิ่มเติม / หมายเหตุ</Label>
                <Input id="edit-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-lg" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-image" className="text-xs font-semibold">รูปภาพวัสดุ</Label>
                <div className="flex items-center gap-3">
                  {formData.image_url ? (
                    <img src={formData.image_url} alt="Preview" className="w-14 h-14 object-cover rounded-lg border shadow-xs shrink-0" />
                  ) : (
                    <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center border text-muted-foreground shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <Input id="edit-image" type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="rounded-lg text-xs" />
                </div>
              </div>

              {/* Section: ปรับยอดสต็อกคงเหลือปัจจุบัน (Current Stock Adjustment) */}
              <div className="pt-3 border-t border-border/40 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                    <span>ปรับยอดสต็อกคงเหลือปัจจุบัน (Current Stock Adjustment)</span>
                  </Label>

                  {allowDirectStockAdjustment && canAdjustStock ? (
                    <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>เปิดใช้งาน</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-muted text-muted-foreground border border-border/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      <span>ปิดใช้งาน</span>
                    </span>
                  )}
                </div>

                {!allowDirectStockAdjustment ? (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      การแก้ไขยอดสต็อกโดยตรงถูกปิดใช้งานในการตั้งค่าระบบ (คุณสามารถเปิดได้ที่ <strong>Settings &gt; กฎการเบิกและสต็อก</strong>)
                    </div>
                  </div>
                ) : !canAdjustStock ? (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      คุณไม่มีสิทธิ์ในการปรับปรุงยอดสต็อกสินค้า (ต้องการสิทธิ์ <code>items.adjust_stock</code> หรือ Admin)
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    {/* Project Selector for adjustment */}
                    <div className="space-y-1">
                      <Label htmlFor="adjust-project" className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-primary" />
                        <span>เลือกคลัง/โครงการที่ต้องการปรับปรุงยอด</span>
                      </Label>
                      <select
                        id="adjust-project"
                        value={adjustProjectId}
                        onChange={(e) => handleProjectChangeForAdjustment(e.target.value)}
                        className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary cursor-pointer"
                      >
                        {projectsList.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.project_code ? `${p.project_code} — ` : ''}{p.name}{p.location ? ` (${p.location})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Stock comparison & input */}
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-muted-foreground">ยอดสต็อกเดิม (Current Stock)</Label>
                        <div className="h-9 px-3 rounded-lg bg-background border border-border/80 flex items-center justify-between font-mono text-xs font-bold">
                          <span className="text-foreground">{currentStockQty}</span>
                          <span className="text-muted-foreground text-[10px]">{formData.unit || 'ชิ้น'}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="adjust-new-qty" className="text-[11px] font-bold text-foreground flex items-center justify-between">
                          <span>ยอดสต็อกใหม่ (New Stock)</span>
                          {parseInt(newStockQty, 10) !== currentStockQty && !isNaN(parseInt(newStockQty, 10)) && (
                            <span className={`text-[10px] font-mono font-extrabold px-1.5 py-0.2 rounded-md ${
                              parseInt(newStockQty, 10) > currentStockQty 
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' 
                                : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                            }`}>
                              {parseInt(newStockQty, 10) > currentStockQty ? `+${parseInt(newStockQty, 10) - currentStockQty}` : `${parseInt(newStockQty, 10) - currentStockQty}`} {formData.unit}
                            </span>
                          )}
                        </Label>
                        <Input
                          id="adjust-new-qty"
                          type="number"
                          min="0"
                          value={newStockQty}
                          onChange={(e) => setNewStockQty(e.target.value)}
                          className="h-9 rounded-lg font-mono text-xs font-bold bg-background"
                          placeholder="ระบุยอดคงเหลือใหม่"
                        />
                      </div>
                    </div>

                    {/* Mandatory reason when stock changes */}
                    {parseInt(newStockQty, 10) !== currentStockQty && !isNaN(parseInt(newStockQty, 10)) && (
                      <div className="space-y-1.5 pt-1 animate-in fade-in-50 duration-200">
                        <Label htmlFor="adjust-reason" className="text-[11px] font-bold text-primary flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <span>เหตุผลในการปรับปรุงยอดสต็อก (Adjustment Reason) <span className="text-destructive">*</span></span>
                        </Label>
                        <textarea
                          id="adjust-reason"
                          rows={2}
                          required
                          value={stockAdjustReason}
                          onChange={(e) => setStockAdjustReason(e.target.value)}
                          placeholder="เช่น ตรวจนับสต็อกประจำปี, พบสินค้าชำรุดเสียหาย, ปรับปรุงยอดยกมาเริ่มต้น..."
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-lg" onClick={() => setIsEditOpen(false)}>ยกเลิก</Button>
              <Button type="submit" disabled={isAdjustingStock} className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-xs">
                {isAdjustingStock ? 'กำลังบันทึก...' : 'อัปเดตวัสดุและสต็อก'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Master Item Modal */}
      <Dialog 
        open={isDeleteOpen} 
        onOpenChange={(open) => {
          setIsDeleteOpen(open);
          if (!open) setHasTransactionConflict(false);
        }}
      >
        <DialogContent className="sm:max-w-[450px] rounded-xl border-border bg-card shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-destructive font-bold text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>{hasTransactionConflict ? 'พบประวัติธุรกรรมในระบบ' : 'ยืนยันการลบรายการวัสดุ'}</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground/80 space-y-2" asChild>
              <div>
                {hasTransactionConflict ? (
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs">
                      รายการ <strong>{selectedItem?.name}</strong> (SKU: {selectedItem?.sku || '-'}) มีประวัติการรับเข้า/เบิกจ่าย หรือยอดคงเหลือผูกอยู่ในระบบ
                    </div>
                    <p className="text-xs text-muted-foreground">
                      หากคุณต้องการลบรายการนี้ออกจากระบบทั้งหมด ระบบจะทำการลบประวัติธุรกรรมและความเคลื่อนไหวที่เกี่ยวข้องกับสินค้านี้ออกไปด้วย การกระทำนี้ไม่สามารถย้อนกลับได้
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    คุณแน่ใจหรือไม่ว่าต้องการลบรายการ <strong>{selectedItem?.name}</strong> (SKU: {selectedItem?.sku || '-'})? การกระทำนี้ไม่สามารถย้อนกลับได้
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="outline" 
              className="rounded-lg" 
              disabled={isDeleting}
              onClick={() => {
                setIsDeleteOpen(false);
                setHasTransactionConflict(false);
              }}
            >
              ยกเลิก
            </Button>
            {hasTransactionConflict ? (
              <Button 
                type="button" 
                variant="destructive" 
                className="rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white shadow-xs" 
                disabled={isDeleting}
                onClick={() => handleDeleteItem(true)}
              >
                {isDeleting ? 'กำลังลบข้อมูล...' : 'บังคับลบรายการและประวัติทั้งหมด'}
              </Button>
            ) : (
              <Button 
                type="button" 
                variant="destructive" 
                className="rounded-lg font-medium shadow-xs" 
                disabled={isDeleting}
                onClick={() => handleDeleteItem(false)}
              >
                {isDeleting ? 'กำลังตรวจสอบ...' : 'ยืนยันการลบ'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Warehouse Transfer Dialog Modal */}
      <TransferItemDialog
        open={isTransferOpen}
        onOpenChange={setIsTransferOpen}
        item={itemToTransfer}
        projectsList={projectsList}
        onSuccess={fetchItems}
        currentProfile={profile}
      />

      {/* Stock Adjustment Audit History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="sm:max-w-[620px] rounded-xl border-border bg-card shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <History className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span>ประวัติการปรับปรุงยอดสต็อก (Stock Adjustment History)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              รายการ: <strong className="text-foreground">{selectedItemForHistory?.name}</strong> (SKU: {selectedItemForHistory?.sku || '-'})
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {loadingHistoryLogs ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-600" />
                <span>กำลังโหลดประวัติการปรับปรุงสต็อก...</span>
              </div>
            ) : adjustmentHistoryLogs.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border/80 text-center text-xs text-muted-foreground">
                <History className="w-6 h-6 mx-auto mb-1 opacity-40" />
                <span>ยังไม่มีประวัติการปรับปรุงยอดสต็อกสำหรับรายการนี้</span>
              </div>
            ) : (
              <div className="space-y-2">
                {adjustmentHistoryLogs.map((log) => {
                  const projName = log.projects?.project_code 
                    ? `${log.projects.project_code} — ${log.projects.name}` 
                    : (log.projects?.name || 'คลังสินค้า');
                  return (
                    <div 
                      key={log.id} 
                      className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-muted/60 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-primary" />
                            {projName}
                          </span>
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {log.previous_quantity} ➔ <strong className="text-foreground font-bold">{log.new_quantity}</strong>
                          </span>
                          <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] font-extrabold ${
                            log.difference > 0 
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                              : log.difference < 0
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {log.difference > 0 ? `+${log.difference}` : log.difference} {selectedItemForHistory?.unit || 'ชิ้น'}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          เหตุผล: <span className="text-foreground font-medium">&quot;{log.reason}&quot;</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          ผู้ทำรายการ: {log.profiles?.full_name || 'เจ้าหน้าที่'}
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground font-mono self-end sm:self-auto shrink-0">
                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm น.')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsHistoryDialogOpen(false)}
              className="rounded-lg text-xs"
            >
              ปิดหน้าต่าง
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Items;
