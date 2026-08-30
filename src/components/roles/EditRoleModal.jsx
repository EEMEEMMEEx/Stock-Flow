import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Sparkles, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

const BADGE_COLOR_PRESETS = [
  { name: 'Purple', bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300' },
  { name: 'Blue', bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300' },
  { name: 'Emerald', bg: 'bg-emerald-100 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300' },
  { name: 'Amber', bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300' },
  { name: 'Rose', bg: 'bg-rose-100 dark:bg-rose-950', text: 'text-rose-700 dark:text-rose-300' },
  { name: 'Indigo', bg: 'bg-indigo-100 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300' },
  { name: 'Slate', bg: 'bg-slate-200 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300' },
];

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
      <DialogContent className="max-w-lg neu-flat border-0">
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
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-900 dark:text-purple-200 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>บทบาทของระบบ (System Role) — ป้องกันการลบหรือเปลี่ยนรหัสบทบาทเพื่อความเสถียรของระบบ</span>
            </div>
          )}
          <div>
            <Label className="text-sm font-medium">รหัสบทบาท (Role Code)</Label>
            <Input
              disabled
              value={role?.code || ''}
              className="mt-1 neu-pressed bg-muted/50 text-muted-foreground font-mono opacity-80 cursor-not-allowed"
            />
          </div>

          <div>
            <Label htmlFor="edit_role_name" className="text-sm font-medium">ชื่อบทบาท (Role Name) *</Label>
            <Input
              id="edit_role_name"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 neu-pressed bg-transparent"
            />
          </div>

          <div>
            <Label htmlFor="edit_role_desc" className="text-sm font-medium">คำอธิบายรายละเอียด</Label>
            <Input
              id="edit_role_desc"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="mt-1 neu-pressed bg-transparent text-xs"
            />
          </div>

          {/* Color Palette Selector & Live Badge Preview */}
          <div className="p-4 rounded-xl neu-pressed-sm space-y-3 bg-white/40 dark:bg-black/20">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">เลือกธีมสีป้าย (Badge Theme)</Label>
              <div className="flex items-center gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>ตัวอย่างสด:</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${formData.badge_background} ${formData.badge_text_color}`}>
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
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${preset.bg} ${preset.text} ${
                      isSelected ? 'ring-2 ring-primary ring-offset-2 scale-105 shadow-md' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={loading} className="neu-primary">
              {loading ? 'กำลังอัปเดต...' : 'บันทึกการแก้ไข'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditRoleModal;
