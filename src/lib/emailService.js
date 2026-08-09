import { supabase } from './supabase';
import { APP_CONFIG } from '@/config/appConfig';
import { renderEmailHtml, renderTestEmailHtml, resolveEmailVariables, SAMPLE_EMAIL_DATA } from './emailRenderer';

export const DEFAULT_SMTP_CONFIG = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  sender_email: '',
  sender_name: 'StockFlow Notification',
  reject_unauthorized: true,
  password_set: false
};

const PDF_SERVICE_URL = import.meta.env.VITE_PDF_SERVICE_URL || 'http://localhost:3001';

/**
 * Resolves effective SMTP settings from Supabase system_settings. Empty values let
 * the server use its own protected environment configuration instead of stale UI defaults.
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
 * Centralized email sending function -> proxying to Express backend PDF & Email service
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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('กรุณาเข้าสู่ระบบใหม่ก่อนส่งอีเมลทดสอบ');
    }

    const response = await fetch(`${PDF_SERVICE_URL}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        to,
        subject: subject || 'ทดสอบการเชื่อมต่ออีเมล — StockFlow',
        html,
        text: text || 'นี่คืออีเมลทดสอบจากระบบ',
        smtpConfig: mergedSmtpConfig
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `เกิดข้อผิดพลาดในการส่งอีเมลผ่านเซิร์ฟเวอร์ SMTP (Status ${response.status})`);
    }

    return {
      success: true,
      messageId: result.messageId,
      recipient: to,
      acceptedCount: result.acceptedCount,
      rejectedCount: result.rejectedCount
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
export const sendTestEmail = async (testRecipient, customTemplate = null, smtpConfigOverrides = {}) => {
  const isoTimestamp = new Date().toISOString();
  let settings = {};
  try {
    const { data, error } = await supabase.rpc('admin_get_system_settings');
    if (!error && data) settings = data;
  } catch {
    // The real send path will still report its own authentication/configuration error.
  }

  const templateData = {
    ...SAMPLE_EMAIL_DATA,
    app_name: settings.branding?.app_name || APP_CONFIG.name || 'StockFlow',
    request_date: isoTimestamp,
    year: new Date().getFullYear().toString()
  };
  const subject = customTemplate?.subject
    ? resolveEmailVariables(customTemplate.subject, templateData).replace(/[\r\n]+/g, ' ').trim()
    : 'ทดสอบการเชื่อมต่ออีเมล — StockFlow';

  const renderedHtml = customTemplate
    ? renderEmailHtml({ branding: settings.branding || {}, template: customTemplate, data: templateData })
    : renderTestEmailHtml({ appName: templateData.app_name, isoTimestamp });

  const plainText = `StockFlow\n\n${subject}\n\nนี่คืออีเมลทดสอบจากระบบ\n\nเวลา: ${isoTimestamp}`;

  return await sendStockFlowEmail({
    to: testRecipient,
    subject,
    html: renderedHtml,
    text: plainText,
    smtpConfigOverrides
  });
};
