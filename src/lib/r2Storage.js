import toast from 'react-hot-toast';
import { supabase } from './supabase.js';

export const ALLOWED_R2_FOLDERS = Object.freeze([
  'avatars',
  'items',
  'documents',
  'receipts',
  'attachments',
  'uploads'
]);

export const R2_PUBLIC_URL = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_R2_PUBLIC_URL) ||
  (typeof globalThis !== 'undefined' && (globalThis.process?.env?.VITE_R2_PUBLIC_URL || globalThis.process?.env?.R2_PUBLIC_URL)) ||
  'https://pub-275b37eccbba4e63941708ae5dfa46a7.r2.dev'
).replace(/\/+$/, '');

export const SUPABASE_STORAGE_PUBLIC_URL = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof globalThis !== 'undefined' && (globalThis.process?.env?.VITE_SUPABASE_URL || globalThis.process?.env?.SUPABASE_URL)) ||
  'https://vrnutseacyejnzwcfamv.supabase.co'
).replace(/\/+$/, '') + '/storage/v1/object/public/stockflow-assets';

/**
 * Resolves a stored path or URL into a fully-qualified accessible media URL.
 * If the value is an object key (e.g. 'attachments/...', 'items/...'), prepends R2_PUBLIC_URL.
 * If it's already an absolute URL (http/https/data/blob), returns it as-is.
 *
 * @param {string} pathOrUrl - Stored object key or absolute URL
 * @returns {string} - Fully qualified URL or empty string
 */
export function resolveStorageUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return '';
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return '';

  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  const cleanKey = trimmed.replace(/^\/+/, '');
  return `${R2_PUBLIC_URL}/${cleanKey}`;
}

/**
 * Returns the fallback storage URL (Supabase Storage bucket) for a given storage key or URL.
 * Used when the primary object storage CDN returns 404 or encounters network issues.
 *
 * @param {string} pathOrUrl
 * @returns {string}
 */
export function getFallbackStorageUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return '';
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return '';

  if (trimmed.includes('/storage/v1/object/public/stockflow-assets/')) {
    return trimmed;
  }

  const cleanKey = extractStorageKey(trimmed);
  if (!cleanKey) return '';
  return `${SUPABASE_STORAGE_PUBLIC_URL}/${cleanKey}`;
}

/**
 * Image onError handler to seamlessly fallback from primary storage CDN to fallback storage bucket.
 * Prevents broken images when assets have not yet synced or when primary storage returns 404.
 *
 * @param {Event} event - Image error event
 * @param {string} pathOrUrl - Original key or URL
 */
export function handleStorageImageError(event, pathOrUrl) {
  if (!event || !event.currentTarget) return;
  const fallbackUrl = getFallbackStorageUrl(pathOrUrl);
  if (fallbackUrl && event.currentTarget.src !== fallbackUrl) {
    event.currentTarget.src = fallbackUrl;
  }
}

/**
 * Normalizes any storage URL (Supabase Storage, R2 CDN, or raw path) into a clean object key.
 *
 * @param {string} urlOrKey - Full URL or key
 * @returns {string} - Relative object key (e.g. 'attachments/xyz.jpg')
 */
export function extractStorageKey(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const trimmed = urlOrKey.trim();
  if (!trimmed) return '';

  // Supabase Storage URL: .../stockflow-assets/attachments/...
  if (trimmed.includes('/stockflow-assets/')) {
    const afterBucket = trimmed.split('/stockflow-assets/')[1] || '';
    return afterBucket.split('?')[0].replace(/^\/+/, '');
  }

  // Standard absolute URL: extract pathname
  if (/^https?:\/\/[^/]+\/(.+)$/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname.replace(/^\/+/, '').split('?')[0];
    } catch {
      // Fallback to manual split
    }
  }

  // Raw key or path
  return trimmed.split('?')[0].replace(/^\/+/, '');
}

/**
 * Extracts a human-friendly display file name from an object key or URL.
 * Strips directory prefixes and random UUID prefixes when present.
 *
 * @param {string} urlOrKey
 * @returns {string}
 */
