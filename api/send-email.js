import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Normalize Nodemailer and SMTP errors into clear, actionable responses in Thai/English
 */
function normalizeNodemailerError(error) {
  const code = error?.code || '';
  const responseCode = error?.responseCode || 0;
  const rawMessage = error?.message || 'Failed to send email';

  if (code === 'EAUTH' || responseCode === 535) {
    return {
      status: 401,
      code: 'EAUTH',
      message: 'การยืนยันตัวตน SMTP ล้มเหลว: ชื่อผู้ใช้หรือรหัสผ่าน SMTP ไม่ถูกต้อง (สำหรับ Gmail กรุณาใช้ Google App Password 16 หลัก)',
      original: rawMessage,
    };
  }

  if (code === 'ESOCKET' || code === 'ETIMEDOUT') {
    return {
      status: 504,
      code: 'ETIMEDOUT',
      message: 'การเชื่อมต่อไปยัง Mail Server หมดเวลา (Timeout): กรุณาตรวจสอบ Host/Port และสถานะ Firewall หรือ Network',
      original: rawMessage,
    };
  }

  if (code === 'ENOTFOUND') {
    return {
      status: 502,
      code: 'ENOTFOUND',
      message: 'ไม่พบที่อยู่ Mail Server (Host not found): กรุณาตรวจสอบค่า SMTP Host ให้ถูกต้อง',
      original: rawMessage,
    };
  }

  if (code === 'EENVELOPE') {
    return {
      status: 400,
      code: 'EENVELOPE',
      message: 'รูปแบบข้อมูลผู้ส่งหรือผู้รับใน Envelope ไม่ถูกต้อง (Invalid email address)',
      original: rawMessage,
    };
  }

  return {
    status: 500,
    code: code || 'ESEND',
    message: rawMessage,
    original: rawMessage,
  };
}

