import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const ALLOWED_FOLDERS = ['avatars', 'items', 'documents', 'receipts', 'attachments', 'uploads'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'csv', 'xlsx', 'txt'];

export default async function handler(req, res) {
  // 1. Set robust CORS and Security headers
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Internal-Secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
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

    // 2. Authenticate Caller via Supabase JWT Bearer Token or Internal Secret
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const internalSecret = req.headers['x-internal-secret'];

    let isAuthorized = false;

    if (internalSecret && process.env.INTERNAL_SERVICE_KEY && internalSecret === process.env.INTERNAL_SERVICE_KEY) {
      isAuthorized = true;
    } else if (token && supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (!authErr && user) {
          isAuthorized = true;
        }
      } catch (authEx) {
        console.warn('[R2 API] Auth token verification error:', authEx.message);
      }
    }

    if (!isAuthorized) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Valid authentication token required to request upload URLs.'
      });
    }

    const { fileName, contentType, folder = 'uploads' } = req.body || {};

    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ success: false, message: 'fileName is required and must be a string' });
    }

    // 3. Strict Folder Validation & Whitelisting
    const rawFolder = String(folder || 'uploads').trim().toLowerCase();
    const cleanFolder = rawFolder.replace(/[^a-z0-9_-]/g, '');
    if (!ALLOWED_FOLDERS.includes(cleanFolder) || cleanFolder.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid destination folder. Allowed folders: ${ALLOWED_FOLDERS.join(', ')}`
      });
    }

    // 4. Path Traversal Prevention & Filename Extension Validation
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fileName: Path traversal characters are not permitted.'
      });
    }

    const extMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
    const extension = extMatch ? extMatch[1] : '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return res.status(400).json({
        success: false,
        message: `File extension ".${extension}" is not permitted. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`
      });
    }

    const safeBaseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const uniqueId = crypto.randomUUID();
    const key = `${cleanFolder}/${uniqueId}-${safeBaseName}.${extension}`;

    // 5. Load R2 Credentials from environment variables
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

    // 6. Initialize S3 Client configured for Cloudflare R2
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const effectiveContentType = contentType || 'application/octet-stream';

    // 7. Generate Presigned PUT URL (valid for 5 minutes / 300 seconds)
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

