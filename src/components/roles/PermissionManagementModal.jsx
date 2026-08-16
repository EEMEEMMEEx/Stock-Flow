import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ChevronDown, ChevronRight, CheckSquare, Square, RefreshCw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const PERMISSION_DEPENDENCIES = {
  'projects.create': ['projects.view'],
  'projects.update': ['projects.view'],
  'projects.delete': ['projects.view'],
  'items.create': ['items.view'],
  'items.update': ['items.view'],
  'items.delete': ['items.view'],
  'stock_in.create': ['stock_in.view'],
  'withdrawals.create': ['withdrawals.view'],
  'withdrawals.approve': ['withdrawals.view'],
  'withdrawals.reject': ['withdrawals.view'],
  'withdrawals.complete': ['withdrawals.view'],
  'checkouts.create': ['checkouts.view'],
  'checkouts.return': ['checkouts.view'],
  'reports.export': ['reports.view'],
  'users.create': ['users.view'],
  'users.update': ['users.view'],
  'users.deactivate': ['users.view'],
  'users.reset_password': ['users.view'],
  'roles.create': ['roles.view'],
  'roles.update': ['roles.view'],
  'roles.delete': ['roles.view'],
  'roles.manage_permissions': ['roles.view'],
  'settings.update': ['settings.view'],
};

const PermissionManagementModal = ({ isOpen, onClose, onSave, role, catalog = [], currentPermissions = [] }) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [initialIds, setInitialIds] = useState([]);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role && currentPermissions) {
      const ids = currentPermissions
        .map(p => (typeof p === 'object' && p !== null ? (p.permission_id || p.id) : p))
        .filter(Boolean);
      setSelectedIds(ids);
      setInitialIds(ids);
    }
  }, [role, currentPermissions]);

  // Group permissions by category
  const groupedCatalog = catalog.reduce((acc, item) => {
    const cat = item.category || ' General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const toggleCategoryCollapse = (cat) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handlePermissionToggle = (permission) => {
    const isCurrentlySelected = selectedIds.includes(permission.id);

    if (!isCurrentlySelected) {
      // ENABLING permission -> check for dependencies and enable required parent permissions
      const requiredCodes = PERMISSION_DEPENDENCIES[permission.code] || [];
      const requiredPermissionIds = catalog
        .filter(p => requiredCodes.includes(p.code))
        .map(p => p.id);

      const newIds = Array.from(new Set([...selectedIds, permission.id, ...requiredPermissionIds]));
      setSelectedIds(newIds);
    } else {
      // DISABLING permission -> if disabling parent view, check if child dependent permissions exist
      const childDependentCodes = Object.keys(PERMISSION_DEPENDENCIES).filter(childCode => 
        (PERMISSION_DEPENDENCIES[childCode] || []).includes(permission.code)
      );

      const activeChildIds = catalog
        .filter(p => childDependentCodes.includes(p.code) && selectedIds.includes(p.id))
        .map(p => p.id);

      if (activeChildIds.length > 0) {
        // Automatically uncheck active child permissions that depend on this parent
        const newIds = selectedIds.filter(id => id !== permission.id && !activeChildIds.includes(id));
        setSelectedIds(newIds);
      } else {
        setSelectedIds(selectedIds.filter(id => id !== permission.id));
      }
    }
  };

  const handleSelectAllCategory = (categoryItems) => {
    const catIds = categoryItems.map(p => p.id);
    const newIds = Array.from(new Set([...selectedIds, ...catIds]));
    setSelectedIds(newIds);
  };

  const handleClearAllCategory = (categoryItems) => {
    const catIds = categoryItems.map(p => p.id);
    setSelectedIds(selectedIds.filter(id => !catIds.includes(id)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await onSave(role.id, selectedIds);
      onClose();
    } catch (error) {
      console.error('Save Role Permissions Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const addedCount = selectedIds.filter(id => !initialIds.includes(id)).length;
  const removedCount = initialIds.filter(id => !selectedIds.includes(id)).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto neu-flat border-0">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <ShieldCheck className="w-6 h-6" />
            กำหนดสิทธิ์การใช้งาน (Permissions Configuration) — {role?.name} ({role?.code})
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            เปิด-ปิดสิทธิ์การใช้งานแต่ละส่วนสำหรับบทบาทนี้ ระบบจะจัดสรรสิทธิ์ตามเงื่อนไขความสัมพันธ์อัตโนมัติ
          </DialogDescription>
        </DialogHeader>

        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs">
          <div className="flex items-center gap-4">
            <span>สิทธิ์ที่เลือกทั้งหมด: <strong className="text-primary text-sm font-bold">{selectedIds.length}</strong> / {catalog.length} รายการ</span>
            {(addedCount > 0 || removedCount > 0) && (
              <span className="flex items-center gap-2 font-medium">
                {addedCount > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{addedCount} เพิ่มใหม่</span>}
                {removedCount > 0 && <span className="text-red-500">-{removedCount} ยกเลิก</span>}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(catalog.map(p => p.id))}
              className="text-xs h-7 px-2.5 neu-button"
            >
              เลือกทั้งหมดในระบบ
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="text-xs h-7 px-2.5 neu-button"
            >
              ล้างทั้งหมด
            </Button>
          </div>
        </div>

        {/* Permission Categories Accordion */}
        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {Object.keys(groupedCatalog).map((categoryName) => {
              const categoryItems = groupedCatalog[categoryName];
              const isCollapsed = collapsedCategories[categoryName];
              const selectedCategoryCount = categoryItems.filter(p => selectedIds.includes(p.id)).length;
              const isAllCategorySelected = selectedCategoryCount === categoryItems.length;

              return (
                <div key={categoryName} className="rounded-xl neu-flat-sm border border-white/20 overflow-hidden">
                  {/* Category Header */}
                  <div className="p-3 bg-black/5 dark:bg-white/5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapse(categoryName)}
                      className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span>{categoryName}</span>
                      <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {selectedCategoryCount} / {categoryItems.length}
                      </span>
                    </button>

                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => isAllCategorySelected ? handleClearAllCategory(categoryItems) : handleSelectAllCategory(categoryItems)}
                        className="text-primary hover:underline font-medium"
                      >
                        {isAllCategorySelected ? 'ยกเลิกทั้งกลุ่ม' : 'เลือกทั้งหมดในกลุ่ม'}
                      </button>
                    </div>
                  </div>

                  {/* Category Permissions List */}
                  {!isCollapsed && (
                    <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 bg-transparent">
                      {categoryItems.map((permission) => {
                        const isChecked = selectedIds.includes(permission.id);
                        return (
                          <label
                            key={permission.id}
                            className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                              isChecked
                                ? 'border-primary/50 bg-primary/10 font-medium'
                                : 'border-transparent neu-pressed-sm hover:bg-black/5'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handlePermissionToggle(permission)}
                              className="mt-0.5 rounded text-primary focus:ring-primary h-4 w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-semibold">{permission.name}</span>
                                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                                  {permission.code}
                                </code>
                              </div>
                              {permission.description && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                  {permission.description}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={loading} className="neu-primary">
              {loading ? 'กำลังบันทึก...' : `บันทึกการตั้งค่าสิทธิ์ (${selectedIds.length} สิทธิ์)`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionManagementModal;
