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
      const { data, error } = await supabase.rpc('admin_get_roles_with_stats');
      if (!error && data) {
        setRoles(data);
        setRpcMissing(false);
        return;
      }
    } catch (err) {
      console.warn('RPC admin_get_roles_with_stats not found, using fallback query:', err);
    }

    // Fallback query if migration 09 not yet executed
    setRpcMissing(true);
    const { data: rolesData, error: rolesErr } = await supabase
      .from('roles')
      .select('*')
      .order('is_system', { ascending: false });

    if (rolesErr || !rolesData) {
      // Hardcoded fallback baseline if roles table doesn't exist yet
      setRoles([
        {
          id: 'system-admin',
          code: 'ADMIN',
          name: 'ผู้ดูแลระบบ (Administrator)',
          description: 'สิทธิ์สูงสุด บริหารจัดการผู้ใช้งาน บทบาท สต็อก และโครงการทั้งหมด',
          badge_background: 'bg-purple-100 dark:bg-purple-950',
          badge_text_color: 'text-purple-700 dark:text-purple-300',
          is_system: true,
          is_active: true,
          user_count: 1,
          permission_count: 30
        },
        {
          id: 'system-staff',
          code: 'STAFF',
          name: 'เจ้าหน้าที่ / ผู้ขอเบิก (Staff)',
          description: 'สามารถขอเบิกจ่ายวัสดุ และดูข้อมูลสต็อกเฉพาะโครงการที่ได้รับมอบหมาย',
          badge_background: 'bg-blue-100 dark:bg-blue-950',
          badge_text_color: 'text-blue-700 dark:text-blue-300',
          is_system: true,
          is_active: true,
          user_count: 2,
          permission_count: 7
        },
        {
          id: 'system-supervisor',
          code: 'SUPERVISOR',
          name: 'ผู้จัดการ / ผู้อนุมัติ (Supervisor)',
          description: 'สามารถตรวจสอบ อนุมัติการเบิกจ่าย และดูรายงานระดับโครงการ',
          badge_background: 'bg-emerald-100 dark:bg-emerald-950',
          badge_text_color: 'text-emerald-700 dark:text-emerald-300',
          is_system: true,
          is_active: true,
          user_count: 0,
          permission_count: 11
        }
      ]);
      return;
    }

    setRoles(rolesData.map(r => ({
      ...r,
      user_count: r.user_count || 0,
      permission_count: r.permission_count || 0
    })));
  };

  const fetchCatalog = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_permissions_catalog');
      if (!error && data) {
        setCatalog(data);
        return;
      }
    } catch (e) {}

    // Fallback catalog query
    const { data: perms } = await supabase.from('permissions').select('*').order('category');
    setCatalog(perms || []);
  };

  const handleOpenPermissionModal = async (roleObj) => {
    try {
      setSelectedRoleForPerms(roleObj);
      const { data, error } = await supabase.rpc('admin_get_role_permissions', { p_role_id: roleObj.id });
      if (!error && data) {
        setCurrentRolePermissions(data);
      } else {
        // Fallback fetch role_permissions
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
      const { data, error } = await supabase.rpc('admin_save_role_permissions', {
        p_role_id: roleId,
        p_permission_ids: permissionIds
      });

      if (error) {
        if (error.code === 'PGRST202' || error.status === 404) {
          toast.error('กรุณารันสคริปต์ Migration 09 ใน Supabase SQL Editor เพื่อบันทึกสิทธิ์บทบาท');
          return;
        }
        throw error;
      }

      if (data?.success) {
        toast.success('บันทึกการกำหนดสิทธิ์เรียบร้อยแล้ว');
        await fetchRoles();
        await refreshProfile();
      }
    } catch (error) {
      console.error('Save Role Permissions Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์');
      throw error;
    }
  };

  const handleCreateRole = async (rolePayload) => {
    try {
      const { data, error } = await supabase.rpc('admin_create_role', {
        p_code: rolePayload.code,
        p_name: rolePayload.name,
        p_description: rolePayload.description,
        p_badge_background: rolePayload.badge_background,
        p_badge_text_color: rolePayload.badge_text_color
      });

      if (error) {
        if (error.code === 'PGRST202' || error.status === 404) {
          toast.error('กรุณารันสคริปต์ Migration 09 ใน Supabase SQL Editor เพื่อสร้างบทบาทใหม่');
          return;
        }
        throw error;
      }

      if (data?.success) {
        toast.success('สร้างบทบาทใหม่สำเร็จ');
        await fetchRoles();
      }
    } catch (error) {
      console.error('Create Role Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการสร้างบทบาท');
      throw error;
    }
  };

  const handleUpdateRole = async (roleId, rolePayload) => {
    try {
      const { data, error } = await supabase.rpc('admin_update_role', {
        p_role_id: roleId,
        p_name: rolePayload.name,
        p_description: rolePayload.description,
        p_badge_background: rolePayload.badge_background,
        p_badge_text_color: rolePayload.badge_text_color
      });

      if (error) {
        if (error.code === 'PGRST202' || error.status === 404) {
          toast.error('กรุณารันสคริปต์ Migration 09 ใน Supabase SQL Editor เพื่ออัปเดตบทบาท');
          return;
        }
        throw error;
      }

      if (data?.success) {
        toast.success('อัปเดตข้อมูลบทบาทสำเร็จ');
        await fetchRoles();
      }
    } catch (error) {
      console.error('Update Role Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการอัปเดตบทบาท');
      throw error;
    }
  };

  const handleDeleteRole = async (roleObj) => {
    if (roleObj.is_system) {
      toast.error('ไม่สามารถลบบทบาทของระบบ (System Role) ได้');
      return;
    }

    if (roleObj.user_count > 0) {
      toast.error(`ไม่สามารถลบบทบาทนี้ได้ เนื่องจากมีผู้ใช้งาน ${roleObj.user_count} คน กรุณาย้ายผู้ใช้งานไปยังบทบาทอื่นก่อน`);
      return;
    }

    setSelectedRoleForDelete(roleObj);
  };

  const confirmDeleteRole = async () => {
    if (!selectedRoleForDelete) return;

    try {
      const { data, error } = await supabase.rpc('admin_delete_role', {
        p_role_id: selectedRoleForDelete.id
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('ลบบทบาทสำเร็จ');
        await fetchRoles();
      }
    } catch (error) {
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
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${roleObj.badge_background || 'bg-purple-100 dark:bg-purple-950'} ${roleObj.badge_text_color || 'text-purple-700 dark:text-purple-300'}`}>
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

                    {/* Delete Role */}
                    {can('roles.delete') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={roleObj.is_system ? 'ไม่สามารถลบบทบาทของระบบได้' : roleObj.user_count > 0 ? `ไม่สามารถลบเนื่องจากมีผู้ใช้ ${roleObj.user_count} คน` : 'ลบบทบาท'}
                        disabled={roleObj.is_system || roleObj.user_count > 0}
                        onClick={() => handleDeleteRole(roleObj)}
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-30 disabled:cursor-not-allowed"
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
