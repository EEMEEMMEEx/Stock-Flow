export const DEFAULT_MAX_DIMENSION = 1280;
export const DEFAULT_IMAGE_QUALITY = 0.75;
export const DEFAULT_OUTPUT_TYPE = 'image/jpeg';
export const MAX_RAW_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB raw limit before compression

export const ALLOWED_IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export const ALLOWED_IMAGE_EXTENSIONS = Object.freeze([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
]);

/**
 * Custom error class with machine-readable code for photo validation, compression, and upload errors.
 */
export class ReturnPhotoError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'ReturnPhotoError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Validate a raw image file selected by the borrower before attempting client-side compression.
 * @param {File|Blob} file
 * @returns {{ isValid: boolean, error?: string, code?: string }}
 */
export function validateReturnPhotoFile(file) {
  if (!file) {
    return {
      isValid: false,
      code: 'MISSING_FILE',
      error: 'Please select a photo file for this returned item.',
    };
  }

  if (typeof file.size === 'number' && file.size <= 0) {
    return {
      isValid: false,
      code: 'EMPTY_FILE',
      error: 'The selected image file is empty.',
    };
  }

  if (typeof file.size === 'number' && file.size > MAX_RAW_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      code: 'FILE_TOO_LARGE',
      error: 'Image file size exceeds the 20 MB maximum limit.',
    };
  }

  const mimeType = String(file.type || '').toLowerCase().trim();
  const fileName = String(file.name || '').toLowerCase().trim();
  const extMatch = fileName.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  const hasValidMime = mimeType ? ALLOWED_IMAGE_MIME_TYPES.includes(mimeType) || mimeType.startsWith('image/') : false;
  const hasValidExt = ext ? ALLOWED_IMAGE_EXTENSIONS.includes(ext) : false;

  if (!hasValidMime && !hasValidExt) {
    return {
      isValid: false,
      code: 'INVALID_FILE_TYPE',
      error: 'Unsupported file format. Please upload a valid image (JPG, PNG, or WebP).',
    };
  }

  return { isValid: true };
}

/**
 * Calculate target width and height while preserving aspect ratio and never upscaling.
 * @param {number} width
 * @param {number} height
 * @param {number} [maxDimension=1280]
 * @returns {{ width: number, height: number, resized: boolean }}
 */
export function calculateCompressedDimensions(width, height, maxDimension = DEFAULT_MAX_DIMENSION) {
  const srcW = Number(width);
  const srcH = Number(height);
  const limit = Number(maxDimension) > 0 ? Number(maxDimension) : DEFAULT_MAX_DIMENSION;

  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
    throw new ReturnPhotoError('COMPRESSION_FAILED', 'Invalid source image dimensions.');
  }

  if (srcW <= limit && srcH <= limit) {
    return {
      width: Math.max(1, Math.round(srcW)),
      height: Math.max(1, Math.round(srcH)),
      resized: false,
    };
  }

  const scale = limit / Math.max(srcW, srcH);
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
    resized: true,
  };
}

/**
 * Decode an image File/Blob in the browser into a drawable source ({ source, width, height, cleanup }).
 * @param {File|Blob} file
 */
async function decodeBrowserImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => {
          if (typeof bitmap.close === 'function') {
            try { bitmap.close(); } catch { /* ignore */ }
          }
        },
      };
    } catch {
      // Fallback to HTMLImageElement if createImageBitmap fails on a specific format
    }
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new ReturnPhotoError('COMPRESSION_FAILED', 'Image decoding APIs are unavailable in this environment.');
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => {
          try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
        },
      });
    };

    img.onerror = (err) => {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
      reject(new ReturnPhotoError('COMPRESSION_FAILED', 'Failed to decode the selected image file.', err));
    };

    img.src = objectUrl;
  });
}

/**
 * Compress an image File/Blob on the client side using HTML5 Canvas.
 * Resizes to maxDimension (default 1280px) and encodes with reduced quality (default 0.75 JPEG).
 *
 * @param {File|Blob} file - Source image file
 * @param {object} [options]
 * @param {number} [options.maxDimension=1280]
 * @param {number} [options.quality=0.75]
 * @param {string} [options.outputType='image/jpeg']
 * @param {Function} [options.decodeImageFn] - Optional injectable decoder for unit testing
 * @param {Function} [options.createCanvasFn] - Optional injectable canvas factory for unit testing
 * @returns {Promise<{ file: File, width: number, height: number, originalSize: number, compressedSize: number, resized: boolean }>}
 */
