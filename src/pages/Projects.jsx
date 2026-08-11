import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, MapPin, Calendar, Edit, Trash2, Building2, Layers, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const Projects = () => {
  const { can, profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  const [formData, setFormData] = useState({ name: '', project_code: '', description: '', location: '' });
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedLogicalProject, setSelectedLogicalProject] = useState(null);
  
  // Track expanded locations state per logical project key
  const [expandedKeys, setExpandedKeys] = useState({});

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*, profiles!created_by(full_name)')
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

  const totalLocationsCount = projects.length;

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!can('projects.create')) return toast.error('คุณไม่มีสิทธิ์ในการสร้างโครงการ (Requires projects.create)');

    try {
      const { error } = await supabase
        .from('projects')
        .insert([{ 
          name: formData.name.trim(),
          project_code: formData.project_code.trim() || null,
          location: formData.location.trim() || null,
          description: formData.description.trim() || null,
          created_by: profile.id,
          owner_id: profile.id
        }]);

      if (error) throw error;
      toast.success('สร้างโครงการสำเร็จ');
      setIsCreateOpen(false);
      setFormData({ name: '', project_code: '', description: '', location: '' });
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
      setFormData({ name: '', project_code: '', description: '', location: '' });
      fetchProjects();
    } catch (error) {
      console.error('Add Location Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการเพิ่มสถานที่ตั้ง');
    }
  };

  const handleEditRecord = async (e) => {
    e.preventDefault();
    if (!can('projects.update')) return toast.error('คุณไม่มีสิทธิ์ในการแก้ไขโครงการ (Requires projects.update)');

    try {
      const updatePayload = {
        name: formData.name.trim(),
        project_code: formData.project_code.trim() || null,
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

  const handleDeleteRecord = async () => {
    if (!can('projects.delete')) return toast.error('คุณไม่มีสิทธิ์ในการลบโครงการ (Requires projects.delete)');

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', selectedRecord.id);

      if (error) throw error;
      toast.success('ลบสถานที่ตั้งสำเร็จ');
      setIsDeleteOpen(false);
      fetchProjects();
    } catch (error) {
      if (error.code === '23503') {
        toast.error('ไม่สามารถลบได้ เนื่องจากมีประวัติรับเข้า/เบิกจ่ายผูกกับโครงการนี้อยู่');
      } else {
        toast.error('เกิดข้อผิดพลาดในการลบโครงการ');
      }
    }
  };

  const openAddLocationDialog = (group) => {
    setSelectedLogicalProject(group);
    setFormData({ name: group.canonicalName, project_code: group.canonicalCode || '', location: '', description: '' });
    setIsAddLocationOpen(true);
  };

  const openEditDialog = (record) => {
    setSelectedRecord(record);
    setFormData({ 
      name: record.name, 
      project_code: record.project_code || '', 
      description: record.description || '', 
      location: record.location || '',
      status: record.status || 'active'
    });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (record) => {
    setSelectedRecord(record);
    setIsDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Building2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            <span>จัดการโครงการ (Projects)</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
            <span>โครงการหลักในระบบ: <strong className="text-foreground font-bold">{logicalProjects.length} โครงการ</strong></span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/20">
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
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="shrink-0 gap-2 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20">
                  <Plus className="h-4 w-4" /> สร้างโครงการใหม่
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[450px] rounded-2xl">
                <form onSubmit={handleCreateProject}>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                      <span>สร้างโครงการใหม่</span>
                    </DialogTitle>
                    <DialogDescription>
                      ระบุรายละเอียดชื่อโครงการและสถานที่ตั้งเพื่อใช้สำหรับคลังและเบิกจ่ายวัสดุ
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs font-semibold">ชื่อโครงการ <span className="text-destructive">*</span></Label>
                      <Input id="name" required placeholder="เช่น DTRS-DOPA" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="project_code" className="text-xs font-semibold">รหัสโครงการ (Project ID/Code)</Label>
                      <Input id="project_code" placeholder="เช่น 20317-9999" value={formData.project_code} onChange={e => setFormData({...formData, project_code: e.target.value})} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="location" className="text-xs font-semibold">สถานที่ตั้ง / คลังตั้งต้น</Label>
                      <Input id="location" placeholder="เช่น FORTH" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="description" className="text-xs font-semibold">รายละเอียดเพิ่มเติม</Label>
                      <Input id="description" placeholder="ระบุหมายเหตุหรือสถานที่ตั้งย่อย" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-xl" />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsCreateOpen(false)}>ยกเลิก</Button>
                    <Button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">บันทึกโครงการ</Button>
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
            return (
              <Card 
                key={group.key} 
                className="neu-interactive overflow-hidden rounded-2xl neu-flat border-0 flex flex-col justify-between"
              >
                <CardHeader className="pb-3 bg-muted/30 border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                          {group.canonicalName}
                        </CardTitle>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          {group.status.toUpperCase()}
                        </span>
                      </div>
                      
                      {group.canonicalCode && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Project ID: {group.canonicalCode}</span>
                        </div>
                      )}
                    </div>

                    {can('projects.create') && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs gap-1 rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 shrink-0 font-medium"
                        onClick={() => openAddLocationDialog(group)}
                      >
                        <Plus className="w-3.5 h-3.5" /> + เพิ่มสถานที่ตั้ง
                      </Button>
                    )}
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
                      className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
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
                          className="group/item flex items-start justify-between gap-3 p-3 rounded-xl bg-background/60 hover:bg-background/90 border transition-all duration-200"
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
                                  className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg"
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
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg"
                                  title="ลบสถานที่ตั้งนี้"
                                  onClick={() => openDeleteDialog(rec)}
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
            <div className="col-span-full py-16 text-center text-muted-foreground bg-card/30 rounded-2xl border border-dashed flex flex-col items-center gap-2">
              <Info className="w-8 h-8 text-muted-foreground/50" />
              <span>ไม่พบข้อมูลโครงการตามคำค้นหา "{searchQuery}"</span>
            </div>
          )}
        </div>
      )}

      {/* Add Location Modal */}
      <Dialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl">
          <form onSubmit={handleAddLocationToProject}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                <span>เพิ่มสถานที่ตั้งโครงการ</span>
              </DialogTitle>
              <DialogDescription>
                เพิ่มสถานที่ตั้งใหม่ภายใต้โครงการ <strong>{selectedLogicalProject?.canonicalName}</strong> (Project ID: {selectedLogicalProject?.canonicalCode})
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">ชื่อโครงการ (Canonical Name)</Label>
                <Input disabled value={selectedLogicalProject?.canonicalName || ''} className="rounded-xl font-semibold bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">รหัสโครงการ (Project ID)</Label>
                <Input disabled value={selectedLogicalProject?.canonicalCode || ''} className="rounded-xl font-mono bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-location" className="text-xs font-semibold">ชื่อสถานที่ตั้ง / คลังย่อย <span className="text-destructive">*</span></Label>
                <Input id="add-location" required placeholder="เช่น FORTH EMS2 (TAOBIN)" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-description" className="text-xs font-semibold">รายละเอียดเพิ่มเติม</Label>
                <Input id="add-description" placeholder="รายละเอียดคลังหรือโซนจัดเก็บ" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-xl" />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsAddLocationOpen(false)}>ยกเลิก</Button>
              <Button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">ยืนยันเพิ่มสถานที่</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl">
          <form onSubmit={handleEditRecord}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                <span>แก้ไขข้อมูลโครงการ / สถานที่ตั้ง</span>
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold">ชื่อโครงการ <span className="text-destructive">*</span></Label>
                <Input id="edit-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-project_code" className="text-xs font-semibold">รหัสโครงการ (Project ID/Code)</Label>
                <Input id="edit-project_code" placeholder="เช่น 20317-9999" value={formData.project_code} onChange={e => setFormData({...formData, project_code: e.target.value})} className="rounded-xl font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-location" className="text-xs font-semibold">สถานที่ตั้ง</Label>
                <Input id="edit-location" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-description" className="text-xs font-semibold">รายละเอียดเพิ่มเติม</Label>
                <Input id="edit-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-status" className="text-xs font-semibold">สถานะโครงการ</Label>
                <select
                  id="edit-status"
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  value={formData.status || 'active'}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">ACTIVE (กำลังดำเนินงาน)</option>
                  <option value="completed">COMPLETED (เสร็จสิ้นโครงการ)</option>
                  <option value="inactive">INACTIVE (ปิดการใช้งาน)</option>
                </select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsEditOpen(false)}>ยกเลิก</Button>
              <Button type="submit" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold">อัปเดตข้อมูล</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Record Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-600 font-bold text-lg flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              <span>ยืนยันการลบสถานที่ตั้ง</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-xs">
              คุณแน่ใจหรือไม่ว่าต้องการลบสถานที่ตั้ง <strong>{selectedRecord?.location || selectedRecord?.name}</strong> ของโครงการ <strong>{selectedRecord?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsDeleteOpen(false)}>ยกเลิก</Button>
            <Button type="button" variant="destructive" className="rounded-xl font-semibold" onClick={handleDeleteRecord}>ยืนยันการลบ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
