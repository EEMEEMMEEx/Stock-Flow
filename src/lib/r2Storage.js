import toast from 'react-hot-toast';

/**
 * Upload any File or Blob directly to Cloudflare R2 via Presigned URL
 * 
 * @param {File|Blob} file - The file object to upload
 * @param {string} folder - Destination folder name (e.g. 'avatars', 'items', 'documents')
 * @param {string} [customFileName] - Optional explicit file name or path
 * @param {boolean} [silent] - If true, do not display error toast (useful when caller has fallback)
 * @returns {Promise<string|null>} - Returns the public CDN URL of the uploaded file
 */
export async function uploadFileToR2(file, folder = 'uploads', customFileName = null, silent = false) {
  if (!file) {
    throw new Error('ไม่พบไฟล์ที่ต้องการอัปโหลด');
  }

  // 1. Generate clean file name
  const rawFileName = customFileName || file.name || `file_${Date.now()}.png`;
  const sanitizedFileName = rawFileName.replace(/[^a-zA-Z0-9._\-/]/g, '_');

  // Determine API endpoint: prefer local /api endpoint on localhost / full-stack servers
  const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  );
  
  const customServiceUrl = import.meta.env.VITE_R2_SERVICE_URL;
  const vercelEndpoint = 'https://stock-flow-pi-coral.vercel.app/api/r2-upload-url';
  
  // When running locally on Vite, hit local Vite dev middleware directly (http://localhost:5173/api/r2-upload-url)
  const targetEndpoint = customServiceUrl || (isLocalhost ? '/api/r2-upload-url' : vercelEndpoint);

  try {
    // 2. Request Presigned Upload URL from Serverless API
    const presignResponse = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: sanitizedFileName,
        contentType: file.type || 'application/octet-stream',
        folder,
      }),
    });

    const presignData = await presignResponse.json().catch(() => ({}));

    if (!presignResponse.ok || !presignData.success || !presignData.uploadUrl) {
      // If relative/custom endpoint failed and we are not already on vercelEndpoint, retry with Vercel
      if (targetEndpoint !== vercelEndpoint) {
        try {
          const fallbackRes = await fetch(vercelEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: sanitizedFileName,
              contentType: file.type || 'application/octet-stream',
              folder,
            }),
          });
          const fallbackData = await fallbackRes.json().catch(() => ({}));
          if (fallbackRes.ok && fallbackData.success && fallbackData.uploadUrl) {
            return await executeDirectPutUpload(file, fallbackData.uploadUrl, fallbackData.publicUrl);
          }
        } catch {
          // Ignore secondary fallback network error and throw original error
        }
      }
      throw new Error(presignData.message || 'ไม่สามารถขอ Upload URL จากเซิร์ฟเวอร์ได้');
    }

    return await executeDirectPutUpload(file, presignData.uploadUrl, presignData.publicUrl);
  } catch (error) {
    console.error('[r2Storage] Upload error:', error);
    if (!silent) {
      toast.error('อัปโหลดไฟล์ไปยัง Cloudflare R2 ไม่สำเร็จ: ' + (error.message || 'เกิดข้อผิดพลาด'));
    }
    return null;
  }
}

/**
 * Execute HTTP PUT upload directly from browser to Cloudflare R2
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
    throw new Error(`Cloudflare R2 ตอบกลับรหัสสถานะ ${putResponse.status} ${putResponse.statusText}`);
  }

  // Append timestamp to bypass browser cache on immediate reload
  const cacheBustUrl = `${publicUrl}?t=${Date.now()}`;
  return cacheBustUrl;
}
