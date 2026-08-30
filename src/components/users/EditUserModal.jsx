import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  User, Shield, ShieldCheck, ShieldAlert, Check, FolderKanban, 
  Phone, Mail, Briefcase, Building2, Lock, AlertCircle, AlertTriangle, 
  Search, RefreshCw, KeyRound, CheckSquare, Square, Sparkles, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import AvatarUpload from '@/components/users/AvatarUpload';
import RoleBadge, { getRoleLabel } from '@/components/ui/RoleBadge';
import { supabase } from '@/lib/supabase';

const EditUserModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  user, 
  projects = [], 
  roles = [], 
  allUsers = [] 
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'rbac' | 'projects'
  const [loading, setLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  
  // Real-time RBAC Permissions state loaded from database
  const [rolePermissionsList, setRolePermissionsList] = useState([]);
  const [totalCatalogCount, setTotalCatalogCount] = useState(0);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [liveRoles, setLiveRoles] = useState(roles && roles.length > 0 ? roles : []);

  const defaultRoles = [
    { code: 'STAFF', name: 'STAFF / REQUESTER', description: 'ขอเบิกจ่ายวัสดุ และดูสต็อกเฉพาะโครงการที่ได้รับมอบหมาย' },
    { code: 'SUPERVISOR', name: 'SUPERVISOR / APPROVER', description: 'อนุมัติการเบิกจ่าย และดูรายงานระดับโครงการ' },
    { code: 'ADMIN', name: 'ADMINISTRATOR', description: 'สิทธิ์สูงสุด อนุมัติเบิกจ่าย จัดการโครงการ บทบาท และผู้ใช้' },
    { code: 'SUPER', name: 'SUPER ADMIN', description: 'สิทธิ์สูงสุดระดับระบบ จัดการทุกอย่าง รวมถึง Admin, สิทธิ์, การตั้งค่าระบบ, Security, Integration' }
  ];

  const availableRoles = liveRoles.length > 0 ? liveRoles : (roles.length > 0 ? roles : defaultRoles);

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    department: '',
    position: '',
    avatar_url: '',
    avatar_file: null,
    avatar_removed: false,
    role: 'staff',
    role_id: null,
    status: 'active',
    must_change_password: false,
    access_type: 'all', // 'all' | 'selected'
    selected_projects: []
  });

  // Calculate if the user being edited is the last active Admin
  const activeAdmins = allUsers.filter(
    (u) => (u.role === 'admin' || u.role === 'ADMIN' || u.roles?.code === 'ADMIN') && u.status === 'active'
  );
  const isTargetAdmin = user && (user.role === 'admin' || user.role === 'ADMIN' || user.roles?.code === 'ADMIN');
  const isLastActiveAdmin = isTargetAdmin && user?.status === 'active' && activeAdmins.length <= 1;

  // Helper to resolve role ID from code/aliases or existing ID
  const resolveRoleId = (roleCode, existingRoleId, roleList = availableRoles) => {
    if (existingRoleId) {
      const found = roleList.find((r) => r.id === existingRoleId);
      if (found?.id) return found.id;
    }
    const normalized = (roleCode || '').toUpperCase().trim();
    let match = roleList.find((r) => (r.code || '').toUpperCase().trim() === normalized);
    if (match?.id) return match.id;
    if (['STAFF', 'OPERATOR', 'REQUESTER'].includes(normalized)) {
      match = roleList.find((r) => ['STAFF', 'OPERATOR', 'REQUESTER'].includes((r.code || '').toUpperCase().trim()));
      if (match?.id) return match.id;
    }
    if (['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(normalized)) {
      match = roleList.find((r) => ['SUPERVISOR', 'APPROVER', 'MANAGER'].includes((r.code || '').toUpperCase().trim()));
      if (match?.id) return match.id;
    }
    if (['ADMIN', 'ADMINISTRATOR'].includes(normalized)) {
      match = roleList.find((r) => ['ADMIN', 'ADMINISTRATOR'].includes((r.code || '').toUpperCase().trim()));
      if (match?.id) return match.id;
    }
    if (['SUPER', 'SUPERADMIN', 'SUPER_ADMIN'].includes(normalized)) {
      match = roleList.find((r) => ['SUPER', 'SUPERADMIN', 'SUPER_ADMIN'].includes((r.code || '').toUpperCase().trim()));
      if (match?.id) return match.id;
    }
    return null;
  };

  useEffect(() => {
    if (user) {
      const userRoleCode = (user.role || 'staff').toLowerCase();
      const resolvedId = resolveRoleId(userRoleCode, user.role_id, availableRoles);
      const hasSpecificProjects = Array.isArray(user.assigned_project_ids) && user.assigned_project_ids.length > 0;
      const isAllProjects = user.all_projects === true || (!hasSpecificProjects && userRoleCode === 'admin');

      setFormData({
        email: user.email || '',
        full_name: user.full_name || '',
        phone: user.phone || '',
        department: user.department || '',
        position: user.position || '',
        avatar_url: user.avatar_url || '',
        avatar_file: null,
        avatar_removed: false,
        role: userRoleCode,
        role_id: resolvedId,
        status: user.status || 'active',
        must_change_password: user.must_change_password === true,
        access_type: isAllProjects ? 'all' : 'selected',
        selected_projects: user.assigned_project_ids || []
      });

      setActiveTab('profile');
    }
  }, [user, isOpen]);

  // Load LIVE Roles and RBAC Permissions directly from Database for the selected role
  const fetchLiveRolePermissions = async () => {
    if (!isOpen) return;
    setLoadingPerms(true);
    try {
      // 1. Fetch live active roles, permissions catalog, and role_permissions in parallel
      const [rolesRes, catRes, rpRes] = await Promise.all([
        supabase.from('roles').select('*').order('is_system', { ascending: false }),
        supabase.from('permissions').select('*').order('category', { ascending: true }),
        supabase.from('role_permissions').select('role_id, permission_id')
      ]);

      const dbRolesList = (rolesRes.data && rolesRes.data.length > 0) ? rolesRes.data : [];
      const currentRoles = dbRolesList.length > 0 ? dbRolesList : (roles.length > 0 ? roles : defaultRoles);
      setLiveRoles(currentRoles);

      const fullCatalog = (catRes.data && catRes.data.length > 0) ? catRes.data : [];
      const allRolePerms = (rpRes.data && rpRes.data.length > 0) ? rpRes.data : [];

      setTotalCatalogCount(fullCatalog.length > 0 ? fullCatalog.length : 36);

      // 2. Resolve role record for the currently selected role
      const currentRoleCode = (formData.role || (user?.role) || 'staff').toUpperCase().trim();
      const effectiveRoleId = formData.role_id || user?.role_id;

      let targetRole = null;
      if (effectiveRoleId) {
        targetRole = currentRoles.find(r => r.id === effectiveRoleId);
      }
      if (!targetRole && currentRoleCode) {
        targetRole = currentRoles.find(r => (r.code || '').toUpperCase().trim() === currentRoleCode);
      }
      if (!targetRole) {
        if (['STAFF', 'OPERATOR', 'REQUESTER'].includes(currentRoleCode)) {
          targetRole = currentRoles.find(r => ['STAFF', 'OPERATOR', 'REQUESTER'].includes((r.code || '').toUpperCase().trim()));
        } else if (['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(currentRoleCode)) {
          targetRole = currentRoles.find(r => ['SUPERVISOR', 'APPROVER', 'MANAGER'].includes((r.code || '').toUpperCase().trim()));
        } else if (['ADMIN', 'ADMINISTRATOR'].includes(currentRoleCode)) {
          targetRole = currentRoles.find(r => ['ADMIN', 'ADMINISTRATOR'].includes((r.code || '').toUpperCase().trim()));
        } else if (['SUPER', 'SUPERADMIN', 'SUPER_ADMIN'].includes(currentRoleCode)) {
          targetRole = currentRoles.find(r => ['SUPER', 'SUPERADMIN', 'SUPER_ADMIN'].includes((r.code || '').toUpperCase().trim()));
        }
      }

      if (currentRoleCode === 'SUPER' || targetRole?.code?.toUpperCase() === 'SUPER') {
        setRolePermissionsList(fullCatalog);
      } else if (targetRole?.id) {
        const assignedRows = allRolePerms.filter(rp => String(rp.role_id).toLowerCase() === String(targetRole.id).toLowerCase());
        const assignedPermIds = new Set(assignedRows.map(rp => String(rp.permission_id || '').toLowerCase()));
        const matchedPerms = fullCatalog.filter(p => assignedPermIds.has(String(p.id || '').toLowerCase()));
        
        // If matchedPerms is empty but we know default role baseline (fallback safety)
        if (matchedPerms.length === 0 && fullCatalog.length > 0) {
          if (['STAFF', 'OPERATOR', 'REQUESTER'].includes(targetRole?.code?.toUpperCase() || currentRoleCode)) {
            const staffCodes = ['dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 'withdrawals.view', 'withdrawals.create'];
            const fallbackStaff = fullCatalog.filter(p => staffCodes.includes(p.code));
            setRolePermissionsList(fallbackStaff.length > 0 ? fallbackStaff : matchedPerms);
          } else if (['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(targetRole?.code?.toUpperCase() || currentRoleCode)) {
            const supCodes = ['dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete', 'checkouts.view', 'checkouts.create', 'checkouts.return', 'history.view', 'reports.view', 'reports.export'];
            const fallbackSup = fullCatalog.filter(p => supCodes.includes(p.code));
            setRolePermissionsList(fallbackSup.length > 0 ? fallbackSup : matchedPerms);
          } else if (['ADMIN', 'ADMINISTRATOR'].includes(targetRole?.code?.toUpperCase() || currentRoleCode)) {
            setRolePermissionsList(fullCatalog.filter(p => p.code !== 'system.super_bypass'));
          } else {
            setRolePermissionsList(matchedPerms);
          }
        } else {
          setRolePermissionsList(matchedPerms);
        }
      } else {
        setRolePermissionsList([]);
      }
    } catch (err) {
      console.error('Error fetching live role permissions from DB:', err);
      setRolePermissionsList([]);
    } finally {
      setLoadingPerms(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLiveRolePermissions();
    }
  }, [formData.role, formData.role_id, isOpen]);

  // Real-time synchronization when role_permissions or roles change in /roles
  useEffect(() => {
    if (!isOpen) return;

    const channel = supabase
      .channel(`realtime_edit_user_modal_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'role_permissions' },
        () => {
          fetchLiveRolePermissions();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roles' },
        () => {
          fetchLiveRolePermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, formData.role, formData.role_id]);

  const handleRoleSelect = (roleCode, roleId) => {
    if (isLastActiveAdmin && roleCode.toLowerCase() !== 'admin') {
      toast.error('ไม่สามารถลดระดับบทบาทของ Administrator คนสุดท้ายของระบบได้');
      return;
    }

    const resolvedId = resolveRoleId(roleCode, roleId, availableRoles);
    setFormData((prev) => ({
      ...prev,
      role: roleCode.toLowerCase(),
      role_id: resolvedId
    }));
  };

  const handleStatusChange = (newStatus) => {
    if (isLastActiveAdmin && newStatus !== 'active') {
      toast.error('ไม่สามารถระงับหรือปิดใช้งานบัญชี Administrator คนสุดท้ายของระบบได้');
      return;
    }
    setFormData((prev) => ({ ...prev, status: newStatus }));
  };

  const handleProjectToggle = (projectId) => {
    setFormData((prev) => {
      const exists = prev.selected_projects.includes(projectId);
      return {
        ...prev,
        selected_projects: exists
          ? prev.selected_projects.filter((id) => id !== projectId)
          : [...prev.selected_projects, projectId]
      };
    });
  };

  const handleSelectAllProjects = () => {
    setFormData((prev) => ({
      ...prev,
      selected_projects: projects.map((p) => p.id)
    }));
  };

  const handleDeselectAllProjects = () => {
    setFormData((prev) => ({
      ...prev,
      selected_projects: []
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.full_name.trim()) {
      toast.error('กรุณาระบุชื่อ-นามสกุล');
      setActiveTab('profile');
      return;
    }

    if (formData.access_type === 'selected' && formData.selected_projects.length === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 โครงการสำหรับสิทธิ์แบบเลือกเฉพาะโครงการ');
      setActiveTab('projects');
      return;
    }

    if (isLastActiveAdmin && (formData.role !== 'admin' || formData.status !== 'active')) {
      toast.error('ความปลอดภัยของระบบ: ไม่สามารถลดระดับหรือปิดใช้งานบัญชี Administrator คนสุดท้ายได้');
      return;
    }

    try {
      setLoading(true);
      const effectiveRoleId = resolveRoleId(formData.role, formData.role_id);

      await onSave(user.id, {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
        department: formData.department.trim() || null,
        position: formData.position.trim() || null,
        avatar_url: formData.avatar_url || null,
        avatar_file: formData.avatar_file,
        avatar_removed: formData.avatar_removed,
        role: formData.role,
        role_id: effectiveRoleId,
        status: formData.status,
        must_change_password: formData.must_change_password,
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

  const filteredProjects = projects.filter(
    (p) =>
      p.name?.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.project_code?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // Group real-time permissions by category
  const groupedPermissions = rolePermissionsList.reduce((acc, perm) => {
    const cat = perm.category || perm.module || 'ทั่วไป (General)';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(perm);
    return acc;
  }, {});

  const isRoleAdmin = (formData.role || '').toLowerCase() === 'admin';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto neu-flat border-0 p-0 sm:rounded-2xl">
        {/* Header Section with User Summary Badge */}
        <div className="p-6 border-b border-border/40 bg-muted/20">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {formData.avatar_url ? (
                  <img
                    src={formData.avatar_url}
                    alt={formData.full_name}
                    className="w-12 h-12 rounded-full object-cover shadow-sm border border-white/40 shrink-0"
                    onError={(e) => { e.target.onerror = null; e.target.src = ''; }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-white font-bold text-base shadow-md shrink-0">
                    {getInitials(formData.full_name || user?.full_name)}
                  </div>
                )}
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                    แก้ไขข้อมูลและสิทธิ์ผู้ใช้งาน (Edit User & RBAC)
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{user?.email || formData.email}</span>
                  </DialogDescription>
                </div>
              </div>

              {/* Current Role & Status Live Badges */}
              <div className="flex items-center gap-2">
                <RoleBadge 
                  role={formData.role} 
                  roleObj={availableRoles.find(r => (formData.role_id && r.id === formData.role_id) || (r.code || '').toLowerCase() === (formData.role || '').toLowerCase())}
                />

                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  formData.status === 'active'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : formData.status === 'suspended'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    formData.status === 'active' ? 'bg-emerald-500 animate-pulse' : formData.status === 'suspended' ? 'bg-amber-500' : 'bg-red-500'
                  }`}></span>
                  {formData.status.toUpperCase()}
                </span>
              </div>
            </div>
          </DialogHeader>

          {/* Tab Navigation Selector */}
          <div className="flex border-b border-border/40 mt-5 -mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="w-4 h-4" />
              TAB 1: ข้อมูลผู้ใช้งานและโปรไฟล์
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rbac')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'rbac'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              TAB 2: บทบาทและสิทธิ์ (RBAC)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('projects')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'projects'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              TAB 3: การเข้าถึงโครงการ
            </button>
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* TAB 1: Profile Information */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              {/* Avatar Upload */}
              <div className="p-4 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 space-y-2">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> รูปโปรไฟล์ (Profile Avatar)
                </Label>
                <AvatarUpload
                  value={formData.avatar_url}
                  name={formData.full_name}
                  onChange={(file) => setFormData((prev) => ({ ...prev, avatar_file: file, avatar_removed: false }))}
                  onRemove={() => setFormData((prev) => ({ ...prev, avatar_file: null, avatar_url: '', avatar_removed: true }))}
                />
              </div>

              {/* Login Email (Readonly) & Full Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit_email" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> บัญชีอีเมลเข้าสู่ระบบ (Login Email)
                  </Label>
                  <Input
                    id="edit_email"
                    type="email"
                    disabled
                    value={user?.email || formData.email}
                    className="neu-pressed bg-muted/40 text-muted-foreground text-sm cursor-not-allowed border-dashed"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    บัญชีอีเมลเป็นตัวระบุสิทธิ์หลักใน Supabase Auth
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit_full_name" className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-primary" /> ชื่อ-นามสกุล <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit_full_name"
                    required
                    placeholder="เช่น สมชาย ใจดี"
                    value={formData.full_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                    className="neu-pressed bg-transparent text-sm"
                  />
                </div>
              </div>

              {/* Phone & Department & Position */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit_phone" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" /> เบอร์โทรศัพท์ (Phone)
                  </Label>
                  <Input
                    id="edit_phone"
                    type="tel"
                    placeholder="เช่น 0812345678"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    className="neu-pressed bg-transparent text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit_department" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> แผนก / ฝ่าย (Department)
                  </Label>
                  <Input
                    id="edit_department"
                    placeholder="เช่น วิศวกรรม, คลังสินค้า"
                    value={formData.department}
                    onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                    className="neu-pressed bg-transparent text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit_position" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> ตำแหน่ง / หน้าที่ (Position)
                  </Label>
                  <Input
                    id="edit_position"
                    placeholder="เช่น Site Engineer, Storekeeper"
                    value={formData.position}
                    onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
                    className="neu-pressed bg-transparent text-sm"
                  />
                </div>
              </div>

              {/* Security & Password Enforcement */}
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.must_change_password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, must_change_password: e.target.checked }))}
                    className="mt-1 rounded text-primary focus:ring-primary h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-primary" />
                      บังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป (Must Change Password on Next Login)
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      เมื่อเปิดใช้งาน ผู้ใช้จะได้รับการแจ้งเตือนและจำเป็นต้องกำหนดรหัสผ่านใหม่ก่อนเข้าใช้งานส่วนอื่นๆ ของระบบ
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: Roles, RBAC Permissions Preview & Account Status */}
          {activeTab === 'rbac' && (
            <div className="space-y-5">
              {/* Last Active Admin Protection Banner */}
              {isLastActiveAdmin && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block text-xs">
                      คำเตือนความปลอดภัย: บัญชี Administrator คนสุดท้ายของระบบ
                    </strong>
                    บัญชีนี้เป็นผู้ดูแลระบบที่เปิดใช้งานอยู่เพียงคนเดียว ระบบจะไม่อนุญาตให้ลดระดับบทบาทหรือระงับการใช้งานเพื่อป้องกันการถูกตัดสิทธิ์จากระบบ
                  </div>
                </div>
              )}

              {/* Dynamic Role Selection Cards */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground block">
                    กำหนดบทบาทการใช้งาน (Assigned Role) <span className="text-red-500">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => { onClose(); navigate('/roles'); }}
                    className="text-[11px] text-purple-600 hover:text-purple-700 dark:text-purple-400 hover:underline flex items-center gap-1"
                  >
                    <span>จัดการบทบาทและสิทธิ์ที่ /roles</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {availableRoles.map((r) => {
                    const roleCode = (r.code || r.role || '').toLowerCase();
                    const isSelected = (formData.role || '').toLowerCase() === roleCode;
                    const isRoleDisabled = isLastActiveAdmin && roleCode !== 'admin';

                    return (
                      <div
                        key={r.id || r.code}
                        onClick={() => !isRoleDisabled && handleRoleSelect(roleCode, r.id)}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isRoleDisabled
                            ? 'opacity-40 cursor-not-allowed border-border bg-muted/30'
                            : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'border-primary bg-primary/10 neu-pressed ring-1 ring-primary'
                            : 'border-border neu-flat-sm hover:bg-black/5'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-xs flex items-center gap-1.5">
                            <Shield className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            {getRoleLabel(r.code, r.name)}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                        </div>
                        {r.description && (
                          <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
                            {r.description}
                          </p>
                        )}
                        {r.is_system && (
                          <span className="inline-block text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground mt-2 font-mono">
                            System Role
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RBAC Permissions Breakdown: Exact Live Count & List from /roles */}
              <div className="p-4 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    สิทธิ์การใช้งานที่ได้รับตามบทบาท (Assigned RBAC Permissions)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                      {loadingPerms ? (
                        'กำลังโหลดข้อมูลสิทธิ์...'
                      ) : rolePermissionsList.length === totalCatalogCount && totalCatalogCount > 0 ? (
                        `เปิดใช้งานครบทุกสิทธิ์ (${rolePermissionsList.length} / ${totalCatalogCount} สิทธิ์)`
                      ) : (
                        `สิทธิ์ที่เปิดใช้งาน: ${rolePermissionsList.length} / ${totalCatalogCount || rolePermissionsList.length} สิทธิ์`
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => fetchLiveRolePermissions()}
                      disabled={loadingPerms}
                      title="รีเฟรชสิทธิ์จากฐานข้อมูล"
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingPerms ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {loadingPerms ? (
                  <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                    กำลังตรวจสอบโครงสร้างสิทธิ์จริงจากฐานข้อมูล...
                  </div>
                ) : rolePermissionsList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs text-center space-y-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                    <p className="font-semibold">ยังไม่มีสิทธิ์เปิดใช้งานสำหรับบทบาทนี้ในระบบ /roles</p>
                    <p className="text-[11px] text-muted-foreground">
                      สามารถกำหนดสิทธิ์เพิ่มเติมให้บทบาทนี้ได้โดยตรงที่หน้า <button type="button" onClick={() => { onClose(); navigate('/roles'); }} className="text-primary underline">จัดการบทบาท (Role Management)</button>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rolePermissionsList.length === totalCatalogCount && totalCatalogCount > 0 && (
                      <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-900 dark:text-purple-200 text-xs flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span>บทบาทนี้ได้รับสิทธิ์สูงสุดเต็มรูปแบบ สามารถเข้าถึงและจัดการทุกฟังก์ชันในระบบทั้งหมด {rolePermissionsList.length} สิทธิ์</span>
                      </div>
                    )}

                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                      {Object.keys(groupedPermissions).map((category) => (
                        <div key={category} className="space-y-1">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                            <span>{category}</span>
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {groupedPermissions[category].length} สิทธิ์
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {groupedPermissions[category].map((perm) => (
                              <span
                                key={perm.code || perm.id}
                                title={perm.description || perm.code}
                                className="inline-flex items-center gap-1 text-[11px] bg-background/80 text-foreground px-2 py-0.5 rounded-md border border-border/60 shadow-2xs"
                              >
                                <Check className="w-3 h-3 text-emerald-500" />
                                {perm.name || perm.code}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Account Status Radio Cards */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground block">
                  สถานะบัญชีการใช้งาน (Account Status) <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* ACTIVE */}
                  <label
                    onClick={() => handleStatusChange('active')}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      formData.status === 'active'
                        ? 'border-emerald-500 bg-emerald-500/10 neu-pressed ring-1 ring-emerald-500'
                        : 'border-border neu-flat-sm hover:bg-black/5'
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit_status"
                      value="active"
                      checked={formData.status === 'active'}
                      onChange={() => handleStatusChange('active')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">ACTIVE (เปิดใช้งาน)</span>
                      <span className="text-[10px] text-muted-foreground">เข้าสู่ระบบและทำรายการได้ปกติ</span>
                    </div>
                  </label>

                  {/* INACTIVE */}
                  <label
                    onClick={() => !isLastActiveAdmin && handleStatusChange('inactive')}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isLastActiveAdmin ? 'opacity-40 cursor-not-allowed bg-muted/30' : 'cursor-pointer'
                    } ${
                      formData.status === 'inactive'
                        ? 'border-red-500 bg-red-500/10 neu-pressed ring-1 ring-red-500'
                        : 'border-border neu-flat-sm hover:bg-black/5'
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit_status"
                      value="inactive"
                      disabled={isLastActiveAdmin}
                      checked={formData.status === 'inactive'}
                      onChange={() => handleStatusChange('inactive')}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">INACTIVE (ระงับชั่วคราว)</span>
                      <span className="text-[10px] text-muted-foreground">ปิดกั้นการเข้าสู่ระบบ</span>
                    </div>
                  </label>

                  {/* SUSPENDED */}
                  <label
                    onClick={() => !isLastActiveAdmin && handleStatusChange('suspended')}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isLastActiveAdmin ? 'opacity-40 cursor-not-allowed bg-muted/30' : 'cursor-pointer'
                    } ${
                      formData.status === 'suspended'
                        ? 'border-amber-500 bg-amber-500/10 neu-pressed ring-1 ring-amber-500'
                        : 'border-border neu-flat-sm hover:bg-black/5'
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit_status"
                      value="suspended"
                      disabled={isLastActiveAdmin}
                      checked={formData.status === 'suspended'}
                      onChange={() => handleStatusChange('suspended')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">SUSPENDED (พักบัญชี)</span>
                      <span className="text-[10px] text-muted-foreground">พักสิทธิ์การเข้าใช้งาน</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Project Access Configuration */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-foreground block">
                  สิทธิ์การเข้าถึงข้อมูลโครงการ (Project Access Control) <span className="text-red-500">*</span>
                </Label>

                {/* Mode 1: All Projects */}
                <label
                  onClick={() => setFormData((prev) => ({ ...prev, access_type: 'all' }))}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    formData.access_type === 'all'
                      ? 'border-primary bg-primary/10 neu-pressed ring-1 ring-primary'
                      : 'border-border neu-flat-sm hover:bg-black/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="edit_access_type"
                    value="all"
                    checked={formData.access_type === 'all'}
                    onChange={() => setFormData((prev) => ({ ...prev, access_type: 'all' }))}
                    className="mt-0.5 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground block">
                      เข้าถึงได้ทุกโครงการ (All Projects Access)
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      ผู้ใช้จะได้รับสิทธิ์ในการดูสต็อก เบิกจ่าย และรับเข้าวัสดุในทุกโครงการของระบบโดยอัตโนมัติ
                    </p>
                  </div>
                </label>

                {/* Mode 2: Selected Projects */}
                <label
                  onClick={() => setFormData((prev) => ({ ...prev, access_type: 'selected' }))}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    formData.access_type === 'selected'
                      ? 'border-primary bg-primary/10 neu-pressed ring-1 ring-primary'
                      : 'border-border neu-flat-sm hover:bg-black/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="edit_access_type"
                    value="selected"
                    checked={formData.access_type === 'selected'}
                    onChange={() => setFormData((prev) => ({ ...prev, access_type: 'selected' }))}
                    className="mt-0.5 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground block">
                      เลือกเฉพาะโครงการที่ได้รับมอบหมาย (Selected Projects Only)
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      จำกัดสิทธิ์ให้เห็นและดำเนินการได้เฉพาะโครงการที่ระบุไว้ในรายการด้านล่างเท่านั้น
                    </p>
                  </div>
                </label>
              </div>

              {/* Selected Projects Sub-panel */}
              {formData.access_type === 'selected' && (
                <div className="p-4 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-border space-y-3">
                  {/* Search and Action Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="ค้นหาชื่อหรือรหัสโครงการ..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="pl-8 text-xs neu-pressed bg-transparent h-8"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllProjects}
                        className="text-[11px] h-7 px-2.5 neu-button"
                      >
                        เลือกทั้งหมด ({projects.length})
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDeselectAllProjects}
                        className="text-[11px] h-7 px-2.5 neu-button"
                      >
                        ล้างการเลือก
                      </Button>
                    </div>
                  </div>

                  {/* Project Checkbox List */}
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {filteredProjects.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">
                        ไม่พบโครงการที่ตรงกับคำค้นหา
                      </p>
                    ) : (
                      filteredProjects.map((p) => {
                        const isChecked = formData.selected_projects.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-colors border ${
                              isChecked
                                ? 'border-primary/50 bg-primary/10 font-semibold'
                                : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleProjectToggle(p.id)}
                                className="rounded text-primary focus:ring-primary h-4 w-4"
                              />
                              <span>{p.name}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
                              {p.project_code || 'N/A'}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>

                  <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                    <span>
                      จำเป็นต้องเลือกอย่างน้อย 1 โครงการสำหรับสิทธิ์ประเภทนี้
                    </span>
                    <span className="font-semibold text-foreground">
                      เลือกแล้ว: {formData.selected_projects.length} / {projects.length} โครงการ
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dialog Footer Navigation & Actions */}
          <DialogFooter className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {activeTab === 'profile' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('rbac')}
                  className="text-xs h-9 px-3"
                >
                  ถัดไป (TAB 2: บทบาทและสิทธิ์) →
                </Button>
              )}

              {activeTab === 'rbac' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('profile')}
                    className="text-xs h-9 px-3"
                  >
                    ← ย้อนกลับ (TAB 1)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('projects')}
                    className="text-xs h-9 px-3"
                  >
                    ถัดไป (TAB 3: สิทธิ์โครงการ) →
                  </Button>
                </>
              )}

              {activeTab === 'projects' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('rbac')}
                  className="text-xs h-9 px-3"
                >
                  ← ย้อนกลับ (TAB 2)
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button type="button" variant="ghost" onClick={onClose} className="text-xs h-9 px-4">
                ยกเลิก
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="neu-primary text-xs h-9 px-5 font-semibold flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    บันทึกการแก้ไข
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModal;
