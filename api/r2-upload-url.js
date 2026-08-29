import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export default async function handler(req, res) {
  // 1. Set robust CORS headers for all browser origins
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { fileName, contentType, folder = 'uploads' } = req.body || {};

    if (!fileName) {
      return res.status(400).json({ success: false, message: 'fileName is required' });
    }

    // 2. Load R2 Credentials from environment variables
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME || 'stockflow-assets';
    const publicBaseUrl = (
      process.env.VITE_R2_PUBLIC_URL ||
      process.env.R2_PUBLIC_URL ||
      'https://pub-275b37eccbba4e63941708ae5dfa46a7.r2.dev'
    ).replace(/\/+$/, '');

    if (!accountId || !accessKeyId || !secretAccessKey) {
      console.error('[R2 API] Missing R2 credentials in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing Cloudflare R2 credentials.',
      });
    }

    // 3. Clean up folder & fileName to build a safe object key
    const sanitizedFolder = String(folder || 'uploads')
      .trim()
      .replace(/^\/+|\/+$/g, '');

    const sanitizedFileName = String(fileName)
      .trim()
      .replace(/^\/+/, '');

    const key = sanitizedFileName.startsWith(sanitizedFolder + '/')
      ? sanitizedFileName
      : `${sanitizedFolder}/${sanitizedFileName}`;

    // 4. Initialize S3 Client configured for Cloudflare R2
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const effectiveContentType = contentType || 'application/octet-stream';

    // 5. Generate Presigned PUT URL (valid for 5 minutes / 300 seconds)
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: effectiveContentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });
    const publicUrl = `${publicBaseUrl}/${key}`;

    return res.status(200).json({
      success: true,
      uploadUrl,
      publicUrl,
      key,
    });
  } catch (error) {
    console.error('[R2 API] Error generating presigned URL:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate upload URL',
    });
  }
}
