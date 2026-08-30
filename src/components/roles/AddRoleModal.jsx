import React, { useState } from 'react';
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
      toast.error('กรุณาระบุรหัสบทบาท (Role Code) และชื่อบทบาท (Role Name)');
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
      <DialogContent className="max-w-lg neu-flat border-0">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            + เพิ่มบทบาทใหม่ (Add Custom Role)
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            สร้างบทบาทใหม่ในระบบเพื่อกำหนดชุดสิทธิ์การใช้งาน (RBAC) ให้แก่ผู้ใช้งาน
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="role_code" className="text-sm font-medium">รหัสบทบาท (Role Code) *</Label>
            <Input
              id="role_code"
              required
              placeholder="เช่น WAREHOUSE_MANAGER, SITE_ENGINEER"
              value={formData.code}
              onChange={handleCodeChange}
              className="mt-1 neu-pressed bg-transparent font-mono uppercase"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              * ต้องเป็นตัวอักษรภาษาอังกฤษตัวพิมพ์ใหญ่ ตัวเลข และตัวอักขระพิเศษ <code className="bg-muted px-1 rounded">_</code> เท่านั้น (ห้ามมีเว้นวรรค)
            </p>
          </div>

          <div>
            <Label htmlFor="role_name" className="text-sm font-medium">ชื่อบทบาท (Role Name) *</Label>
            <Input
              id="role_name"
              required
              placeholder="เช่น ผู้จัดการคลังสินค้า, วิศวกรคุมงาน"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 neu-pressed bg-transparent"
            />
          </div>

          <div>
            <Label htmlFor="role_desc" className="text-sm font-medium">คำอธิบายรายละเอียด (Description)</Label>
            <Input
              id="role_desc"
              placeholder="อธิบายขอบเขตงานและความรับผิดชอบของบทบาทนี้"
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
            <Button type="button" variant="ghost" onClick={() => { resetForm(); onClose(); }}>
              ยกเลิก
            </Button>
            <Button 
              type="submit" 
              disabled={loading} 
              className="neu-primary h-10 px-5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>บันทึกสร้างบทบาท</span>
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
