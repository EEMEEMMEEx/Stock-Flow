import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, RefreshCw, Check, Shield, User, FolderKanban, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import AvatarUpload from '@/components/users/AvatarUpload';


const AddUserModal = ({ isOpen, onClose, onSave, projects = [], roles = [] }) => {
  const [activeTab, setActiveTab] = useState('account'); // 'account' | 'access'
  const [loading, setLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const defaultRoles = [
    { code: 'STAFF', name: 'STAFF / REQUESTER', description: 'เบิกจ่ายวัสดุ ดูสต็อกเฉพาะโครงการที่ได้รับมอบหมาย' },
    { code: 'ADMIN', name: 'ADMINISTRATOR', description: 'สิทธิ์สูงสุด อนุมัติเบิกจ่าย จัดการโครงการ และจัดการผู้ใช้' },
    { code: 'SUPERVISOR', name: 'SUPERVISOR / APPROVER', description: 'อนุมัติการเบิกจ่าย และดูรายงานระดับโครงการ' }
  ];

  const availableRoles = roles.length > 0 ? roles : defaultRoles;

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    position: '',
    avatar_url: '',
    role: 'staff',
    status: 'active',
    access_type: 'all', // 'all' | 'selected'
    selected_projects: []
  });



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
    if (!formData.email || !formData.full_name) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็น (*)');
      return;
    }

    if (formData.access_type === 'selected' && formData.selected_projects.length === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 โครงการสำหรับสิทธิ์แบบเลือกเฉพาะโครงการ');
      return;
    }

    try {
      setLoading(true);
      await onSave({
        email: formData.email.trim(),
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
        position: formData.position.trim() || null,
        avatar_url: formData.avatar_url.trim() || null,
        role: formData.role,
        status: formData.status,
        all_projects: formData.access_type === 'all',
        project_ids: formData.access_type === 'selected' ? formData.selected_projects : []
      });
      resetForm();
      onClose();
    } catch (error) {

      console.error('Create User Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      phone: '',
      position: '',
      avatar_url: '',
      role: 'staff',
      status: 'active',
      access_type: 'all',
      selected_projects: []
    });
    setActiveTab('account');
  };

  const filteredProjects = projects.filter(p => 
    p.name?.toLowerCase().includes(projectSearch.toLowerCase()) ||
    p.project_code?.toLowerCase().includes(projectSearch.toLowerCase())
  );


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto neu-flat border-0">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            + เพิ่มผู้ใช้งานใหม่ (Add User)
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            สร้างผู้ใช้ใหม่ในระบบ Supabase Auth พร้อมกำหนดบทบาทและสิทธิ์การเข้าถึงโครงการ
          </DialogDescription>
        </DialogHeader>

        {/* Tab Selector */}
        <div className="flex border-b border-border mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'account'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-4 h-4" />
            TAB 1 — ข้อมูลบัญชีผู้ใช้
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('access')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'access'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="w-4 h-4" />
            TAB 2 — สิทธิ์และระดับการเข้าถึง
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name" className="text-sm font-medium">ชื่อ-นามสกุล *</Label>
                  <Input
                    id="full_name"
                    required
                    placeholder="เช่น สมชาย ใจดี"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                    className="mt-1 neu-pressed bg-transparent"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-medium">อีเมล (Email) *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="example@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="mt-1 neu-pressed bg-transparent"
                  />
                </div>
              </div>

              {/* Automatic Default Password Info Notice */}
              <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-900 dark:text-purple-200 text-xs flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block text-sm mb-0.5">รหัสผ่านเริ่มต้นอัตโนมัติ (Default Reset Password)</strong>
                  ระบบจะกำหนดรหัสผ่านชั่วคราวจากค่ากลางของระบบให้อัตโนมัติ ผู้ใช้ใหม่จะต้องเปลี่ยนรหัสผ่านด้วยตนเองเมื่อเข้าสู่ระบบครั้งแรก (First-Time Login — Password Change Required)
                </div>
              </div>


              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone" className="text-sm font-medium">เบอร์โทรศัพท์ (Optional)</Label>
                  <Input
                    id="phone"
                    placeholder="081-234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 neu-pressed bg-transparent"
                  />
                </div>

                <div>
                  <Label htmlFor="position" className="text-sm font-medium">ตำแหน่ง / หน้าที่ (Optional)</Label>
                  <Input
                    id="position"
                    placeholder="เช่น Site Engineer / Store Keeper"
                    value={formData.position}
                    onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                    className="mt-1 neu-pressed bg-transparent"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">รูปโปรไฟล์ (Profile Avatar)</Label>
                <AvatarUpload
                  value={formData.avatar_url}
                  name={formData.full_name}
                  onChange={(file) => setFormData(prev => ({ ...prev, avatar_file: file }))}
                  onRemove={() => setFormData(prev => ({ ...prev, avatar_file: null, avatar_url: '' }))}
                />
              </div>

            </div>
          )}

          {activeTab === 'access' && (
            <div className="space-y-5">
              {/* Role Selection */}
              <div>
                <Label className="text-sm font-medium mb-2 block">ระบุบทบาทการใช้งาน (Role) *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
                  {availableRoles.map((r) => {
                    const roleCode = (r.code || r.role || '').toLowerCase();
                    const isSelected = formData.role.toLowerCase() === roleCode;
                    return (
                      <div
                        key={r.id || r.code}
                        onClick={() => setFormData(prev => ({ ...prev, role: roleCode }))}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 neu-pressed'
                            : 'border-border neu-flat-sm hover:bg-black/5'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm">{r.name || r.code}</span>
                          {isSelected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                        {r.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>


              {/* Account Status */}
              <div>
                <Label className="text-sm font-medium mb-2 block">สถานะบัญชี (Account Status) *</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="active"
                      checked={formData.status === 'active'}
                      onChange={() => setFormData(prev => ({ ...prev, status: 'active' }))}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ACTIVE (เปิดใช้งาน)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="inactive"
                      checked={formData.status === 'inactive'}
                      onChange={() => setFormData(prev => ({ ...prev, status: 'inactive' }))}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> INACTIVE (ระงับการใช้งาน)
                    </span>
                  </label>
                </div>
              </div>

              {/* Project Authorization */}
              <div>
                <Label className="text-sm font-medium mb-2 block">สิทธิ์การเข้าถึงโครงการ (Project Access) *</Label>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer p-2.5 rounded-lg neu-pressed-sm">
                    <input
                      type="radio"
                      name="access_type"
                      value="all"
                      checked={formData.access_type === 'all'}
                      onChange={() => setFormData(prev => ({ ...prev, access_type: 'all' }))}
                      className="text-primary"
                    />
                    <div>
                      <span className="font-semibold text-sm">เข้าถึงได้ทุกโครงการ (All Projects)</span>
                      <p className="text-xs text-muted-foreground">ผู้ใช้จะเห็นและดำเนินการสต็อกได้ทุกโครงการในระบบ</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 text-sm cursor-pointer p-2.5 rounded-lg neu-pressed-sm">
                    <input
                      type="radio"
                      name="access_type"
                      value="selected"
                      checked={formData.access_type === 'selected'}
                      onChange={() => setFormData(prev => ({ ...prev, access_type: 'selected' }))}
                      className="text-primary"
                    />
                    <div>
                      <span className="font-semibold text-sm">เลือกเฉพาะโครงการ (Selected Projects Only)</span>
                      <p className="text-xs text-muted-foreground">จำกัดสิทธิ์เข้าถึงเฉพาะโครงการที่ถูกเช็คเลือกด้านล่างเท่านั้น</p>
                    </div>
                  </label>
                </div>

                {/* Selected Projects List */}
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
                    <div className="text-[11px] text-muted-foreground text-right">
                      เลือกแล้ว: {formData.selected_projects.length} โครงการ
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-border flex justify-between items-center">
            {activeTab === 'account' ? (
              <Button type="button" variant="outline" onClick={() => setActiveTab('access')}>
                ถัดไป (TAB 2: สิทธิ์การเข้าถึง) →
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setActiveTab('account')}>
                ← ย้อนกลับ (TAB 1)
              </Button>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => { resetForm(); onClose(); }}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={loading} className="neu-primary">
                {loading ? 'กำลังบันทึก...' : 'บันทึกสร้างผู้ใช้'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserModal;
