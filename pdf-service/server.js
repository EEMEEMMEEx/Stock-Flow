import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import path from 'path';
import { fileURLToPath } from 'url';
import { renderEmailHtml, resolveEmailVariables, formatThaiDateTime } from '../src/lib/emailRenderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from pdf-service directory and parent project root directory
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });



const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Helper: Validate whether password string is a real secret (filters out masked placeholders like ••••••••)
const isValidPasswordSecret = (pwd) => {
  if (!pwd || typeof pwd !== 'string') return false;
  const trimmed = pwd.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false;
  if (/^[•\*\s]+$/.test(trimmed) || trimmed.includes('••••')) return false;
  return true;
};

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const getAuthorizationHeader = (req) => {
  const authorization = req.get('authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw new ApiError(401, 'Authentication is required to send email.', 'AUTHENTICATION_REQUIRED');
  }
  return authorization;
};

const callSupabaseRpcAsUser = async (rpcName, authorization, payload = {}) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new ApiError(500, 'Supabase configuration is missing on the email service.', 'SUPABASE_CONFIG_MISSING');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    const message = responseBody?.message || responseBody?.hint || 'Supabase rejected the request.';
    const status = response.status === 401 || response.status === 403 ? 403 : 502;
    throw new ApiError(status, message, 'SUPABASE_RPC_REJECTED');
  }
};

const getServerSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new ApiError(
      503,
      'Notification service is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.',
      'NOTIFICATION_SERVICE_UNAVAILABLE'
    );
  }

  return { url, serviceRoleKey };
};

const callSupabaseAsService = async (path, options = {}) => {
  const { url, serviceRoleKey } = getServerSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(502, body?.message || 'Supabase service request failed.', 'SUPABASE_SERVICE_REQUEST_FAILED');
  }
  return body;
};

const getAuthenticatedUser = async (authorization) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new ApiError(500, 'Supabase configuration is missing on the notification service.', 'SUPABASE_CONFIG_MISSING');
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) {
    throw new ApiError(401, 'Authentication is required to send notifications.', 'AUTHENTICATION_REQUIRED');
  }
  return user;
};

