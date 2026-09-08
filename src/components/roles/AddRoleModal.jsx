import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Sparkles, Check, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { BADGE_COLOR_PRESETS } from '@/config/badgePresets';

const AddRoleModal = ({ isOpen, onClose, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    badge_background: BADGE_COLOR_PRESETS[0].bg,
    badge_text_color: BADGE_COLOR_PRESETS[0].text,
  });

  const handleCodeChange = (e) => {
    // Normalize to uppercase and allow only A-Z, 0-9, _
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    setFormData(prev => ({ ...prev, code: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      toast.error('Please enter Role Code and Role Name');
      return;
    }

    try {
      setLoading(true);
      await onSave({
        code: formData.code.trim(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        badge_background: formData.badge_background,
        badge_text_color: formData.badge_text_color,
      });
      resetForm();
      onClose();
    } catch (error) {
      console.error('Create Role Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      badge_background: BADGE_COLOR_PRESETS[0].bg,
      badge_text_color: BADGE_COLOR_PRESETS[0].text,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-lg rounded-xl bg-card text-card-foreground border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Add Custom Role
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Create a new role in the system to configure RBAC permissions for users
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="role_code" className="text-sm font-medium">Role Code *</Label>
            <Input
              id="role_code"
              required
              placeholder="e.g. WAREHOUSE_MANAGER, SITE_ENGINEER"
              value={formData.code}
              onChange={handleCodeChange}
              className="mt-1 h-9 text-xs rounded-lg bg-background border border-input font-mono uppercase focus-visible:ring-1 focus-visible:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              * Must contain uppercase letters, numbers, and underscore <code className="bg-muted px-1 rounded">_</code> only (no spaces)
            </p>
          </div>

          <div>
            <Label htmlFor="role_name" className="text-sm font-medium">Role Name *</Label>
            <Input
              id="role_name"
              required
              placeholder="e.g. Warehouse Manager, Site Engineer"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          <div>
            <Label htmlFor="role_desc" className="text-sm font-medium">Description</Label>
            <Input
              id="role_desc"
              placeholder="Describe the scope of work and responsibilities for this role"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          {/* Color Palette Selector & Live Badge Preview */}
          <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Badge Theme</Label>
              <div className="flex items-center gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Live Preview:</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${formData.badge_background} ${formData.badge_text_color}`}>
                  {formData.badge_background.includes('gradient') ? <Sparkles className="w-3 h-3 text-amber-500 shrink-0" /> : <Shield className="w-3 h-3 shrink-0" />}
                  {formData.code || 'ROLE_CODE'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {BADGE_COLOR_PRESETS.map((preset) => {
                const isSelected = formData.badge_background === preset.bg;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      badge_background: preset.bg,
                      badge_text_color: preset.text
                    }))}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${preset.bg} ${preset.text} ${
                      isSelected ? 'ring-2 ring-primary ring-offset-2 scale-105 shadow-xs' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => { resetForm(); onClose(); }} className="h-9 px-4 rounded-lg text-xs">
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading} 
              className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Create Role</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddRoleModal;
