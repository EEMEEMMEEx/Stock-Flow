import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Bot, KeyRound, Eye, EyeOff, Save, Trash2, ExternalLink, 
  Sparkles, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { 
  saveGeminiApiKey, 
  getGeminiApiKeyDetails 
} from '@/lib/geminiCopilot';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';

export default function GeminiApiKeyManager({ canUpdate = true }) {
  const { t } = useTranslation();
  const [keyDetails, setKeyDetails] = useState({
    hasKey: false,
    source: 'none',
    activeKey: '',
    localKey: '',
    hasEnvKey: false
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshKeyStatus = () => {
    const details = getGeminiApiKeyDetails();
    setKeyDetails(details);
    // Prefill with localKey if exists, or activeKey if user wants to see it
    setApiKeyInput(details.localKey || (details.hasEnvKey ? '' : ''));
  };

  useEffect(() => {
    refreshKeyStatus();

    const handleKeyUpdated = () => {
      refreshKeyStatus();
    };

    window.addEventListener('stockflow:gemini-key-updated', handleKeyUpdated);
    return () => {
      window.removeEventListener('stockflow:gemini-key-updated', handleKeyUpdated);
    };
  }, []);

  const handleSave = (e) => {
    if (e) e.preventDefault();
    if (!canUpdate) {
      return toast.error(t('settings.toasts.permissionDenied', { perm: 'settings.update', defaultValue: 'You do not have permission to update settings' }));
    }

    setSaving(true);
    try {
      const trimmed = apiKeyInput.trim();
      saveGeminiApiKey(trimmed);
      refreshKeyStatus();
      if (trimmed) {
        toast.success(t('settings.toasts.geminiSaved', 'บันทึก Google Gemini API Key เรียบร้อยแล้ว'));
      } else {
        toast.success(t('settings.toasts.geminiCleared', 'ลบการตั้งค่า Gemini API Key ในเบราว์เซอร์แล้ว'));
      }
    } catch (err) {
      toast.error(err.message || t('settings.toasts.saveFailed', 'เกิดข้อผิดพลาดในการบันทึก Key'));
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = () => {
    if (!canUpdate) {
      return toast.error(t('settings.toasts.permissionDenied', { perm: 'settings.update', defaultValue: 'You do not have permission to update settings' }));
    }

    setSaving(true);
    try {
      saveGeminiApiKey('');
      setApiKeyInput('');
      refreshKeyStatus();
      toast.success(t('settings.toasts.geminiCleared', 'ลบการตั้งค่า Gemini API Key ในเบราว์เซอร์แล้ว'));
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถลบ Key ได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">
                {t('settings.gemini.statusTitle', 'สถานะการเชื่อมต่อ Gemini AI')}
              </span>
              {keyDetails.hasKey ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('settings.gemini.connected', 'เชื่อมต่อแล้ว')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <AlertCircle className="h-3 w-3" />
                  {t('settings.gemini.notConfigured', 'ยังไม่ได้กำหนดค่า')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {keyDetails.hasEnvKey ? (
                <span className="text-primary font-medium">
                  {t('settings.gemini.sourceEnv', '● กำหนดค่าผ่านตัวแปรระบบ (.env: VITE_GEMINI_API_KEY)')}
                </span>
              ) : keyDetails.localKey ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {t('settings.gemini.sourceLocal', '● บันทึกในหน่วยความจำเบราว์เซอร์ (LocalStorage)')}
                </span>
              ) : (
                <span>
                  {t('settings.gemini.sourceNone', 'ยังไม่มีการกำหนด API Key สำหรับ StockFlow Copilot')}
                </span>
              )}
            </p>
          </div>
        </div>

        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline hover:text-primary/90 shrink-0"
        >
          <span>{t('settings.gemini.getFreeKey', 'รับ API Key ฟรี (Google AI Studio)')}</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* API Key Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <Label htmlFor="gemini_api_key" className="text-xs font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-primary" />
              {t('settings.gemini.inputLabel', 'Google Gemini API Key')}
            </span>
            {keyDetails.hasEnvKey && !keyDetails.localKey && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {t('settings.gemini.envActiveHint', '* ระบบกำลังใช้ Key จาก .env สามารถกรอกค่าด้านล่างเพื่อ Override เฉพาะเครื่องนี้ได้')}
              </span>
            )}
          </Label>

          <div className="relative mt-1">
            <Input
              id="gemini_api_key"
              type={showKey ? 'text' : 'password'}
              disabled={!canUpdate || saving}
              placeholder={
                keyDetails.hasEnvKey && !keyDetails.localKey
                  ? '•••••••••••••••••••••••••• (Active from .env)'
                  : t('settings.gemini.inputPlaceholder', 'ระบุ API Key ขึ้นต้นด้วย AIzaSy...')
              }
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="h-9 pr-10 text-xs font-mono rounded-lg bg-background border border-input"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded"
              title={showKey ? 'ซ่อน API Key' : 'แสดง API Key'}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {t('settings.gemini.hint', 'Gemini API Key จะถูกจัดเก็บไว้ใน LocalStorage ของเบราว์เซอร์อย่างปลอดภัยเพื่อใช้เรียก API สำหรับ StockFlow Copilot')}
          </p>
        </div>

        {/* Feature & Free Tier Note */}
        <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>{t('settings.gemini.freeTierTitle', 'ข้อมูลโมเดลและโควต้าฟรี (Google AI Studio Free Tier)')}</span>
          </div>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1 text-[11px]">
            <li>
              <strong className="text-foreground">Gemini 3.8 Flash & Gemini 2.5 Flash:</strong> {t('settings.gemini.freeTierDesc', 'รองรับการวิเคราะห์สต็อกสินค้า ตอบคำถามสถานะคลัง และค้นหาข้อมูลรวดเร็วผ่านหน้าต่าง StockFlow Copilot')}
            </li>
            <li>
              <strong className="text-foreground">Free Tier Quota:</strong> {t('settings.gemini.freeTierQuota', 'ใช้งานได้ฟรีสูงสุด 15 Requests Per Minute (RPM) และ 1,500 Requests Per Day (RPD) โดยไม่มีค่าใช้จ่าย')}
            </li>
            <li>
              <strong className="text-foreground">ความปลอดภัยของข้อมูล:</strong> {t('settings.gemini.securityDesc', 'Key ของคุณจะไม่ถูกส่งไปยังเซิร์ฟเวอร์ภายนอกที่ไม่ได้รับอนุญาต และใช้งานเฉพาะการประมวลผลสต็อกภายในระบบเท่านั้น')}
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        {canUpdate && (
          <div className="flex items-center justify-between pt-1">
            <div>
              {keyDetails.localKey && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearKey}
                  disabled={saving}
                  className="h-8 px-3 rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('settings.gemini.clearBtn', 'ลบ Key ออก')}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 text-xs font-semibold cursor-pointer shadow-xs"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? t('settings.app.savingBtn', 'กำลังบันทึก...') : t('settings.gemini.saveBtn', 'บันทึก Gemini API Key')}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