const getCallerPermissions = async (authorization) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_user_permissions`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const permissions = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(permissions)) {
    throw new ApiError(403, 'Unable to verify notification permission.', 'NOTIFICATION_PERMISSION_DENIED');
  }
  return new Set(permissions.map((permission) => permission?.permission_code || permission?.code || permission));
};

const normalizeEmail = (value) => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const normalizeEmailList = (value) => {
  const values = Array.isArray(value) ? value : String(value || '').split(/[;,\n]/);
  return [...new Set(values.map(normalizeEmail).filter(Boolean))];
};

const sanitizeEmailHeader = (value, fallback = '') => String(value || fallback)
  .replace(/[\r\n]+/g, ' ')
  .trim()
  .slice(0, 500);

const resolvePublicBaseUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    return isHttp && !(process.env.NODE_ENV === 'production' && isLocalhost) ? url.href.replace(/\/$/, '') : '';
  } catch {
    return '';
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const sendServerNotificationEmail = async ({ to, cc = [], subject, html, text, smtpConfig = {} }) => {
  const host = String(smtpConfig.host || process.env.SMTP_HOST || '').trim();
  const port = Number(smtpConfig.port || process.env.SMTP_PORT || 465);
  const user = String(smtpConfig.user || process.env.SMTP_USER || '').trim();
  const storedPassword = await fetchStoredSmtpPassword();
  const pass = String(storedPassword || process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();
  const senderEmail = normalizeEmail(smtpConfig.sender_email || process.env.SMTP_SENDER_EMAIL || user);
  const senderName = sanitizeEmailHeader(smtpConfig.sender_name || process.env.SMTP_SENDER_NAME || 'StockFlow Notification');
  const recipients = normalizeEmailList(to);
  const carbonCopies = normalizeEmailList(cc).filter((email) => !recipients.includes(email));

  if (!host || !user || !pass || !senderEmail || recipients.length === 0) {
    throw new ApiError(503, 'SMTP notification service is not configured.', 'SMTP_NOT_CONFIGURED');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || (smtpConfig.secure === true),
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized: smtpConfig.reject_unauthorized !== false }
  });

  console.info('[Email] Config loaded', { host, port, secure: port === 465 || smtpConfig.secure === true, recipientCount: recipients.length, ccCount: carbonCopies.length });
  console.info('[Email] Connecting SMTP');
  await transporter.verify();
  console.info('[Email] SMTP authenticated');
  console.info('[Email] Sending');
  return transporter.sendMail({
    from: senderName ? `"${senderName}" <${senderEmail}>` : senderEmail,
    to: recipients,
    cc: carbonCopies.length ? carbonCopies : undefined,
    subject: sanitizeEmailHeader(subject, '[StockFlow] Notification'),
    html,
    text
  });
};

// Helper: Retrieve stored SMTP Password from Supabase Vault (system_secrets)
const fetchStoredSmtpPassword = async () => {
  try {
    const { url, serviceRoleKey } = getServerSupabaseConfig();
    const res = await fetch(`${url}/rest/v1/rpc/admin_get_smtp_password_internal`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.ok) {
      const val = await res.json();
      const secretStr = typeof val === 'string' ? val : (val?.secret || '');
      return isValidPasswordSecret(secretStr) ? secretStr : '';
    }
  } catch (e) {
    console.warn('[SMTP Backend]: Error fetching vault SMTP password:', e.message);
  }
  return '';
};

// SMTP Email Sender Endpoint
app.post('/api/send-email', async (req, res) => {
  try {
    const body = req.body || {};
    const { to, subject, html, text, smtpConfig } = body;
    const authorization = getAuthorizationHeader(req);

    // The RPC validates auth.uid() and settings.update before SMTP is contacted.
    await callSupabaseRpcAsUser('admin_authorize_email_send', authorization);

    if (!to) {
      return res.status(400).json({ error: 'Recipient "to" address is required' });
    }

    const host = (smtpConfig?.host || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const port = Number(smtpConfig?.port || process.env.SMTP_PORT || 465);
    const isGmail = host.toLowerCase().includes('gmail.com');

    // For Port 465 or Gmail, enforce secure: true (Implicit SSL/TLS)
    const secure = (port === 465 || isGmail) ? true : (smtpConfig?.secure !== undefined ? Boolean(smtpConfig.secure) : false);
    const rejectUnauthorized = smtpConfig?.reject_unauthorized !== undefined ? Boolean(smtpConfig.reject_unauthorized) : true;

    const user = (smtpConfig?.user || process.env.SMTP_USER || 'stockflow.noreply.app@gmail.com').trim();

    // Resolve password priority with masked placeholder protection
    let pass = '';
    let passSource = 'none';

    if (isValidPasswordSecret(smtpConfig?.pass)) {
      pass = smtpConfig.pass.trim();
      passSource = 'payload pass';
    } else if (isValidPasswordSecret(smtpConfig?.new_password)) {
      pass = smtpConfig.new_password.trim();
      passSource = 'payload new_password';
    } else {
      // Try Vault RPC
      const vaultPass = await fetchStoredSmtpPassword();
      if (isValidPasswordSecret(vaultPass)) {
        pass = vaultPass.trim();
        passSource = 'supabase vault';
      } else {
        // Try Environment Variables (.env)
        const envPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD || '';
        if (isValidPasswordSecret(envPass)) {
          pass = envPass.trim();
          passSource = 'environment variables (.env)';
        }
      }
    }

    // Normalize App Password (strip internal spaces if Google App Password format)
    if (pass && isGmail) {
      pass = pass.replace(/\s+/g, '');
    }

    const senderEmail = (smtpConfig?.sender_email || user).trim();
    const senderName = (smtpConfig?.sender_name || 'StockFlow Notification').trim();
    const fromAddress = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

    // Reject anonymous sending if Username is set but Password is blank
    if (user && !pass) {
      console.warn(`[SMTP Diagnostic Warning] Username is set (${user}) but Password is blank/missing!`);
      return res.status(400).json({
        success: false,
        error: `การยืนยันตัวตน SMTP ล้มเหลว: ไม่พบรหัสผ่านสำหรับบัญชี ${user} (กรุณาระบุ SMTP Password หรือ Google App Password 16 หลัก ในหน้าตั้งค่าหรือ .env)`,
        category: 'AUTHENTICATION_FAILED'
      });
    }

    // Structured non-secret diagnostic logging
    console.log(`[SMTP Diagnostic State]:
