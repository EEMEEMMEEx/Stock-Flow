import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, MapPin, Calendar, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const Projects = () => {
  const { can, profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  const [formData, setFormData] = useState({ name: '', project_code: '', description: '', location: '' });
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      toast.error('ไม่สามารถโหลดข้อมูลโครงการได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!can('projects.create')) return toast.error('คุณไม่มีสิทธิ์ในการสร้างโครงการ (Requires projects.create)');

    
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([{ 
          ...formData,
          created_by: profile.id,
          owner_id: profile.id
        }])
        .select();

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

  const handleEditProject = async (e) => {
    e.preventDefault();
    if (!can('projects.update')) return toast.error('คุณไม่มีสิทธิ์ในการแก้ไขโครงการ (Requires projects.update)');

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: formData.name,
          project_code: formData.project_code,
          location: formData.location,
          description: formData.description,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedProject.id);

      if (error) throw error;
      toast.success('อัปเดตโครงการสำเร็จ');
      setIsEditOpen(false);
      fetchProjects();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการอัปเดตโครงการ');
    }
  };

  const handleDeleteProject = async () => {
    if (!can('projects.delete')) return toast.error('คุณไม่มีสิทธิ์ในการลบโครงการ (Requires projects.delete)');

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', selectedProject.id);

      if (error) throw error;
      toast.success('ลบโครงการสำเร็จ');
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


  const openEditDialog = (project) => {
    setSelectedProject(project);
    setFormData({ name: project.name, project_code: project.project_code || '', description: project.description || '', location: project.location || '' });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (project) => {
    setSelectedProject(project);
    setIsDeleteOpen(true);
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.project_code && p.project_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.location && p.location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">จัดการโครงการ (Projects)</h2>
          <p className="text-muted-foreground mt-2">
            โครงการทั้งหมดในระบบ จำนวน {projects.length} โครงการ
          </p>
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ค้นหาโครงการ..."
              className="pl-8 bg-background/50 backdrop-blur-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {can('projects.create') && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>

              <DialogTrigger asChild>
                <Button className="shrink-0 gap-2 shadow-lg shadow-primary/20">
                  <Plus className="h-4 w-4" /> สร้างโครงการใหม่
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleCreateProject}>
                  <DialogHeader>
                    <DialogTitle>สร้างโครงการใหม่</DialogTitle>
                    <DialogDescription>
                      ระบุรายละเอียดโครงการเพื่อใช้สำหรับเบิกจ่ายวัสดุ
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">ชื่อโครงการ <span className="text-destructive">*</span></Label>
                      <Input id="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="project_code">รหัสโครงการ (Project ID/Code)</Label>
                      <Input id="project_code" placeholder="เช่น 25310-9999" value={formData.project_code} onChange={e => setFormData({...formData, project_code: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">สถานที่ตั้ง</Label>
                      <Input id="location" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">รายละเอียดเพิ่มเติม</Label>
                      <Input id="description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>ยกเลิก</Button>
                    <Button type="submit">บันทึก</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="hover:border-primary/50 transition-colors group cursor-pointer">
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-xl line-clamp-1" title={project.name}>{project.name}</CardTitle>
                  {project.project_code && (
                    <div className="text-sm font-medium text-primary bg-primary/10 w-fit px-2 py-0.5 rounded-md mb-1 border border-primary/20">
                      ID: {project.project_code}
                    </div>
                  )}
                  <div className="flex items-center text-sm text-muted-foreground gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="line-clamp-1">{project.location || 'ไม่ระบุสถานที่'}</span>
                  </div>
                </div>
                {(can('projects.update') || can('projects.delete')) && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {can('projects.update') && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEditDialog(project)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {can('projects.delete') && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => openDeleteDialog(project)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}

              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4 h-10">
                  {project.description || 'ไม่มีรายละเอียด'}
                </p>
                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                  <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(project.created_at), 'dd/MM/yyyy')}
                  </div>
                  <div className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    project.status === 'active' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                    project.status === 'completed' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 
                    'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}>
                    {project.status.toUpperCase()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredProjects.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed">
              ไม่พบข้อมูลโครงการ
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleEditProject}>
            <DialogHeader>
              <DialogTitle>แก้ไขโครงการ</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">ชื่อโครงการ <span className="text-destructive">*</span></Label>
                <Input id="edit-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-project_code">รหัสโครงการ (Project ID/Code)</Label>
                <Input id="edit-project_code" placeholder="เช่น 25310-9999" value={formData.project_code} onChange={e => setFormData({...formData, project_code: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-location">สถานที่ตั้ง</Label>
                <Input id="edit-location" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">รายละเอียดเพิ่มเติม</Label>
                <Input id="edit-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>ยกเลิก</Button>
              <Button type="submit">อัปเดต</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">ยืนยันการลบโครงการ</DialogTitle>
            <DialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการลบโครงการ <strong>{selectedProject?.name}</strong>? การกระทำนี้ไม่สามารถย้อนกลับได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>ยกเลิก</Button>
            <Button type="button" variant="destructive" onClick={handleDeleteProject}>ยืนยันการลบ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
