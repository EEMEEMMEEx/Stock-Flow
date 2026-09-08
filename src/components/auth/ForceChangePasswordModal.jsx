import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
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
      return toast.error('Please enter and confirm your new password');
    }

    if (newPassword !== confirmPassword) {
      return toast.error('New password and confirmation do not match');
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

      toast.success('Password changed successfully. Welcome to StockFlow!');
      setNewPassword('');
      setConfirmPassword('');
      
      if (onPasswordChanged) {
        await onPasswordChanged();
      }
    } catch (err) {
      console.error('Force Change Password Error:', err);
      toast.error(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-md rounded-xl bg-card text-card-foreground border border-border shadow-xl p-6 [&>button]:hidden" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            Set New Password (First-Time Login)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Your account was created with a temporary default password. Please set a secure password before proceeding.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="force_new_password" className="text-xs font-semibold text-foreground">
                New Password *
              </Label>
              <div className="relative">
                <Input
                  id="force_new_password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="At least 12 characters (uppercase, lowercase, numbers, symbols)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="force_confirm_password" className="text-xs font-semibold text-foreground">
                Confirm New Password *
              </Label>
              <Input
                id="force_confirm_password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
          </div>

          {/* Policy Checklist */}
          {newPassword && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] space-y-1">
              <div className="font-semibold text-muted-foreground mb-1">Password Requirements:</div>
              <div className={`flex items-center gap-1.5 ${newPassword.length >= 12 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> At least 12 characters
              </div>
              <div className={`flex items-center gap-1.5 ${/[A-Z]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Contains uppercase letter (A-Z)
              </div>
              <div className={`flex items-center gap-1.5 ${/[a-z]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Contains lowercase letter (a-z)
              </div>
              <div className={`flex items-center gap-1.5 ${/[0-9]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Contains number (0-9)
              </div>
              <div className={`flex items-center gap-1.5 ${/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Contains special character (!@#$%...)
              </div>
            </div>
          )}

          <Button 
            type="submit" 
            disabled={loading || !validation.isValid} 
            className="w-full h-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Saving password...' : 'Save Password & Get Started'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ForceChangePasswordModal;
