import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

/**
 * Mirror the normalization function from api/send-email.js for unit testing
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

test('normalizes Nodemailer SMTP error codes into clear actionable Thai messages', () => {
  const authErr = normalizeNodemailerError({ code: 'EAUTH', responseCode: 535, message: '535 5.7.8 Bad credentials' });
  assert.equal(authErr.status, 401);
  assert.equal(authErr.code, 'EAUTH');
  assert.match(authErr.message, /Google App Password/);

  const timeoutErr = normalizeNodemailerError({ code: 'ETIMEDOUT', message: 'Connection timeout' });
  assert.equal(timeoutErr.status, 504);
  assert.equal(timeoutErr.code, 'ETIMEDOUT');
  assert.match(timeoutErr.message, /หมดเวลา/);

  const hostErr = normalizeNodemailerError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' });
  assert.equal(hostErr.status, 502);
  assert.equal(hostErr.code, 'ENOTFOUND');
  assert.match(hostErr.message, /ไม่พบที่อยู่ Mail Server/);

  const envelopeErr = normalizeNodemailerError({ code: 'EENVELOPE', message: 'No recipients defined' });
  assert.equal(envelopeErr.status, 400);
  assert.equal(envelopeErr.code, 'EENVELOPE');
  assert.match(envelopeErr.message, /Envelope ไม่ถูกต้อง/);

  const genericErr = normalizeNodemailerError(new Error('Unknown failure'));
  assert.equal(genericErr.status, 500);
  assert.equal(genericErr.code, 'ESEND');
});

test('builds and delivers mail payload via Nodemailer jsonTransport with Thai encoding and multipart structure', async () => {
  const transporter = nodemailer.createTransport({
    jsonTransport: true,
  });

  const mailOptions = {
    from: '"StockFlow Notification" <notification@stockflowth.online>',
    to: 'approver@example.com, manager@example.com',
    cc: 'audit@example.com',
    bcc: 'archive@example.com',
    subject: '[StockFlow] คำขอเบิก WO-2026-001 รอการอนุมัติ',
    text: 'กรุณาตรวจสอบคำขอเบิก WO-2026-001',
    html: '<p>กรุณาตรวจสอบคำขอเบิก <strong>WO-2026-001</strong></p>',
    headers: {
      'Content-Language': 'th',
    },
    envelope: {
      from: 'notification@stockflowth.online',
      to: ['approver@example.com', 'manager@example.com', 'audit@example.com', 'archive@example.com'],
    },
    replyTo: 'support@stockflowth.online',
  };

  const info = await transporter.sendMail(mailOptions);
  assert.ok(info.messageId);

  const parsed = JSON.parse(info.message);
  assert.equal(parsed.from.address, 'notification@stockflowth.online');
  assert.equal(parsed.from.name, 'StockFlow Notification');
  assert.equal(parsed.to.length, 2);
  assert.equal(parsed.to[0].address, 'approver@example.com');
  assert.equal(parsed.to[1].address, 'manager@example.com');
  assert.equal(parsed.cc[0].address, 'audit@example.com');
  assert.equal(parsed.bcc[0].address, 'archive@example.com');
  assert.equal(parsed.subject, '[StockFlow] คำขอเบิก WO-2026-001 รอการอนุมัติ');
  assert.match(parsed.text, /WO-2026-001/);
  assert.match(parsed.html, /<strong>WO-2026-001<\/strong>/);
  assert.equal(parsed.headers['Content-Language'] || parsed.headers['content-language'], 'th');
});

test('handles inline CID attachments correctly for corporate email branding', async () => {
  const transporter = nodemailer.createTransport({
    jsonTransport: true,
  });

  const dummyLogoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const mailOptions = {
    from: '"StockFlow Notification" <notification@stockflowth.online>',
    to: 'user@example.com',
    subject: '[StockFlow] แจ้งเตือนพร้อมโลโก้ระบบ',
    text: 'การแจ้งเตือนพร้อมตราสัญลักษณ์',
    html: '<div><img src="cid:stockflow-logo" alt="Logo" /><p>เนื้อหาอีเมล</p></div>',
    attachments: [
      {
        filename: 'stockflow-logo.png',
        content: dummyLogoBase64,
        encoding: 'base64',
        cid: 'stockflow-logo',
        contentType: 'image/png',
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  const parsed = JSON.parse(info.message);

  assert.ok(Array.isArray(parsed.attachments));
  assert.equal(parsed.attachments.length, 1);
  const att = parsed.attachments[0];
  assert.equal(att.filename, 'stockflow-logo.png');
  assert.equal(att.cid, 'stockflow-logo');
  assert.equal(att.contentType, 'image/png');
  assert.equal(att.content, dummyLogoBase64);
});

test('verifies Nodemailer transport configuration with pooling, timeouts, and TLS options', () => {
  const host = 'smtp.gmail.com';
  const port = 465;
  const isSecure = true;
  const rejectUnauthorized = true;

  const transportConfig = {
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    host,
    port,
    secure: isSecure,
    auth: {
      user: 'test@example.com',
      pass: 'secret123',
    },
    tls: {
      rejectUnauthorized,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };

  const transporter = nodemailer.createTransport(transportConfig);

  assert.equal(transporter.options.host, 'smtp.gmail.com');
  assert.equal(transporter.options.port, 465);
  assert.equal(transporter.options.secure, true);
  assert.equal(transporter.options.pool, true);
  assert.equal(transporter.options.maxConnections, 3);
  assert.equal(transporter.options.maxMessages, 100);
  assert.equal(transporter.options.tls.rejectUnauthorized, true);
  assert.equal(transporter.options.connectionTimeout, 10000);
  assert.equal(transporter.options.greetingTimeout, 10000);
  assert.equal(transporter.options.socketTimeout, 15000);
});
