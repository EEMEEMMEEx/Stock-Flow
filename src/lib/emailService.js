import {
  getSampleEmailData,
  renderEmailHtml,
  renderEmailText,
  renderTestEmailHtml,
  renderUserInvitationEmailHtml,
  renderUserInvitationEmailText,
  resolveEmailVariables,
} from './emailRenderer.js';

const viteEnv = import.meta.env || {};

/**
 * Send an email through the StockFlow Vercel API service (/api/send-email)
 * with graceful fallback to Supabase Native Auth
 */
export async function sendStockFlowEmail({ to, cc, subject, html, text, smtpOverrides }) {
  if (!to) {
    throw new Error('กรุณาระบุอีเมลผู้รับ (recipient email)');
  }

  // Resolve active API endpoint: prefer dynamic origin on browser, fallback to custom domain
  const isBrowser = typeof window !== 'undefined';
  const isGithubPages = isBrowser && window.location.hostname.includes('github.io');
  const dynamicOrigin = isBrowser && !isGithubPages && window.location.origin ? window.location.origin : 'https://stockflowth.online';
  const defaultEndpoint = `${dynamicOrigin}/api/send-email`;
  const endpoint = viteEnv.VITE_EMAIL_SERVICE_URL || defaultEndpoint;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        cc,
        subject,
        html,
        text,
        smtpOverrides,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result.success !== false) {
      return result;
    }

    throw new Error(result.message || `Server returned status ${response.status}`);
  } catch (error) {
    console.error('[emailService] Email dispatch failed:', error.message);
    throw error;
  }
}

/**
 * Build an event-specific message with the same shared shell used by the test email.
 */
export const buildNotificationEmail = ({ eventType, template = {}, data = {}, branding = {} } = {}) => {
  const resolvedEventType = eventType || template.event_type || data.event_type || 'withdrawal_submitted';
  const sampleData = {
    ...getSampleEmailData(resolvedEventType),
    ...data,
    event_type: resolvedEventType,
  };
  const resolvedTemplate = { ...template, event_type: resolvedEventType };
  const appName = branding.app_name || sampleData.app_name || 'StockFlow';

  return {
    subject: resolveEmailVariables(
      resolvedTemplate.subject || `[${appName}] แจ้งเตือน ${resolvedEventType}`,
      sampleData
    ),
    html: renderEmailHtml({
      branding: { ...branding, app_name: appName },
      template: resolvedTemplate,
      data: sampleData,
    }),
    text: renderEmailText({
      branding: { ...branding, app_name: appName },
      template: resolvedTemplate,
      data: sampleData,
    }),
  };
};

export async function sendNotificationEmail({ to, cc, eventType, template = {}, data = {}, branding = {}, smtpOverrides } = {}) {
  const message = buildNotificationEmail({ eventType, template, data, branding });

  return sendStockFlowEmail({
    to,
    cc,
    ...message,
    smtpOverrides,
  });
}

/**
 * Send the connectivity test or a selected event template draft.
 */
export async function sendTestEmail(toEmail, eventOrTemplate = null, smtpOverrides = null) {
  if (eventOrTemplate && typeof eventOrTemplate === 'object' && eventOrTemplate.event_type) {
    const template = eventOrTemplate.template || eventOrTemplate;
    const data = eventOrTemplate.data || {};
    const branding = eventOrTemplate.branding || {};
    const message = buildNotificationEmail({
      eventType: template.event_type,
      template,
      data,
      branding,
    });

    return sendStockFlowEmail({
      to: toEmail,
      ...message,
      smtpOverrides,
    });
  }

  if (typeof eventOrTemplate === 'string' && eventOrTemplate) {
    const message = buildNotificationEmail({ eventType: eventOrTemplate });
    return sendStockFlowEmail({ to: toEmail, ...message, smtpOverrides });
  }

  const branding = (eventOrTemplate && typeof eventOrTemplate === 'object' && eventOrTemplate.branding) || {};
  const effectiveAppName = branding.app_name || 'StockFlow';
  const isoTimestamp = new Date().toUTCString();
  const html = renderTestEmailHtml({
    appName: effectiveAppName,
    branding,
    isoTimestamp,
  });
  const subject = `[${effectiveAppName}] ทดสอบการส่งอีเมลระบบแจ้งเตือน (${isoTimestamp})`;
  const text = `ทดสอบการส่งอีเมลจากระบบ ${effectiveAppName}\nเวลาที่ส่ง: ${isoTimestamp}\nหากคุณได้รับอีเมลนี้ แสดงว่าระบบส่งอีเมลสามารถส่งเข้าสู่ Inbox ของคุณได้อย่างสมบูรณ์`;

  return sendStockFlowEmail({
    to: toEmail,
    subject,
    html,
    text,
    smtpOverrides,
  });
}

/**
 * Send a user invitation email displaying the custom invitation email layout
 */
export async function sendUserInvitationEmail({
  recipientEmail,
  userName,
  roleName,
  projectAccessSummary,
  actionUrl,
  branding = {},
  tempPassword = 'F0rth2026@dtrs',
}) {
  if (!recipientEmail) {
    throw new Error('กรุณาระบุอีเมลผู้รับ');
  }

  const defaultActionUrl = 'https://bearnannan.github.io/Stock-Flow';
  const targetActionUrl = actionUrl || defaultActionUrl;

  const html = renderUserInvitationEmailHtml({
    appName: branding.app_name || 'StockFlow',
    userName: userName || recipientEmail,
    userEmail: recipientEmail,
    roleName: roleName || 'ผู้ใช้งานระบบ',
    projectAccessSummary: projectAccessSummary || 'ตามสิทธิ์ที่ได้รับมอบหมาย',
    actionUrl: targetActionUrl,
    branding,
    tempPassword,
  });

  const text = renderUserInvitationEmailText({
    appName: branding.app_name || 'StockFlow',
    userName: userName || recipientEmail,
    userEmail: recipientEmail,
    roleName: roleName || 'ผู้ใช้งานระบบ',
    projectAccessSummary: projectAccessSummary || 'ตามสิทธิ์ที่ได้รับมอบหมาย',
    actionUrl: targetActionUrl,
    branding,
    tempPassword,
  });

  const effectiveAppName = branding.app_name || 'StockFlow';

  return sendStockFlowEmail({
    to: recipientEmail,
    subject: `ยินดีต้อนรับสู่ ${effectiveAppName} — ข้อมูลการเข้าใช้งานสำหรับคุณ ${userName || recipientEmail}`,
    html,
    text,
    actionUrl: targetActionUrl,
  });
}