export default async function handler(req, res) {
  // Set CORS and Security headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Internal-Secret'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 1. Authenticate Caller via Supabase JWT Bearer Token or Internal Secret
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const internalSecret = req.headers['x-internal-secret'];

    let callerUser = null;
    let isAuthorized = false;

    if (internalSecret && process.env.INTERNAL_SERVICE_KEY && internalSecret === process.env.INTERNAL_SERVICE_KEY) {
      isAuthorized = true;
    } else if (token && supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (!authErr && authUser) {
          callerUser = authUser;
          isAuthorized = true;
        }
      } catch (authEx) {
        console.warn('[Vercel API send-email] Token verification error:', authEx.message);
      }
    }

    if (!isAuthorized) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Valid authentication token required to send emails.'
      });
    }

    const { to, cc, bcc, subject, html, text, smtpOverrides, inlineImages } = req.body || {};

    // Parse, trim and deduplicate recipients (to, cc, bcc)
    const rawTo = Array.isArray(to) ? to : String(to || '').split(',').map(s => s.trim()).filter(Boolean);
    const toList = [...new Set(rawTo)];

    if (!toList.length) {
      return res.status(400).json({ success: false, message: 'Recipient email (to) is required and cannot be empty.' });
    }

    const rawCc = cc ? (Array.isArray(cc) ? cc : String(cc).split(',').map(s => s.trim()).filter(Boolean)) : [];
    const ccList = [...new Set(rawCc)];

    const rawBcc = bcc ? (Array.isArray(bcc) ? bcc : String(bcc).split(',').map(s => s.trim()).filter(Boolean)) : [];
    const bccList = [...new Set(rawBcc)];

    // Check if caller has admin privileges before permitting custom smtpOverrides
    let isCallerAdmin = false;
    if (callerUser && supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role, roles(code)')
          .eq('id', callerUser.id)
          .maybeSingle();
        const rCode = (profile?.roles?.code || profile?.role || '').toUpperCase();
        isCallerAdmin = rCode === 'ADMIN' || rCode === 'SUPER' || callerUser.email?.toLowerCase() === 'admin@stockflow.com';
      } catch {
        isCallerAdmin = false;
      }
    }

    // Only allow smtpOverrides if caller is verified admin (prevents SSRF and open relay abuse)
    const effectiveSmtpOverrides = isCallerAdmin ? smtpOverrides : null;

    // 2. Resolve dynamic SMTP config from database (Supabase) if not explicitly overridden
    let dynamicSmtp = {};
    if (!effectiveSmtpOverrides || !effectiveSmtpOverrides.host) {
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
                reject_unauthorized: parsed.reject_unauthorized !== false,
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

    // 3. Priority: Verified Admin Overrides > Supabase DB Config > Environment Variables
    const host = effectiveSmtpOverrides?.host || dynamicSmtp.host || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(effectiveSmtpOverrides?.port || dynamicSmtp.port || process.env.SMTP_PORT || 465);
    const isSecure = effectiveSmtpOverrides?.secure !== undefined
      ? Boolean(effectiveSmtpOverrides.secure)
      : (dynamicSmtp.secure !== undefined ? dynamicSmtp.secure : (port === 465));
    const rejectUnauthorized = effectiveSmtpOverrides?.reject_unauthorized !== undefined
      ? Boolean(effectiveSmtpOverrides.reject_unauthorized)
      : (dynamicSmtp.reject_unauthorized !== undefined ? dynamicSmtp.reject_unauthorized : (process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'));
    const user = effectiveSmtpOverrides?.user || dynamicSmtp.user || process.env.SMTP_USER;
    const pass = effectiveSmtpOverrides?.pass || dynamicSmtp.pass || process.env.SMTP_PASS;
    const senderEmail = effectiveSmtpOverrides?.sender_email || dynamicSmtp.sender_email || process.env.SMTP_SENDER_EMAIL || process.env.EMAIL_FROM || user;
    const senderName = effectiveSmtpOverrides?.sender_name || dynamicSmtp.sender_name || process.env.SMTP_SENDER_NAME || process.env.EMAIL_FROM_NAME || 'StockFlow Notification';

    if (!user || !pass) {
      console.error('[Vercel API send-email] SMTP credentials missing in environment and secrets vault');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: SMTP credentials are not configured.'
      });
    }

    // Safely validate whether the SMTP host belongs to Google/Gmail
    const isGmailSmtpHost = (rawHost) => {
      if (!rawHost || typeof rawHost !== 'string') return false;
      const cleanHost = rawHost.trim().toLowerCase().split(':')[0];
      return cleanHost === 'gmail.com' ||
             cleanHost === 'smtp.gmail.com' ||
             cleanHost.endsWith('.gmail.com') ||
             cleanHost.endsWith('.googlemail.com');
    };

    // When using Gmail SMTP, Header From address must match authenticated user to pass SPF/DKIM/DMARC on Microsoft 365 / Corporate Inboxes
    const fromAddress = isGmailSmtpHost(host) ? user : senderEmail;

    // Create Nodemailer transporter with connection pooling, socket timeouts and TLS options
    const transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    // Process optional inline CID images for branding (e.g. company logo)
    const attachments = [];
    if (Array.isArray(inlineImages) && inlineImages.length > 0) {
      for (const img of inlineImages) {
        if (img && img.cid && (img.content || img.path)) {
          attachments.push({
            filename: img.filename || `${img.cid}.png`,
            content: img.content,
            path: img.path,
            encoding: img.encoding || (typeof img.content === 'string' && img.content.startsWith('data:') ? undefined : 'base64'),
            cid: img.cid,
            contentType: img.contentType || 'image/png',
          });
        }
      }
    }

    // Strip HTML tags if text is not provided to ensure multipart/alternative MIME structure (RFC 2046)
    const plainText = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'StockFlow Notification');
    const messageId = `<${crypto.randomUUID()}@smtp.gmail.com>`;

    const mailOptions = {
      from: `"${senderName}" <${fromAddress}>`,
      to: toList.join(', '),
      ...(ccList.length ? { cc: ccList.join(', ') } : {}),
      ...(bccList.length ? { bcc: bccList.join(', ') } : {}),
      subject: subject || 'StockFlow Notification',
      text: plainText,
      html: html || `<p>${plainText}</p>`,
      messageId,
      date: new Date(),
      // Envelope sender alignment for SPF / DKIM verification on Gmail & Microsoft 365
      envelope: {
        from: user,
        to: [...toList, ...ccList, ...bccList],
      },
      replyTo: senderEmail || user,
      headers: {
        'Content-Language': 'th',
      },
      ...(attachments.length > 0 ? { attachments } : {}),
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
    const normalized = normalizeNodemailerError(error);
    return res.status(normalized.status).json({
      success: false,
      code: normalized.code,
      message: normalized.message,
      originalError: normalized.original
    });
  }
}


