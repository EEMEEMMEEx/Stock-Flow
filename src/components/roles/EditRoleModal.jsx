import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Sparkles, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { BADGE_COLOR_PRESETS } from '@/config/badgePresets';

const EditRoleModal = ({ isOpen, onClose, onSave, role }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    badge_background: BADGE_COLOR_PRESETS[0].bg,
    badge_text_color: BADGE_COLOR_PRESETS[0].text,
  });

  useEffect(() => {
    if (role) {
      setFormData({
        name: role.name || '',
        description: role.description || '',
        badge_background: role.badge_background || BADGE_COLOR_PRESETS[0].bg,
        badge_text_color: role.badge_text_color || BADGE_COLOR_PRESETS[0].text,
      });
    }
  }, [role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('กรุณาระบุชื่อบทบาท');
      return;
    }

    try {
      setLoading(true);
      await onSave(role.id, {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        badge_background: formData.badge_background,
        badge_text_color: formData.badge_text_color,
      });
      onClose();
    } catch (error) {
      console.error('Update Role Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg rounded-xl bg-card text-card-foreground border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            แก้ไขบทบาท (Edit Role) — {role?.code}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            แก้ไขชื่อ คำอธิบาย และธีมสีป้ายสำหรับบทบาทนี้ (รหัสบทบาทเป็นค่าที่ไม่สามารถเปลี่ยนได้)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {role?.is_system && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>บทบาทของระบบ (System Role) — ป้องกันการลบหรือเปลี่ยนรหัสบทบาทเพื่อความเสถียรของระบบ</span>
            </div>
          )}
          <div>
            <Label className="text-sm font-medium">รหัสบทบาท (Role Code)</Label>
            <Input
              disabled
              value={role?.code || ''}
              className="mt-1 h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground font-mono opacity-80 cursor-not-allowed border border-input"
            />
          </div>

          <div>
            <Label htmlFor="edit_role_name" className="text-sm font-medium">ชื่อบทบาท (Role Name) *</Label>
            <Input
              id="edit_role_name"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          <div>
            <Label htmlFor="edit_role_desc" className="text-sm font-medium">คำอธิบายรายละเอียด</Label>
            <Input
              id="edit_role_desc"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="mt-1 h-9 text-xs rounded-lg bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          {/* Color Palette Selector & Live Badge Preview */}
          <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">เลือกธีมสีป้าย (Badge Theme)</Label>
              <div className="flex items-center gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>ตัวอย่างสด:</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${formData.badge_background} ${formData.badge_text_color}`}>
                  {formData.badge_background.includes('gradient') ? <Sparkles className="w-3 h-3 text-amber-500 shrink-0" /> : <Shield className="w-3 h-3 shrink-0" />}
                  {role?.code || 'ROLE'}
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
            <Button type="button" variant="ghost" onClick={onClose} className="h-9 px-4 rounded-lg text-xs">
              ยกเลิก
            </Button>
            <Button type="submit" disabled={loading} className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs cursor-pointer">
              {loading ? 'กำลังอัปเดต...' : 'บันทึกการแก้ไข'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditRoleModal;
