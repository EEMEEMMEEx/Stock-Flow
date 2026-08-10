import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';
import toast from 'react-hot-toast';

const ForceChangePasswordModal = ({ isOpen, onPasswordChanged }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState({ isValid: false, message: '' });

  useEffect(() => {
    if (newPassword) {
      setValidation(validatePasswordPolicy(newPassword));
    } else {
      setValidation({ isValid: false, message: '' });
    }
  }, [newPassword]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      return toast.error('กรุณากรอกรหัสผ่านใหม่และยืนยันรหัสผ่าน');
    }

    if (newPassword !== confirmPassword) {
      return toast.error('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
    }

    const policyCheck = validatePasswordPolicy(newPassword);
    if (!policyCheck.isValid) {
      return toast.error(policyCheck.message);
    }

    try {
      setLoading(true);
      
      // 1. Update Auth User Password in Supabase GoTrue
      const { error: authErr } = await supabase.auth.updateUser({ password: newPassword });
      if (authErr) throw authErr;

      // 2. Clear must_change_password flag via RPC
      const { error: rpcErr } = await supabase.rpc('complete_force_password_change');
      if (rpcErr) {
        // Fallback direct profile update if RPC fails
        await supabase
          .from('profiles')
          .update({ must_change_password: false, updated_at: new Date().toISOString() })
          .eq('id', (await supabase.auth.getUser())?.data?.user?.id);
      }

      toast.success('เปลี่ยนรหัสผ่านสำเร็จ เริ่มต้นใช้งานระบบ StockFlow ได้ทันที');
      setNewPassword('');
      setConfirmPassword('');
      
      if (onPasswordChanged) {
        await onPasswordChanged();
      }
    } catch (err) {
      console.error('Force Change Password Error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-md neu-flat border-0 p-6 [&>button]:hidden" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            กำหนดรหัสผ่านใหม่ (First-Time Login)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            ระบบตรวจพบว่าบัญชีของคุณถูกสร้างขึ้นใหม่ด้วยรหัสผ่านเริ่มต้นระบบ กรุณากำหนดรหัสผ่านใหม่ของคุณเองเพื่อความปลอดภัยก่อนเริ่มต้นใช้งาน (Password Change Required)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="force_new_password" className="text-xs font-semibold text-foreground">
                รหัสผ่านใหม่ (New Password) *
              </Label>
              <div className="relative">
                <Input
                  id="force_new_password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="อย่างน้อย 12 ตัวอักษร (พิมพ์ใหญ่, เล็ก, ตัวเลข, สัญลักษณ์)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10 neu-pressed bg-transparent text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="force_confirm_password" className="text-xs font-semibold text-foreground">
                ยืนยันรหัสผ่านใหม่ (Confirm New Password) *
              </Label>
              <Input
                id="force_confirm_password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="ป้อนรหัสผ่านใหม่อีกครั้งให้ตรงกัน"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="neu-pressed bg-transparent text-xs"
              />
            </div>
          </div>

          {/* Policy Checklist */}
          {newPassword && (
            <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-[11px] space-y-1">
              <div className="font-semibold text-muted-foreground mb-1">ความแข็งแกร่งรหัสผ่าน:</div>
              <div className={`flex items-center gap-1.5 ${newPassword.length >= 12 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> ความยาวอย่างน้อย 12 ตัวอักษร
              </div>
              <div className={`flex items-center gap-1.5 ${/[A-Z]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> มีตัวอักษรพิมพ์ใหญ่ (A-Z)
              </div>
              <div className={`flex items-center gap-1.5 ${/[a-z]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> มีตัวอักษรพิมพ์เล็ก (a-z)
              </div>
              <div className={`flex items-center gap-1.5 ${/[0-9]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> มีตัวเลข (0-9)
              </div>
              <div className={`flex items-center gap-1.5 ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> มีสัญลักษณ์พิเศษ (!@#$%...)
              </div>
            </div>
          )}

          <Button 
            type="submit" 
            disabled={loading || !validation.isValid} 
            className="w-full neu-primary font-bold py-2.5 text-sm"
          >
            {loading ? 'กำลังบันทึกรหัสผ่าน...' : 'บันทึกรหัสผ่านใหม่และเริ่มต้นใช้งาน'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ForceChangePasswordModal;
