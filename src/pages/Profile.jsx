import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { 
  User, Mail, KeyRound, Save, Camera, 
  RefreshCw, CheckCircle2, Lock, FolderKanban, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadAvatarImage } from '@/lib/avatarUpload';
import RoleBadge from '@/components/ui/RoleBadge';
import { getRoleLabel } from '@/lib/roleUtils';

const Profile = () => {
  const { user, profile, refreshProfile, assignedProjectIds, allProjectsAccess } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Tab state: 'info' | 'password'
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    setActiveTab(requestedTab === 'password' ? 'password' : 'info');
  }, [searchParams]);

  // Form State
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    position: '',
  });

  const [initialData, setInitialData] = useState({
    full_name: '',
    email: '',
    phone: '',
    position: '',
  });

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // Projects list state
  const [projectsList, setProjectsList] = useState([]);

  // Saving states
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Form State
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      const data = {
        full_name: profile.full_name || '',
        email: profile.email || user?.email || '',
        phone: profile.phone || '',
        position: profile.position || '',
      };
      setFormData(data);
      setInitialData(data);
      setAvatarPreview(profile.avatar_url || '');
    }
    fetchProjects();
  }, [profile, user]);

  const fetchProjects = async () => {
    try {
      const { data } = await supabase.from('projects').select('id, name, project_code').eq('status', 'active');
      setProjectsList(data || []);
    } catch (e) {
      console.warn('[Profile] Failed to fetch active projects:', e);
    }
  };

  // Check if form is dirty (changed)
  const isFormDirty =
    formData.full_name.trim() !== initialData.full_name.trim() ||
    formData.email.trim().toLowerCase() !== initialData.email.trim().toLowerCase() ||
    formData.phone.trim() !== initialData.phone.trim() ||
    formData.position.trim() !== initialData.position.trim() ||
    avatarFile !== null;

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // Handle Avatar Image File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return toast.error('Only JPG, PNG, or WebP images are supported');
    }

    // Validate size (3MB)
    if (file.size > 3 * 1024 * 1024) {
      return toast.error('Image file size must not exceed 3MB');
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  };

  // Handle Profile Update Submission
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user || !user.id || savingProfile || uploadingAvatar) return;

    const trimmedName = formData.full_name.trim();
    if (!trimmedName) {
      return toast.error('Please enter your full name');
    }

    try {
      setSavingProfile(true);
      let updatedAvatarUrl = profile?.avatar_url || null;

      // 1. Upload Avatar Image if newly selected
      if (avatarFile) {
        setUploadingAvatar(true);
        const uploadedUrl = await uploadAvatarImage(user.id, avatarFile);
        if (uploadedUrl) {
          updatedAvatarUrl = uploadedUrl;
        }
        setUploadingAvatar(false);
      }

      // 2. Explicitly Whitelisted Self-Update Payload (Security Enforcement)
      const updatePayload = {
        full_name: trimmedName,
        phone: formData.phone.trim(),
        position: formData.position.trim(),
        avatar_url: updatedAvatarUrl,
        updated_at: new Date().toISOString(),
      };

      // 3. Compare edited email with current Supabase Auth email (case-insensitive & trimmed)
      const currentAuthEmail = (user?.email || '').trim().toLowerCase();
      const editedEmail = formData.email.trim().toLowerCase();
      const isEmailChanged = editedEmail !== '' && editedEmail !== currentAuthEmail;
      let emailNotice = null;

      if (isEmailChanged) {
        const { data: authData, error: emailAuthErr } = await supabase.auth.updateUser({ email: editedEmail });
        
        if (emailAuthErr) {
          console.warn('[Profile Email Update Warning]:', emailAuthErr);
          
          if (emailAuthErr.status === 429 || emailAuthErr.message?.includes('42 seconds') || emailAuthErr.message?.includes('security purposes')) {
            const secMatch = emailAuthErr.message?.match(/after (\d+) seconds/i);
            const waitSec = secMatch ? secMatch[1] : '42';
            toast.error(`Please wait approximately ${waitSec} seconds before trying to change your email again`);
          } else {
            toast.error(`Failed to update email: ${emailAuthErr.message}`);
          }
        } else {
          // Check if email confirmation flow is pending or updated immediately
          const pendingEmail = authData?.user?.new_email;
          if (pendingEmail) {
            emailNotice = `Confirmation link sent to ${editedEmail}. Please check your inbox`;
          } else {
            updatePayload.email = editedEmail;
          }
        }
      }

      // 4. Update profiles table for auth.uid() = id
      const { error: profileErr } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (profileErr) throw profileErr;

      // 5. Sync AuthContext to refresh Topbar, Sidebar, & Profile state without page reload
      await refreshProfile();

      const newSavedEmail = isEmailChanged && updatePayload.email ? editedEmail : (formData.email.trim() || user?.email || '');

      setInitialData({
        full_name: trimmedName,
        email: newSavedEmail,
        phone: formData.phone.trim(),
        position: formData.position.trim(),
      });
      setFormData(prev => ({ ...prev, email: newSavedEmail }));
      setAvatarFile(null);

      if (emailNotice) {
        toast.success(emailNotice, { duration: 6000 });
      } else {
        toast.success('Profile updated successfully');
      }
    } catch (err) {
      console.error('Save Profile Error:', err);
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Password Update Submission
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.newPassword) {
      return toast.error('Please enter a new password');
    }
    if (passwordForm.newPassword.length < 6) {
      return toast.error('New password must be at least 6 characters');
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error('New password and confirmation do not match');
    }

    try {
      setUpdatingPassword(true);
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (error) throw error;

      setPasswordForm({ newPassword: '', confirmPassword: '' });
      toast.success('Password changed successfully');
    } catch (err) {
      console.error('Update Password Error:', err);
      toast.error(err.message || 'Failed to change password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Resolve assigned project names
  const assignedProjects = allProjectsAccess
    ? 'All Projects Access'
    : assignedProjectIds && assignedProjectIds.length > 0
    ? projectsList
        .filter((p) => assignedProjectIds.includes(p.id))
        .map((p) => p.name)
        .join(', ') || 'No assigned projects'
    : 'No assigned projects';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <User className="w-7 h-7 text-primary" />
            Personal Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage personal information, profile photo, and account security
          </p>
        </div>
      </div>

      {/* 1. User Identity Header Card */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar Container with Upload Overlay */}
            <div className="relative group shrink-0">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={formData.full_name}
                  className="w-24 h-24 rounded-full object-cover shadow-xs border border-border"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '';
                  }}
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-2xl shadow-xs">
                  {getInitials(formData.full_name)}
                </div>
              )}

              {/* Upload Trigger Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Change profile photo"
                className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-transform active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* User Meta Info */}
            <div className="flex-1 text-center sm:text-left space-y-2 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap justify-center sm:justify-start">
                <h2 className="text-xl font-bold text-foreground">
                  {formData.full_name || 'StockFlow User'}
                </h2>
                {formData.position && (
                  <span className="inline-block text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full font-mono">
                    {formData.position}
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-2">
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate">{user?.email || formData.email}</span>
              </div>

              {/* Read-Only Badges */}
              <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                <RoleBadge 
                  role={profile?.roles?.code || profile?.role || 'STAFF'} 
                  roleName={profile?.roles?.name} 
                  roleObj={profile?.roles} 
                />

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ACTIVE ACCOUNT
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`px-3.5 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'info'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <User className="w-4 h-4" />
          Personal Info
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('password')}
          className={`px-3.5 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'password'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          Change Password
        </button>
      </div>

      {/* TAB 1: Personal Info Form */}
      {activeTab === 'info' && (
        <form onSubmit={handleSaveProfile}>
          <Card className="rounded-xl bg-card border border-border shadow-xs">
            <CardContent className="p-6 space-y-6">
              <div className="font-bold text-sm text-foreground flex items-center gap-2 pb-2 border-b border-border">
                <Sparkles className="w-4 h-4 text-primary" />
                Edit Personal Info
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-xs font-semibold text-foreground">
                    Full Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="full_name"
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="name@company.com"
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold text-foreground">
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. 0812345678"
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                {/* Position / Job Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="position" className="text-xs font-semibold text-foreground">
                    Position / Job Title
                  </Label>
                  <Input
                    id="position"
                    type="text"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="e.g. Project Engineer / Inventory Officer"
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              </div>

              {/* READ-ONLY System Controlled Fields */}
              <div className="pt-4 border-t border-border space-y-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Read-Only Identity Fields
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Read-Only Username */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Username / Login ID
                    </Label>
                    <Input
                      type="text"
                      disabled
                      value={user?.email || formData.email}
                      className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground cursor-not-allowed border-dashed border border-input"
                    />
                    <p className="text-[11px] text-muted-foreground italic">
                      System username cannot be edited
                    </p>
                  </div>

                  {/* Read-Only Role */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      System Role
                    </Label>
                    <Input
                      type="text"
                      disabled
                      value={getRoleLabel(profile?.roles?.code || profile?.role || 'STAFF', profile?.roles?.name)}
                      className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground cursor-not-allowed border-dashed border border-input font-bold"
                    />
                    <p className="text-[11px] text-muted-foreground italic">
                      Role assigned by administrator (Admin-Controlled)
                    </p>
                  </div>
                </div>

                {/* Read-Only Projects Access */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5" /> Assigned Projects
                  </Label>
                  <div className="p-3 rounded-lg bg-muted/30 text-xs text-foreground font-medium border border-border/50">
                    {assignedProjects}
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={!isFormDirty || savingProfile || uploadingAvatar}
                  className="h-9 px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingProfile || uploadingAvatar ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Profile
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {/* TAB 2: Change Password Form */}
      {activeTab === 'password' && (
        <form onSubmit={handleUpdatePassword}>
          <Card className="rounded-xl bg-card border border-border shadow-xs">
            <CardContent className="p-6 space-y-6">
              <div className="font-bold text-sm text-foreground flex items-center gap-2 pb-2 border-b border-border">
                <Lock className="w-4 h-4 text-primary" />
                Change Login Password
              </div>

              <div className="max-w-md space-y-4">
                {/* New Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-xs font-semibold text-foreground">
                    New Password <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="At least 6 characters"
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground">
                    Confirm New Password <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter new password"
                    className="h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              </div>

              {/* Password Action Button */}
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={updatingPassword || !passwordForm.newPassword}
                  className="h-9 px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {updatingPassword ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Updating password...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Update Password
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
};

export default Profile;
