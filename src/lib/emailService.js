import { supabase } from './supabase';
import { APP_CONFIG } from '@/config/appConfig';
import { renderEmailHtml, renderTestEmailHtml, renderUserInvitationEmailHtml, resolveEmailVariables, SAMPLE_EMAIL_DATA } from './emailRenderer';

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

/**
 * Mask email address for structured logging (e.g. w***a.m@forth.co.th)
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [name, domain] = parts;
  if (name.length <= 2) return `${name}***@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
};

/**
 * Resolves effective SMTP settings from Supabase system_settings.
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
 * Centralized email sending function using Supabase Auth password recovery trigger.
 * Throws explicit errors when Supabase Auth returns a 500 or network failure.
 */
export const sendStockFlowEmail = async ({
  to,
  subject,
  html,
  text,
  actionUrl
}) => {
  if (!to) {
    throw new Error('กรุณาระบุอีเมลผู้รับ (Recipient address is required)');
  }

  const timestamp = new Date().toISOString();
  const maskedTo = maskEmail(to);
  const redirectTarget = actionUrl || `${window.location.origin}/login`;

  console.info(`[EmailService][${timestamp}] Attempting email delivery:`, {
    operation: 'sendStockFlowEmail',
    recipient: maskedTo,
    provider: 'Supabase Auth / GoTrue SMTP',
    redirectTarget
  });

  const { error: authErr } = await supabase.auth.resetPasswordForEmail(to, {
    redirectTo: redirectTarget
  });

  if (authErr) {
    console.error(`[EmailService][${timestamp}] Email delivery failed:`, {
      operation: 'sendStockFlowEmail',
      recipient: maskedTo,
      provider: 'Supabase Auth / GoTrue SMTP',
      status: authErr.status || 500,
      code: authErr.code || 'AUTH_SMTP_ERROR',
      name: authErr.name,
      message: authErr.message
    });

    let friendlyMessage = `ไม่สามารถส่งอีเมลไปยัง ${to} ได้ (Supabase Auth HTTP ${authErr.status || 500}: ${authErr.message || 'SMTP Server Error'})`;
    if (authErr.status === 500 || authErr.name === 'AuthRetryableFetchError') {
      friendlyMessage = `ไม่สามารถส่งอีเมลไปยัง ${to} ได้ (รหัสข้อผิดพลาด HTTP 500: การตั้งค่า Custom SMTP หรือ Redirect URL ใน Supabase Dashboard ขัดข้อง)`;
    }

    const errObj = new Error(friendlyMessage);
    errObj.status = authErr.status || 500;
    errObj.code = authErr.code;
    errObj.originalError = authErr;
    throw errObj;
  }

  console.info(`[EmailService][${timestamp}] Email request accepted by Supabase Auth:`, {
    operation: 'sendStockFlowEmail',
    recipient: maskedTo,
    provider: 'Supabase Auth / GoTrue SMTP',
    status: 200
  });

  return {
    success: true,
    status: 'Accepted',
    recipient: to,
    message: `ส่งคำขอส่งอีเมลไปยัง ${to} ผ่าน Supabase Auth เรียบร้อยแล้ว`
  };
};

/**
 * Send Test Email Handler
 */
export const sendTestEmail = async (testRecipient, customTemplate = null) => {
  const isoTimestamp = new Date().toISOString();
  let settings = {};
  try {
    const { data, error } = await supabase.rpc('admin_get_system_settings');
    if (!error && data) settings = data;
  } catch {
    // Fallback
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
    text: plainText
  });
};

/**
 * Send User Invitation Email Handler
 */
export const sendUserInvitationEmail = async ({ recipientEmail, userName, roleName, projectAccessSummary, actionUrl }) => {
  if (!recipientEmail) {
    throw new Error('กรุณาระบุอีเมลผู้รับ');
  }

  let branding = {};
  try {
    const { data } = await supabase.rpc('admin_get_system_settings');
    branding = data?.branding || {};
  } catch (error) {
    console.warn('[emailService] Default invitation branding:', error);
  }

  const appName = branding.app_name || APP_CONFIG.name || 'StockFlow';
  const targetUrl = actionUrl || `${window.location.origin}/login`;

  return await sendStockFlowEmail({
    to: recipientEmail,
    subject: `เชิญเข้าใช้งาน ${appName}`,
    html: renderUserInvitationEmailHtml({ appName, userName, userEmail: recipientEmail, roleName, projectAccessSummary, actionUrl: targetUrl, branding }),
    text: `ยินดีต้อนรับสู่ ${appName}\n\nบัญชี: ${recipientEmail}\nบทบาท: ${roleName}\n\nเข้าสู่ระบบ: ${targetUrl}`,
    actionUrl: targetUrl
  });
};
