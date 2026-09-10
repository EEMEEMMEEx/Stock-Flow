import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  User, Shield, ShieldCheck, Check, FolderKanban, 
  Phone, Mail, Briefcase, Building2, Lock, AlertCircle, AlertTriangle, 
  Search, RefreshCw, KeyRound, Sparkles, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import AvatarUpload from '@/components/users/AvatarUpload';
import RoleBadge from '@/components/ui/RoleBadge';
import { getRoleLabel } from '@/lib/roleUtils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Helper to resolve role ID from code/aliases or existing ID
const resolveRoleId = (roleCode, existingRoleId, roleList = []) => {
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

const DEFAULT_ROLES = [
  { code: 'STAFF', name: 'STAFF / REQUESTER', description: 'Request materials and view stock for assigned projects only' },
  { code: 'SUPERVISOR', name: 'SUPERVISOR / APPROVER', description: 'Approve withdrawals and view project-level reports' },
  { code: 'ADMIN', name: 'ADMINISTRATOR', description: 'Full access: approve withdrawals, manage projects, roles, and users' },
  { code: 'SUPER', name: 'SUPER ADMIN', description: 'System-level access: manage everything including admins, permissions, system settings, security, integrations' }
];

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
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'rbac' | 'projects'
  const [loading, setLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  
  // Real-time RBAC Permissions state loaded from database
  const [rolePermissionsList, setRolePermissionsList] = useState([]);
  const [totalCatalogCount, setTotalCatalogCount] = useState(0);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [liveRoles, setLiveRoles] = useState(roles && roles.length > 0 ? roles : []);

  const rawRoles = useMemo(
    () => liveRoles.length > 0 ? liveRoles : (roles.length > 0 ? roles : DEFAULT_ROLES),
    [liveRoles, roles]
  );
  const availableRoles = useMemo(
    () => rawRoles.filter(r => {
      const code = (r.code || '').toUpperCase();
      if (code === 'SUPER' && !isSuperAdmin) return false;
      return true;
    }),
    [rawRoles, isSuperAdmin]
  );

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
  const isTargetSuper = Boolean(user && ((user.role || '').toLowerCase() === 'super' || (user.roles?.code || '').toUpperCase() === 'SUPER' || (user.email || '').toLowerCase() === 'admin@stockflow.com'));

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

    }
  }, [user, isOpen, availableRoles]);

  // Reset the wizard only when a different user is opened, not when form or
  // live RBAC data changes while the current tab is being viewed.
  useEffect(() => {
    if (isOpen) setActiveTab('profile');
  }, [isOpen, user?.id]);

  // Load LIVE Roles and RBAC Permissions directly from Database for the selected role
  const fetchLiveRolePermissions = useCallback(async () => {
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
      const currentRoles = dbRolesList.length > 0 ? dbRolesList : (roles.length > 0 ? roles : DEFAULT_ROLES);
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
  }, [isOpen, roles, formData.role, formData.role_id, user?.role, user?.role_id]);

  useEffect(() => {
    if (isOpen) {
      fetchLiveRolePermissions();
    }
  }, [isOpen, fetchLiveRolePermissions]);

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
  }, [isOpen, fetchLiveRolePermissions]);

  const handleRoleSelect = (roleCode, roleId) => {
    if (isLastActiveAdmin && roleCode.toLowerCase() !== 'admin') {
      toast.error('Cannot demote the last active Administrator in the system');
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
      toast.error('Cannot suspend or deactivate the last active Administrator in the system');
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
      toast.error('Please enter full name');
      setActiveTab('profile');
      return;
    }

    if (formData.access_type === 'selected' && formData.selected_projects.length === 0) {
      toast.error('Please select at least 1 project for selected projects access');
      setActiveTab('projects');
      return;
    }

    if (isTargetSuper && !isSuperAdmin) {
      toast.error('System Security: Only Super Admin can edit this account');
      return;
    }

    if (isLastActiveAdmin && (formData.role !== 'admin' || formData.status !== 'active')) {
      toast.error('System Security: Cannot demote or deactivate the last active Administrator');
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
    const cat = perm.category || perm.module || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(perm);
    return acc;
  }, {});

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-card text-card-foreground border border-border shadow-xl p-0 sm:rounded-xl">
        {/* Header Section with User Summary Badge */}
        <div className="p-6 border-b border-border bg-muted/30">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {formData.avatar_url ? (
                  <img
                    src={formData.avatar_url}
                    alt={formData.full_name}
                    className="w-12 h-12 rounded-full object-cover shadow-xs border border-border shrink-0"
                    onError={(e) => { e.target.onerror = null; e.target.src = ''; }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-base shadow-xs shrink-0">
                    {getInitials(formData.full_name || user?.full_name)}
                  </div>
                )}
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                    Edit User & RBAC Permissions
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
          <div className="flex border-b border-border mt-5 -mb-6">
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
              TAB 1: User Profile
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
              TAB 2: Roles & Permissions (RBAC)
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
              TAB 3: Project Access
            </button>
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* TAB 1: Profile Information */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              {/* Super Admin Security Protection Banner */}
              {isTargetSuper && !isSuperAdmin && (
                <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block text-xs">
                      Security Notice: Super Admin Account
                    </strong>
                    This account is a system Super Admin. Only Super Admin can modify or save this account.
                  </div>
                </div>
              )}

              {/* Avatar Upload */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Profile Avatar
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
                    <Lock className="w-3.5 h-3.5" /> Login Email
                  </Label>
                  <Input
                    id="edit_email"
                    type="email"
                    disabled
                    value={user?.email || formData.email}
                    className="h-9 text-xs rounded-lg bg-muted/40 text-muted-foreground cursor-not-allowed border-dashed border border-input"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Login email is the primary identity in Supabase Auth
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit_full_name" className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-primary" /> Full Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit_full_name"
                    required
                    placeholder="e.g. John Doe"
                    value={formData.full_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              </div>

              {/* Phone & Department & Position */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit_phone" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" /> Phone Number
                  </Label>
                  <Input
                    id="edit_phone"
                    type="tel"
                    placeholder="e.g. 0812345678"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit_department" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Department
                  </Label>
                  <Input
                    id="edit_department"
                    placeholder="e.g. Engineering, Warehouse"
                    value={formData.department}
                    onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit_position" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> Position
                  </Label>
                  <Input
                    id="edit_position"
                    placeholder="e.g. Site Engineer, Storekeeper"
                    value={formData.position}
                    onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              </div>

              {/* Security & Password Enforcement */}
              <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-2">
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
                      Must change password on next login
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      When enabled, the user must set a new password before accessing the system.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: Roles, RBAC Permissions Preview & Account Status */}
          {activeTab === 'rbac' && (
            <div className="space-y-5">
              {/* Super Admin Security Protection Banner */}
              {isTargetSuper && !isSuperAdmin && (
                <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block text-xs">
                      Security Notice: Super Admin Account
                    </strong>
                    This account is a system Super Admin. Only Super Admin can change the role or permissions of this account.
                  </div>
                </div>
              )}

              {/* Last Active Admin Protection Banner */}
              {isLastActiveAdmin && !isTargetSuper && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block text-xs">
                      Security Notice: Last Active Administrator
                    </strong>
                    This account is the only active Administrator. Demoting or suspending this account is not allowed to prevent system lockout.
                  </div>
                </div>
              )}

              {/* Dynamic Role Selection Cards */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground block">
                    Assigned Role <span className="text-red-500">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => { onClose(); navigate('/roles'); }}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <span>Manage roles and permissions at /roles</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {availableRoles.map((r) => {
                    const roleCode = (r.code || r.role || '').toLowerCase();
                    const isSelected = (formData.role || '').toLowerCase() === roleCode;
                    const isRoleDisabled = (isLastActiveAdmin && roleCode !== 'admin') || (isTargetSuper && !isSuperAdmin);

                    return (
                      <div
                        key={r.id || r.code}
                        onClick={() => !isRoleDisabled && handleRoleSelect(roleCode, r.id)}
                        className={`p-3.5 rounded-lg border transition-all ${
                          isRoleDisabled
                            ? 'opacity-40 cursor-not-allowed border-border bg-muted/30'
                            : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary'
                            : 'border-border bg-card hover:bg-muted/50'
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
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Assigned RBAC Permissions
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                      {loadingPerms ? (
                        'Loading permissions...'
                      ) : rolePermissionsList.length === totalCatalogCount && totalCatalogCount > 0 ? (
                        `All permissions enabled (${rolePermissionsList.length} / ${totalCatalogCount})`
                      ) : (
                        `Enabled: ${rolePermissionsList.length} / ${totalCatalogCount || rolePermissionsList.length}`
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => fetchLiveRolePermissions()}
                      disabled={loadingPerms}
                      title="Refresh permissions from database"
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingPerms ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {loadingPerms ? (
                  <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                    Loading live permission schema from database...
                  </div>
                ) : rolePermissionsList.length === 0 ? (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs text-center space-y-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                    <p className="font-semibold">No permissions currently enabled for this role in /roles</p>
                    <p className="text-[11px] text-muted-foreground">
                      You can configure additional permissions directly in <button type="button" onClick={() => { onClose(); navigate('/roles'); }} className="text-primary underline">Role Management</button>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rolePermissionsList.length === totalCatalogCount && totalCatalogCount > 0 && (
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary shrink-0" />
                        <span>This role has full system privileges, with access to all {rolePermissionsList.length} system permissions.</span>
                      </div>
                    )}

                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                      {Object.keys(groupedPermissions).map((category) => (
                        <div key={category} className="space-y-1">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                            <span>{category}</span>
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {groupedPermissions[category].length} {groupedPermissions[category].length === 1 ? 'permission' : 'permissions'}
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
                  Account Status <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* ACTIVE */}
                  <label
                    onClick={() => handleStatusChange('active')}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      formData.status === 'active'
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500'
                        : 'border-border bg-card hover:bg-muted/50'
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
                      <span className="text-xs font-bold text-foreground block">Active</span>
                      <span className="text-[10px] text-muted-foreground">Normal login and operations</span>
                    </div>
                  </label>

                  {/* INACTIVE */}
                  <label
                    onClick={() => !isLastActiveAdmin && handleStatusChange('inactive')}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isLastActiveAdmin ? 'opacity-40 cursor-not-allowed bg-muted/30' : 'cursor-pointer'
                    } ${
                      formData.status === 'inactive'
                        ? 'border-red-500 bg-red-500/10 shadow-xs ring-1 ring-red-500'
                        : 'border-border bg-card hover:bg-muted/50'
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
                      <span className="text-xs font-bold text-foreground block">Inactive</span>
                      <span className="text-[10px] text-muted-foreground">Block login access</span>
                    </div>
                  </label>

                  {/* SUSPENDED */}
                  <label
                    onClick={() => !isLastActiveAdmin && handleStatusChange('suspended')}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isLastActiveAdmin ? 'opacity-40 cursor-not-allowed bg-muted/30' : 'cursor-pointer'
                    } ${
                      formData.status === 'suspended'
                        ? 'border-amber-500 bg-amber-500/10 shadow-xs ring-1 ring-amber-500'
                        : 'border-border bg-card hover:bg-muted/50'
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
                      <span className="text-xs font-bold text-foreground block">Suspended</span>
                      <span className="text-[10px] text-muted-foreground">Temporarily suspended</span>
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
                  Project Access Control <span className="text-red-500">*</span>
                </Label>

                {/* Mode 1: All Projects */}
                <label
                  onClick={() => setFormData((prev) => ({ ...prev, access_type: 'all' }))}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                    formData.access_type === 'all'
                      ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-muted/50'
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
                      All Projects Access
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      The user will automatically have access to view stock, withdraw, and receive items across all projects.
                    </p>
                  </div>
                </label>

                {/* Mode 2: Selected Projects */}
                <label
                  onClick={() => setFormData((prev) => ({ ...prev, access_type: 'selected' }))}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                    formData.access_type === 'selected'
                      ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-muted/50'
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
                      Selected Projects Only
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Restrict access to view and perform actions only within the selected projects listed below.
                    </p>
                  </div>
                </label>
              </div>

              {/* Selected Projects Sub-panel */}
              {formData.access_type === 'selected' && (
                <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
                  {/* Search and Action Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search project name or code..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="pl-8 text-xs bg-background border border-input h-8 rounded-lg"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllProjects}
                        className="text-[11px] h-7 px-2.5 rounded-lg"
                      >
                        Select All ({projects.length})
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDeselectAllProjects}
                        className="text-[11px] h-7 px-2.5 rounded-lg"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>

                  {/* Project Checkbox List */}
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {filteredProjects.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">
                        No matching projects found
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
                                : 'border-transparent hover:bg-muted/50'
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
                      At least 1 project is required for this access type
                    </span>
                    <span className="font-semibold text-foreground">
                      Selected: {formData.selected_projects.length} / {projects.length} {projects.length === 1 ? 'project' : 'projects'}
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
                  className="text-xs h-9 px-3 rounded-lg"
                >
                  Next (TAB 2: Roles & Permissions) →
                </Button>
              )}

              {activeTab === 'rbac' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('profile')}
                    className="text-xs h-9 px-3 rounded-lg"
                  >
                    ← Back (TAB 1)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('projects')}
                    className="text-xs h-9 px-3 rounded-lg"
                  >
                    Next (TAB 3: Project Access) →
                  </Button>
                </>
              )}

              {activeTab === 'projects' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('rbac')}
                  className="text-xs h-9 px-3 rounded-lg"
                >
                  ← Back (TAB 2)
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button type="button" variant="ghost" onClick={onClose} className="text-xs h-9 px-4 rounded-lg">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || (isTargetSuper && !isSuperAdmin)}
                title={isTargetSuper && !isSuperAdmin ? 'Only Super Admin can edit this account' : 'Save changes'}
                className="h-9 px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Save Changes
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
