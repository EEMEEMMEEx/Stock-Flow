import { renderTestEmailHtml, renderUserInvitationEmailHtml } from './emailRenderer';
import { supabase } from './supabase';

/**
 * Send an email through the StockFlow Vercel API service (/api/send-email)
 * with graceful fallback to Supabase Native Auth
 */
export async function sendStockFlowEmail({ to, subject, html, text, smtpOverrides, actionUrl }) {
  if (!to) {
    throw new Error('กรุณาระบุอีเมลผู้รับ (recipient email)');
  }

  const endpoint = import.meta.env.VITE_EMAIL_SERVICE_URL || '/api/send-email';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        html,
        text,
        smtpOverrides,
      }),
    });

    if (response.ok) {
      return await response.json().catch(() => ({ success: true }));
    }
  } catch (error) {
    console.warn('[emailService] Vercel API send-email fetch failed, trying Supabase Native Auth fallback:', error.message);
  }

  // Fallback to Supabase Native Auth if Vercel endpoint is un-deployed or offline
  const prodOrigin = typeof window !== 'undefined' && !window.location.origin.includes('localhost')
    ? window.location.origin
    : (import.meta.env.VITE_APP_URL || 'https://stock-flow-two-psi.vercel.app');
  const redirectUri = actionUrl || `${prodOrigin}/login`;

  const { error: authErr } = await supabase.auth.resetPasswordForEmail(to, {
    redirectTo: redirectUri,
  });

  if (authErr) {
    throw new Error(authErr.message || 'ไม่สามารถส่งอีเมลได้');
  }

  return { success: true, method: 'supabase_native', recipient: to };
}

/**
 * Send a test email displaying the original clean test email layout
 */
export async function sendTestEmail(toEmail, eventType = null, smtpOverrides = null) {
  const html = renderTestEmailHtml({
    appName: 'StockFlow',
    isoTimestamp: new Date().toISOString(),
  });

  return sendStockFlowEmail({
    to: toEmail,
    subject: 'ทดสอบการเชื่อมต่ออีเมล — StockFlow',
    html,
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
}) {
  if (!recipientEmail) {
    throw new Error('กรุณาระบุอีเมลผู้รับ');
  }

  const html = renderUserInvitationEmailHtml({
    appName: branding.app_name || 'StockFlow',
    userName: userName || recipientEmail,
    userEmail: recipientEmail,
    roleName: roleName || 'ผู้ใช้งานระบบ',
    projectAccessSummary: projectAccessSummary || 'ตามสิทธิ์ที่ได้รับมอบหมาย',
    actionUrl: actionUrl || (typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'),
    branding,
  });

  return sendStockFlowEmail({
    to: recipientEmail,
    subject: `คำเชิญเข้าใช้งานระบบ StockFlow — คุณ ${userName || recipientEmail}`,
    html,
    actionUrl
  });
}
