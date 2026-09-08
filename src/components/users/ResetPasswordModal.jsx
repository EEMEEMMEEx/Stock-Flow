import { useState } from 'react';
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
    toast.success('Generated strong password successfully');
  };

  const handleUseDefaultPassword = async () => {
    try {
      setFetchingDefault(true);
      const { data, error } = await supabase.rpc('admin_get_default_password_for_reset');
      if (error) throw error;

      if (data) {
        setNewPassword(data);
        setShowPassword(true);
        toast.success('Default reset password loaded successfully');
      } else {
        toast.error('Default reset password is not configured. Generate a password or configure it in /settings');
      }
    } catch (err) {
      console.error('Fetch default reset password error:', err);
      toast.error('Failed to load default reset password');
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
      <DialogContent className="max-w-md bg-card text-card-foreground rounded-xl border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <KeyRound className="w-5 h-5" />
            Reset Password
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Set a new password for user: <strong className="text-foreground">{user?.full_name}</strong> ({user?.email})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <Label htmlFor="new_password" className="text-sm font-medium">New Password *</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={fetchingDefault}
                  onClick={handleUseDefaultPassword}
                  className="text-[11px] text-purple-600 hover:text-purple-700 hover:underline flex items-center gap-1 h-7 px-2 cursor-pointer"
                >
                  <ShieldCheck className="w-3 h-3" />
                  {fetchingDefault ? 'Fetching...' : 'Use Default Password'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateRandom}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 h-7 px-2 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Generate Password
                </Button>
              </div>
            </div>


            <div className="relative">
              <Input
                id="new_password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Enter new password (at least 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10 h-9 text-xs rounded-lg bg-background border border-input"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="h-9 px-3 rounded-lg text-xs cursor-pointer">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs cursor-pointer shadow-xs">
              {loading ? 'Saving...' : 'Save New Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ResetPasswordModal;