SMTP_HOST: ${host ? 'configured (' + host + ')' : 'missing'}
SMTP_PORT: ${port}
SMTP_USER: ${user ? 'configured (' + user + ')' : 'missing'}
SMTP_PASSWORD: ${pass ? 'configured (source: ' + passSource + ')' : 'missing'}
SMTP_SECURE: ${secure}`);

    const transportOpts = {
      host,
      port,
      secure,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      tls: {
        rejectUnauthorized
      }
    };

    if (user && pass) {
      transportOpts.auth = { user, pass };
    }

    const transporter = nodemailer.createTransport(transportOpts);


    // 1. Verify Connection & Authentication before sending
    await transporter.verify();
    console.log(`[SMTP Diagnostic] Transporter verification succeeded for ${host}:${port}`);

    // 2. Submit Email
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject: subject || '[StockFlow] Notification',
      text: text || 'This is a StockFlow email notification.',
      html: html || undefined
    });

    const acceptedCount = normalizeEmailList(info.accepted).length;
    const rejectedCount = normalizeEmailList(info.rejected).length;
    console.log(`[SMTP Success] Email accepted by server for ${to}. MessageId: ${info.messageId}. Accepted: ${acceptedCount}, Rejected: ${rejectedCount}`);

    try {
      await callSupabaseRpcAsUser('admin_record_email_sent_audit', authorization, {
        p_recipient: to,
        p_subject: subject || '[StockFlow] Notification',
        p_message_id: info.messageId || null
      });
    } catch (auditError) {
      console.error('[Audit Log Error]: Email was sent but its audit record failed.', auditError);
      return res.status(502).json({
        success: false,
        error: 'Email was sent, but the audit log could not be recorded. Do not resend; contact an administrator.',
        category: 'AUDIT_LOG_FAILED',
        messageId: info.messageId,
        recipient: to
      });
    }

    res.json({ success: true, messageId: info.messageId, recipient: to, acceptedCount, rejectedCount });

  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
        category: error.code
      });
    }

    console.error('[SMTP Diagnostic Error]:', error);
    let userMsg = error.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ส่งอีเมล SMTP ได้';
    let category = 'UNKNOWN_ERROR';

    const errMsg = String(error.message || '');
    const errCode = String(error.code || '');
    const respCode = Number(error.responseCode || 0);

    if (errCode === 'ETIMEDOUT' || errCode === 'ENOTFOUND' || errCode === 'ECONNREFUSED' || errMsg.includes('Greeting never received')) {
      category = 'CONNECTION_TIMEOUT';
      userMsg = `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ SMTP (${smtpConfig?.host || 'smtp.gmail.com'}:${smtpConfig?.port || 465}) ได้ (Connection Timeout). กรุณาตรวจสอบว่าเซิร์ฟเวอร์อยู่ในเครือข่ายที่เข้าถึงอินเทอร์เน็ตได้`;
    } else if (errMsg.includes('TLS wrong version number') || errMsg.includes('CERT_HAS_EXPIRED') || errMsg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')) {
      category = 'TLS_NEGOTIATION_FAILED';
      userMsg = `เกิดข้อผิดพลาดในการเจรจาความปลอดภัย TLS กับเซิร์ฟเวอร์ SMTP. กรุณาตรวจสอบโหมด SSL/TLS หรือ STARTTLS ให้ตรงตามพอร์ตที่กำหนด`;
    } else if (respCode === 535 || respCode === 530 || errMsg.includes('530 5.7.0') || errMsg.includes('Authentication Required') || errMsg.includes('SMTP AUTH is required') || errMsg.includes('Authentication failed') || errMsg.includes('turn on SMTP Authentication')) {
      category = 'AUTHENTICATION_FAILED';
      userMsg = `การยืนยันตัวตน Gmail SMTP ล้มเหลว (530/535 Authentication Required). กรุณาตรวจสอบว่าใช้ Google App Password 16 หลักที่เปิด 2-Step Verification แล้วสำหรับบัญชี ${smtpConfig?.user || 'Gmail'}`;
    } else if (errMsg.includes('not permitted to relay') || errMsg.includes('Relay access denied') || respCode === 554) {
      category = 'RELAY_DENIED';
      userMsg = `เซิร์ฟเวอร์ SMTP ปฏิเสธการส่งผ่านอีเมล (Relay Access Denied). บัญชีผู้ใช้ไม่ได้รับอนุญาตให้ส่งแทนอีเมลผู้ส่งนี้`;
    } else if (respCode === 550 && (errMsg.includes('RBL') || errMsg.includes('JunkMail rejected') || errMsg.includes('in an RBL'))) {
      category = 'RBL_IP_REJECTED';
      userMsg = `หมายเลข IP ปัจจุบันถูกปฏิเสธโดยนโยบายความปลอดภัย RBL/Anti-Spam ของเซิร์ฟเวอร์ SMTP (550 JunkMail Rejected). กรุณาติดต่อผู้ดูแลระบบเครือข่าย/SMTP Admin`;
    } else if (errCode === 'EENVELOPE' || respCode === 550 || errMsg.includes('Recipient rejected')) {
      category = 'RECIPIENT_REJECTED';
      userMsg = `อีเมลผู้รับปลายทางถูกปฏิเสธโดยเซิร์ฟเวอร์ SMTP (Recipient Rejected). กรุณาตรวจสอบที่อยู่อีเมลผู้รับ`;
    }

    res.status(500).json({ 
      success: false,
      error: userMsg, 
      category,
      code: errCode || undefined, 
      responseCode: respCode || undefined 
    });
  }
});

// Transactional withdrawal notifications are dispatched only by this server.
// Recipient addresses and SMTP secrets never cross the browser boundary.
const notificationDispatches = new Set();

app.post('/api/notifications/withdrawal', async (req, res) => {
  try {
    const { eventType, orderId, approverName = '', rejectionReason = '' } = req.body || {};
    const authorization = getAuthorizationHeader(req);
    const allowedEvents = new Set([
      'withdrawal_submitted',
      'withdrawal_approved',
      'withdrawal_rejected',
      'withdrawal_completed'
    ]);

    if (!allowedEvents.has(eventType) || !/^[0-9a-f-]{36}$/i.test(String(orderId || ''))) {
      throw new ApiError(400, 'Invalid withdrawal notification request.', 'INVALID_NOTIFICATION_REQUEST');
    }

    const dedupeKey = `${eventType}:${orderId}`;
    if (notificationDispatches.has(dedupeKey)) {
      return res.json({ success: true, deduplicated: true, sentCount: 0 });
    }

    const [caller, permissions, orders] = await Promise.all([
      getAuthenticatedUser(authorization),
      getCallerPermissions(authorization),
      callSupabaseAsService(`/rest/v1/withdrawal_orders?select=id,requested_by,project_id,status,purpose,notes,requested_at,approved_at,approved_by,rejected_at,rejected_by,reject_reason,completed_at,completed_by,override_reason&id=eq.${encodeURIComponent(orderId)}`)
    ]);
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order) throw new ApiError(404, 'Withdrawal request was not found.', 'WITHDRAWAL_NOT_FOUND');

    const requiredPermission = eventType === 'withdrawal_submitted'
      ? 'withdrawals.create'
      : eventType === 'withdrawal_approved'
        ? 'withdrawals.approve'
        : eventType === 'withdrawal_rejected'
          ? 'withdrawals.reject'
          : order.requested_by === caller.id
            ? 'withdrawals.create'
            : 'withdrawals.approve';

    if (!permissions.has(requiredPermission) || (eventType === 'withdrawal_submitted' && order.requested_by !== caller.id)) {
      throw new ApiError(403, 'You are not allowed to dispatch this notification.', 'NOTIFICATION_PERMISSION_DENIED');
    }

    const settingsRows = await callSupabaseAsService('/rest/v1/system_settings?select=key,value&key=in.(notification_events,branding,smtp_config)');
    const settings = Object.fromEntries((settingsRows || []).map((row) => [row.key, row.value]));
    const eventConfig = settings.notification_events?.[eventType] || { enabled: true };
    if (eventConfig.enabled === false) {
      return res.json({ success: true, disabled: true, sentCount: 0 });
    }

    const fallbackRoles = eventType === 'withdrawal_submitted' ? ['admin', 'supervisor'] : [];
    const configuredRoles = [...new Set((Array.isArray(eventConfig.roles) ? eventConfig.roles : fallbackRoles)
      .map((role) => String(role || '').trim().toLowerCase())
      .filter((role) => ['admin', 'supervisor', 'staff'].includes(role)))];
    const roleFilter = configuredRoles.join(',');
    const [roleProfiles, requesterProfiles, projectRows, withdrawalItems, stockBalances, usersResponse] = await Promise.all([
      roleFilter
        ? callSupabaseAsService(`/rest/v1/profiles?select=id,full_name,role,status&status=eq.active&role=in.(${encodeURIComponent(roleFilter)})`)
        : Promise.resolve([]),
      callSupabaseAsService(`/rest/v1/profiles?select=id,full_name,position&id=eq.${encodeURIComponent(order.requested_by)}`),
      callSupabaseAsService(`/rest/v1/projects?select=id,name,project_code&id=eq.${encodeURIComponent(order.project_id)}`),
      callSupabaseAsService(`/rest/v1/withdrawal_items?select=id,item_id,quantity,available_at_approval,deducted_quantity,shortage_quantity,items(id,name,sku,unit)&order_id=eq.${encodeURIComponent(order.id)}`),
      callSupabaseAsService(`/rest/v1/stock_balance?select=item_id,balance&project_id=eq.${encodeURIComponent(order.project_id)}`),
      callSupabaseAsService('/auth/v1/admin/users?page=1&per_page=1000')
    ]);
    const userEmails = new Map((usersResponse?.users || []).map((user) => [user.id, normalizeEmail(user.email)]));
    const primaryProfiles = eventType === 'withdrawal_submitted'
      ? []
      : requesterProfiles || [];
    const recipientProfiles = [...primaryProfiles, ...(roleProfiles || [])];
    const recipients = [...new Set(recipientProfiles
      .filter((profile) => profile.id !== caller.id || eventType !== 'withdrawal_submitted')
      .map((profile) => userEmails.get(profile.id))
      .filter(Boolean)), ...normalizeEmailList(eventConfig.to_extra)];
    const ccRecipients = normalizeEmailList(eventConfig.cc_extra).filter((email) => !recipients.includes(email));

    console.info('[Email] Recipients resolved', { eventType, primaryCount: primaryProfiles.length, roleCount: roleProfiles.length, toCount: recipients.length, ccCount: ccRecipients.length });

    if (recipients.length === 0) {
      return res.status(422).json({ success: false, error: 'No valid recipient emails are configured for this notification.', code: 'NO_NOTIFICATION_RECIPIENTS' });
    }

    const participantIds = [...new Set([
      order.requested_by,
      order.approved_by,
      order.rejected_by,
      order.completed_by
    ].filter(Boolean))];
    const participantProfiles = participantIds.length > 0
      ? await callSupabaseAsService(`/rest/v1/profiles?select=id,full_name&id=in.(${participantIds.map(encodeURIComponent).join(',')})`)
      : [];
    const participantNames = new Map((participantProfiles || []).map((profile) => [profile.id, profile.full_name || 'ผู้ใช้งานระบบ']));
    const stockByItemId = new Map((stockBalances || []).map((stock) => [stock.item_id, Number(stock.balance || 0)]));
    const requester = requesterProfiles?.[0];
    const project = projectRows?.[0];
    const requestNo = `WO-${String(order.id).slice(0, 8).toUpperCase()}`;
    const eventDetails = {
      withdrawal_submitted: {
        status: 'รออนุมัติ',
        badge: 'คำขอเบิกใหม่',
        fulfillmentStatus: 'รอการพิจารณาอนุมัติ'
      },
      withdrawal_approved: {
        status: 'อนุมัติแล้ว',
        badge: 'อนุมัติแล้ว',
        fulfillmentStatus: 'รอจ่ายวัสดุ'
      },
      withdrawal_rejected: {
        status: 'ไม่อนุมัติ',
        badge: 'ไม่อนุมัติ',
        fulfillmentStatus: 'ไม่อนุมัติ'
      },
      withdrawal_completed: {
        status: 'จ่ายวัสดุแล้ว',
        badge: 'จ่ายวัสดุแล้ว',
        fulfillmentStatus: 'รับวัสดุเรียบร้อยแล้ว'
      }
    }[eventType];
    const requesterName = requester?.full_name || 'ผู้ขอเบิก';
    const requesterPosition = requester?.position || '';
    const publicBaseUrl = resolvePublicBaseUrl(settings.branding?.public_base_url || process.env.PUBLIC_APP_URL);
    
    // Map Item List for Table Renderer
    const itemsList = (withdrawalItems || []).map((wi) => {
      const requestedQty = Number(wi.quantity || 0);
      const deductedQty = wi.deducted_quantity === null || wi.deducted_quantity === undefined
        ? undefined
        : Number(wi.deducted_quantity);
      const shortageQty = wi.shortage_quantity === null || wi.shortage_quantity === undefined
        ? undefined
        : Number(wi.shortage_quantity);
      const approvedQty = eventType === 'withdrawal_approved' || eventType === 'withdrawal_completed'
        ? deductedQty ?? (shortageQty === undefined ? requestedQty : Math.max(requestedQty - shortageQty, 0))
        : undefined;

      return {
        name: wi.items?.name || 'วัสดุในระบบ',
        sku: wi.items?.sku || '',
        unit: wi.items?.unit || 'ชิ้น',
        requested_qty: requestedQty,
        approved_qty: approvedQty,
        issued_qty: eventType === 'withdrawal_completed' ? deductedQty : undefined,
        available_stock: wi.available_at_approval ?? stockByItemId.get(wi.item_id),
        available_stock_label: eventType === 'withdrawal_submitted'
          ? 'คงเหลือขณะขอเบิก'
          : 'คงเหลือขณะอนุมัติ'
      };
    });

    const totalQty = (withdrawalItems || []).reduce((total, item) => total + Number(item.quantity || 0), 0);

    const emailData = {
      app_name: settings.branding?.app_name || 'StockFlow',
      event_type: eventType,
      user_name: requesterName,
      requester_name: requesterName,
      requester_email: userEmails.get(order.requested_by) || '',
      user_position: requesterPosition,
      request_no: requestNo,
      project_name: project?.name || '-',
      project_code: project?.project_code || '',
      request_date: formatThaiDateTime(order.requested_at),
      approved_date: formatThaiDateTime(order.approved_at),
      rejected_date: formatThaiDateTime(order.rejected_at),
      completed_date: formatThaiDateTime(order.completed_at),
      status: eventDetails.status,
      status_badge: eventDetails.badge,
      fulfillment_status: eventDetails.fulfillmentStatus,
      purpose: order.purpose || '',
      note: order.notes || '',
      override_reason: order.override_reason || '',
      item_count: `${(withdrawalItems || []).length} รายการ`,
      total_quantity: `${totalQty} หน่วย`,
      total_items: (withdrawalItems || []).length,
      total_requested_quantity: totalQty,
      approved_by: approverName || participantNames.get(order.approved_by) || '',
      rejected_by: participantNames.get(order.rejected_by) || '',
      completed_by: participantNames.get(order.completed_by) || '',
      rejection_reason: rejectionReason || order.reject_reason || '',
      items: itemsList,
      action_url: publicBaseUrl ? `${publicBaseUrl}/withdrawals` : 'https://stockflow.app/withdrawals',
      year: String(new Date().getFullYear())
    };
    const subject = sanitizeEmailHeader(resolveEmailVariables(
      eventConfig.subject || `[StockFlow] คำขอเบิก ${requestNo} ${eventDetails.status}`,
      emailData
    ));
    const html = renderEmailHtml({ branding: settings.branding || {}, template: eventConfig, data: emailData });
    const textItems = itemsList.map((item, index) => {
      const itemLines = [
        `${index + 1}. ${item.name}${item.sku ? ` (${item.sku})` : ''}`,
        `   จำนวนที่ขอ: ${item.requested_qty} ${item.unit}`
      ];
      if (item.available_stock !== undefined && item.available_stock !== null) itemLines.push(`   คงเหลือขณะอนุมัติ: ${item.available_stock} ${item.unit}`);
      if (item.approved_qty !== undefined) itemLines.push(`   จำนวนที่อนุมัติ: ${item.approved_qty} ${item.unit}`);
      if (item.issued_qty !== undefined) itemLines.push(`   จำนวนที่จ่าย: ${item.issued_qty} ${item.unit}`);
      return itemLines.join('\n');
    }).join('\n');
    const text = [
      eventDetails.status,
      `เลขที่คำขอ: ${requestNo}`,
      `โครงการ: ${emailData.project_name}${emailData.project_code ? ` (${emailData.project_code})` : ''}`,
      `ผู้ขอเบิก: ${requesterName}`,
      emailData.requester_email ? `อีเมล: ${emailData.requester_email}` : '',
      `วันที่ขอเบิก: ${emailData.request_date}`,
      `สถานะ: ${eventDetails.status}`,
      textItems ? `รายการวัสดุ:\n${textItems}` : '',
      emailData.approved_by ? `ผู้อนุมัติ: ${emailData.approved_by}` : '',
      emailData.rejected_by ? `ผู้ปฏิเสธ: ${emailData.rejected_by}` : '',
      emailData.completed_by ? `ผู้จ่ายวัสดุ: ${emailData.completed_by}` : '',
      emailData.rejection_reason ? `เหตุผลที่ไม่อนุมัติ: ${emailData.rejection_reason}` : '',
      emailData.purpose ? `วัตถุประสงค์: ${emailData.purpose}` : '',
      emailData.note ? `หมายเหตุ: ${emailData.note}` : '',
      emailData.action_url
    ].filter(Boolean).join('\n');

    const info = await sendServerNotificationEmail({
      to: recipients,
      cc: ccRecipients,
      subject,
      html,
      text,
      smtpConfig: settings.smtp_config || {}
    });
    console.info('[Email] Accepted', { eventType, messageId: info.messageId, acceptedCount: info.accepted?.length || 0, rejectedCount: info.rejected?.length || 0 });
    notificationDispatches.add(dedupeKey);
    res.json({ success: true, sentCount: recipients.length, ccCount: ccRecipients.length, messageId: info.messageId, acceptedCount: info.accepted?.length || 0, rejectedCount: info.rejected?.length || 0 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'NOTIFICATION_DELIVERY_FAILED';
    console.error('[Withdrawal Notification Error]', { code, message: error.message });
    res.status(status).json({ success: false, error: 'ไม่สามารถส่งการแจ้งเตือนคำขอเบิกได้', code });
  }
});



// Upload Endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `item-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    });

    await s3.send(command);

    const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;
    res.json({ url: publicUrl });

  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});


