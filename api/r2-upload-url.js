import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const ALLOWED_FOLDERS = ['avatars', 'items', 'documents', 'receipts', 'attachments', 'uploads'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'csv', 'xlsx', 'txt'];
const FALLBACK_STORAGE_BUCKET = 'stockflow-assets';

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
    const supabaseKey =
      serviceRoleKey ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY;

    // 2. Authenticate Caller via Supabase JWT Bearer Token or Internal Secret
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const internalSecret = req.headers['x-internal-secret'];

    let isAuthorized = false;

    if (internalSecret && process.env.INTERNAL_SERVICE_KEY && internalSecret === process.env.INTERNAL_SERVICE_KEY) {
      isAuthorized = true;
    } else if (token && supabaseUrl && supabaseKey) {
      try {
        const supabaseAuthClient = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: { user }, error: authErr } = await supabaseAuthClient.auth.getUser(token);
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

    const parsedBody = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});
    const { fileName, contentType, folder = 'uploads', fileBase64 = null } = parsedBody;

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
    const effectiveContentType = contentType || 'application/octet-stream';

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

    const hasR2Credentials = Boolean(accountId && accessKeyId && secretAccessKey);

    // 6. Direct Server-Side Upload when fileBase64 is provided (eliminates browser CORS & checksum mismatch)
    if (fileBase64 && typeof fileBase64 === 'string') {
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      if (fileBuffer.length > 0) {
        let r2Error = null;

        if (hasR2Credentials) {
          try {
            const s3Client = new S3Client({
              region: 'auto',
              endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
              credentials: {
                accessKeyId,
                secretAccessKey,
              },
              requestChecksumCalculation: 'WHEN_REQUIRED',
              responseChecksumValidation: 'WHEN_REQUIRED',
            });

            const directPutCommand = new PutObjectCommand({
              Bucket: bucketName,
              Key: key,
              Body: fileBuffer,
              ContentType: effectiveContentType,
            });
            await s3Client.send(directPutCommand);

            return res.status(200).json({
              success: true,
              uploaded: true,
              uploadUrl: null,
              publicUrl: `${publicBaseUrl}/${key}`,
              key,
              provider: 'r2',
            });
          } catch (err) {
            r2Error = err;
            console.warn('[R2 API] Direct R2 upload failed, attempting Supabase Storage fallback:', err.message);
          }
        }

        // Automatic fallback to Supabase Storage if R2 credentials are missing or R2 upload failed
        if (supabaseUrl && serviceRoleKey) {
          try {
            const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
              auth: { autoRefreshToken: false, persistSession: false }
            });

            await supabaseAdmin.storage.createBucket(FALLBACK_STORAGE_BUCKET, {
              public: true,
            }).catch(() => {});

            const { error: uploadErr } = await supabaseAdmin.storage
              .from(FALLBACK_STORAGE_BUCKET)
              .upload(key, fileBuffer, {
                contentType: effectiveContentType,
                upsert: true,
              });

            if (uploadErr) {
              throw uploadErr;
            }

            const { data: pubData } = supabaseAdmin.storage
              .from(FALLBACK_STORAGE_BUCKET)
              .getPublicUrl(key);

            if (pubData?.publicUrl) {
              return res.status(200).json({
                success: true,
                uploaded: true,
                uploadUrl: null,
                publicUrl: pubData.publicUrl,
                key,
                provider: 'supabase-storage',
              });
            }
          } catch (fallbackErr) {
            console.error('[R2 API] Supabase Storage fallback error:', fallbackErr.message);
          }
        }

        if (r2Error) {
          throw r2Error;
        }
      }
    }

    // 7. Presigned URL generation when fileBase64 is not sent
    if (!hasR2Credentials) {
      if (supabaseUrl && serviceRoleKey) {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        await supabaseAdmin.storage.createBucket(FALLBACK_STORAGE_BUCKET, {
          public: true,
        }).catch(() => {});

        const { data: signedData, error: signedErr } = await supabaseAdmin.storage
          .from(FALLBACK_STORAGE_BUCKET)
          .createSignedUploadUrl(key);

        if (!signedErr && signedData?.signedUrl) {
          const { data: pubData } = supabaseAdmin.storage
            .from(FALLBACK_STORAGE_BUCKET)
            .getPublicUrl(key);

          return res.status(200).json({
            success: true,
            uploaded: false,
            uploadUrl: signedData.signedUrl,
            publicUrl: pubData?.publicUrl || '',
            key,
            provider: 'supabase-storage',
          });
        }
      }

      console.error('[Storage API] Missing credentials in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Storage credentials not configured.',
      });
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: effectiveContentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });
    const publicUrl = `${publicBaseUrl}/${key}`;

    return res.status(200).json({
      success: true,
      uploaded: false,
      uploadUrl,
      publicUrl,
      key,
      provider: 'r2',
    });
  } catch (error) {
    console.error('[R2 API] Error generating presigned URL or uploading:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate upload URL',
    });
  }
}
