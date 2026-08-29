import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { 
  Plus, Search, MapPin, Calendar, Edit, Trash2, Building2, 
  Layers, ChevronDown, ChevronUp, Info, X, AlertTriangle, ArrowRight, Package, ShieldAlert 
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

// Interactive Multi-Code Tag Input Component
const ProjectCodeTagInput = ({
  codes = [],
  onChange,
  placeholder = "พิมพ์รหัสโครงการ แล้วกด Enter หรือเครื่องหมายจุลภาค ,"
}) => {
  const [inputValue, setInputValue] = useState('');

  const addCode = (codeStr) => {
    const trimmed = codeStr.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    const newCodes = Array.from(new Set([...codes, ...parts]));
    onChange(newCodes);
    setInputValue('');
  };

  const removeCode = (indexToRemove) => {
    onChange(codes.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCode(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && codes.length > 0) {
      removeCode(codes.length - 1);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      addCode(pasted);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-emerald-500 min-h-[44px]">
        {codes.map((code, idx) => (
          <span
            key={`${code}-${idx}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 animate-in zoom-in-95"
          >
            <span>{code}</span>
            <button
              type="button"
              onClick={() => removeCode(idx)}
              className="hover:text-red-500 p-0.5 rounded-full hover:bg-emerald-500/20 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (inputValue.trim()) addCode(inputValue);
          }}
          placeholder={codes.length === 0 ? placeholder : "เพิ่มอีก..."}
          className="flex-1 min-w-[140px] bg-transparent border-none text-xs font-mono focus:outline-none p-1 text-foreground placeholder:text-muted-foreground/70"
        />
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center justify-between">
        <span>พิมพ์รหัสแล้วกด <strong>Enter</strong> หรือ <strong>,</strong> เพื่อเพิ่มหลายรหัส</span>
        {codes.length > 0 && (
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            {codes.length} รหัสที่ระบุ
          </span>
        )}
      </p>
    </div>
  );
};

const Projects = () => {
  const { can, profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  // Delete & Stock Transfer States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCheckingStock, setIsCheckingStock] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'project' | 'location', name: string, projectIds: string[], stockItems: [] }
  const [destinationProjectId, setDestinationProjectId] = useState('');
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  const [formData, setFormData] = useState({ 
    name: '', 
    project_code: '', 
    project_codes: [],
    description: '', 
    location: '', 
    status: 'active' 
  });
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedLogicalProject, setSelectedLogicalProject] = useState(null);
  
  // Track expanded locations state per logical project key
  const [expandedKeys, setExpandedKeys] = useState({});

  useEffect(() => {
    fetchProjects();

    // Live Realtime synchronization on projects
    const channel = supabase
      .channel('projects-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchProjects();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_code, location, description, status, created_at, created_by, profiles!created_by(full_name)')
        .neq('status', 'inactive')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Fetch projects error:', error);
      toast.error('ไม่สามารถโหลดข้อมูลโครงการได้');
    } finally {
      setLoading(false);
    }
  };

  // Group raw database records into logical projects (Name + Code)
  const groupLogicalProjects = (rawProjects) => {
    const map = new Map();

    rawProjects.forEach(record => {
      if (record.status === 'inactive') return; // Filter out inactive projects
      const nameKey = (record.name || '').trim().toLowerCase();
      const codeKey = (record.project_code || '').trim().toLowerCase();
      const key = `${nameKey}|||${codeKey}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          canonicalName: record.name,
          canonicalCode: record.project_code,
          status: record.status || 'active',
          created_at: record.created_at,
          records: [record]
        });
      } else {
        const group = map.get(key);
        group.records.push(record);
        if (new Date(record.created_at) < new Date(group.created_at)) {
          group.created_at = record.created_at;
        }
      }
    });

    return Array.from(map.values());
  };

  const logicalProjects = groupLogicalProjects(projects);

  const filteredLogicalProjects = logicalProjects.filter(group => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const matchName = group.canonicalName.toLowerCase().includes(query);
    const matchCode = (group.canonicalCode || '').toLowerCase().includes(query);
    const matchLocationOrDesc = group.records.some(r => 
      (r.location && r.location.toLowerCase().includes(query)) ||
      (r.description && r.description.toLowerCase().includes(query))
    );
    return matchName || matchCode || matchLocationOrDesc;
  });

  const totalLocationsCount = projects.filter(p => p.status !== 'inactive').length;

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!can('projects.create')) return toast.error('คุณไม่มีสิทธิ์ในการสร้างโครงการ (Requires projects.create)');

    const projectCodeString = Array.isArray(formData.project_codes) && formData.project_codes.length > 0
      ? formData.project_codes.map(c => c.trim()).filter(Boolean).join(', ')
      : (formData.project_code?.trim() || null);

    try {
      const { error } = await supabase
        .from('projects')
        .insert([{ 
          name: formData.name.trim(),
          project_code: projectCodeString,
          location: formData.location.trim() || null,
          description: formData.description.trim() || null,
          created_by: profile.id,
          owner_id: profile.id
        }]);

      if (error) throw error;
      toast.success('สร้างโครงการสำเร็จ');
      setIsCreateOpen(false);
      setFormData({ name: '', project_code: '', project_codes: [], description: '', location: '', status: 'active' });
      fetchProjects();
    } catch (error) {
      console.error('Create Project Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการสร้างโครงการ');
    }
  };

  const handleAddLocationToProject = async (e) => {
    e.preventDefault();
    if (!can('projects.create')) return toast.error('คุณไม่มีสิทธิ์ในการเพิ่มสถานที่ตั้งโครงการ');

    try {
      const { error } = await supabase
        .from('projects')
        .insert([{ 
          name: selectedLogicalProject.canonicalName,
          project_code: selectedLogicalProject.canonicalCode || null,
          location: formData.location.trim() || null,
          description: formData.description.trim() || null,
          created_by: profile.id,
          owner_id: profile.id
        }]);

      if (error) throw error;
      toast.success(`เพิ่มสถานที่ตั้งสำหรับ "${selectedLogicalProject.canonicalName}" สำเร็จ`);
      setIsAddLocationOpen(false);
      setFormData({ name: '', project_code: '', project_codes: [], description: '', location: '', status: 'active' });
      fetchProjects();
    } catch (error) {
      console.error('Add Location Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการเพิ่มสถานที่ตั้ง');
    }
  };

  const handleEditRecord = async (e) => {
    e.preventDefault();
    if (!can('projects.update')) return toast.error('คุณไม่มีสิทธิ์ในการแก้ไขโครงการ (Requires projects.update)');

    const projectCodeString = Array.isArray(formData.project_codes) && formData.project_codes.length > 0
      ? formData.project_codes.map(c => c.trim()).filter(Boolean).join(', ')
      : (formData.project_code?.trim() || null);

    try {
      const updatePayload = {
        name: formData.name.trim(),
        project_code: projectCodeString,
        location: formData.location.trim() || null,
        description: formData.description.trim() || null,
        status: formData.status || 'active'
      };

      const { error } = await supabase
        .from('projects')
        .update(updatePayload)
        .eq('id', selectedRecord.id);

      if (error) throw error;
      toast.success('อัปเดตข้อมูลโครงการสำเร็จ');
      setIsEditOpen(false);
      fetchProjects();
    } catch (error) {
      console.error('Edit Project Error:', error);
      toast.error('เกิดข้อผิดพลาดในการอัปเดตโครงการ: ' + (error.message || error.details || 'Bad Request'));
    }
  };

  // Initiate Delete with Stock Verification
  const startDeleteProcess = async (type, name, projectIds) => {
    if (!can('projects.delete')) return toast.error('คุณไม่มีสิทธิ์ในการลบโครงการ (Requires projects.delete)');

    setIsCheckingStock(true);
    const toastId = toast.loading('กำลังตรวจสอบสต็อกคงเหลือในโครงการ...');

    try {
      // Query stock_balance for all project IDs being deleted
      const { data: stockData, error: stockError } = await supabase
        .from('stock_balance')
        .select('*')
        .in('project_id', projectIds)
        .gt('balance', 0);

      if (stockError && stockError.code !== '42P01') throw stockError;

      const itemsWithStock = stockData || [];

      setDeleteTarget({
        type, // 'project' | 'location'
        name,
        projectIds,
        stockItems: itemsWithStock
      });
      setDestinationProjectId('');
      setIsDeleteModalOpen(true);
      toast.dismiss(toastId);
    } catch (err) {
      console.error('Check Stock Error:', err);
      toast.error('เกิดข้อผิดพลาดในการตรวจสอบสต็อก', { id: toastId });
    } finally {
      setIsCheckingStock(false);
    }
  };

  // Confirm Delete & Stock Transfer
  const handleConfirmDeleteAndTransfer = async () => {
    if (!deleteTarget || isProcessingDelete) return;

    const hasStock = deleteTarget.stockItems.length > 0;
    if (hasStock && !destinationProjectId) {
      toast.error('กรุณาเลือกสถานที่จัดเก็บ (Location) ปลายทางที่จะรับโอนสต็อก');
      return;
    }

    setIsProcessingDelete(true);
    const toastId = toast.loading(hasStock ? 'กำลังโอนย้ายสต็อกและลบโครงการ...' : 'กำลังลบโครงการ...');

    try {
      // 1. Try atomic RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('transfer_and_delete_project', {
        p_source_project_ids: deleteTarget.projectIds,
        p_dest_project_id: destinationProjectId || null,
        p_actor_id: profile?.id || null
      });

      if (rpcError) {
        // Fallback to client-side transfer & delete if RPC is missing
        console.warn('RPC transfer_and_delete_project not found or failed, using client fallback:', rpcError);
        
        if (hasStock && destinationProjectId) {
          // Create stock_in_order in destination
          const { data: inOrder, error: inOrderErr } = await supabase
            .from('stock_in_orders')
            .insert([{
              project_id: destinationProjectId,
              created_by: profile?.id,
              received_date: new Date().toISOString().split('T')[0],
              notes: `รับโอนสต็อกอัตโนมัติจากการลบโครงการ: ${deleteTarget.name}`
            }])
            .select()
            .single();

          if (inOrderErr) throw inOrderErr;

          // Insert stock_in_items
          const inItems = deleteTarget.stockItems.map(item => ({
            order_id: inOrder.id,
            item_id: item.item_id,
            quantity: item.balance,
            notes: `โอนมาจากโครงการ: ${deleteTarget.name}`
          }));
          await supabase.from('stock_in_items').insert(inItems);

          // Insert stock_out transactions on sources
          const outTransactions = deleteTarget.stockItems.map(item => ({
            project_id: item.project_id,
            item_id: item.item_id,
            quantity: item.balance,
            transaction_type: 'stock_out',
            created_by: profile?.id
          }));
          await supabase.from('stock_transactions').insert(outTransactions);

          // Reassign historical foreign key records to destination project
          for (const pid of deleteTarget.projectIds) {
            await supabase.from('stock_in_orders').update({ project_id: destinationProjectId }).eq('project_id', pid);
            await supabase.from('withdrawal_orders').update({ project_id: destinationProjectId }).eq('project_id', pid);
            await supabase.from('stock_transactions').update({ project_id: destinationProjectId }).eq('project_id', pid);
            await supabase.from('user_notifications').update({ project_id: destinationProjectId }).eq('project_id', pid);
          }
        } else {
          // Delete foreign keys for projects with 0 stock
          for (const pid of deleteTarget.projectIds) {
            await supabase.from('stock_transactions').delete().eq('project_id', pid);
            await supabase.from('withdrawal_orders').delete().eq('project_id', pid);
            await supabase.from('stock_in_orders').delete().eq('project_id', pid);
            await supabase.from('user_notifications').delete().eq('project_id', pid);
          }
        }

        // Delete user assignments
        await supabase.from('user_project_assignments').delete().in('project_id', deleteTarget.projectIds);

        // Permanently delete project rows from database
        for (const pid of deleteTarget.projectIds) {
          const { error: delErr } = await supabase.from('projects').delete().eq('id', pid);
          if (delErr) {
            console.warn('Hard delete failed, setting status to inactive:', delErr);
            await supabase.from('projects').update({ 
              status: 'inactive', 
              description: `[ลบโครงการแล้ว - โอนสต็อกแล้ว]` 
            }).eq('id', pid);
          }
        }
      }

      // Remove from local UI state immediately
      setProjects(prev => prev.filter(p => !deleteTarget.projectIds.includes(p.id)));

      toast.success(
        hasStock 
          ? `โอนย้ายสต็อก ${deleteTarget.stockItems.length} รายการ และลบโครงการสำเร็จ`
          : 'ลบโครงการเรียบร้อยแล้ว',
        { id: toastId }
      );

      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      fetchProjects();
    } catch (err) {
      console.error('Delete & Transfer Error:', err);
      toast.error('เกิดข้อผิดพลาดในการลบโครงการ: ' + (err.message || 'Error'), { id: toastId });
    } finally {
      setIsProcessingDelete(false);
    }
  };

  const openAddLocationDialog = (group) => {
    setSelectedLogicalProject(group);
    const parsedCodes = (group.canonicalCode || '')
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

    setFormData({ 
      name: group.canonicalName, 
      project_code: group.canonicalCode || '', 
      project_codes: parsedCodes,
      location: '', 
      description: '',
      status: 'active'
    });
    setIsAddLocationOpen(true);
  };

  const openEditDialog = (record) => {
    setSelectedRecord(record);
    const parsedCodes = (record.project_code || '')
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

    setFormData({ 
      name: record.name, 
      project_code: record.project_code || '', 
      project_codes: parsedCodes,
      description: record.description || '', 
      location: record.location || '',
      status: record.status || 'active'
    });
    setIsEditOpen(true);
  };

  // Available destination projects (exclude source project IDs)
  const availableDestinationProjects = useMemo(() => {
    if (!deleteTarget) return [];
    const sourceSet = new Set(deleteTarget.projectIds);
    return projects.filter(p => !sourceSet.has(p.id) && p.status === 'active');
  }, [projects, deleteTarget]);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5 text-foreground">
            <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Building2 className="w-6 h-6" />
            </div>
            <span>จัดการโครงการ (Projects)</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm flex items-center gap-2">
            <span>โครงการหลักในระบบ: <strong className="text-foreground font-bold">{logicalProjects.length} โครงการ</strong></span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
              รวม {totalLocationsCount} สถานที่ตั้ง
            </span>
          </p>
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ค้นหาโครงการ หรือสถานที่..."
              className="pl-9 bg-background/60 backdrop-blur-sm rounded-xl text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {can('projects.create') && (
            <Dialog open={isCreateOpen} onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (open) {
                setFormData({ name: '', project_code: '', project_codes: [], description: '', location: '', status: 'active' });
              }
            }}>
              <DialogTrigger asChild>
                <Button className="shrink-0 gap-2 rounded-2xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 cursor-pointer h-11 px-4 text-xs">
                  <Plus className="h-4 w-4" /> สร้างโครงการใหม่
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
                <form onSubmit={handleCreateProject}>
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <span>สร้างโครงการใหม่</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      ระบุรายละเอียดชื่อโครงการและรหัสโครงการ (รองรับหลายรหัส) เพื่อใช้สำหรับคลังและเบิกจ่ายวัสดุ
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3.5 py-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs font-bold text-foreground">ชื่อโครงการ <span className="text-destructive">*</span></Label>
                      <Input 
                        id="name" 
                        required 
                        placeholder="เช่น DTRS-DOPA" 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        className="rounded-xl h-10 text-xs" 
                      />
                    </div>

                    {/* Multi-Code Tag Input */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>รหัสโครงการ (Project IDs/Codes)</span>
                      </Label>
                      <ProjectCodeTagInput
                        codes={formData.project_codes || []}
                        onChange={(newCodes) => setFormData({ ...formData, project_codes: newCodes })}
                        placeholder="เช่น 20317-9999 (พิมพ์แล้วกด Enter เพื่อเพิ่มหลายรหัส)"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="location" className="text-xs font-bold text-foreground">สถานที่ตั้ง / คลังตั้งต้น</Label>
                      <Input 
                        id="location" 
                        placeholder="เช่น FORTH" 
                        value={formData.location} 
                        onChange={e => setFormData({...formData, location: e.target.value})} 
                        className="rounded-xl h-10 text-xs" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="description" className="text-xs font-bold text-foreground">รายละเอียดเพิ่มเติม</Label>
                      <Input 
                        id="description" 
                        placeholder="ระบุหมายเหตุหรือสถานที่ตั้งย่อย" 
                        value={formData.description} 
                        onChange={e => setFormData({...formData, description: e.target.value})} 
                        className="rounded-xl h-10 text-xs" 
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
                    <Button type="button" variant="outline" className="rounded-xl text-xs h-10" onClick={() => setIsCreateOpen(false)}>ยกเลิก</Button>
                    <Button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 cursor-pointer shadow-sm">บันทึกโครงการ</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Logical Project Cards Grid */}
      {loading ? (
        <div className="flex justify-center p-16">
          <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredLogicalProjects.map((group) => {
            const isExpanded = expandedKeys[group.key] ?? true;
            const projectCodesList = (group.canonicalCode || '')
              .split(/[,;]+/)
              .map(c => c.trim())
              .filter(Boolean);

            const allGroupProjectIds = group.records.map(r => r.id);

            return (
              <Card 
                key={group.key} 
                className="overflow-hidden rounded-3xl glass shadow-md hover:shadow-xl transition-all duration-300 border-white/20 dark:border-slate-800 flex flex-col justify-between"
              >
                <CardHeader className="pb-3 bg-muted/30 border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-xl font-bold tracking-tight text-foreground truncate">
                          {group.canonicalName}
                        </CardTitle>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          {group.status.toUpperCase()}
                        </span>
                      </div>
                      
                      {/* Render multiple code tags */}
                      {projectCodesList.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {projectCodesList.map((code, idx) => (
                            <div 
                              key={`${code}-${idx}`}
                              className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20"
                            >
                              <Layers className="w-3 h-3 shrink-0" />
                              <span>{code}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Actions: Add Location & Delete Project */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {can('projects.create') && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs gap-1.5 px-3 rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/50 font-bold cursor-pointer transition-all shadow-2xs"
                          onClick={() => openAddLocationDialog(group)}
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>เพิ่มสถานที่ตั้ง</span>
                        </Button>
                      )}

                      {can('projects.delete') && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl cursor-pointer"
                          title="ลบโครงการทั้งหมดนี้"
                          disabled={isCheckingStock}
                          onClick={() => startDeleteProcess('project', group.canonicalName, allGroupProjectIds)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4 flex-1">
                  {/* Locations Count & Toggle Header */}
                  <div className="flex items-center justify-between text-xs pb-1 border-b">
                    <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>สถานที่ตั้ง ({group.records.length} แห่ง)</span>
                    </span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => toggleExpand(group.key)}
                    >
                      {isExpanded ? (
                        <><span>ย่อรายการ</span> <ChevronUp className="w-3 h-3" /></>
                      ) : (
                        <><span>ขยายดูทั้งหมด ({group.records.length})</span> <ChevronDown className="w-3 h-3" /></>
                      )}
                    </Button>
                  </div>

                  {/* Locations List */}
                  {isExpanded && (
                    <div className="space-y-2.5">
                      {group.records.map((rec) => (
                        <div 
                          key={rec.id} 
                          className="group/item flex items-start justify-between gap-3 p-3 rounded-2xl bg-background/60 hover:bg-background/90 border transition-all duration-200"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {rec.location || 'คลังหลัก / ไม่ระบุสถานที่'}
                              </span>
                            </div>
                            {rec.description && (
                              <p className="text-[11px] text-muted-foreground pl-2.5 border-l-2 border-muted-foreground/20 line-clamp-2">
                                {rec.description}
                              </p>
                            )}
                            <div className="text-[10px] text-muted-foreground/80 pl-2.5 font-mono">
                              เพิ่มเมื่อ: {format(new Date(rec.created_at), 'dd/MM/yyyy HH:mm')}
                            </div>
                          </div>

                          {(can('projects.update') || can('projects.delete')) && (
                            <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover/item:opacity-100 transition-opacity">
                              {can('projects.update') && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg cursor-pointer"
                                  title="แก้ไขข้อมูลสถานที่ตั้งนี้"
                                  onClick={() => openEditDialog(rec)}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {can('projects.delete') && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg cursor-pointer"
                                  title="ลบสถานที่ตั้งนี้"
                                  onClick={() => startDeleteProcess('location', `${group.canonicalName} (${rec.location || 'คลังหลัก'})`, [rec.id])}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {filteredLogicalProjects.length === 0 && (
            <div className="col-span-full py-16 text-center text-muted-foreground bg-card/30 rounded-3xl border border-dashed flex flex-col items-center gap-2">
              <Info className="w-8 h-8 text-muted-foreground/50" />
              <span>ไม่พบข้อมูลโครงการตามคำค้นหา &quot;{searchQuery}&quot;</span>
            </div>
          )}
        </div>
      )}

      {/* Add Location Modal */}
      <Dialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
          <form onSubmit={handleAddLocationToProject}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <span>เพิ่มสถานที่ตั้งโครงการ</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                เพิ่มสถานที่ตั้งใหม่ภายใต้โครงการ <strong>{selectedLogicalProject?.canonicalName}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3.5 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">ชื่อโครงการ</Label>
                <Input disabled value={selectedLogicalProject?.canonicalName || ''} className="rounded-xl font-semibold bg-muted/50 text-xs h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">รหัสโครงการ (Project IDs)</Label>
                <Input disabled value={selectedLogicalProject?.canonicalCode || '-'} className="rounded-xl font-mono bg-muted/50 text-xs h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-location" className="text-xs font-bold text-foreground">ชื่อสถานที่ตั้ง / คลังย่อย <span className="text-destructive">*</span></Label>
                <Input id="add-location" required placeholder="เช่น FORTH EMS2 (TAOBIN)" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="rounded-xl text-xs h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-description" className="text-xs font-bold text-foreground">รายละเอียดเพิ่มเติม</Label>
                <Input id="add-description" placeholder="รายละเอียดคลังหรือโซนจัดเก็บ" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-xl text-xs h-10" />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
              <Button type="button" variant="outline" className="rounded-xl text-xs h-10" onClick={() => setIsAddLocationOpen(false)}>ยกเลิก</Button>
              <Button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 cursor-pointer shadow-sm">ยืนยันเพิ่มสถานที่</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
          <form onSubmit={handleEditRecord}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Edit className="w-5 h-5" />
                </div>
                <span>แก้ไขข้อมูลโครงการ / สถานที่ตั้ง</span>
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3.5 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-bold text-foreground">ชื่อโครงการ <span className="text-destructive">*</span></Label>
                <Input id="edit-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-xl text-xs h-10" />
              </div>

              {/* Multi-Code Tag Input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>รหัสโครงการ (Project IDs/Codes)</span>
                </Label>
                <ProjectCodeTagInput
                  codes={formData.project_codes || []}
                  onChange={(newCodes) => setFormData({ ...formData, project_codes: newCodes })}
                  placeholder="เช่น 20317-9999 (พิมพ์แล้วกด Enter เพื่อเพิ่มหลายรหัส)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-location" className="text-xs font-bold text-foreground">สถานที่ตั้ง</Label>
                <Input id="edit-location" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="rounded-xl text-xs h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-description" className="text-xs font-bold text-foreground">รายละเอียดเพิ่มเติม</Label>
                <Input id="edit-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-xl text-xs h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-status" className="text-xs font-bold text-foreground">สถานะโครงการ</Label>
                <select
                  id="edit-status"
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  value={formData.status || 'active'}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">ACTIVE (กำลังดำเนินงาน)</option>
                  <option value="completed">COMPLETED (เสร็จสิ้นโครงการ)</option>
                  <option value="inactive">INACTIVE (ปิดการใช้งาน)</option>
                </select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
              <Button type="button" variant="outline" className="rounded-xl text-xs h-10" onClick={() => setIsEditOpen(false)}>ยกเลิก</Button>
              <Button type="submit" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 cursor-pointer shadow-sm">อัปเดตข้อมูล</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete & Stock Transfer Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}>
        <DialogContent className="sm:max-w-[540px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
          <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2.5 text-foreground">
              <div className={`p-2 rounded-2xl ${deleteTarget?.stockItems?.length > 0 ? 'bg-amber-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'}`}>
                {deleteTarget?.stockItems?.length > 0 ? <AlertTriangle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
              </div>
              <span>
                {deleteTarget?.stockItems?.length > 0 
                  ? 'โอนย้ายสต็อกก่อนลบโครงการ'
                  : 'ยืนยันการลบโครงการ'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {deleteTarget?.type === 'project' ? 'กำลังดำเนินการลบโครงการ:' : 'กำลังดำเนินการลบสถานที่ตั้ง:'}{' '}
              <strong className="text-foreground">{deleteTarget?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-4 text-xs">
            {deleteTarget?.stockItems?.length > 0 ? (
              /* Case 1: Project has assigned stock -> Prompt for Transfer */
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1 leading-relaxed">
                  <p className="font-bold flex items-center gap-1.5 text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>พบวัสดุคงเหลืออยู่ในโครงการนี้รวม {deleteTarget.stockItems.length} รายการ ({deleteTarget.stockItems.reduce((s, i) => s + (Number(i.balance) || 0), 0)} ชิ้น)</span>
                  </p>
                  <p className="text-[11px] pl-5 opacity-90">
                    เพื่อความถูกต้องของระบบสต็อก กรุณาเลือกสถานที่จัดเก็บ (Location) ปลายทางที่จะรับโอนวัสดุทั้งหมดก่อนทำการลบ
                  </p>
                </div>

                {/* Stock Items Preview Table */}
                <div className="border border-border/60 rounded-2xl overflow-hidden glass shadow-2xs max-h-[180px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-muted/50 text-[11px]">
                      <TableRow>
                        <TableHead>รายการวัสดุ</TableHead>
                        <TableHead className="text-center">คลังย่อย</TableHead>
                        <TableHead className="text-right">ยอดคงเหลือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {deleteTarget.stockItems.map(item => (
                        <TableRow key={`${item.project_id}-${item.item_id}`}>
                          <TableCell className="font-bold text-foreground py-2">
                            {item.item_name}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground text-[11px] py-2">
                            {item.project_name || '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 py-2">
                            {item.balance} {item.unit || 'ชิ้น'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Destination Location Selector */}
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เลือกสถานที่จัดเก็บ (Location) ปลายทางที่จะรับโอนสต็อก <span className="text-destructive">*</span></span>
                  </Label>
                  <select
                    className="flex h-11 w-full rounded-2xl border border-input bg-background px-3 py-2 text-xs font-bold text-foreground focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs transition-all"
                    value={destinationProjectId}
                    onChange={(e) => setDestinationProjectId(e.target.value)}
                  >
                    <option value="" disabled>-- เลือกสถานที่จัดเก็บ (Location) ที่เปิดใช้งานอยู่ --</option>
                    {availableDestinationProjects.map(proj => (
                      <option key={proj.id} value={proj.id}>
                        {proj.project_code ? `[${proj.project_code}] ` : ''}{proj.name} ({proj.location || 'คลังหลัก'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              /* Case 2: Project has NO stock -> Simple confirmation */
              <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 space-y-2">
                <p className="font-semibold text-foreground">
                  โครงการนี้ <strong>ไม่มียอดสต็อกคงเหลือ</strong> (ยอดคงเหลือ 0 ชิ้น)
                </p>
                <p className="text-muted-foreground text-[11px]">
                  คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้ออกจากระบบ? ข้อมูลการจัดเก็บจะถูกลบหรือปิดการใช้งานอย่างปลอดภัย
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl text-xs h-10"
              disabled={isProcessingDelete}
              onClick={() => setIsDeleteModalOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              disabled={isProcessingDelete || (deleteTarget?.stockItems?.length > 0 && !destinationProjectId)}
              onClick={handleConfirmDeleteAndTransfer}
              className={`rounded-xl text-xs h-10 font-bold shadow-sm cursor-pointer ${
                deleteTarget?.stockItems?.length > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isProcessingDelete
                ? 'กำลังดำเนินการ...'
                : deleteTarget?.stockItems?.length > 0
                  ? 'โอนย้ายสต็อกและลบโครงการ'
                  : 'ยืนยันการลบ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
