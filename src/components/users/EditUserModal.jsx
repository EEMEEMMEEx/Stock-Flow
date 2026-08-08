import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Shield, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import AvatarUpload from '@/components/users/AvatarUpload';


const EditUserModal = ({ isOpen, onClose, onSave, user, projects = [], roles = [] }) => {
  const [loading, setLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    position: '',
    avatar_url: '',
    avatar_file: null,
    avatar_removed: false,
    role: 'staff',
    status: 'active',
    access_type: 'all',
    selected_projects: []
  });

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        phone: user.phone || '',
        position: user.position || '',
        avatar_url: user.avatar_url || '',
        avatar_file: null,
        avatar_removed: false,
        role: user.role || 'staff',
        status: user.status || 'active',
        access_type: user.all_projects ? 'all' : 'selected',
        selected_projects: user.assigned_project_ids || []
      });
    }
  }, [user]);

  const handleProjectToggle = (projectId) => {
    setFormData(prev => {
      const exists = prev.selected_projects.includes(projectId);
      return {
        ...prev,
        selected_projects: exists
          ? prev.selected_projects.filter(id => id !== projectId)
          : [...prev.selected_projects, projectId]
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.full_name) {
      toast.error('กรุณาระบุชื่อ-นามสกุล');
      return;
    }

    if (formData.access_type === 'selected' && formData.selected_projects.length === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 โครงการสำหรับสิทธิ์แบบเลือกเฉพาะโครงการ');
      return;
    }

    try {
      setLoading(true);
      await onSave(user.id, {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
        position: formData.position.trim() || null,
        avatar_url: formData.avatar_url || null,
        avatar_file: formData.avatar_file,
        avatar_removed: formData.avatar_removed,
        role: formData.role,
        status: formData.status,
        all_projects: formData.access_type === 'all',
        project_ids: formData.access_type === 'selected' ? formData.selected_projects : []
      });
      onClose();
    } catch (error) {
      console.error('Update User Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name?.toLowerCase().includes(projectSearch.toLowerCase()) ||
    p.project_code?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto neu-flat border-0">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            แก้ไขข้อมูลผู้ใช้ (Edit User) — {user?.email}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            แก้ไขชื่อ ตำแหน่ง บทบาท สถานะการใช้งาน และสิทธิ์โครงการสำหรับผู้ใช้นี้
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Avatar Upload Component */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">รูปโปรไฟล์ (Profile Avatar)</Label>
            <AvatarUpload
              value={formData.avatar_url}
              name={formData.full_name}
              onChange={(file) => setFormData(prev => ({ ...prev, avatar_file: file, avatar_removed: false }))}
              onRemove={() => setFormData(prev => ({ ...prev, avatar_file: null, avatar_url: '', avatar_removed: true }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_full_name" className="text-sm font-medium">ชื่อ-นามสกุล *</Label>
              <Input
                id="edit_full_name"
                required
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                className="mt-1 neu-pressed bg-transparent"
              />
            </div>

            <div>
              <Label htmlFor="edit_phone" className="text-sm font-medium">เบอร์โทรศัพท์</Label>
              <Input
                id="edit_phone"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="mt-1 neu-pressed bg-transparent"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit_position" className="text-sm font-medium">ตำแหน่ง / หน้าที่</Label>
            <Input
              id="edit_position"
              value={formData.position}
              onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
              className="mt-1 neu-pressed bg-transparent"
            />
          </div>


          {/* Role & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 neu-pressed-sm bg-white/40 dark:bg-black/20 rounded-xl">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">บทบาทการใช้งาน (Role)</Label>
              <select
                value={formData.role}
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                className="w-full p-2.5 rounded-lg neu-pressed bg-background text-foreground text-sm border-0 focus:ring-2 focus:ring-primary"
              >
                <option value="staff">STAFF / REQUESTER</option>
                <option value="admin">ADMINISTRATOR</option>
              </select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">สถานะบัญชี (Status)</Label>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                className="w-full p-2.5 rounded-lg neu-pressed bg-background text-foreground text-sm border-0 focus:ring-2 focus:ring-primary"
              >
                <option value="active">ACTIVE (เปิดใช้งาน)</option>
                <option value="inactive">INACTIVE (ระงับการใช้งาน)</option>
              </select>
            </div>
          </div>

          {/* Project Access */}
          <div>
            <Label className="text-sm font-medium mb-2 block">สิทธิ์การเข้าถึงโครงการ (Project Access)</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg neu-pressed-sm">
                <input
                  type="radio"
                  name="edit_access_type"
                  value="all"
                  checked={formData.access_type === 'all'}
                  onChange={() => setFormData(prev => ({ ...prev, access_type: 'all' }))}
                  className="text-primary"
                />
                <span className="font-semibold text-sm">เข้าถึงได้ทุกโครงการ (All Projects)</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg neu-pressed-sm">
                <input
                  type="radio"
                  name="edit_access_type"
                  value="selected"
                  checked={formData.access_type === 'selected'}
                  onChange={() => setFormData(prev => ({ ...prev, access_type: 'selected' }))}
                  className="text-primary"
                />
                <span className="font-semibold text-sm">เลือกเฉพาะโครงการ (Selected Projects Only)</span>
              </label>
            </div>

            {formData.access_type === 'selected' && (
              <div className="mt-3 p-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-border space-y-2">
                <Input
                  placeholder="ค้นหาชื่อหรือรหัสโครงการ..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="text-xs neu-pressed bg-transparent h-8"
                />

                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {filteredProjects.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2 text-center">ไม่พบโครงการ</p>
                  ) : (
                    filteredProjects.map(p => {
                      const isChecked = formData.selected_projects.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                            isChecked ? 'bg-primary/10 font-semibold' : 'hover:bg-black/5'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleProjectToggle(p.id)}
                              className="rounded text-primary focus:ring-primary"
                            />
                            <span>{p.name}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {p.project_code || 'N/A'}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border">
            <Button type="button" variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={loading} className="neu-primary">
              {loading ? 'กำลังอัปเดต...' : 'บันทึกการแก้ไข'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModal;
