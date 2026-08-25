import { renderTestEmailHtml, renderUserInvitationEmailHtml, renderUserInvitationEmailText } from './emailRenderer';
import { supabase } from './supabase';

/**
 * Send an email through the StockFlow Vercel API service (/api/send-email)
 * with graceful fallback to Supabase Native Auth
 */
export async function sendStockFlowEmail({ to, subject, html, text, smtpOverrides, actionUrl }) {
  if (!to) {
    throw new Error('กรุณาระบุอีเมลผู้รับ (recipient email)');
  }

  // Always route to the active Vercel serverless function unless explicitly overridden
  const defaultEndpoint = 'https://stock-flow-pi-coral.vercel.app/api/send-email';
  const endpoint = import.meta.env.VITE_EMAIL_SERVICE_URL || defaultEndpoint;

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
 * Send a test email displaying the original clean test email layout
 */
export async function sendTestEmail(toEmail, eventType = null, smtpOverrides = null) {
  const html = renderTestEmailHtml({
    appName: 'StockFlow',
    isoTimestamp: new Date().toISOString(),
  });
  const text = `ทดสอบการเชื่อมต่ออีเมล — StockFlow\nระบบส่งอีเมลทำงานสำเร็จเมื่อ ${new Date().toISOString()}\nนี่คืออีเมลทดสอบการเชื่อมต่อ SMTP จากระบบ StockFlow`;

  return sendStockFlowEmail({
    to: toEmail,
    subject: 'ทดสอบการเชื่อมต่ออีเมล — StockFlow',
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

  const defaultActionUrl = 'https://eemeemmeex.github.io/Stock-Flow';
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


