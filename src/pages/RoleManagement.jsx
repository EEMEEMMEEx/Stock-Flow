import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  ShieldCheck, Plus, RefreshCw, Edit, Trash2, Shield, Users, Lock, AlertCircle 
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

import AddRoleModal from '@/components/roles/AddRoleModal';
import EditRoleModal from '@/components/roles/EditRoleModal';
import PermissionManagementModal from '@/components/roles/PermissionManagementModal';

const RoleManagement = () => {
  const { can, refreshProfile } = useAuth();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rpcMissing, setRpcMissing] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState(null);
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState(null);
  const [currentRolePermissions, setCurrentRolePermissions] = useState([]);
  const [selectedRoleForDelete, setSelectedRoleForDelete] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchRoles(), fetchCatalog()]);
    } catch (error) {
      console.error('Fetch Roles Error:', error);
      toast.error('เกิดข้อผิดพลาดในการโหลดข้อมูลบทบาท');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      // 1. Fetch roles, profiles, and role_permissions in parallel
      let rolesData = [];
      let isRpcActive = false;

      try {
        const { data, error } = await supabase.rpc('admin_get_roles_with_stats');
        if (!error && Array.isArray(data) && data.length > 0) {
          rolesData = data;
          isRpcActive = true;
        }
      } catch (err) {
        console.warn('RPC admin_get_roles_with_stats not found or error:', err);
      }

      // If RPC didn't return roles, query roles table directly
      if (rolesData.length === 0) {
        const { data: directRoles } = await supabase
          .from('roles')
          .select('*')
          .order('is_system', { ascending: false });
        rolesData = directRoles || [];
      }

      setRpcMissing(rolesData.length === 0);

      // Fetch live profiles and role_permissions for accurate counts & self-healing
      const [profilesRes, rpRes] = await Promise.all([
        supabase.from('profiles').select('id, role, role_id'),
        supabase.from('role_permissions').select('role_id, permission_id')
      ]);

      const profilesList = profilesRes.data || [];
      const rpList = rpRes.data || [];

      if (!rolesData || rolesData.length === 0) {
        setRoles([]);
        return;
      }

      // Helper function to check if a user belongs to a role
      const matchesRole = (userProfile, roleRecord) => {
        if (!userProfile || !roleRecord) return false;
        if (userProfile.role_id && userProfile.role_id === roleRecord.id) return true;

        const userRole = (userProfile.role || '').toUpperCase().trim();
        const roleCode = (roleRecord.code || '').toUpperCase().trim();

        if (userRole === roleCode) return true;
        if ((roleCode === 'STAFF' || roleCode === 'OPERATOR') && ['STAFF', 'OPERATOR', 'REQUESTER'].includes(userRole)) return true;
        if (roleCode === 'SUPERVISOR' && ['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(userRole)) return true;
        if (roleCode === 'ADMIN' && ['ADMIN', 'ADMINISTRATOR'].includes(userRole)) return true;
        return false;
      };

      // 2. Map and compute exact real-time user_count and permission_count
      const reconciledRoles = rolesData.map(r => {
        const uCount = profilesList.filter(p => matchesRole(p, r)).length;
        const livePermCount = rpList.filter(rp => rp.role_id === r.id).length;
        const pCount = livePermCount > 0 ? livePermCount : (r.permission_count || 0);

        return {
          ...r,
          user_count: uCount,
          permission_count: pCount
        };
      });

      setRoles(reconciledRoles);

      // 3. Self-healing: Auto-link missing role_id on profiles in background
      const unlinkedProfiles = profilesList.filter(p => !p.role_id);
      if (unlinkedProfiles.length > 0 && rolesData.length > 0) {
        unlinkedProfiles.forEach(async (p) => {
          const matchedRole = rolesData.find(r => matchesRole(p, r));
          if (matchedRole?.id) {
            try {
              await supabase.from('profiles').update({ role_id: matchedRole.id }).eq('id', p.id);
            } catch (healErr) {
              console.warn('Profile role_id auto-heal notice:', healErr);
            }
          }
        });
      }
    } catch (error) {
      console.error('Error fetching and reconciling roles:', error);
      toast.error('เกิดข้อผิดพลาดในการโหลดข้อมูลบทบาท');
    }
  };

  const fetchCatalog = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_permissions_catalog');
      if (!error && data) {
        setCatalog(data);
        return;
      }
    } catch (e) {
      console.warn('admin_get_permissions_catalog RPC error:', e);
    }

    // Fallback catalog query
    const { data: perms } = await supabase.from('permissions').select('*').order('category');
    setCatalog(perms || []);
  };

  const handleOpenPermissionModal = async (roleObj) => {
    try {
      setSelectedRoleForPerms(roleObj);
      const { data, error } = await supabase.rpc('admin_get_role_permissions', { p_role_id: roleObj.id });
      if (!error && Array.isArray(data)) {
        setCurrentRolePermissions(data);
      } else {
        // Fallback fetch role_permissions table directly
        const { data: rpData } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', roleObj.id);
        setCurrentRolePermissions(rpData || []);
      }
    } catch (e) {
      console.error('Error fetching role permissions:', e);
      setCurrentRolePermissions([]);
    }
  };

  const handleSaveRolePermissions = async (roleId, permissionIds) => {
    try {
      // 1. Try atomic PostgreSQL RPC first
      let rpcSuccess = false;
      try {
        const { data, error } = await supabase.rpc('admin_save_role_permissions', {
          p_role_id: roleId,
          p_permission_ids: permissionIds
        });
        if (!error && data?.success) {
          rpcSuccess = true;
        }
      } catch (e) {
        console.warn('admin_save_role_permissions RPC failed, attempting direct table fallback:', e);
      }

      // 2. Direct database table fallback (Protected by RLS)
      if (!rpcSuccess) {
        const { error: delErr } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId);

        if (delErr) throw delErr;

        if (permissionIds.length > 0) {
          const insertPayload = permissionIds.map(pid => ({
            role_id: roleId,
            permission_id: pid
          }));

          const { error: insErr } = await supabase
            .from('role_permissions')
            .insert(insertPayload);

          if (insErr) throw insErr;
        }
      }

      toast.success('บันทึกการกำหนดสิทธิ์เรียบร้อยแล้ว');
      await fetchRoles();
      await refreshProfile();
    } catch (error) {
      console.error('Save Role Permissions Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์');
      throw error;
    }
  };

  const handleCreateRole = async (rolePayload) => {
    try {
      let created = false;
      try {
        const { data, error } = await supabase.rpc('admin_create_role', {
          p_code: rolePayload.code,
          p_name: rolePayload.name,
          p_description: rolePayload.description,
          p_badge_background: rolePayload.badge_background,
          p_badge_text_color: rolePayload.badge_text_color
        });
        if (!error && data?.success) {
          created = true;
        }
      } catch (e) {
        console.warn('admin_create_role RPC notice, using direct insert:', e);
      }

      if (!created) {
        const { error: insertErr } = await supabase
          .from('roles')
          .insert({
            code: rolePayload.code.toUpperCase().trim(),
            name: rolePayload.name.trim(),
            description: rolePayload.description,
            badge_background: rolePayload.badge_background,
            badge_text_color: rolePayload.badge_text_color,
            is_system: false,
            is_active: true
          });

        if (insertErr) throw insertErr;
      }

      toast.success('สร้างบทบาทใหม่สำเร็จ');
      await fetchRoles();
    } catch (error) {
      console.error('Create Role Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการสร้างบทบาท');
      throw error;
    }
  };

  const handleUpdateRole = async (roleId, rolePayload) => {
    try {
      let updated = false;
      try {
        const { data, error } = await supabase.rpc('admin_update_role', {
          p_role_id: roleId,
          p_name: rolePayload.name,
          p_description: rolePayload.description,
          p_badge_background: rolePayload.badge_background,
          p_badge_text_color: rolePayload.badge_text_color
        });
        if (!error && data?.success) {
          updated = true;
        }
      } catch (e) {
        console.warn('admin_update_role RPC notice, using direct update:', e);
      }

      if (!updated) {
        const { error: updateErr } = await supabase
          .from('roles')
          .update({
            name: rolePayload.name.trim(),
            description: rolePayload.description,
            badge_background: rolePayload.badge_background,
            badge_text_color: rolePayload.badge_text_color,
            updated_at: new Date().toISOString()
          })
          .eq('id', roleId);

        if (updateErr) throw updateErr;
      }

      toast.success('อัปเดตข้อมูลบทบาทสำเร็จ');
      await fetchRoles();
    } catch (error) {
      console.error('Update Role Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการอัปเดตบทบาท');
      throw error;
    }
  };

  const handleDeleteRole = async (roleObj) => {
    if (roleObj.is_system) {
      toast.error(`ไม่สามารถลบบทบาทของระบบ (System Role: ${roleObj.name || roleObj.code}) ได้ เพื่อรักษาเสถียรภาพของระบบ`);
      return;
    }

    if (roleObj.user_count > 0) {
      toast.error(
        `ไม่สามารถลบบทบาท "${roleObj.name || roleObj.code}" ได้ เนื่องจากยังมีผู้ใช้งานจำนวน ${roleObj.user_count} คน กำหนดบทบาทนี้อยู่ กรุณาย้ายผู้ใช้งานไปยังบทบาทอื่นในระบบก่อนลบ`,
        { duration: 5000 }
      );
      return;
    }

    setSelectedRoleForDelete(roleObj);
  };

  const confirmDeleteRole = async () => {
    if (!selectedRoleForDelete) return;

    if (selectedRoleForDelete.is_system) {
      toast.error('ไม่สามารถลบบทบาทของระบบ (System Role) ได้');
      setSelectedRoleForDelete(null);
      return;
    }

    if (selectedRoleForDelete.user_count > 0) {
      toast.error(`ไม่สามารถลบบทบาทได้ เนื่องจากมีผู้ใช้งาน ${selectedRoleForDelete.user_count} คน กำหนดบทบาทนี้อยู่`);
      setSelectedRoleForDelete(null);
      return;
    }

    try {
      let rpcSuccess = false;
      try {
        const { data, error } = await supabase.rpc('admin_delete_role', {
          p_role_id: selectedRoleForDelete.id
        });
        if (!error && data?.success) {
          rpcSuccess = true;
        }
      } catch (e) {
        console.warn('RPC admin_delete_role notice, fallback to direct table delete:', e);
      }

      if (!rpcSuccess) {
        const { error: deleteRpErr } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', selectedRoleForDelete.id);

        if (deleteRpErr) throw deleteRpErr;

        const { error: deleteRoleErr } = await supabase
          .from('roles')
          .delete()
          .eq('id', selectedRoleForDelete.id);

        if (deleteRoleErr) throw deleteRoleErr;
      }

      toast.success(`ลบบทบาท ${selectedRoleForDelete.name} เรียบร้อยแล้ว`);
      await fetchRoles();
    } catch (error) {
      console.error('Delete Role error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการลบบทบาท');
    } finally {
      setSelectedRoleForDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            จัดการบทบาทและสิทธิ์ (Role & Permission Management - RBAC)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            สร้าง/แก้ไขบทบาท และกำหนดสิทธิ์การใช้งาน (RBAC) ให้แต่ละบทบาท
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={fetchInitialData} 
            disabled={loading}
            className="neu-button flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </Button>

          {can('roles.create') && (
            <Button 
              onClick={() => setIsAddModalOpen(true)}
              className="neu-primary h-10 px-4 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>เพิ่มบทบาท</span>
            </Button>
          )}
        </div>
      </div>

      {/* Migration Notice Banner */}
      {rpcMissing && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-800 dark:text-amber-300">
              แจ้งเตือน: ยังไม่ได้เปิดใช้งาน Supabase Migration 09 บนฐานข้อมูล Cloud
            </div>
            <p className="text-muted-foreground">
              หากต้องการใช้ระบบ RBAC แบบไดนามิกเต็มรูปแบบ (สร้างบทบาทใหม่, กำหนดสิทธิ์แบบเปิด-ปิด, และเชื่อมโยงแคตตาล็อกสิทธิ์) 
              กรุณานำโค้ดในไฟล์ <code className="bg-amber-200/50 dark:bg-amber-950/60 px-1 py-0.5 rounded font-mono">supabase/migrations/09_dynamic_rbac_roles_permissions.sql</code> ไปวางและกด Run ใน <strong>Supabase Dashboard → SQL Editor</strong>
            </p>
          </div>
        </div>
      )}

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            กำลังโหลดรายชื่อบทบาทและสิทธิ์...
          </div>
        ) : roles.length === 0 ? (
          <div className="col-span-full py-16 text-center text-muted-foreground">
            ไม่พบบทบาทในระบบ
          </div>
        ) : (
          roles.map((roleObj) => (
            <Card key={roleObj.id} className="neu-flat border-0 flex flex-col justify-between hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  {/* Badge with live theme colors */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${roleObj.badge_background || 'bg-purple-100 dark:bg-purple-950'} ${roleObj.badge_text_color || 'text-purple-700 dark:text-purple-300'}`}>
                    {(roleObj.code === 'SUPER' || (roleObj.badge_background || '').includes('gradient')) ? (
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {roleObj.code}
                  </span>

                  {roleObj.is_system && (
                    <span className="text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-3 h-3" /> System Role
                    </span>
                  )}
                </div>

                <CardTitle className="text-lg font-bold text-foreground">
                  {roleObj.name}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {roleObj.description || 'ไม่มีคำอธิบายรายละเอียด'}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0 space-y-4">
                {/* User Count & Permission Count Indicators */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-[10px] text-muted-foreground">จำนวนผู้ใช้</div>
                      <div className="font-bold text-sm text-foreground">{roleObj.user_count || 0} คน</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-l border-border pl-3">
                    <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <div>
                      <div className="text-[10px] text-muted-foreground">สิทธิ์ที่เปิดใช้งาน</div>
                      <div className="font-bold text-sm text-foreground">{roleObj.permission_count || 0} สิทธิ์</div>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  {can('roles.manage_permissions') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenPermissionModal(roleObj)}
                      className="neu-button text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      กำหนดสิทธิ์ (Shield)
                    </Button>
                  ) : (
                    <div></div>
                  )}

                  <div className="flex items-center gap-1">
                    {/* Edit Role */}
                    {can('roles.update') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="แก้ไขบทบาท (Edit Role)"
                        onClick={() => setSelectedRoleForEdit(roleObj)}
                        className="h-8 w-8 text-slate-600 hover:text-primary hover:bg-primary/10"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}

                    {/* Delete Role Button controlled strictly by RBAC roles.delete permission */}
                    {can('roles.delete') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={
                          roleObj.is_system
                            ? 'ไม่สามารถลบบทบาทของระบบได้ (System Role)'
                            : roleObj.user_count > 0
                            ? `มีผู้ใช้ประจำอยู่ ${roleObj.user_count} คน (คลิกเพื่อดูรายละเอียด)`
                            : 'ลบบทบาท (Delete Role)'
                        }
                        onClick={() => handleDeleteRole(roleObj)}
                        className={`h-8 w-8 transition-colors ${
                          roleObj.is_system || roleObj.user_count > 0
                            ? 'text-red-400/80 hover:text-red-600 hover:bg-red-50/80 dark:hover:bg-red-950/60'
                            : 'text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Role Modal */}
      <AddRoleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleCreateRole}
      />

      {/* Edit Role Modal */}
      {selectedRoleForEdit && (
        <EditRoleModal
          isOpen={!!selectedRoleForEdit}
          onClose={() => setSelectedRoleForEdit(null)}
          onSave={handleUpdateRole}
          role={selectedRoleForEdit}
        />
      )}

      {/* Permission Management Modal */}
      {selectedRoleForPerms && (
        <PermissionManagementModal
          isOpen={!!selectedRoleForPerms}
          onClose={() => setSelectedRoleForPerms(null)}
          onSave={handleSaveRolePermissions}
          role={selectedRoleForPerms}
          catalog={catalog}
          currentPermissions={currentRolePermissions}
        />
      )}

      {/* Confirm Delete Role Modal */}
      {selectedRoleForDelete && (
        <Dialog open={!!selectedRoleForDelete} onOpenChange={() => setSelectedRoleForDelete(null)}>
          <DialogContent className="max-w-md neu-flat border-0">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                ยืนยันการลบบทบาท (Delete Role)
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-2">
                คุณแน่ใจหรือไม่ที่จะลบบทบาท <strong>{selectedRoleForDelete.name}</strong> ({selectedRoleForDelete.code}) ?
                <br />
                <span className="text-xs text-red-500 font-medium mt-1 block">
                  * การดำเนินการนี้ไม่สามารถย้อนกลับได้
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setSelectedRoleForDelete(null)}>
                ยกเลิก
              </Button>
              <Button variant="destructive" onClick={confirmDeleteRole}>
                ยืนยันลบบทบาท
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default RoleManagement;
