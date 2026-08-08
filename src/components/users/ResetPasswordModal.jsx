import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, RefreshCw, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { generateStrongPassword, validatePasswordPolicy } from '@/lib/passwordPolicy';
import toast from 'react-hot-toast';

const ResetPasswordModal = ({ isOpen, onClose, onResetPassword, user }) => {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetchingDefault, setFetchingDefault] = useState(false);

  const handleGenerateRandom = () => {
    const randPw = generateStrongPassword();
    setNewPassword(randPw);
    setShowPassword(true);
    toast.success('สุ่มรหัสผ่านปลอดภัยเรียบร้อยแล้ว');
  };

  const handleUseDefaultPassword = async () => {
    try {
      setFetchingDefault(true);
      const { data, error } = await supabase.rpc('admin_get_default_password_for_reset');
      if (error) throw error;

      if (data) {
        setNewPassword(data);
        setShowPassword(true);
        toast.success('โหลดรหัสผ่านเริ่มต้นระบบสำหรับรีเซ็ตเรียบร้อยแล้ว');
      } else {
        toast.error('ยังไม่ได้ตั้งค่ารหัสผ่านเริ่มต้นในระบบ สามารถสุ่มรหัสผ่านใหม่หรือตั้งค่าในหน้า /settings');
      }
    } catch (err) {
      console.error('Fetch default reset password error:', err);
      toast.error('เกิดข้อผิดพลาดในการโหลดรหัสผ่านเริ่มต้นระบบ');
    } finally {
      setFetchingDefault(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const policyCheck = validatePasswordPolicy(newPassword);
    if (!policyCheck.isValid) {
      toast.error(policyCheck.message);
      return;
    }

    try {
      setLoading(true);
      await onResetPassword(user.id, newPassword);
      setNewPassword('');
      onClose();
    } catch (error) {
      console.error('Reset password error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setNewPassword(''); onClose(); } }}>
      <DialogContent className="max-w-md neu-flat border-0">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <KeyRound className="w-5 h-5" />
            รีเซ็ตรหัสผ่าน (Reset Password)
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            กำหนดรหัสผ่านใหม่สำหรับผู้ใช้: <strong className="text-foreground">{user?.full_name}</strong> ({user?.email})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 space-y-3">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <Label htmlFor="new_password" className="text-sm font-medium">รหัสผ่านใหม่ *</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={fetchingDefault}
                  onClick={handleUseDefaultPassword}
                  className="text-[11px] text-purple-600 hover:text-purple-700 hover:underline flex items-center gap-1 h-7 px-2"
                >
                  <ShieldCheck className="w-3 h-3" />
                  {fetchingDefault ? 'กำลังดึง...' : 'ดึงรหัสผ่านเริ่มต้นระบบ'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateRandom}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 h-7 px-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  สุ่มรหัสผ่าน
                </Button>
              </div>
            </div>


            <div className="relative">
              <Input
                id="new_password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="ป้อนรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10 neu-pressed bg-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={loading} className="neu-primary">
              {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ResetPasswordModal;
