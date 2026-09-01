import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { to, cc, subject, html, text, smtpOverrides } = req.body || {};

    // Parse, trim and deduplicate recipients (to and cc)
    const rawTo = Array.isArray(to) ? to : String(to || '').split(',').map(s => s.trim()).filter(Boolean);
    const toList = [...new Set(rawTo)];

    if (!toList.length) {
      return res.status(400).json({ message: 'Recipient email (to) is required and cannot be empty.' });
    }

    const rawCc = cc ? (Array.isArray(cc) ? cc : String(cc).split(',').map(s => s.trim()).filter(Boolean)) : [];
    const ccList = [...new Set(rawCc)];

    // 1. Resolve dynamic SMTP config from database (Supabase) if not explicitly overridden
    let dynamicSmtp = {};
    if (!smtpOverrides || !smtpOverrides.host) {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceRoleKey) {
        try {
          const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
          const [{ data: settingsData }, { data: secretData }] = await Promise.all([
            supabaseAdmin.from('system_settings').select('value').eq('key', 'smtp_config').maybeSingle(),
            supabaseAdmin.from('system_secrets').select('secret_value').eq('key', 'smtp_password').maybeSingle(),
          ]);

          if (settingsData?.value) {
            const parsed = typeof settingsData.value === 'string'
              ? JSON.parse(settingsData.value)
              : settingsData.value;
            if (parsed.host && parsed.user) {
              dynamicSmtp = {
                host: parsed.host,
                port: Number(parsed.port || 465),
                secure: parsed.secure !== false,
                user: parsed.user,
                pass: secretData?.secret_value || '',
                sender_email: parsed.sender_email || parsed.user,
                sender_name: parsed.sender_name || 'StockFlow Notification',
              };
            }
          }
        } catch (dbErr) {
          console.warn('[Vercel API send-email] Supabase dynamic config lookup skipped:', dbErr.message);
        }
      }
    }

    // 2. Priority: Request Overrides > Supabase DB Config > Environment Variables > Hardcoded Defaults
    const host = smtpOverrides?.host || dynamicSmtp.host || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(smtpOverrides?.port || dynamicSmtp.port || process.env.SMTP_PORT || 465);
    const isSecure = smtpOverrides?.secure !== undefined
      ? Boolean(smtpOverrides.secure)
      : (dynamicSmtp.secure !== undefined ? dynamicSmtp.secure : (port === 465));
    const user = smtpOverrides?.user || dynamicSmtp.user || process.env.SMTP_USER || 'stockflow.noreply.app@gmail.com';
    const pass = smtpOverrides?.pass || dynamicSmtp.pass || process.env.SMTP_PASS || 'yitosoxabxycxdij';
    const senderEmail = smtpOverrides?.sender_email || dynamicSmtp.sender_email || process.env.SMTP_SENDER_EMAIL || process.env.EMAIL_FROM || user;
    const senderName = smtpOverrides?.sender_name || dynamicSmtp.sender_name || process.env.SMTP_SENDER_NAME || process.env.EMAIL_FROM_NAME || 'StockFlow Notification';

    // When using Gmail SMTP, Header From address must match authenticated user to pass SPF/DKIM/DMARC on Microsoft 365 / Corporate Inboxes
    const fromAddress = host.toLowerCase().includes('gmail.com') ? user : senderEmail;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    // Strip HTML tags if text is not provided to ensure multipart/alternative MIME structure (RFC 2046)
    const plainText = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'StockFlow Notification');
    const messageId = `<${crypto.randomUUID()}@smtp.gmail.com>`;

    const mailOptions = {
      from: `"${senderName}" <${fromAddress}>`,
      to: toList.join(', '),
      ...(ccList.length ? { cc: ccList.join(', ') } : {}),
      subject: subject || 'StockFlow Notification',
      text: plainText,
      html: html || `<p>${plainText}</p>`,
      messageId,
      date: new Date(),
      // Envelope sender alignment for SPF / DKIM verification on Gmail & Microsoft 365
      envelope: {
        from: user,
        to: [...toList, ...ccList],
      },
      replyTo: senderEmail || user,
      headers: {
        'Content-Language': 'th',
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Vercel API send-email] Sent successfully:', info.messageId || messageId);

    return res.status(200).json({
      success: true,
      messageId: info.messageId || messageId,
      response: info.response || '250 2.0.0 OK',
      accepted: info.accepted || toList,
      rejected: info.rejected || [],
      message: 'Email sent successfully via Vercel SMTP endpoint'
    });
  } catch (error) {
    console.error('[Vercel API send-email] Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send email'
    });
  }
}

