import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, ShieldCheck, Lock, Eye, EyeOff, Save, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { validatePasswordPolicy, generateStrongPassword } from '@/lib/passwordPolicy';
import toast from 'react-hot-toast';

const DefaultPasswordManager = ({ canUpdate }) => {
  const [status, setStatus] = useState({ configured: false, updated_at: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState({ isValid: false, message: '' });

  useEffect(() => {
    fetchConfigStatus();
  }, []);

  useEffect(() => {
    if (passwordInput) {
      setValidation(validatePasswordPolicy(passwordInput));
    } else {
      setValidation({ isValid: false, message: '' });
    }
  }, [passwordInput]);

  const fetchConfigStatus = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('admin_get_default_password_status');
      if (!error && data) {
        setStatus(data);
      } else {
        // Fallback check if RPC not executed in database yet
        const { data: dbSetting } = await supabase
          .from('system_settings')
          .select('updated_at')
          .eq('key', 'default_reset_password_config')
          .maybeSingle();

        if (dbSetting) {
          setStatus({ configured: true, updated_at: dbSetting.updated_at });
        }
      }
    } catch (e) {
      console.warn('Fetch password config status error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSetRandomPassword = () => {
    const strongPw = generateStrongPassword();
    setPasswordInput(strongPw);
    setShowPassword(true);
    toast.success('สุ่มรหัสผ่านปลอดภัยตรงตามนโยบายเรียบร้อยแล้ว');
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!canUpdate) {
      return toast.error('คุณไม่มีสิทธิ์ในการแก้ไขการตั้งค่า (Requires settings.update)');
    }

    const policyCheck = validatePasswordPolicy(passwordInput);
    if (!policyCheck.isValid) {
      return toast.error(policyCheck.message);
    }

    try {
      setSaving(true);
      const { data, error } = await supabase.rpc('admin_update_default_password', {
        p_password: passwordInput
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('บันทึกรหัสผ่านเริ่มต้นสำหรับการรีเซ็ตเรียบร้อยแล้ว');
        setStatus({ configured: true, updated_at: data.updated_at || new Date().toISOString() });
        setPasswordInput('');
        setShowPassword(false);
      }
    } catch (err) {
      console.error('Save default password error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการบันทึกรหัสผ่านเริ่มต้น');
    } finally {
      setSaving(false);
    }
  };

  // Password Policy Checklist Helpers
  const reqMinLen = passwordInput.length >= 12;
  const reqUpper = /[A-Z]/.test(passwordInput);
  const reqLower = /[a-z]/.test(passwordInput);
  const reqDigit = /[0-9]/.test(passwordInput);
  const reqSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(passwordInput);
  const reqNoSpace = passwordInput.length > 0 && passwordInput === passwordInput.trim();

  return (
    <div className="p-4 rounded-2xl neu-pressed bg-white/40 dark:bg-black/20 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/20 pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-foreground">
              รหัสผ่านเริ่มต้นสำหรับการรีเซ็ตรหัสผ่าน (Default Reset Password)
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Temporary password assigned when an administrator resets a user's password. รหัสผ่านที่ตั้งค่าจะถูกจัดเก็บอย่างปลอดภัยฝั่งเซิร์ฟเวอร์และไม่สามารถดูย้อนหลังได้
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {loading ? (
            <span className="text-[11px] text-muted-foreground animate-pulse">กำลังตรวจสอบ...</span>
          ) : status.configured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Configured (ตั้งค่าแล้ว)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30">
              <XCircle className="w-3.5 h-3.5" />
              Not Configured (ยังไม่ได้ตั้งค่า)
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSavePassword} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="default_reset_pw" className="text-xs font-semibold text-foreground">
                รหัสผ่านเริ่มต้นใหม่สำหรับการรีเซ็ต (New Default Reset Password) *
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSetRandomPassword}
                disabled={!canUpdate || saving}
                className="text-[11px] text-purple-600 hover:text-purple-700 dark:text-purple-400 hover:underline h-6 px-2 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                สุ่มรหัสผ่านปลอดภัย (Generate Secure Default)
              </Button>
            </div>


            <div className="relative">
              <Input
                id="default_reset_pw"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                disabled={!canUpdate || saving}
                placeholder={status.configured ? '•••••••••••• (ตั้งค่าไว้แล้ว - ระบุใหม่เมื่อต้องการเปลี่ยน)' : 'ระบุรหัสผ่านเริ่มต้นความยาวอย่างน้อย 12 ตัวอักษร'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
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

          <div>
            <Button
              type="submit"
              disabled={!canUpdate || saving || !passwordInput || !validation.isValid}
              className="w-full neu-primary flex items-center justify-center gap-2 text-xs font-semibold h-9"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านเริ่มต้น'}
            </Button>
          </div>
        </div>

        {/* Live Password Policy Checklist */}
        {passwordInput && (
          <div className="p-3 rounded-xl bg-background/60 border border-border/40 space-y-2 text-[11px]">
            <span className="font-bold text-foreground block">ตรวจสอบนโยบายความปลอดภัยรหัสผ่าน (Live Validation):</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              <span className={`flex items-center gap-1.5 ${reqMinLen ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}`}>
                {reqMinLen ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                ความยาวอย่างน้อย 12 ตัวอักษร
              </span>
              <span className={`flex items-center gap-1.5 ${reqUpper ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}`}>
                {reqUpper ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                ตัวพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว
              </span>
              <span className={`flex items-center gap-1.5 ${reqLower ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}`}>
                {reqLower ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                ตัวพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว
              </span>
              <span className={`flex items-center gap-1.5 ${reqDigit ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}`}>
                {reqDigit ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                ตัวเลข (0-9) อย่างน้อย 1 ตัว
              </span>
              <span className={`flex items-center gap-1.5 ${reqSymbol ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}`}>
                {reqSymbol ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                อักขระพิเศษ (!@#$%^&*) อย่างน้อย 1 ตัว
              </span>
              <span className={`flex items-center gap-1.5 ${reqNoSpace ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}`}>
                {reqNoSpace ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                ไม่มีช่องว่างนำหน้า/ต่อท้าย
              </span>
            </div>

            {validation.message && !validation.isValid && (
              <p className="text-red-500 font-medium text-[11px] pt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {validation.message}
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
};

export default DefaultPasswordManager;
