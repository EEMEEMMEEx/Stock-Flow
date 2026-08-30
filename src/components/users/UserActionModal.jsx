import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  AlertTriangle,
  UserX,
  UserCheck,
  Trash2,
  Shield,
  ShieldAlert,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Mail,
  Briefcase,
  Lock,
  User,
} from 'lucide-react';
import RoleBadge from '@/components/ui/RoleBadge';
import toast from 'react-hot-toast';

const UserActionModal = ({
  isOpen,
  onClose,
  user,
  allUsers = [],
  onToggleStatus,
  onDeletePermanent,
}) => {
  const { can } = useAuth();
  
  // RBAC Permission checks
  const canSuspend = can('users.deactivate') || can('users.suspend');
  const canDelete = can('users.delete');

  // Step state: 1 = Action overview, 2 = Delete confirmation
  const [step, setStep] = useState(1);
  const [confirmInput, setConfirmInput] = useState('');
  
  // Integrity check state
  const [checkingIntegrity, setCheckingIntegrity] = useState(true);
  const [integrityBlock, setIntegrityBlock] = useState({ isBlocked: false, reason: '' });

  // Action pending states
  const [isSuspending, setIsSuspending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setStep(1);
      setConfirmInput('');
      runIntegrityCheck();
    }
  }, [isOpen, user]);

  // Perform database integrity check before allowing hard delete
  const runIntegrityCheck = async () => {
    if (!user) return;
    setCheckingIntegrity(true);
    setIntegrityBlock({ isBlocked: false, reason: '' });

    try {
      // 1. Check if user is active admin and is the last admin
      const isTargetAdmin = (user.role === 'admin' || user.role === 'ADMIN');
      if (isTargetAdmin && user.status === 'active') {
        const activeAdmins = allUsers.filter(
          (u) => (u.role === 'admin' || u.role === 'ADMIN') && u.status === 'active'
        );
        if (activeAdmins.length <= 1) {
          setIntegrityBlock({
            isBlocked: true,
            reason: 'ไม่สามารถลบหรือปิดใช้งานบัญชี Administrator คนสุดท้ายของระบบได้',
          });
          setCheckingIntegrity(false);
          return;
        }
      }

      // 2. Check historical transactions (stock_transactions)
      const { count: txCount, error: txErr } = await supabase
        .from('stock_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id);

      if (!txErr && txCount && txCount > 0) {
        setIntegrityBlock({
          isBlocked: true,
          reason: `พบบันทึกธุรกรรมสต็อกย้อนหลังจำนวน ${txCount} รายการที่เชื่อมโยงกับผู้ใช้นี้`,
        });
        setCheckingIntegrity(false);
        return;
      }

      // 3. Check withdrawal requests & approvals
      const { count: withdrawalCount, error: wdErr } = await supabase
        .from('withdrawal_orders')
        .select('id', { count: 'exact', head: true })
        .or(`requested_by.eq.${user.id},approved_by.eq.${user.id},rejected_by.eq.${user.id}`);

      if (!wdErr && withdrawalCount && withdrawalCount > 0) {
        setIntegrityBlock({
          isBlocked: true,
          reason: `พบบันทึกการเบิกสินค้าในระบบจำนวน ${withdrawalCount} รายการที่เชื่อมโยงกับผู้ใช้นี้`,
        });
        setCheckingIntegrity(false);
        return;
      }

      // 4. Check stock in orders
      const { count: stockInCount, error: siErr } = await supabase
        .from('stock_in_orders')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id);

      if (!siErr && stockInCount && stockInCount > 0) {
        setIntegrityBlock({
          isBlocked: true,
          reason: `พบบันทึกการรับเข้าสต็อกจำนวน ${stockInCount} รายการที่เชื่อมโยงกับผู้ใช้นี้`,
        });
        setCheckingIntegrity(false);
        return;
      }
    } catch (err) {
      console.warn('Integrity check query error:', err);
    } finally {
      setCheckingIntegrity(false);
    }
  };

  if (!user) return null;

  const isActive = user.status === 'active';
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // Input confirmation validation: exact match for email or "DELETE"
  const expectedConfirmText = user.email || 'DELETE';
  const isConfirmMatched =
    confirmInput.trim() === expectedConfirmText ||
    confirmInput.trim().toUpperCase() === 'DELETE';

  // Handle Suspend/Reactivate toggle
  const handleSuspendAction = async () => {
    try {
      setIsSuspending(true);
      await onToggleStatus(user);
      onClose();
    } catch (err) {
      console.error('Suspend Action Error:', err);
    } finally {
      setIsSuspending(false);
    }
  };

  // Handle final Permanent Delete execution
  const handleDeleteAction = async () => {
    if (!isConfirmMatched) return;
    try {
      setIsDeleting(true);
      await onDeletePermanent(user);
      onClose();
    } catch (err) {
      console.error('Delete Action Error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg neu-flat border-0 p-0 overflow-hidden sm:rounded-2xl">
        {/* Modal Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40 bg-muted/20">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2.5 text-foreground">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
              จัดการสิทธิ์และบัญชีผู้ใช้งาน (User Security Action)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {step === 1
                ? 'เลือกระดับการดำเนินการเพื่อความปลอดภัยของข้อมูลระบบ'
                : 'กรุณายืนยันการลบบัญชีผู้ใช้ถาวร (ถอนการติดตั้งบัญชีออกจากระบบ)'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* 1. Compact User Identity Card */}
          <div className="p-4 rounded-xl neu-pressed bg-background/60 border border-border/40 flex items-start gap-4">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="w-12 h-12 rounded-full object-cover shadow-sm border border-white/40 shrink-0"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '';
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-white font-bold text-base shadow-md shrink-0">
                {getInitials(user.full_name)}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-sm truncate">
                  {user.full_name}
                </span>
                {user.position && (
                  <span className="text-[11px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {user.position}
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                <span className="truncate">{user.email}</span>
              </div>

              <div className="flex items-center gap-2 mt-2">
                {/* Role Badge */}
                <RoleBadge 
                  role={user.roles?.code || user.role} 
                  roleName={user.roles?.name}
                  roleObj={user.roles}
                  size="sm"
                />

                {/* Status Badge */}
                {isActive ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ACTIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> SUSPENDED
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* STEP 1: Main Action Options */}
          {step === 1 && (
            <>
              {/* 2. Reversible Action: Suspend / Reactivate */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                    {isActive ? (
                      <UserX className="w-5 h-5" />
                    ) : (
                      <UserCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                      {isActive
                        ? 'ระงับการใช้งานบัญชี (Suspend Access)'
                        : 'คืนสิทธิ์การใช้งานบัญชี (Reactivate Account)'}
                    </h4>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 leading-relaxed">
                      {isActive
                        ? 'ระงับสิทธิ์การเข้าสู่ระบบชั่วคราว ข้อมูลประวัติการเบิก-รับสินค้าย้อนหลังทั้งหมดจะยังคงอยู่และถูกรักษาไว้อย่างปลอดภัย สามารถเปิดใช้งานใหม่ได้ตลอดเวลา'
                        : 'เปิดให้บัญชีนี้สามารถเข้าสู่ระบบและทำรายการในคลังสินค้าได้ตามปกติ'}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    onClick={handleSuspendAction}
                    disabled={!canSuspend || isSuspending}
                    className={`min-h-[44px] px-4 rounded-xl font-semibold text-xs transition-all w-full sm:w-auto ${
                      isActive
                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                    }`}
                  >
                    {isSuspending ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        กำลังดำเนินการ...
                      </span>
                    ) : isActive ? (
                      <span className="flex items-center gap-2">
                        <UserX className="w-4 h-4" />
                        ระงับการใช้งาน (Suspend)
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        เปิดใช้งานอีกครั้ง (Reactivate)
                      </span>
                    )}
                  </Button>
                </div>
              </div>

              {/* 3. Danger Zone: Permanent Delete */}
              <div className="p-4 rounded-xl bg-red-500/5 dark:bg-red-950/20 border border-red-500/30 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-red-500/20 text-red-600 dark:text-red-400 shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-red-700 dark:text-red-300">
                      พื้นที่อันตราย (Danger Zone — Permanent Delete)
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      การลบบัญชีเป็นกระบวนการถาวรที่ไม่สามารถกู้คืนได้ บัญชี Auth และโปรไฟล์จะถูกลบออกจากฐานข้อมูล
                    </p>
                  </div>
                </div>

                {/* Audit Integrity Check Status */}
                {checkingIntegrity ? (
                  <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    กำลังตรวจสอบประวัติธุรกรรมและความถูกต้องของข้อมูล...
                  </div>
                ) : integrityBlock.isBlocked ? (
                  /* Blocked Notice */
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-xs space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                      ไม่อนุญาตให้ลบบัญชีนี้แบบถาวร (Hard Delete Blocked)
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {integrityBlock.reason} เพื่อรักษาความถูกต้องของข้อมูล audit log และประวัติคลังสินค้า แนะนำให้ใช้การ <strong className="underline">&quot;ระงับการใช้งาน (Suspend)&quot;</strong> แทน
                    </p>
                  </div>
                ) : (
                  /* Delete Permitted Button */
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={!canDelete}
                      variant="outline"
                      className="min-h-[44px] px-4 rounded-xl font-semibold text-xs border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:hover:bg-red-950/40 w-full sm:w-auto"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      เริ่มขั้นตอนลบบัญชีถาวร...
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* STEP 2: Two-Step Delete Confirmation */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40 space-y-2">
                <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400" />
                  คำเตือน: การดำเนินการนี้ไม่สามารถยกเลิกได้
                </div>
                <p className="text-xs text-red-800/90 dark:text-red-200/90 leading-relaxed">
                  คุณกำลังจะลบบัญชีผู้ใช้ <strong>{user.full_name}</strong> ออกจากระบบอย่างสมบูรณ์
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground block">
                  กรุณาพิมพ์ <code className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-mono px-1.5 py-0.5 rounded border border-red-300 dark:border-red-800">{user.email}</code> หรือคำว่า <code className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-mono px-1.5 py-0.5 rounded border border-red-300 dark:border-red-800">DELETE</code> เพื่อยืนยัน:
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder={`พิมพ์ ${user.email} หรือ DELETE`}
                    className={`min-h-[44px] text-sm pr-9 neu-pressed ${
                      confirmInput.length > 0
                        ? isConfirmMatched
                          ? 'border-emerald-500 ring-1 ring-emerald-500'
                          : 'border-red-500 ring-1 ring-red-500'
                        : ''
                    }`}
                    autoFocus
                  />
                  {isConfirmMatched && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-muted/20 border-t border-border/40 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          {step === 2 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={isDeleting}
                className="min-h-[44px] text-xs font-semibold"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                ย้อนกลับ
              </Button>

              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteAction}
                disabled={!isConfirmMatched || isDeleting}
                className="min-h-[44px] px-5 rounded-xl font-semibold text-xs shadow-md bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    กำลังลบบัญชี...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    ยืนยันลบบัญชีถาวร
                  </span>
                )}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="min-h-[44px] text-xs font-semibold ml-auto w-full sm:w-auto"
            >
              ปิดหน้าต่าง (Cancel)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserActionModal;