export function extractFileName(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const key = extractStorageKey(urlOrKey);
  const base = key.split('/').pop() || '';

  // Match return photo pattern: return_CHK-XXXX-XXXX
  const returnMatch = base.match(/(return_[A-Za-z0-9_-]+)/);
  if (returnMatch) {
    const ext = base.split('.').pop();
    return ext && ext !== base ? `${returnMatch[1]}.${ext}` : returnMatch[1];
  }

  // Match 36-char UUID prefix: e.g. 5d7384d2-e361-4305-8e5e-e33f1413dae2-filename.jpg
  const uuidPrefixMatch = base.match(/^[0-9a-fA-F-]{36}-(.+)$/);
  if (uuidPrefixMatch) {
    return uuidPrefixMatch[1];
  }

  return base;
}

const MAX_INLINE_UPLOAD_BYTES = 3.5 * 1024 * 1024; // 3.5 MB limit for single-request serverless upload

/**
 * Validates whether a destination folder is in the Cloudflare R2 allowed whitelist
 * @param {string} folder - Destination folder name
 * @returns {{ isValid: boolean, cleanFolder: string, error?: string }}
 */
export function validateR2Folder(folder) {
  if (!folder || typeof folder !== 'string') {
    return {
      isValid: false,
      cleanFolder: 'uploads',
      error: `Destination folder is required. Allowed folders: ${ALLOWED_R2_FOLDERS.join(', ')}`
    };
  }

  const rawFolder = String(folder).trim().toLowerCase();
  const cleanFolder = rawFolder.replace(/[^a-z0-9_-]/g, '');

  if (!ALLOWED_R2_FOLDERS.includes(cleanFolder) || cleanFolder.length === 0) {
    return {
      isValid: false,
      cleanFolder,
      error: `Invalid destination folder "${folder}". Allowed folders: ${ALLOWED_R2_FOLDERS.join(', ')}`
    };
  }

  return {
    isValid: true,
    cleanFolder
  };
}

/**
 * Convert a File or Blob to a Base64 string so the Serverless API can upload directly to R2
 * without requiring browser-to-R2 CORS preflight.
 * @param {File|Blob} file
 * @returns {Promise<string|null>}
 */
async function fileToBase64(file) {
  if (!file) return null;
  if (typeof file.size === 'number' && file.size > MAX_INLINE_UPLOAD_BYTES) {
    return null;
  }

  try {
    if (typeof FileReader !== 'undefined' && (typeof Blob === 'undefined' || file instanceof Blob)) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64 || null);
        };
        reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
        reader.readAsDataURL(file);
      });
    }

    if (typeof file.arrayBuffer === 'function') {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      if (typeof btoa === 'function') {
        return btoa(binary);
      }
    }
  } catch (err) {
    console.warn('[r2Storage] Could not encode file to base64 for inline upload:', err);
  }

  return null;
}

/**
 * Upload any File or Blob via Serverless API / Presigned URL and return both object key and public URL
 *
 * @param {File|Blob} file - The file object to upload
 * @param {string} folder - Destination folder name (must be one of ALLOWED_R2_FOLDERS)
 * @param {string} [customFileName] - Optional explicit file name or path
 * @param {boolean} [silent] - If true, do not display error toast
 * @returns {Promise<{ key: string, publicUrl: string }|null>}
 */
