import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { 
  UserCog, Plus, Search, RefreshCw, Edit, KeyRound, 
  UserX, UserCheck, FolderKanban, Phone, Mail, Trash2, AlertCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

import AddUserModal from '@/components/users/AddUserModal';
import EditUserModal from '@/components/users/EditUserModal';
import ResetPasswordModal from '@/components/users/ResetPasswordModal';
import UserActionModal from '@/components/users/UserActionModal';
import RoleBadge from '@/components/ui/RoleBadge';
import { getRoleLabel } from '@/lib/roleUtils';
import { uploadAvatarImage } from '@/lib/avatarUpload';
import { sendUserInvitationEmail } from '@/lib/emailService';
import { useTranslation } from '@/i18n';

const UserManagement = () => {
  const { t } = useTranslation();
  const { isSuperAdmin, user, can } = useAuth();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [dbRoles, setDbRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);
  const [selectedUserForResetPw, setSelectedUserForResetPw] = useState(null);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState(null);

  const [rpcMissing, setRpcMissing] = useState(false);
  const [resendingInvitationId, setResendingInvitationId] = useState(null);

  const fetchDbRoles = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('roles')
        .select('id, code, name, description, badge_background, badge_text_color, is_system')
        .order('is_system', { ascending: false });
      setDbRoles(data || []);
    } catch (e) {
      console.warn('fetchDbRoles error:', e);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      // 1. Try RPC first
      const { data, error } = await supabase.rpc('admin_get_users');
      if (error) {
        console.warn('RPC admin_get_users returned error:', error);
      } else if (data) {
        setUsers(data);
        setRpcMissing(false);
        return;
      }
    } catch (err) {
      console.warn('RPC admin_get_users not found, using fallback query:', err);
    }

    // 2. Fallback: Query profiles directly if RPC is not yet deployed on Supabase DB
    setRpcMissing(true);
    const { data: profilesData, error: profilesErr } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesErr) throw profilesErr;

    // Fetch user project assignments if table exists
    let assignmentMap = {};
    try {
      const { data: assignments } = await supabase
        .from('user_project_assignments')
        .select('*');

      if (assignments) {
        assignments.forEach(a => {
          if (!assignmentMap[a.user_id]) assignmentMap[a.user_id] = [];
          assignmentMap[a.user_id].push(a.project_id);
        });
      }
    } catch {
      // Table might not exist yet before migration
    }

    const formattedUsers = (profilesData || []).map(p => ({
      id: p.id,
      email: p.email || (user && p.id === user.id ? user.email : `${p.full_name ? p.full_name.toLowerCase().replace(/\s+/g, '') : 'user'}@stockflow.local`),
      full_name: p.full_name,
      role: p.role || 'staff',
      role_id: p.role_id || null,
      status: p.status || 'active',
      phone: p.phone || '',
      department: p.department || '',
      position: p.position || '',
      avatar_url: p.avatar_url || '',
      must_change_password: p.must_change_password === true,
      created_at: p.created_at,
      updated_at: p.updated_at,
      assigned_project_ids: assignmentMap[p.id] || [],
      all_projects: p.all_projects !== undefined ? p.all_projects : (p.role === 'admin' || !assignmentMap[p.id] || assignmentMap[p.id].length === 0)
    }));

    setUsers(formattedUsers);
    setRpcMissing(formattedUsers.length === 0);
  }, [user]);

  const fetchProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, project_code')
      .eq('status', 'active')
      .order('name');
    if (error) throw error;
    setProjects(data || []);
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchProjects(), fetchDbRoles()]);
    } catch (error) {
      console.error('Fetch Data Error:', error);
      toast.error('An error occurred while loading data');
    } finally {
      setLoading(false);
    }
  }, [fetchUsers, fetchProjects, fetchDbRoles]);

  useEffect(() => {
    fetchInitialData();

    // Live real-time synchronization on roles and profiles
    const channel = supabase
      .channel('realtime_user_management_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roles' },
        () => {
          fetchDbRoles();
          fetchUsers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'role_permissions' },
        () => {
          fetchDbRoles();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialData, fetchDbRoles, fetchUsers]);

  // Actions
  const handleCreateUser = async (userPayload) => {
    try {
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_email: userPayload.email,
        p_password: userPayload.password || 'F0rth2026@dtrs',
        p_full_name: userPayload.full_name,
        p_role: userPayload.role,
        p_department: userPayload.department || null,
        p_phone: userPayload.phone || null,
        p_position: userPayload.position || null,
        p_all_projects: userPayload.all_projects,
        p_project_ids: userPayload.project_ids
      });

      if (error) {
        // Fallback for fallback creation directly in profiles if RPC not installed
        if (error.code === 'PGRST202' || error.status === 404) {
          toast.error('Please run Migration 40 in Supabase SQL Editor to enable RPC auth user creation');
          return;
        }
        throw error;
      }
      if (data?.success) {
        const newUserId = data.user_id;
        // Sync role_id on profiles
        if (newUserId && userPayload.role_id) {
          await supabase.from('profiles').update({ role_id: userPayload.role_id }).eq('id', newUserId);
        }
        // Upload avatar image if selected during user creation
        if (userPayload.avatar_file && newUserId) {
          const publicUrl = await uploadAvatarImage(newUserId, userPayload.avatar_file);
          if (publicUrl) {
            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', newUserId);
          }
        }

        toast.success('User account created successfully');
        if (userPayload.send_invitation) {
          try {
            await sendUserInvitationEmail({
              recipientEmail: userPayload.email,
              userName: userPayload.full_name,
              roleName: userPayload.role,
              projectAccessSummary: userPayload.all_projects ? 'All Projects' : `${userPayload.project_ids?.length || 0} selected projects`,
              actionUrl: window.location.origin
            });
            toast.success('User created and invitation email sent successfully');
          } catch (emailError) {
            console.error('Invitation Email Error:', emailError);
            toast.error('User created, but invitation email failed to send. You can resend the invitation later.');
          }
        }
        await fetchUsers();
      } else {
        toast.error(data?.message || 'Failed to create user');
      }
    } catch (error) {
      console.error('Admin Create User Error:', error);
      toast.error(error.message || 'An error occurred while creating user');
      throw error;
    }
  };

  const handleResendInvitation = async (user) => {
    try {
      setResendingInvitationId(user.id);
      await sendUserInvitationEmail({
        recipientEmail: user.email,
        userName: user.full_name,
        roleName: user.role,
        projectAccessSummary: user.all_projects ? 'All Projects' : `${user.assigned_project_ids?.length || 0} assigned projects`,
        actionUrl: window.location.origin
      });
      toast.success(`Invitation email resent to ${user.email} successfully`);
    } catch (error) {
      toast.error(`Failed to resend invitation email: ${error.message}`);
    } finally { setResendingInvitationId(null); }
  };

  const handleUpdateUser = async (userId, userPayload) => {
    try {
      let finalAvatarUrl = userPayload.avatar_url;

      // Handle avatar image file upload or removal
      if (userPayload.avatar_file && userId) {
        const publicUrl = await uploadAvatarImage(userId, userPayload.avatar_file);
        if (publicUrl) finalAvatarUrl = publicUrl;
      } else if (userPayload.avatar_removed) {
        finalAvatarUrl = null;
      }

      let matchedRoleId = userPayload.role_id;
      if (!matchedRoleId && userPayload.role) {
        const normalizedRole = userPayload.role.toUpperCase().trim();
        const found = dbRoles.find(r => 
          (r.code || '').toUpperCase().trim() === normalizedRole ||
          (r.code === 'STAFF' && ['STAFF', 'OPERATOR', 'REQUESTER'].includes(normalizedRole)) ||
          (r.code === 'SUPERVISOR' && ['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(normalizedRole)) ||
          (r.code === 'ADMIN' && ['ADMIN', 'ADMINISTRATOR'].includes(normalizedRole))
        );
        matchedRoleId = found?.id || null;
      }

      // 1. Try atomic PostgreSQL RPC first
      const { data, error } = await supabase.rpc('admin_update_user', {
        p_target_id: userId,
        p_full_name: userPayload.full_name,
        p_role: userPayload.role,
        p_status: userPayload.status,
        p_phone: userPayload.phone,
        p_department: userPayload.department,
        p_position: userPayload.position,
        p_all_projects: userPayload.all_projects,
        p_project_ids: userPayload.project_ids,
        p_avatar_url: finalAvatarUrl,
        p_must_change_password: userPayload.must_change_password,
        p_role_id: matchedRoleId
      });

      if (error) {
        // Fallback to direct resilient update on profiles & project assignments
        console.warn('admin_update_user RPC error or missing parameters, executing resilient direct update:', error);

        const { error: profileErr } = await supabase
          .from('profiles')
          .update({
            full_name: userPayload.full_name,
            role: userPayload.role,
            role_id: matchedRoleId,
            status: userPayload.status,
            phone: userPayload.phone,
            department: userPayload.department,
            position: userPayload.position,
            avatar_url: finalAvatarUrl,
            must_change_password: userPayload.must_change_password,
            all_projects: userPayload.all_projects,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (profileErr) throw profileErr;

        // Sync project assignments in fallback mode
        try {
          await supabase.from('user_project_assignments').delete().eq('user_id', userId);
          if (!userPayload.all_projects && Array.isArray(userPayload.project_ids) && userPayload.project_ids.length > 0) {
            const assignmentInserts = userPayload.project_ids.map(pid => ({
              user_id: userId,
              project_id: pid,
              created_by: user?.id || null
            }));
            await supabase.from('user_project_assignments').insert(assignmentInserts);
          }
        } catch (assignErr) {
          console.warn('Direct project assignment sync warning:', assignErr);
        }

        toast.success('User details and permissions updated successfully');
        await Promise.all([fetchUsers(), fetchDbRoles()]);
        return;
      }

      if (data?.success) {
        toast.success('User details and permissions updated successfully');
        await Promise.all([fetchUsers(), fetchDbRoles()]);
      } else {
        toast.error(data?.message || 'Failed to update user details');
      }
    } catch (error) {
      console.error('Admin Update User Error:', error);
      toast.error(error.message || 'An error occurred while updating user');
      throw error;
    }
  };

  const handleResetPassword = async (userId, newPassword) => {
    try {
      const { data, error } = await supabase.rpc('admin_reset_user_password', {
        p_target_id: userId,
        p_new_password: newPassword
      });

      if (error) {
        if (error.code === 'PGRST202' || error.status === 404) {
          toast.error('Please run Migration 08 in Supabase SQL Editor to enable password resets');
          return;
        }
        throw error;
      }
      if (data?.success) {
        toast.success('Password reset successfully');
      }
    } catch (error) {
      console.error('Admin Reset Password Error:', error);
      toast.error(error.message || 'An error occurred while resetting password');
      throw error;
    }
  };


  const handleToggleStatus = async (userObj) => {
    const isTargetSuper = (userObj.role || '').toLowerCase() === 'super' || (userObj.roles?.code || '').toUpperCase() === 'SUPER' || (userObj.email || '').toLowerCase() === 'admin@stockflow.com';
    if (isTargetSuper && !isSuperAdmin) {
      toast.error('System Security: Only Super Admin can change Super Admin account status');
      return;
    }

    const nextStatus = userObj.status === 'active' ? 'inactive' : 'active';
    try {
      const { data, error } = await supabase.rpc('admin_toggle_user_status', {
        p_target_id: userObj.id,
        p_status: nextStatus
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(nextStatus === 'active' ? 'Account activated successfully' : 'Account deactivated successfully');
        await fetchUsers();
      }
    } catch (error) {
      toast.error(error.message || 'An error occurred while changing account status');
    }
  };

  const confirmDeleteUserPermanent = async () => {
    if (!selectedUserForDelete) return;
    const isTargetSuper = (selectedUserForDelete.role || '').toLowerCase() === 'super' || (selectedUserForDelete.roles?.code || '').toUpperCase() === 'SUPER' || (selectedUserForDelete.email || '').toLowerCase() === 'admin@stockflow.com';
    if (isTargetSuper) {
      toast.error('System Security: Cannot delete Super Admin account');
      setSelectedUserForDelete(null);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_target_id: selectedUserForDelete.id
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Permanently deleted user account ${selectedUserForDelete.email} successfully`);
        await fetchUsers();
      } else {
        toast.error(data?.message || 'Failed to delete user');
      }
    } catch (err) {
      console.error('Delete User Error:', err);
      toast.error(err.message || 'An error occurred while deleting user account');
    } finally {
      setSelectedUserForDelete(null);
      setLoading(false);
    }
  };

  const handleDeleteUserAttempt = (userObj) => {
    const isTargetSuper = (userObj.role || '').toLowerCase() === 'super' || (userObj.roles?.code || '').toUpperCase() === 'SUPER' || (userObj.email || '').toLowerCase() === 'admin@stockflow.com';
    if (isTargetSuper) {
      toast.error('System Security: Cannot delete Super Admin account');
      return;
    }

    // Check if user is active admin
    if (userObj.role === 'admin' && userObj.status === 'active') {
      const activeAdmins = users.filter(u => u.role === 'admin' && u.status === 'active');
      if (activeAdmins.length <= 1) {
        toast.error('Cannot delete or deactivate the last Administrator in the system');
        return;
      }
    }
    setSelectedUserForDelete(userObj);
  };

  const getUserRoleBadge = (u) => {
    const userRoleStr = (u.role || 'staff').toUpperCase().trim();
    const matchedRole = dbRoles.find(r => 
      (u.role_id && r.id === u.role_id) ||
      (r.code || '').toUpperCase().trim() === userRoleStr ||
      (r.code === 'STAFF' && ['STAFF', 'OPERATOR', 'REQUESTER'].includes(userRoleStr)) ||
      (r.code === 'SUPERVISOR' && ['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(userRoleStr)) ||
      (r.code === 'ADMIN' && ['ADMIN', 'ADMINISTRATOR'].includes(userRoleStr)) ||
      (r.code === 'SUPER' && ['SUPER', 'SUPERADMIN', 'SUPER_ADMIN'].includes(userRoleStr))
    );

    const roleCode = matchedRole?.code || userRoleStr;
    const roleName = matchedRole?.name || getRoleLabel(roleCode);

    return (
      <RoleBadge 
        role={roleCode} 
        roleName={roleName} 
        roleObj={matchedRole} 
      />
    );
  };

  // Filtered Users
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      !searchQuery ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.position?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone?.includes(searchQuery);

    const userRoleLower = (u.role || 'staff').toLowerCase().trim();
    const filterLower = roleFilter.toLowerCase().trim();
    const matchesRole = filterLower === 'all' || 
      userRoleLower === filterLower ||
      (filterLower === 'staff' && ['staff', 'operator', 'requester'].includes(userRoleLower)) ||
      (filterLower === 'supervisor' && ['supervisor', 'approver', 'manager'].includes(userRoleLower)) ||
      (filterLower === 'admin' && ['admin', 'administrator'].includes(userRoleLower));

    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;

    let matchesProject = true;
    if (projectFilter !== 'all') {
      matchesProject = u.all_projects || (u.assigned_project_ids && u.assigned_project_ids.includes(projectFilter));
    }

    return matchesSearch && matchesRole && matchesStatus && matchesProject;
  });

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getProjectName = (id) => {
    const p = projects.find(proj => proj.id === id);
    return p ? p.name : id;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserCog className="w-7 h-7 text-primary" />
            {t('users.title', 'User Management & RBAC')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('users.subtitle', 'Manage application users, roles, status, and project access.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={fetchInitialData} 
            disabled={loading}
            className="h-9 rounded-lg font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </Button>

          <Button 
            onClick={() => setIsAddModalOpen(true)}
            disabled={!can('users.create')}
            title={!can('users.create') ? 'Missing permission to add users (requires users.create)' : t('users.addUser', 'Add User')}
            className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm flex items-center gap-2 cursor-pointer shadow-xs shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t('users.addUser', 'Add User')}</span>
          </Button>
        </div>
      </div>

      {/* Migration Notice Banner */}
      {rpcMissing && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-800 dark:text-amber-300">
              Notice: Supabase RPC Functions not yet enabled on Cloud Database
            </div>
            <p className="text-muted-foreground">
              The system is currently displaying users via the <code className="bg-amber-200/50 dark:bg-amber-950/60 px-1 py-0.5 rounded font-mono">profiles</code> table automatically (Fallback Mode).
              To enable full Admin privileges (atomic auth user creation, project access scoping, and password resets), 
              please run the script from <code className="bg-amber-200/50 dark:bg-amber-950/60 px-1 py-0.5 rounded font-mono">supabase/migrations/08_rbac_and_user_management.sql</code> in <strong>Supabase Dashboard → SQL Editor</strong>.
            </p>
          </div>
        </div>
      )}


      {/* Filter Toolbar Card */}
      <Card className="rounded-xl bg-card border border-border shadow-xs">
        <CardContent className="p-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('common.search', 'Search by name, email, position...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-lg bg-background border border-input"
            />
          </div>

          {/* Role Filter */}
          <div className="w-full sm:w-48">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-lg bg-background text-foreground border border-input focus:ring-1 focus:ring-primary focus:outline-none shadow-xs"
            >
              <option value="all">Role: All</option>
              {dbRoles.length > 0 ? (
                dbRoles.map((r) => (
                  <option key={r.id || r.code} value={(r.code || '').toLowerCase()}>
                    {getRoleLabel(r.code, r.name)}
                  </option>
                ))
              ) : (
                <>
                  <option value="super">SUPER ADMIN</option>
                  <option value="admin">ADMINISTRATOR</option>
                  <option value="supervisor">SUPERVISOR / APPROVER</option>
                  <option value="staff">STAFF / REQUESTER</option>
                </>
              )}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full sm:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-lg bg-background text-foreground border border-input focus:ring-1 focus:ring-primary focus:outline-none shadow-xs"
            >
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Project Filter */}
          <div className="w-full sm:w-48">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-lg bg-background text-foreground border border-input focus:ring-1 focus:ring-primary focus:outline-none shadow-xs"
            >
              <option value="all">Project: All</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table Card */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Assigned Projects</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Created</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                        Loading users...
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No users found matching the filter criteria
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const activeAdminsCount = users.filter(
                      (item) => (item.role === 'admin' || item.role === 'ADMIN' || item.roles?.code === 'ADMIN') && item.status === 'active'
                    ).length;

                    const isSelf = u.id === user?.id;
                    const isTargetAdmin = u.role === 'admin' || u.role === 'ADMIN' || u.roles?.code === 'ADMIN';
                    const isTargetSuper = u.role === 'super' || u.role === 'SUPER' || u.roles?.code === 'SUPER' || (u.email || '').toLowerCase() === 'admin@stockflow.com';
                    const isLastActiveAdmin = isTargetAdmin && u.status === 'active' && activeAdminsCount <= 1;

                    // RBAC Permission checks with Super Admin hierarchy enforcement
                    const canEditUser = (!isTargetSuper || isSuperAdmin) && can('users.update');
                    const canResendInvite = (!isTargetSuper || isSuperAdmin) && can('users.create');
                    const canResetPassword = (!isTargetSuper || isSuperAdmin) && can('users.reset_password');
                    const canDeactivate = (!isTargetSuper || isSuperAdmin) && can('users.deactivate') && !isSelf && !isLastActiveAdmin;
                    const canDeleteUser = !isTargetSuper && isSuperAdmin && can('users.delete') && !isSelf && !isLastActiveAdmin;

                    const getEditTitle = () => {
                      if (isTargetSuper && !isSuperAdmin) return 'Only Super Admin can edit the Super Admin account';
                      if (!can('users.update')) return 'Missing permission to edit users (requires users.update)';
                      return 'Edit User';
                    };

                    const getDeactivateTitle = () => {
                      if (isSelf) return 'Cannot deactivate your own account';
                      if (isTargetSuper && !isSuperAdmin) return 'Only Super Admin can deactivate a Super Admin account';
                      if (isLastActiveAdmin) return 'Cannot deactivate the last Administrator in the system';
                      if (!can('users.deactivate')) return 'Missing permission to deactivate account (requires users.deactivate)';
                      return u.status === 'active' ? 'Deactivate Account' : 'Activate Account';
                    };

                    const getDeleteTitle = () => {
                      if (isSelf) return 'Cannot delete your own account';
                      if (isTargetSuper) return 'Cannot delete Super Admin account';
                      if (isLastActiveAdmin) return 'Cannot delete the last Administrator in the system';
                      if (!isSuperAdmin) return 'Only Super Admin can delete user accounts';
                      if (!can('users.delete')) return 'Missing permission to delete user (requires users.delete)';
                      return 'Permanently Delete User';
                    };

                    return (
                      <tr key={u.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        {/* Avatar & Name & Email */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <img 
                                src={u.avatar_url} 
                                alt={u.full_name} 
                                className="w-10 h-10 rounded-full object-cover shadow-sm border border-white/40"
                                onError={(e) => { e.target.onerror = null; e.target.src = ''; }}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                {getInitials(u.full_name)}
                              </div>
                            )}

                            <div>
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                {u.full_name}
                                {u.position && (
                                  <span className="text-[11px] font-normal text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                                    {u.position}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                                <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>
                                {u.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {u.phone}</span>}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {getUserRoleBadge(u)}
                        </td>

                        {/* Assigned Projects */}
                        <td className="px-4 py-4 max-w-xs">
                          {u.all_projects ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              <FolderKanban className="w-3 h-3" /> All Projects
                            </span>
                          ) : u.assigned_project_ids && u.assigned_project_ids.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.assigned_project_ids.map(pid => (
                                <span key={pid} className="inline-block px-2 py-0.5 rounded text-[11px] bg-muted font-medium">
                                  {getProjectName(pid)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground font-italic">No projects assigned</span>
                          )}
                        </td>

                        {/* Account Status Badge */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {u.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span> INACTIVE
                            </span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-muted-foreground">
                          {u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy') : '-'}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* Edit User */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title={getEditTitle()}
                              onClick={() => setSelectedUserForEdit(u)}
                              disabled={!canEditUser}
                              className="h-8 w-8 text-slate-600 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>

                            {/* Resend Invitation */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                !canResendInvite
                                  ? "Missing permission to send invitation email"
                                  : "Resend Invitation"
                              }
                              onClick={() => handleResendInvitation(u)}
                              disabled={resendingInvitationId === u.id || !canResendInvite}
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {resendingInvitationId === u.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                              ) : (
                                <Mail className="w-4 h-4" />
                              )}
                            </Button>

                            {/* Reset Password */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                !canResetPassword
                                  ? "Missing permission to reset password"
                                  : "Reset Password"
                              }
                              onClick={() => setSelectedUserForResetPw(u)}
                              disabled={!canResetPassword}
                              className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>

                            {/* Toggle Active/Inactive (Deactivate / Activate) */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title={getDeactivateTitle()}
                              onClick={() => handleToggleStatus(u)}
                              disabled={!canDeactivate}
                              className={`h-8 w-8 ${
                                u.status === 'active' 
                                  ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950' 
                                  : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950'
                              } disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              {u.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </Button>

                            {/* Delete User */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title={getDeleteTitle()}
                              onClick={() => handleDeleteUserAttempt(u)}
                              disabled={!canDeleteUser}
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleCreateUser}
        projects={projects}
        roles={dbRoles}
      />

      {/* Edit User Modal */}
      {selectedUserForEdit && (
        <EditUserModal
          isOpen={!!selectedUserForEdit}
          onClose={() => setSelectedUserForEdit(null)}
          onSave={handleUpdateUser}
          user={selectedUserForEdit}
          projects={projects}
          roles={dbRoles}
          allUsers={users}
        />
      )}


      {/* Reset Password Modal */}
      {selectedUserForResetPw && (
        <ResetPasswordModal
          isOpen={!!selectedUserForResetPw}
          onClose={() => setSelectedUserForResetPw(null)}
          onResetPassword={handleResetPassword}
          user={selectedUserForResetPw}
        />
      )}

      {/* User Action & Destructive Modal */}
      {selectedUserForDelete && (
        <UserActionModal
          isOpen={!!selectedUserForDelete}
          onClose={() => setSelectedUserForDelete(null)}
          user={selectedUserForDelete}
          allUsers={users}
          onToggleStatus={handleToggleStatus}
          onDeletePermanent={confirmDeleteUserPermanent}
        />
      )}

    </div>
  );
};

export default UserManagement;
