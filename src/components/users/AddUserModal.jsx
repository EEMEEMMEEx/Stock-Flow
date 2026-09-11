import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Shield, User, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import AvatarUpload from '@/components/users/AvatarUpload';
import { getRoleLabel } from '@/lib/roleUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';

const AddUserModal = ({ isOpen, onClose, onSave, projects = [], roles = [] }) => {
  const { isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('account'); // 'account' | 'access'
  const [loading, setLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const defaultRoles = [
    { code: 'STAFF', name: 'STAFF / REQUESTER', description: 'Withdraw items, view stock for assigned projects only' },
    { code: 'SUPERVISOR', name: 'SUPERVISOR / APPROVER', description: 'Approve withdrawal requests and view project-level reports' },
    { code: 'ADMIN', name: 'ADMINISTRATOR', description: 'Full permissions: approve withdrawals, manage projects and users' },
    { code: 'SUPER', name: 'SUPER ADMIN', description: 'System-level access: manage everything including admins, permissions, system settings, security, integrations' }
  ];

  const rawRoles = roles.length > 0 ? roles : defaultRoles;
  const availableRoles = rawRoles.filter(r => {
    const code = (r.code || '').toUpperCase();
    if (code === 'SUPER' && !isSuperAdmin) return false;
    return true;
  });

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    position: '',
    avatar_url: '',
    avatar_file: null,
    role: 'staff',
    status: 'active',
    access_type: 'all', // 'all' | 'selected'
    selected_projects: [],
    send_invitation: false
  });



  const handleProjectToggle = (projectId) => {
    setFormData(prev => {
      const exists = prev.selected_projects.includes(projectId);
      return {
        ...prev,
        selected_projects: exists
          ? prev.selected_projects.filter(id => id !== projectId)
          : [...prev.selected_projects, projectId]
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.full_name) {
      toast.error('Please fill in required fields (*)');
      return;
    }

    if (formData.access_type === 'selected' && formData.selected_projects.length === 0) {
      toast.error('Please select at least one project for selected projects access');
      return;
    }

    try {
      setLoading(true);
      const matchedRole = availableRoles.find(r => (r.code || '').toUpperCase() === (formData.role || '').toUpperCase()) || null;
      await onSave({
        email: formData.email.trim(),
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
        position: formData.position.trim() || null,
        avatar_url: formData.avatar_url || null,
        avatar_file: formData.avatar_file || null,
        role: formData.role,
        role_id: matchedRole?.id || null,
        status: formData.status,
        all_projects: formData.access_type === 'all',
        project_ids: formData.access_type === 'all' ? [] : formData.selected_projects,
        send_invitation: formData.send_invitation
      });
      resetForm();
      onClose();
    } catch (error) {

      console.error('Create User Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      phone: '',
      position: '',
      avatar_url: '',
      avatar_file: null,
      role: 'staff',
      status: 'active',
      access_type: 'all',
      selected_projects: [],
      send_invitation: false
    });
    setActiveTab('account');
    setProjectSearch('');
  };

  const filteredProjects = projects.filter(p => 
    (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) ||
    (p.project_code || '').toLowerCase().includes(projectSearch.toLowerCase())
  );


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card text-card-foreground rounded-xl border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            {t('users.addUser')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('users.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Tab Selector */}
        <div className="flex border-b border-border mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'account'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-4 h-4" />
            TAB 1 — Account Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('access')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'access'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="w-4 h-4" />
            TAB 2 — Roles & Access
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name" className="text-sm font-medium">Full Name *</Label>
                  <Input
                    id="full_name"
                    required
                    placeholder="e.g. John Doe"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-medium">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="example@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              </div>

              {/* Automatic Default Password Info Notice */}
              <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 text-foreground text-xs flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block text-sm mb-0.5">Default Temporary Password</strong>
                  The system will automatically assign default temporary password <code className="font-mono font-bold px-1.5 py-0.5 rounded bg-muted text-foreground border border-border">F0rth2026@dtrs</code>. Users must change their password on first login (First-Time Login — Password Change Required).
                </div>
              </div>


              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone" className="text-sm font-medium">Phone (Optional)</Label>
                  <Input
                    id="phone"
                    placeholder="081-234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>

                <div>
                  <Label htmlFor="position" className="text-sm font-medium">Position / Job Title (Optional)</Label>
                  <Input
                    id="position"
                    placeholder="e.g. Site Engineer / Storekeeper"
                    value={formData.position}
                    onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">Profile Avatar</Label>
                <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30"><label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={formData.send_invitation} onChange={(e) => setFormData(prev => ({ ...prev, send_invitation: e.target.checked }))} className="mt-1 rounded text-primary" /><span className="text-sm">Send invitation and account activation email<span className="block text-xs text-muted-foreground mt-1">Send email notification with first-time login link</span></span></label></div>
                <AvatarUpload
                  value={formData.avatar_url}
                  name={formData.full_name}
                  onChange={(file) => setFormData(prev => ({ ...prev, avatar_file: file }))}
                  onRemove={() => setFormData(prev => ({ ...prev, avatar_file: null, avatar_url: '' }))}
                />
              </div>

            </div>
          )}

          {activeTab === 'access' && (
            <div className="space-y-5">
              {/* Role Selection */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Assigned Role *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
                  {availableRoles.map((r) => {
                    const roleCode = (r.code || r.role || '').toLowerCase();
                    const isSelected = formData.role.toLowerCase() === roleCode;
                    return (
                      <div
                        key={r.id || r.code}
                        onClick={() => setFormData(prev => ({ ...prev, role: roleCode }))}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 shadow-xs'
                            : 'border-border bg-card hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm flex items-center gap-1.5">
                            <Shield className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            {getRoleLabel(r.code, r.name)}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                        </div>
                        {r.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>


              {/* Account Status */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Account Status *</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="active"
                      checked={formData.status === 'active'}
                      onChange={() => setFormData(prev => ({ ...prev, status: 'active' }))}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ACTIVE
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="inactive"
                      checked={formData.status === 'inactive'}
                      onChange={() => setFormData(prev => ({ ...prev, status: 'inactive' }))}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> INACTIVE
                    </span>
                  </label>
                </div>
              </div>

              {/* Project Authorization */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Project Access *</Label>
                <div className="space-y-3">
                  <label className={`flex items-center gap-2 text-sm cursor-pointer p-2.5 rounded-lg border transition-colors ${formData.access_type === 'all' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30'}`}>
                    <input
                      type="radio"
                      name="access_type"
                      value="all"
                      checked={formData.access_type === 'all'}
                      onChange={() => setFormData(prev => ({ ...prev, access_type: 'all' }))}
                      className="text-primary"
                    />
                    <div>
                      <span className="font-semibold text-sm">All Projects</span>
                      <p className="text-xs text-muted-foreground">User can view and operate stock in all projects in the system</p>
                    </div>
                  </label>

                  <label className={`flex items-center gap-2 text-sm cursor-pointer p-2.5 rounded-lg border transition-colors ${formData.access_type === 'selected' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30'}`}>
                    <input
                      type="radio"
                      name="access_type"
                      value="selected"
                      checked={formData.access_type === 'selected'}
                      onChange={() => setFormData(prev => ({ ...prev, access_type: 'selected' }))}
                      className="text-primary"
                    />
                    <div>
                      <span className="font-semibold text-sm">Selected Projects Only</span>
                      <p className="text-xs text-muted-foreground">Restrict access to only the projects checked below</p>
                    </div>
                  </label>
                </div>

                {/* Selected Projects List */}
                {formData.access_type === 'selected' && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border space-y-2">
                    <Input
                      placeholder="Search by project name or code..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="text-xs bg-background border border-input h-8 rounded-lg"
                    />

                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                      {filteredProjects.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2 text-center">No projects found</p>
                      ) : (
                        filteredProjects.map(p => {
                          const isChecked = formData.selected_projects.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                                isChecked ? 'bg-primary/10 font-semibold' : 'hover:bg-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleProjectToggle(p.id)}
                                  className="rounded text-primary focus:ring-primary"
                                />
                                <span>{p.name}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                                {p.project_code || 'N/A'}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground text-right">
                      Selected: {formData.selected_projects.length} {formData.selected_projects.length === 1 ? 'project' : 'projects'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-border flex justify-between items-center">
            {activeTab === 'account' ? (
              <Button type="button" variant="outline" onClick={() => setActiveTab('access')}>
                Next (TAB 2: Roles & Access) →
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setActiveTab('account')}>
                ← Back (TAB 1)
              </Button>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => { resetForm(); onClose(); }}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading} 
                className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs flex items-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Create User</span>
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserModal;
