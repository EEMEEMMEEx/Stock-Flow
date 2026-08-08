import { supabase } from './supabase';
import { APP_CONFIG } from '@/config/appConfig';
import { renderEmailHtml, SAMPLE_EMAIL_DATA } from './emailRenderer';

export const DEFAULT_SMTP_CONFIG = {
  host: 'it.forth.co.th',
  port: 465,
  secure: true,
  user: 'noreply-app@it.forth.co.th',
  sender_email: 'noreply-app@it.forth.co.th',
  sender_name: 'StockFlow Notification',
  reject_unauthorized: false,
  password_set: true
};

const PDF_SERVICE_URL = import.meta.env.VITE_PDF_SERVICE_URL || 'http://localhost:3001';

/**
 * Resolves effective SMTP settings from Supabase system_settings or returns fallback
 */
export const getEffectiveSmtpConfig = async () => {
  try {
    const { data } = await supabase.rpc('admin_get_system_settings');
    if (data && data.smtp_config) {
      return {
        ...DEFAULT_SMTP_CONFIG,
        ...data.smtp_config,
        port: Number(data.smtp_config.port || DEFAULT_SMTP_CONFIG.port),
        secure: data.smtp_config.secure !== undefined ? Boolean(data.smtp_config.secure) : (Number(data.smtp_config.port) === 465)
      };
    }
  } catch (e) {
    console.warn('[emailService] Using default SMTP config fallback:', e);
  }
  return DEFAULT_SMTP_CONFIG;
};

/**
 * Centralized email sending function
 */
export const sendStockFlowEmail = async ({
  to,
  subject,
  html,
  text,
  smtpConfigOverrides = {}
}) => {
  if (!to) {
    throw new Error('กรุณาระบุอีเมลผู้รับ (Recipient address is required)');
  }

  const effectiveConfig = await getEffectiveSmtpConfig();
  const mergedSmtpConfig = {
    ...effectiveConfig,
    ...smtpConfigOverrides
  };

  try {
    const response = await fetch(`${PDF_SERVICE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: subject || '[StockFlow] Notification',
        html,
        text: text || 'This is a StockFlow email notification.',
        smtpConfig: mergedSmtpConfig
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `SMTP Delivery Failed (Status ${response.status})`);
    }

    // Record Audit Event
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        await supabase.from('audit_logs').insert({
          actor_id: userData.user.id,
          action: 'EMAIL_SENT',
          details: {
            recipient: to,
            subject,
            host: mergedSmtpConfig.host,
            port: mergedSmtpConfig.port
          }
        });
      }
    } catch (e) {}

    return {
      success: true,
      messageId: result.messageId,
      recipient: to
    };

  } catch (error) {
    console.error('[sendStockFlowEmail Error]:', error);
    let errorMessage = error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ส่งอีเมล SMTP';
    
    if (error.name === 'TypeError' || errorMessage.includes('Failed to fetch')) {
      errorMessage = `ไม่สามารถเชื่อมต่อบริการส่งอีเมลแบ็กเอนด์ที่พอร์ต 3001 ได้ (${PDF_SERVICE_URL}/api/send-email). กรุณาตรวจสอบว่าเซิร์ฟเวอร์ pdf-service (node pdf-service/server.js) กำลังทำงานอยู่`;
    }
    
    throw new Error(errorMessage);
  }
};


/**
 * Send Test Email Handler
 */
export const sendTestEmail = async (testRecipient, customTemplate = null) => {
  const effectiveConfig = await getEffectiveSmtpConfig();

  const renderedHtml = renderEmailHtml({
    branding: {
      app_name: APP_CONFIG.name,
      accent_color: '#3b82f6'
    },
    template: customTemplate || {
      subject: '[StockFlow] ทดสอบการเชื่อมต่ออีเมล (SMTP Test Email)',
      heading: 'ทดสอบการส่งอีเมลระบบ StockFlow สำเร็จ',
      intro: `อีเมลฉบับนี้เป็นการทดสอบการเชื่อมต่อเซิร์ฟเวอร์ SMTP (${effectiveConfig.host}:${effectiveConfig.port}) จากระบบ StockFlow`,
      cta_label: 'เข้าสู่ระบบ StockFlow',
      cta_url: window.location.origin,
      status_label: 'เชื่อมต่อสำเร็จ',
      status_type: 'approved',
      footer_note: 'หากคุณได้รับอีเมลฉบับนี้ แสดงว่าการตั้งค่า SMTP และระบบแจ้งเตือนทำงานได้สมบูรณ์แล้ว'
    },
    data: SAMPLE_EMAIL_DATA
  });

  return await sendStockFlowEmail({
    to: testRecipient,
    subject: `[StockFlow] ทดสอบการเชื่อมต่ออีเมล (SMTP Test) — ${new Date().toLocaleTimeString('th-TH')}`,
    html: renderedHtml,
    text: 'การทดสอบการเชื่อมต่ออีเมลระบบ StockFlow สำเร็จ'
  });
};
