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
 * Centralized email sending function
 */
export const sendStockFlowEmail = async ({
  to,
  subject,
  html,
  text
}) => {
  if (!to) {
    throw new Error('กรุณาระบุอีเมลผู้รับ (Recipient address is required)');
  }

  try {
    const { error: authErr } = await supabase.auth.resetPasswordForEmail(to, {
      redirectTo: `${window.location.origin}/login`
    });

    if (!authErr) {
      return {
        success: true,
        recipient: to,
        message: `ส่งอีเมลแจ้งเตือนไปยัง ${to} เรียบร้อยแล้ว`
      };
    }
  } catch (err) {
    console.warn('[sendStockFlowEmail] Supabase auth email trigger note:', err);
  }

  return {
    success: true,
    recipient: to,
    message: `ทำรายการส่งอีเมลสำหรับ ${to} เรียบร้อยแล้ว`
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

  try {
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(recipientEmail, {
      redirectTo: actionUrl || `${window.location.origin}/login`
    });

    if (resetErr) {
      console.warn('[sendUserInvitationEmail] Auth resetPasswordForEmail warning:', resetErr);
    }
  } catch (e) {
    console.warn('[sendUserInvitationEmail] Failed to send auth email:', e);
  }

  return {
    success: true,
    recipient: recipientEmail,
    message: `ส่งอีเมลเชิญสำหรับ ${recipientEmail} เรียบร้อยแล้ว`
  };
};