export async function uploadFileWithKey(file, folder = 'uploads', customFileName = null, silent = false) {
  if (!file) {
    throw new Error('No file provided for upload');
  }

  // 1. Validate destination folder against whitelist before network request
  const folderValidation = validateR2Folder(folder);
  if (!folderValidation.isValid) {
    const errorMsg = folderValidation.error;
    console.error('[r2Storage] Destination folder validation error:', errorMsg);
    if (!silent) {
      toast.error('Failed to upload file: ' + errorMsg);
    }
    return null;
  }
  const cleanFolder = folderValidation.cleanFolder;

  // 2. Generate clean file name and prevent path traversal
  const rawFileName = customFileName || file.name || `file_${Date.now()}.png`;
  const sanitizedFileName = rawFileName
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_');

  // Determine API endpoint: prefer local /api endpoint on localhost / full-stack servers
  const isBrowser = typeof window !== 'undefined';
  const isGithubPages = isBrowser && (
    window.location.hostname === 'github.io' || 
    window.location.hostname.endsWith('.github.io')
  );
  const isLocalhost = isBrowser && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  );
  
  const customServiceUrl = import.meta.env.VITE_R2_SERVICE_URL;
  const productionEndpoint = (isBrowser && !isGithubPages && window.location.origin)
    ? `${window.location.origin}/api/r2-upload-url`
    : 'https://www.stockflowth.online/api/r2-upload-url';
  
  // When running locally on Vite or production domain, use relative or dynamically resolved endpoint
  const targetEndpoint = customServiceUrl || (isLocalhost ? '/api/r2-upload-url' : productionEndpoint);

  try {
    const authHeaders = {};
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (authErr) {
      console.warn('[r2Storage] Could not retrieve session token:', authErr);
    }

    const fileBase64 = await fileToBase64(file);
    const requestPayload = {
      fileName: sanitizedFileName,
      contentType: file.type || 'application/octet-stream',
      folder: cleanFolder,
      ...(fileBase64 ? { fileBase64 } : {}),
    };

    // 3. Request Server-Side Upload or Presigned Upload URL from Serverless API
    const presignResponse = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(requestPayload),
    });

    const presignData = await presignResponse.json().catch(() => ({}));

    if (presignResponse.ok && presignData.success) {
      const resolvedKey = presignData.key || extractStorageKey(presignData.publicUrl) || `${cleanFolder}/${sanitizedFileName}`;
      if (presignData.uploaded && presignData.publicUrl) {
        return {
          key: resolvedKey,
          publicUrl: `${presignData.publicUrl}?t=${Date.now()}`
        };
      }
      if (presignData.uploadUrl) {
        const publicUrl = await executeDirectPutUpload(file, presignData.uploadUrl, presignData.publicUrl);
        return {
          key: resolvedKey,
          publicUrl
        };
      }
    }

    // If relative/custom endpoint failed and we are not already on productionEndpoint, retry with production endpoint
    if (targetEndpoint !== productionEndpoint) {
      try {
        const fallbackRes = await fetch(productionEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify(requestPayload),
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        if (fallbackRes.ok && fallbackData.success) {
          const fallbackKey = fallbackData.key || extractStorageKey(fallbackData.publicUrl) || `${cleanFolder}/${sanitizedFileName}`;
          if (fallbackData.uploaded && fallbackData.publicUrl) {
            return {
              key: fallbackKey,
              publicUrl: `${fallbackData.publicUrl}?t=${Date.now()}`
            };
          }
          if (fallbackData.uploadUrl) {
            const publicUrl = await executeDirectPutUpload(file, fallbackData.uploadUrl, fallbackData.publicUrl);
            return {
              key: fallbackKey,
              publicUrl
            };
          }
        }
      } catch {
        // Ignore secondary fallback network error and throw original error
      }
    }

    throw new Error(presignData.message || 'Failed to obtain upload URL from server');
  } catch (error) {
    console.error('[r2Storage] Upload error:', error);
    if (!silent) {
      toast.error('Failed to upload file: ' + (error.message || 'An error occurred'));
    }
    return null;
  }
}

/**
 * Upload any File or Blob directly to storage via Serverless API / Presigned URL
 * 
 * @param {File|Blob} file - The file object to upload
 * @param {string} folder - Destination folder name (must be one of ALLOWED_R2_FOLDERS)
 * @param {string} [customFileName] - Optional explicit file name or path
 * @param {boolean} [silent] - If true, do not display error toast (useful when caller has fallback)
 * @returns {Promise<string|null>} - Returns the public CDN URL of the uploaded file
 */
export async function uploadFileToR2(file, folder = 'uploads', customFileName = null, silent = false) {
  const result = await uploadFileWithKey(file, folder, customFileName, silent);
  return result?.publicUrl || null;
}

/**
 * Execute HTTP PUT upload directly from browser to storage endpoint
 */
async function executeDirectPutUpload(file, uploadUrl, publicUrl) {
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!putResponse.ok) {
    throw new Error(`Upload endpoint returned status ${putResponse.status} ${putResponse.statusText}`);
  }

  // Append timestamp to bypass browser cache on immediate reload
  const cacheBustUrl = `${publicUrl}?t=${Date.now()}`;
  return cacheBustUrl;
}