export async function compressImageFile(file, options = {}) {
  const validation = validateReturnPhotoFile(file);
  if (!validation.isValid) {
    throw new ReturnPhotoError(validation.code || 'INVALID_FILE', validation.error);
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_IMAGE_QUALITY;
  const outputType = options.outputType || DEFAULT_OUTPUT_TYPE;
  const decodeFn = options.decodeImageFn || decodeBrowserImage;
  const createCanvas = options.createCanvasFn || ((w, h) => {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    throw new ReturnPhotoError('COMPRESSION_FAILED', 'Canvas API is unavailable for client-side image compression.');
  });

  let decoded = null;
  try {
    decoded = await decodeFn(file);
    const { width, height, resized } = calculateCompressedDimensions(
      decoded.width,
      decoded.height,
      maxDimension
    );

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ReturnPhotoError('COMPRESSION_FAILED', 'Unable to initialize 2D canvas context for compression.');
    }

    // Fill white background for JPEG output so transparent PNG pixels don't turn black
    if (outputType === 'image/jpeg' || outputType === 'image/jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(decoded.source, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      if (typeof canvas.toBlob !== 'function') {
        reject(new ReturnPhotoError('COMPRESSION_FAILED', 'Canvas toBlob API is not supported.'));
        return;
      }
      canvas.toBlob(
        (resultBlob) => {
          if (!resultBlob || resultBlob.size <= 0) {
            reject(new ReturnPhotoError('COMPRESSION_FAILED', 'Image compression produced an empty output file.'));
            return;
          }
          resolve(resultBlob);
        },
        outputType,
        quality
      );
    });

    const ext = outputType === 'image/webp' ? 'webp' : outputType === 'image/png' ? 'png' : 'jpg';
    const rawBaseName = String(file.name || 'return_photo')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60) || 'return_photo';
    const compressedFileName = `${rawBaseName}.${ext}`;

    const compressedFile = new File([blob], compressedFileName, {
      type: blob.type || outputType,
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      width,
      height,
      originalSize: Number(file.size || 0),
      compressedSize: Number(compressedFile.size || 0),
      resized,
    };
  } catch (err) {
    if (err instanceof ReturnPhotoError) {
      throw err;
    }
    throw new ReturnPhotoError(
      'COMPRESSION_FAILED',
      err?.message || 'Failed to compress image before upload.',
      err
    );
  } finally {
    if (decoded && typeof decoded.cleanup === 'function') {
      decoded.cleanup();
    }
  }
}

/**
 * Compress an item return proof photo on the client side and upload it to Cloudflare R2.
 *
 * @param {File|Blob} file - Raw image selected by the user
 * @param {object} [params]
 * @param {string} [params.orderNumber]
 * @param {string} [params.checkoutItemId]
 * @param {number} [params.maxDimension=1280]
 * @param {number} [params.quality=0.75]
 * @param {Function} [params.compressFn] - Optional override for testing
 * @param {Function} [params.uploadFn] - Optional override for testing
 * @returns {Promise<{ publicUrl: string, originalSize: number, compressedSize: number, width: number, height: number }>}
 */
export async function compressAndUploadReturnPhoto(file, params = {}) {
  const {
    orderNumber = 'order',
    checkoutItemId = 'item',
    maxDimension = DEFAULT_MAX_DIMENSION,
    quality = DEFAULT_IMAGE_QUALITY,
    compressFn = compressImageFile,
    uploadFn = null,
  } = params;

  const compressed = await compressFn(file, {
    maxDimension,
    quality,
    outputType: DEFAULT_OUTPUT_TYPE,
  });

  const safeOrder = String(orderNumber || 'order').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const safeItem = String(checkoutItemId || 'item').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36);
  const customFileName = `return_${safeOrder}_${safeItem}_${Date.now()}.jpg`;

  let publicUrl = null;
  try {
    const effectiveUploadFn = uploadFn || (await import('./r2Storage.js')).uploadFileToR2;
    publicUrl = await effectiveUploadFn(compressed.file, 'attachments', customFileName, true);
  } catch (uploadErr) {
    throw new ReturnPhotoError(
      'UPLOAD_FAILED',
      uploadErr?.message || 'Failed to upload return proof photo to Cloudflare R2.',
      uploadErr
    );
  }

  if (!publicUrl || typeof publicUrl !== 'string') {
    throw new ReturnPhotoError(
      'UPLOAD_FAILED',
      'Failed to upload return proof photo to Cloudflare R2.'
    );
  }

  return {
    publicUrl,
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
    width: compressed.width,
    height: compressed.height,
  };
}

/**
 * Validate that every returned item (returned_quantity > 0) has exactly 1 uploaded photo URL
 * and no pending upload or error state.
 *
 * @param {Array<object>} returnItems
 * @returns {{ isValid: boolean, itemsToProcess: Array<object>, missingPhotoItems: Array<object>, uploadingItems: Array<object>, errorItems: Array<object> }}
 */
export function validateReturnItemsPhotos(returnItems = []) {
  const list = Array.isArray(returnItems) ? returnItems : [];
  const itemsToProcess = list.filter((item) => Number(item?.returned_quantity) > 0);
  const uploadingItems = itemsToProcess.filter((item) => Boolean(item?.photoUploading));
  const errorItems = itemsToProcess.filter((item) => Boolean(item?.photoError));
  const missingPhotoItems = itemsToProcess.filter((item) => {
    const url = String(item?.evidence_photo_url || '').trim();
    return !url || (!url.startsWith('http://') && !url.startsWith('https://'));
  });

  const isValid =
    itemsToProcess.length > 0 &&
    uploadingItems.length === 0 &&
    errorItems.length === 0 &&
    missingPhotoItems.length === 0;

  return {
    isValid,
    itemsToProcess,
    missingPhotoItems,
    uploadingItems,
    errorItems,
  };
}

/**
 * Format byte size into a compact human-readable string (e.g. "245 KB", "1.4 MB").
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