app.post('/api/export-pdf', async (req, res) => {
  const { data, html } = req.body;
  let browser;
  try {
    const puppeteer = (await import('puppeteer')).default;
    // 1. Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    let htmlContent = '';

    if (html) {
      htmlContent = html;
    } else if (data && Array.isArray(data)) {
      // 2. Generate HTML Content for Stock Balance
      let rowsHtml = '';
      data.forEach(b => {
        rowsHtml += `
          <tr>
            <td>${b.project_name || b.โครงการ || ''}</td>
            <td>${b.item_name || b.รายการวัสดุ || ''}</td>
            <td style="text-align: right; color: #10b981;">+${b.total_in || b.รับเข้าทั้งหมด || 0}</td>
            <td style="text-align: right; color: #f59e0b;">-${b.total_out || b.เบิกออกทั้งหมด || 0}</td>
            <td style="text-align: right; font-weight: bold;">${b.balance || b.คงเหลือ || 0} ${b.unit || b.หน่วย || ''}</td>
          </tr>
        `;
      });

      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #333; }
            h1 { text-align: center; font-size: 28px; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; font-size: 16px; }
            th { background-color: #f8fafc; text-align: left; font-weight: 600; }
            .timestamp { text-align: right; font-size: 14px; color: #666; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>รายงานสรุป (Stock Report)</h1>
          <div class="timestamp">ข้อมูล ณ วันที่: ${new Date().toLocaleDateString('th-TH')}</div>
          <table>
            <thead>
              <tr>
                <th>โครงการ</th>
                <th>รายการวัสดุ</th>
                <th style="text-align: right;">ยอดรับเข้า</th>
                <th style="text-align: right;">ยอดเบิกจ่าย</th>
                <th style="text-align: right;">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
        </html>
      `;
    } else {
      throw new Error('Invalid request payload. Must provide "html" or "data" array.');
    }

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 3. Create raw PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }
    });
    
    await browser.close();

    // 4. Send PDF buffer to client
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Stock_Report.pdf"'
    });
    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    console.error(error);
    if (browser) await browser.close();
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ==========================================
// MinIO / S3 Orphan Files Management APIs
// ==========================================

const getMinioClient = () => {
  const endpointHost = String(process.env.MINIO_ENDPOINT || '').trim();
  const port = String(process.env.MINIO_PORT || '').trim();
  const useSsl = process.env.MINIO_USE_SSL === 'true';

  if (!endpointHost || !port || !process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY || !process.env.MINIO_BUCKET) {
    throw new ApiError(
      503,
      'ไม่สามารถเชื่อมต่อระบบจัดเก็บไฟล์ MinIO ได้: ยังไม่ได้กำหนดค่า MinIO บนเซิร์ฟเวอร์',
      'MINIO_NOT_CONFIGURED'
    );
  }

  const endpoint = `${useSsl ? 'https' : 'http'}://${endpointHost}:${port}`;

  return new S3Client({
    endpoint,
    region: process.env.MINIO_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY,
      secretAccessKey: process.env.MINIO_SECRET_KEY
    },
    forcePathStyle: true
  });
};

const sanitizePrefix = (rawPrefix) => {
  if (!rawPrefix || typeof rawPrefix !== 'string') return '';
  return rawPrefix.replace(/^[\/\\]+/, '').replace(/\.\.[\/\\]/g, '').replace(/\0/g, '');
};

// Internal Helper: Collect database file references from Supabase REST API
const collectDatabaseReferences = async () => {
  const refSet = new Set();
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.warn('[MinIO Backend]: Supabase URL or Anon key missing in environment');
    return refSet;
  }

  try {
    // 1. Fetch profiles avatar_url
    const profilesRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=avatar_url`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
    });
    if (profilesRes.ok) {
      const profiles = await profilesRes.json();
      profiles.forEach(p => {
        if (p.avatar_url) {
          refSet.add(p.avatar_url);
          const parts = p.avatar_url.split('/');
          refSet.add(parts[parts.length - 1]);
        }
      });
    }

    // 2. Fetch items image_url
    const itemsRes = await fetch(`${supabaseUrl}/rest/v1/items?select=image_url`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
    });
    if (itemsRes.ok) {
      const items = await itemsRes.json();
      items.forEach(i => {
        if (i.image_url) {
          refSet.add(i.image_url);
          const parts = i.image_url.split('/');
          refSet.add(parts[parts.length - 1]);
        }
      });
    }
  } catch (err) {
    console.error('[MinIO Backend]: Error fetching database references:', err);
  }

  return refSet;
};

// 1. Scan Orphan Files Endpoint
app.post('/api/minio/scan-orphans', async (req, res) => {
  res.type('json');
  try {
    const { prefix: rawPrefix, ageThresholdDays = 7 } = req.body || {};
    const prefix = sanitizePrefix(rawPrefix);
    const bucket = process.env.MINIO_BUCKET;

    console.log(`[MinIO Scan]: Incoming request | Bucket="${bucket}", Prefix="${prefix}", AgeThreshold=${ageThresholdDays} days`);

    const s3Client = getMinioClient();
    const dbRefs = await collectDatabaseReferences();

    let isTruncated = true;
    let continuationToken;
    const objects = [];
    const now = Date.now();
    const thresholdMs = Number(ageThresholdDays) * 24 * 60 * 60 * 1000;

    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken
      });

      const response = await s3Client.send(command);
      const contents = response.Contents || [];

      contents.forEach(obj => {
        const lastMod = new Date(obj.LastModified).getTime();
        const ageMs = now - lastMod;
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        const key = obj.Key;
        const filename = key.split('/').pop();

        // Check if object is referenced in DB
        const isReferenced = dbRefs.has(key) || dbRefs.has(filename);
        const isOldEnough = ageMs >= thresholdMs;

        // Classify as orphan only if unreferenced AND older than threshold
        if (!isReferenced && isOldEnough) {
          objects.push({
            key,
            size: obj.Size,
            lastModified: obj.LastModified,
            ageDays,
            bucket,
            isOrphan: true
          });
        }
      });

      isTruncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    const totalOrphanSize = objects.reduce((sum, o) => sum + o.size, 0);

    res.json({
      success: true,
      data: {
        files: objects,
        total: objects.length,
        totalOrphanSize,
        bucket,
        prefix,
        ageThresholdDays: Number(ageThresholdDays)
      }
    });
  } catch (error) {
    const unavailable = error instanceof ApiError || error?.code === 'ECONNREFUSED' || error?.name === 'AggregateError';
    console.error('[MinIO Scan Error]:', { code: error?.code, message: error?.message });
    res.status(unavailable ? 503 : 500).json({
      success: false,
      error: {
        code: unavailable ? (error?.code || 'MINIO_UNAVAILABLE') : 'MINIO_SCAN_FAILED',
        message: error.message || 'เกิดข้อผิดพลาดในการสแกนไฟล์ MinIO/S3'
      }
    });
  }
});

// 2. Safe Delete Selected Orphan Files Endpoint (Re-validates server-side)
app.post('/api/minio/delete-orphans', async (req, res) => {
  res.type('json');
  try {
    const { keys = [], prefix: rawPrefix, ageThresholdDays = 7 } = req.body || {};
    const bucket = process.env.MINIO_BUCKET || 'stockflow';

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'กรุณาเลือกไฟล์ขยะที่ต้องการลบอย่างน้อย 1 รายการ'
        }
      });
    }

    console.log(`[MinIO Delete]: Request to delete ${keys.length} objects from bucket="${bucket}"`);

    // Double Server-Side Security Re-validation
    const dbRefs = await collectDatabaseReferences();
    const safeKeysToDelete = [];
    const rejectedKeys = [];

    keys.forEach(key => {
      const sanitizedKey = sanitizePrefix(key);
      const filename = sanitizedKey.split('/').pop();
      if (dbRefs.has(sanitizedKey) || dbRefs.has(filename)) {
        console.warn(`[MinIO Security Alert]: Prevented deletion of database-referenced file: ${key}`);
        rejectedKeys.push(key);
      } else {
        safeKeysToDelete.push(sanitizedKey);
      }
    });

    if (safeKeysToDelete.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SECURITY_REJECTION',
          message: 'ไม่อนุญาตให้ลบไฟล์ที่ถูกอ้างอิงอยู่ในฐานข้อมูลระบบ'
        },
        rejectedKeys
      });
    }

    const s3Client = getMinioClient();
    const successKeys = [];
    const failedKeys = [];

    for (const key of safeKeysToDelete) {
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        successKeys.push(key);
      } catch (err) {
        console.error(`[MinIO Delete Error for ${key}]:`, err.message);
        failedKeys.push({ key, reason: err.message });
      }
    }

    console.log(`[MinIO Delete Complete]: Deleted ${successKeys.length}/${keys.length} files successfully`);

    res.json({
      success: true,
      data: {
        summary: {
          totalRequested: keys.length,
          totalDeleted: successKeys.length,
          totalFailed: failedKeys.length,
          totalRejectedSecurity: rejectedKeys.length
        },
        successKeys,
        failedKeys,
        rejectedKeys,
        bucket
      }
    });
  } catch (error) {
    console.error('[MinIO Delete Error]:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MINIO_DELETE_FAILED',
        message: error.message || 'เกิดข้อผิดพลาดในการลบไฟล์ขยะ MinIO'
      }
    });
  }
});


// 3. Export Scan Results CSV Endpoint
app.post('/api/minio/export-csv', async (req, res) => {
  try {
    const { scanResults = [] } = req.body || {};

    const csvRows = [
      ['Object Key', 'File Size (Bytes)', 'Last Modified', 'Age (Days)', 'Orphan Status', 'Selected Status'].join(',')
    ];

    scanResults.forEach(item => {
      const row = [
        `"${item.key || ''}"`,
        item.size || 0,
        `"${item.lastModified || ''}"`,
        item.ageDays || 0,
        `"${item.isOrphan ? 'ORPHAN' : 'REFERENCED'}"`,
        `"${item.selected ? 'SELECTED' : 'UNSELECTED'}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="minio_orphan_files_report.csv"'
    });
    res.send(Buffer.from('\uFEFF' + csvContent, 'utf-8')); // Add BOM for Excel UTF-8 display

  } catch (error) {
    console.error('[MinIO Export CSV Error]:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งออกไฟล์ CSV' });
  }
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`PDF Service running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Backend Startup Notice]: Port ${PORT} is already in use by an active StockFlow backend instance. Reusing existing server process.`);
  } else {
    console.error('[Backend Startup Error]:', err);
  }
});
