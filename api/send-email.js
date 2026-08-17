import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

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
    const { to, subject, html, text, smtpOverrides } = req.body || {};

    if (!to) {
      return res.status(400).json({ message: 'Recipient email (to) is required.' });
    }

    const host = smtpOverrides?.host || process.env.SMTP_HOST || 'smtp.gmail.com';
    // Port 465 with Implicit TLS is the gold standard for Gmail SMTP deliverability
    const port = Number(smtpOverrides?.port || process.env.SMTP_PORT || 465);
    const isSecure = port === 465;
    const user = smtpOverrides?.user || process.env.SMTP_USER || 'stockflow.noreply.app@gmail.com';
    const pass = smtpOverrides?.pass || process.env.SMTP_PASS || 'yitosoxabxycxdij';
    const senderEmail = smtpOverrides?.sender_email || process.env.SMTP_SENDER_EMAIL || user;
    const senderName = smtpOverrides?.sender_name || process.env.SMTP_SENDER_NAME || 'StockFlow Notification';

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
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject: subject || 'StockFlow Notification',
      text: plainText,
      html: html || `<p>${plainText}</p>`,
      messageId,
      date: new Date(),
      // Envelope sender alignment for SPF / DKIM verification on Gmail & Microsoft 365
      envelope: {
        from: user,
        to: Array.isArray(to) ? to : [to],
      },
      headers: {
        'X-Priority': '3', // Normal priority (avoids bulk/spam classification)
        'X-Entity-Ref-ID': crypto.randomUUID(),
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Vercel API send-email] Sent successfully:', info.messageId || messageId);

    return res.status(200).json({
      success: true,
      messageId: info.messageId || messageId,
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

