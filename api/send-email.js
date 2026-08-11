import nodemailer from 'nodemailer';

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
    const port = Number(smtpOverrides?.port || process.env.SMTP_PORT || 587);
    const user = smtpOverrides?.user || process.env.SMTP_USER || 'stockflow.noreply.app@gmail.com';
    const pass = smtpOverrides?.pass || process.env.SMTP_PASS || 'yitosoxabxycxdij';
    const senderName = smtpOverrides?.sender_name || process.env.SMTP_SENDER_NAME || 'StockFlow Notification';

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: `"${senderName}" <${user}>`,
      to,
      subject: subject || 'StockFlow Notification',
      html: html || `<p>${text || 'StockFlow Notification'}</p>`,
      text: text || undefined,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Vercel API send-email] Sent successfully:', info.messageId);

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
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
