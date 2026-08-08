import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// SMTP Email Sender Endpoint
app.post('/api/send-email', async (req, res) => {
  try {
    const body = req.body || {};
    const { to, subject, html, text, smtpConfig } = body;


    if (!to) {
      return res.status(400).json({ error: 'Recipient "to" address is required' });
    }

    const host = smtpConfig?.host || process.env.SMTP_HOST || 'it.forth.co.th';
    const port = Number(smtpConfig?.port || process.env.SMTP_PORT || 465);
    const secure = smtpConfig?.secure !== undefined ? Boolean(smtpConfig.secure) : (port === 465);
    const rejectUnauthorized = smtpConfig?.reject_unauthorized !== undefined ? Boolean(smtpConfig.reject_unauthorized) : false;

    const user = smtpConfig?.user || process.env.SMTP_USER || 'noreply-app@it.forth.co.th';
    const pass = smtpConfig?.pass || process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';
    const senderEmail = smtpConfig?.sender_email || user;
    const senderName = smtpConfig?.sender_name || 'StockFlow Notification';

    const fromAddress = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

    // Structured non-secret diagnostic logging
    console.log(`[SMTP Diagnostic] Connecting to ${host}:${port} | Secure(Implicit SSL): ${secure} | AuthUser: ${user ? user : 'ANONYMOUS'} | RejectUnauthorized: ${rejectUnauthorized}`);

    const transportOpts = {
      host,
      port,
      secure,
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized
      }
    };

    if (user && pass) {
      transportOpts.auth = { user, pass };
    } else if (user) {
      const envPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
      if (envPass) {
        transportOpts.auth = { user, pass: envPass };
      }
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

    console.log(`[SMTP Success] Email accepted by server for ${to}. MessageId: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId, recipient: to });

  } catch (error) {
    console.error('[SMTP Diagnostic Error]:', error);
    let userMsg = error.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ส่งอีเมล SMTP ได้';
    let category = 'UNKNOWN_ERROR';

    const errMsg = String(error.message || '');
    const errCode = String(error.code || '');
    const respCode = Number(error.responseCode || 0);

    if (errCode === 'ETIMEDOUT' || errCode === 'ENOTFOUND' || errCode === 'ECONNREFUSED' || errMsg.includes('Greeting never received')) {
      category = 'CONNECTION_TIMEOUT';
      userMsg = `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ SMTP (${smtpConfig?.host || 'it.forth.co.th'}:${smtpConfig?.port || 465}) ได้ (Connection Timeout). กรุณาตรวจสอบว่าเซิร์ฟเวอร์อยู่ในเครือข่ายภายในองค์กรหรือผ่าน VPN`;
    } else if (errMsg.includes('TLS wrong version number') || errMsg.includes('CERT_HAS_EXPIRED') || errMsg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')) {
      category = 'TLS_NEGOTIATION_FAILED';
      userMsg = `เกิดข้อผิดพลาดในการเจรจาความปลอดภัย TLS กับเซิร์ฟเวอร์ SMTP. กรุณาตรวจสอบโหมด SSL/TLS หรือ STARTTLS ให้ตรงตามพอร์ตที่กำหนด`;
    } else if (respCode === 535 || errMsg.includes('SMTP AUTH is required') || errMsg.includes('Authentication failed') || errMsg.includes('turn on SMTP Authentication')) {
      category = 'AUTHENTICATION_FAILED';
      userMsg = `การยืนยันตัวตน SMTP ล้มเหลว (550/535 SMTP AUTH Required). กรุณาตรวจสอบ Username และ Password ในการตั้งค่า`;
    } else if (errMsg.includes('not permitted to relay') || errMsg.includes('Relay access denied') || respCode === 554) {
      category = 'RELAY_DENIED';
      userMsg = `เซิร์ฟเวอร์ SMTP ปฏิเสธการส่งผ่านอีเมล (Relay Access Denied). บัญชีผู้ใช้ไม่ได้รับอนุญาตให้ส่งแทนอีเมลผู้ส่งนี้`;
    } else if (respCode === 550 && (errMsg.includes('RBL') || errMsg.includes('JunkMail rejected') || errMsg.includes('in an RBL'))) {
      category = 'RBL_IP_REJECTED';
      userMsg = `หมายเลข IP ปัจจุบันถูกปฏิเสธโดยนโยบายความปลอดภัย RBL/Anti-Spam ของเซิร์ฟเวอร์ SMTP (550 JunkMail Rejected). กรุณาติดต่อผู้ดูแลระบบเครือข่าย/SMTP Admin เพื่อปลดล็อก IP หรือส่งผ่าน VPN องค์กร`;
    } else if (errCode === 'EENVELOPE' || respCode === 550 || errMsg.includes('Recipient rejected')) {
      category = 'RECIPIENT_REJECTED';
      userMsg = `อีเมลผู้รับปลายทางถูกปฏิเสธโดยเซิร์ฟเวอร์ SMTP (Recipient Rejected). กรุณาตรวจสอบที่อยู่อีเมลผู้รับ`;
    }

    res.status(500).json({ 
      error: userMsg, 
      category,
      code: errCode || undefined, 
      responseCode: respCode || undefined 
    });
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
      headless: 'new',
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PDF Service running on port ${PORT}`);
});
