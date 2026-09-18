import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  PenTool, RotateCcw, Save, CheckCircle2, AlertTriangle, 
  Trash2, ShieldCheck, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { uploadFileToR2 } from '@/lib/r2Storage';
import { useTranslation } from '@/i18n';

const SignatureCanvas = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useTranslation();

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSignature, setSavedSignature] = useState(profile?.signature_url || null);
  const [lastPoint, setLastPoint] = useState(null);

  // Sync savedSignature with profile changes
  useEffect(() => {
    if (profile?.signature_url) {
      setSavedSignature(profile.signature_url);
    }
  }, [profile?.signature_url]);

  // Canvas dimensions and High-DPI scaling
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 480;
    const height = 180;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, [setupCanvas]);

  // Coordinate calculation relative to canvas
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Pointer event handlers (works seamlessly for mouse, pen, and touch)
  const handlePointerDown = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const coords = getCoordinates(e);
    setIsDrawing(true);
    setLastPoint(coords);

    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = getCoordinates(e);

    if (lastPoint) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }

    setLastPoint(coords);
    setIsEmpty(false);
  };

  const handlePointerUp = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    setIsDrawing(false);
    setLastPoint(null);
  };

  // Clear canvas
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setIsEmpty(true);
    setLastPoint(null);
  };

  // Save signature to profile
  const handleSaveSignature = async () => {
    if (isEmpty || !canvasRef.current || !user?.id) {
      return toast.error(t('profile.toasts.signatureEmptyError', 'กรุณาวาดลายเซ็นก่อนบันทึก'));
    }

    try {
      setSaving(true);
      const canvas = canvasRef.current;

      // 1. Export as transparent PNG Data URL
      const dataUrl = canvas.toDataURL('image/png');
      let finalSignatureUrl = dataUrl;

      // 2. Attempt uploading to Cloudflare R2 if accessible
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const safeUserId = String(user.id).replace(/[^a-zA-Z0-9_-]/g, '_');
          const customFileName = `signature_${safeUserId}_${Date.now()}.png`;
          const file = new File([blob], customFileName, { type: 'image/png' });
          const r2Url = await uploadFileToR2(file, 'documents', customFileName, true);
          if (r2Url) {
            finalSignatureUrl = r2Url;
          }
        }
      } catch (uploadErr) {
        console.warn('[SignatureCanvas] Cloudflare R2 upload fallback to Data URL:', uploadErr);
      }

      // 3. Update profile table in Supabase
      const { error } = await supabase
        .from('profiles')
        .update({
          signature_url: finalSignatureUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      setSavedSignature(finalSignatureUrl);
      setIsEmpty(true);
      handleClear();

      // Refresh auth context so all app components immediately reflect the new signature
      if (refreshProfile) {
        await refreshProfile(true);
      }

      toast.success(t('profile.toasts.signatureSaved', 'บันทึกลายเซ็นเรียบร้อยแล้ว'));
    } catch (err) {
      console.error('[SignatureCanvas] Save error:', err);
      toast.error(t('profile.toasts.signatureSaveFailed', 'ไม่สามารถบันทึกลายเซ็นได้') + (err.message ? `: ${err.message}` : ''));
    } finally {
      setSaving(false);
    }
  };

  // Delete/Remove existing signature
  const handleRemoveSignature = async () => {
    if (!user?.id || !savedSignature) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          signature_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      setSavedSignature(null);
      if (refreshProfile) {
        await refreshProfile(true);
      }
      toast.success(t('profile.toasts.signatureRemoved', 'ลบลายเซ็นเรียบร้อยแล้ว'));
    } catch (err) {
      console.error('[SignatureCanvas] Remove error:', err);
      toast.error(t('profile.toasts.signatureRemoveFailed', 'ไม่สามารถลบลายเซ็นได้') + (err.message ? `: ${err.message}` : ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Status Banner & Guidelines */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <PenTool className="w-4 h-4 text-primary" />
                <span>{t('profile.signatureTitle', 'ลายเซ็นเจ้าหน้าที่')}</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('profile.signatureSubtitle', 'ต้องมีลายเซ็นก่อนทำธุรกรรมในระบบ')}
              </p>
            </div>

            {/* Status Badge */}
            <div>
              {savedSignature ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('profile.signatureActiveBadge', 'มีลายเซ็นในระบบแล้ว')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{t('profile.signatureRequiredBadge', 'ยังไม่มีลายเซ็น — จำเป็นต้องสร้าง')}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <strong>{t('profile.signatureNoticeHeader', 'ข้อกำหนดความปลอดภัย:')}</strong>{' '}
              {t(
                'profile.signatureNoticeBody',
                'ลายเซ็นดิจิทัลของคุณจะถูกประทับลงในเอกสารใบเบิกพัสดุ (Withdrawal Voucher) ใบยืมพัสดุ (Checkout Slip) และใบรับคืนพัสดุ (Return Receipt) โดยอัตโนมัติ เพื่อยืนยันความถูกต้องของธุรกรรม'
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Current Saved Signature Preview */}
      {savedSignature && (
        <Card className="rounded-xl bg-card border border-border shadow-xs">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span>{t('profile.currentSignatureLabel', 'ลายเซ็นปัจจุบันของคุณ')}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={handleRemoveSignature}
                className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10 gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('profile.removeSignatureBtn', 'ลบลายเซ็น')}</span>
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white flex items-center justify-center min-h-27.5 shadow-2xs relative">
              <img
                src={savedSignature}
                alt="User Signature"
                className="max-h-24 max-w-full object-contain filter drop-shadow-2xs"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Drawing Canvas Section */}
      <Card className="rounded-xl bg-card border border-border shadow-xs">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5 text-primary" />
              <span>
                {savedSignature
                  ? t('profile.updateSignatureLabel', 'วาดลายเซ็นใหม่เพื่ออัปเดต')
                  : t('profile.drawSignatureLabel', 'วาดลายเซ็นของคุณ')}
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t('profile.signatureDrawTip', 'ใช้นิ้วหรือเมาส์วาดลงบนกรอบ')}
            </span>
          </div>

          {/* Canvas Wrapper */}
          <div
            ref={containerRef}
            className="relative w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary/50 transition-colors bg-white overflow-hidden shadow-2xs select-none"
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="cursor-crosshair w-full block"
              style={{ touchAction: 'none' }}
            />

            {/* Subtle Baseline Watermark */}
            <div className="absolute inset-x-8 bottom-6 pointer-events-none flex items-center justify-between border-b border-dashed border-slate-300 pb-0.5">
              <span className="text-[10px] font-mono text-slate-400 select-none">✕ เซ็นชื่อเหนือเส้นนี้</span>
              <span className="text-[10px] text-slate-400 select-none">Digital Signature</span>
            </div>

            {/* Prompt when empty */}
            {isEmpty && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 text-xs">
                <span className="flex items-center gap-1.5 select-none">
                  <PenTool className="w-4 h-4 opacity-50 text-slate-400" />
                  {t('profile.canvasWatermark', 'วาดลายเซ็นที่นี่...')}
                </span>
              </div>
            )}
          </div>

          {/* Canvas Action Buttons */}
          <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isEmpty || saving}
              onClick={handleClear}
              className="h-9 px-3.5 text-xs gap-1.5 font-semibold rounded-lg shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('profile.clearCanvasBtn', 'ล้างกระดาน')}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isEmpty || saving}
              onClick={handleSaveSignature}
              className="h-9 px-4 text-xs gap-1.5 font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? t('common.saving', 'กำลังบันทึก...') : t('profile.saveSignatureBtn', 'บันทึกลายเซ็น')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignatureCanvas;
