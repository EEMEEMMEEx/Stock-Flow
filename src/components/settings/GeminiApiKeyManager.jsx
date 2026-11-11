import { useState, useEffect } from 'react';
import { 
  Bot, CheckCircle2, AlertCircle, ShieldCheck, 
  ExternalLink, Server, Cpu
} from 'lucide-react';
import { getGeminiApiKeyDetails } from '@/lib/geminiCopilot';
import { useTranslation } from '@/i18n';

export default function GeminiApiKeyManager() {
  const { t } = useTranslation();
  const [keyDetails, setKeyDetails] = useState({
    hasKey: false,
    source: 'none',
    activeKey: '',
    hasEnvKey: false
  });

  const refreshKeyStatus = () => {
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

      {/* Centralized Configuration Assurance Card */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
        <div className="flex items-center gap-2 text-foreground font-bold text-xs">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>การกำหนดค่าส่วนกลางผ่าน Vercel (Centralized Environment Configuration)</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t('settings.gemini.hint', 'ระบบ StockFlow เชื่อมต่อผ่านตัวแปรระบบส่วนกลางของ Vercel (VITE_GEMINI_API_KEY / GEMINI_API_KEY) โดยตรง ไม่จำเป็นต้องกรอกหรือจัดเก็บ Key ไว้ใน LocalStorage ของเบราว์เซอร์ เพื่อความปลอดภัยสูงสุดและพร้อมใช้งานสำหรับเจ้าหน้าที่ทุกคนในระบบ')}
        </p>
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
