import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Setup S3 Client for Cloudflare R2
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

// Upload Endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

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

// Helper function to run ghostscript
const convertToPdfA = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    // In production Docker, 'gs' is available. In windows dev, need to ensure 'gswin64c' or similar is in PATH.
    // For universal compatibility in our Docker container, we use 'gs'
    const command = `gs -dPDFA=2 -dBATCH -dNOPAUSE -dNOOUTERSAVE -sColorConversionStrategy=RGB -sDEVICE=pdfwrite -sOutputFile=${outputPath} ${inputPath}`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Ghostscript Error:', stderr);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
};

app.post('/api/export-pdf', async (req, res) => {
  const { data } = req.body;
  let browser;
  try {
    // 1. Launch Puppeteer
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 2. Generate HTML Content
    // Read local font as base64 for embedding (assume it's downloaded in fonts/)
    // For MVP, if font file doesn't exist, we will just use a web font or system font fallback.
    // Here we use Google Fonts TH Sarabun New for simplicity, which works perfectly with Puppeteer.
    
    let rowsHtml = '';
    data.forEach(b => {
      rowsHtml += `
        <tr>
          <td>${b.project_name}</td>
          <td>${b.item_name}</td>
          <td style="text-align: right; color: #10b981;">+${b.total_in}</td>
          <td style="text-align: right; color: #f59e0b;">-${b.total_out}</td>
          <td style="text-align: right; font-weight: bold;">${b.balance} ${b.unit}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Sarabun', sans-serif;
            padding: 40px;
            color: #333;
          }
          h1 {
            text-align: center;
            font-size: 28px;
            margin-bottom: 30px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 12px;
            font-size: 16px;
          }
          th {
            background-color: #f8fafc;
            text-align: left;
            font-weight: 600;
          }
          .timestamp {
            text-align: right;
            font-size: 14px;
            color: #666;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <h1>รายงานสรุปยอดคงเหลือ (Stock Balance)</h1>
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

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 3. Create raw PDF
    const tempPdfPath = path.join(__dirname, 'temp_report.pdf');
    const finalPdfPath = path.join(__dirname, 'final_report_pdfa.pdf');
    
    await page.pdf({
      path: tempPdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }
    });
    
    await browser.close();

    // 4. Convert to PDF/A-2b using Ghostscript
    try {
      await convertToPdfA(tempPdfPath, finalPdfPath);
      // Send the PDF/A file
      res.download(finalPdfPath, 'Stock_Report_PDFA.pdf', (err) => {
        // Cleanup temp files
        if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
        if (fs.existsSync(finalPdfPath)) fs.unlinkSync(finalPdfPath);
      });
    } catch (gsError) {
      console.warn("Ghostscript failed or not installed. Falling back to standard PDF.");
      // Fallback: Just send the raw Puppeteer PDF if Ghostscript fails (e.g. on Windows dev machine without GS)
      res.download(tempPdfPath, 'Stock_Report.pdf', (err) => {
        if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
      });
    }

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
