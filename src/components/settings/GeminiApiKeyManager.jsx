import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  Bot, CheckCircle2, AlertCircle, 
  ExternalLink, Server, Cpu, Sparkles, Loader2
} from 'lucide-react';
import { getGeminiApiKeyDetails } from '@/lib/geminiCopilot';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

export default function GeminiApiKeyManager({ canUpdate = true }) {
  const { t } = useTranslation();
  const [keyDetails, setKeyDetails] = useState({
    hasKey: false,
    source: 'none',
    activeKey: '',
    hasEnvKey: false
  });

  const [isCopilotEnabled, setIsCopilotEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('stockflow_copilot_enabled') !== 'false';
    }
    return true;
  });
  const [isToggling, setIsToggling] = useState(false);

  const refreshKeyStatus = async () => {
    // Clean up any legacy localStorage key to ensure no residual data in browser
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('stockflow_gemini_api_key');
      }
    } catch {
      // Ignore in restricted environments
    }

    const details = getGeminiApiKeyDetails();
    setKeyDetails(details);

    try {
      const { data } = await supabase.rpc('admin_get_system_settings');
      if (data && data.enable_copilot !== undefined) {
        const enabled = Boolean(data.enable_copilot);
        setIsCopilotEnabled(enabled);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('stockflow_copilot_enabled', String(enabled));
        }
      }
    } catch {
      // Fallback to local or default
    }
  };

  useEffect(() => {
    refreshKeyStatus();

    const handleKeyUpdated = () => {
      refreshKeyStatus();
    };

    window.addEventListener('stockflow:gemini-key-updated', handleKeyUpdated);
    window.addEventListener('stockflow:settings-updated', handleKeyUpdated);
    return () => {
      window.removeEventListener('stockflow:gemini-key-updated', handleKeyUpdated);
      window.removeEventListener('stockflow:settings-updated', handleKeyUpdated);
    };
  }, []);

  const handleToggleCopilot = async () => {
    if (!canUpdate) {
      return toast.error(t('settings.toasts.permissionDenied', { 
        perm: 'settings.update', 
        defaultValue: 'Permission denied. Requires settings.update' 
      }));
    }

    const nextState = !isCopilotEnabled;
    setIsToggling(true);
    // Optimistic UI update
    setIsCopilotEnabled(nextState);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('stockflow_copilot_enabled', String(nextState));
      }

      // Persist in system_settings database
      const { error } = await supabase.rpc('admin_update_system_settings', {
        p_settings: { enable_copilot: nextState },
        p_category: 'copilot'
      });

      if (error) {
        console.warn('[GeminiApiKeyManager] DB update warning, using local state:', error);
      }

      // Dispatch global events so Copilot FAB and Modal update immediately
      window.dispatchEvent(new CustomEvent('stockflow:copilot-toggle', { detail: { enabled: nextState } }));
      window.dispatchEvent(new Event('stockflow:settings-updated'));

      if (nextState) {
        toast.success(t('settings.gemini.copilotEnabledToast', 'เปิดใช้งาน StockFlow Copilot เรียบร้อยแล้ว'));
      } else {
        toast.success(t('settings.gemini.copilotDisabledToast', 'ปิดการใช้งาน StockFlow Copilot เรียบร้อยแล้ว'));
      }
    } catch (err) {
      console.error('[GeminiApiKeyManager] Toggle error:', err);
      toast.error(err.message || 'Failed to update Copilot setting');
    } finally {
      setIsToggling(false);
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
              {keyDetails.hasKey ? (
                <span className="text-primary font-medium">
                  {t('settings.gemini.sourceEnv', '● กำหนดค่าผ่านตัวแปรระบบ (Vercel Environment Variables: VITE_GEMINI_API_KEY)')}
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

      {/* Copilot Enable / Disable Toggle Switch Card */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            <h4 className="font-bold text-sm text-foreground">
              {t('settings.gemini.enableCopilotTitle', 'เปิด-ปิดการใช้งาน StockFlow Copilot')}
            </h4>
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1",
              isCopilotEnabled 
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-muted text-muted-foreground border-border"
            )}>
              {isCopilotEnabled ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t('common.active', 'เปิดใช้งาน')}
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  {t('common.inactive', 'ปิดใช้งาน')}
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('settings.gemini.enableCopilotDesc', 'ควบคุมการแสดงผลปุ่มลอย AI Copilot (Floating Button) และคีย์ลัด Ctrl+K สำหรับเจ้าหน้าที่ทุกคนในระบบ')}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={isCopilotEnabled}
            disabled={!canUpdate || isToggling}
            onClick={handleToggleCopilot}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
              isCopilotEnabled ? "bg-primary" : "bg-muted-foreground/30"
            )}
            title={isCopilotEnabled ? 'คลิกเพื่อปิดการใช้งาน Copilot' : 'คลิกเพื่อเปิดการใช้งาน Copilot'}
          >
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none inline-flex items-center justify-center h-5 w-5 transform rounded-full bg-white dark:bg-card shadow-md ring-0 transition duration-200 ease-in-out",
                isCopilotEnabled ? "translate-x-5" : "translate-x-0"
              )}
            >
              {isToggling && (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Architecture & Quota Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Model & Capabilities */}
        <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Cpu className="h-4 w-4 text-indigo-500" />
            <span>โมเดลปัญญาประดิษฐ์และฟังก์ชันการทำงาน</span>
          </div>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1 text-[11px]">
            <li>
              <strong className="text-foreground">โมเดลหลัก:</strong> Google Gemini 3.8 Flash (ความเร็วสูง รองรับการวิเคราะห์สต็อกแบบเรียลไทม์)
            </li>
            <li>
              <strong className="text-foreground">โมเดลสำรอง:</strong> Gemini 2.5 Flash / Flash Lite fallback อัตโนมัติ
            </li>
            <li>
              <strong className="text-foreground">ขอบเขตงาน:</strong> วิเคราะห์พัสดุใกล้หมด, รายงานภาพรวมคลัง, สรุปประวัติการเบิกจ่าย
            </li>
          </ul>
        </div>

        {/* Security & Free Tier Quota */}
        <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Server className="h-4 w-4 text-emerald-500" />
            <span>ความปลอดภัยและโควต้าการใช้งาน</span>
          </div>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1 text-[11px]">
            <li>
              <strong className="text-foreground">ความปลอดภัยระดับ Backend:</strong> ประมวลผลผ่าน Serverless Function (<code>/api/gemini-copilot</code>) ป้องกันการเปิดเผย Key สู่ Client
            </li>
            <li>
              <strong className="text-foreground">Free Tier Quota:</strong> {t('settings.gemini.freeTierQuota', 'ใช้งานได้ฟรีสูงสุด 15 Requests Per Minute (RPM) และ 1,500 Requests Per Day (RPD) โดยไม่มีค่าใช้จ่าย')}
            </li>
            <li>
              <strong className="text-foreground">การปกป้องข้อมูล:</strong> {t('settings.gemini.securityDesc', 'Key ของคุณถูกจัดเก็บใน Vercel Environment Variables อย่างปลอดภัย และใช้งานเฉพาะการประมวลผลสต็อกภายในระบบเท่านั้น')}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

GeminiApiKeyManager.propTypes = {
  canUpdate: PropTypes.bool
};
