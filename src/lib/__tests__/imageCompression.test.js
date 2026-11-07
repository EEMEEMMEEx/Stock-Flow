import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReturnPhotoFile,
  calculateCompressedDimensions,
  compressImageFile,
  compressAndUploadReturnPhoto,
  validateReturnItemsPhotos,
  formatFileSize,
  ReturnPhotoError,
  MAX_RAW_FILE_SIZE_BYTES,
} from '../imageCompression.js';

describe('imageCompression utility', () => {
  describe('validateReturnPhotoFile', () => {
    it('rejects null or undefined file', () => {
      const res = validateReturnPhotoFile(null);
      assert.equal(res.isValid, false);
      assert.equal(res.code, 'MISSING_FILE');
    });

    it('rejects empty 0-byte file', () => {
      const emptyFile = new File([], 'photo.jpg', { type: 'image/jpeg' });
      const res = validateReturnPhotoFile(emptyFile);
      assert.equal(res.isValid, false);
      assert.equal(res.code, 'EMPTY_FILE');
    });

    it('rejects files larger than MAX_RAW_FILE_SIZE_BYTES', () => {
      const fakeOversized = {
        name: 'huge.jpg',
        type: 'image/jpeg',
        size: MAX_RAW_FILE_SIZE_BYTES + 1024,
      };
      const res = validateReturnPhotoFile(fakeOversized);
      assert.equal(res.isValid, false);
      assert.equal(res.code, 'FILE_TOO_LARGE');
    });

    it('rejects non-image MIME types and extensions', () => {
      const pdfFile = new File(['%PDF-1.4'], 'manual.pdf', { type: 'application/pdf' });
      const res = validateReturnPhotoFile(pdfFile);
      assert.equal(res.isValid, false);
      assert.equal(res.code, 'INVALID_FILE_TYPE');
    });

    it('accepts valid JPEG, PNG, and WebP files', () => {
      const jpg = new File(['imgdata'], 'proof.jpg', { type: 'image/jpeg' });
      const png = new File(['imgdata'], 'proof.png', { type: 'image/png' });
      const webp = new File(['imgdata'], 'proof.webp', { type: 'image/webp' });
      assert.equal(validateReturnPhotoFile(jpg).isValid, true);
      assert.equal(validateReturnPhotoFile(png).isValid, true);
      assert.equal(validateReturnPhotoFile(webp).isValid, true);
    });
  });

  describe('calculateCompressedDimensions', () => {
    it('keeps original dimensions when already within maxDimension', () => {
      const res = calculateCompressedDimensions(800, 600, 1280);
      assert.deepEqual(res, { width: 800, height: 600, resized: false });
    });

    it('scales down landscape image proportionally to maxDimension', () => {
      const res = calculateCompressedDimensions(4000, 3000, 1280);
      assert.equal(res.width, 1280);
      assert.equal(res.height, 960);
      assert.equal(res.resized, true);
    });

    it('scales down portrait image proportionally to maxDimension', () => {
      const res = calculateCompressedDimensions(1500, 3000, 1280);
      assert.equal(res.width, 640);
      assert.equal(res.height, 1280);
      assert.equal(res.resized, true);
    });

    it('throws ReturnPhotoError on invalid dimensions', () => {
      assert.throws(
        () => calculateCompressedDimensions(0, -100, 1280),
        (err) => err instanceof ReturnPhotoError && err.code === 'COMPRESSION_FAILED'
      );
    });
  });

  describe('compressImageFile', () => {
    it('resizes and compresses image via canvas and reduces file size', async () => {
      const rawContent = new Uint8Array(500_000); // 500 KB raw
      const rawFile = new File([rawContent], 'camera_capture_01.png', { type: 'image/png' });

      let drawnDims = null;
      let usedQuality = null;

      const result = await compressImageFile(rawFile, {
        maxDimension: 1280,
        quality: 0.75,
        decodeImageFn: async () => ({
          source: {},
          width: 3840,
          height: 2160,
          cleanup: () => {},
        }),
        createCanvasFn: (w, h) => ({
          width: w,
          height: h,
          getContext: () => ({
            fillStyle: '',
            fillRect: () => {},
            drawImage: (_src, _x, _y, dw, dh) => {
              drawnDims = { dw, dh };
            },
          }),
          toBlob: (cb, type, q) => {
            usedQuality = q;
            const smallerPayload = new Uint8Array(64_000); // 64 KB compressed
            cb(new Blob([smallerPayload], { type }));
          },
        }),
      });

      assert.equal(result.width, 1280);
      assert.equal(result.height, 720);
      assert.equal(result.resized, true);
      assert.deepEqual(drawnDims, { dw: 1280, dh: 720 });
      assert.equal(usedQuality, 0.75);
      assert.equal(result.originalSize, 500_000);
      assert.equal(result.compressedSize, 64_000);
      assert.ok(result.compressedSize < result.originalSize);
      assert.equal(result.file.name, 'camera_capture_01.jpg');
      assert.equal(result.file.type, 'image/jpeg');
    });

    it('throws COMPRESSION_FAILED when image decoding fails', async () => {
      const rawFile = new File(['corrupt'], 'corrupt.jpg', { type: 'image/jpeg' });
      await assert.rejects(
        () =>
          compressImageFile(rawFile, {
            decodeImageFn: async () => {
              throw new Error('Corrupt JPEG header');
            },
          }),
        (err) => err instanceof ReturnPhotoError && err.code === 'COMPRESSION_FAILED'
      );
    });

    it('throws COMPRESSION_FAILED when canvas toBlob returns null', async () => {
      const rawFile = new File(['valid'], 'photo.jpg', { type: 'image/jpeg' });
      await assert.rejects(
        () =>
          compressImageFile(rawFile, {
            decodeImageFn: async () => ({
              source: {},
              width: 1000,
              height: 800,
              cleanup: () => {},
            }),
            createCanvasFn: (w, h) => ({
              width: w,
              height: h,
              getContext: () => ({
                fillStyle: '',
                fillRect: () => {},
                drawImage: () => {},
              }),
              toBlob: (cb) => cb(null),
            }),
          }),
        (err) => err instanceof ReturnPhotoError && err.code === 'COMPRESSION_FAILED'
      );
    });
  });

  describe('compressAndUploadReturnPhoto', () => {
    it('compresses and uploads to R2 attachments folder and returns publicUrl', async () => {
      const rawFile = new File(['raw_bytes'], 'item1.png', { type: 'image/png' });
      let uploadedFolder = null;
      let uploadedFileName = null;

      const res = await compressAndUploadReturnPhoto(rawFile, {
        orderNumber: 'CHK-202611-0001',
        checkoutItemId: 'item-uuid-123',
        compressFn: async () => ({
          file: new File(['compressed'], 'item1.jpg', { type: 'image/jpeg' }),
          width: 1024,
          height: 768,
          originalSize: 204800,
          compressedSize: 40960,
          resized: true,
        }),
        uploadFn: async (_file, folder, customName) => {
          uploadedFolder = folder;
          uploadedFileName = customName;
          return 'https://cdn.example.com/attachments/' + customName;
        },
      });

      assert.equal(uploadedFolder, 'attachments');
      assert.match(uploadedFileName, /^return_CHK-202611-0001_item-uuid-123_\d+\.jpg$/);
      assert.match(res.publicUrl, /^https:\/\/cdn\.example\.com\/attachments\//);
      assert.equal(res.originalSize, 204800);
      assert.equal(res.compressedSize, 40960);
    });

    it('throws UPLOAD_FAILED when R2 upload returns null or rejects', async () => {
      const rawFile = new File(['raw_bytes'], 'item1.png', { type: 'image/png' });
      await assert.rejects(
        () =>
          compressAndUploadReturnPhoto(rawFile, {
            compressFn: async () => ({
              file: new File(['compressed'], 'item1.jpg', { type: 'image/jpeg' }),
              width: 800,
              height: 600,
              originalSize: 1000,
              compressedSize: 500,
              resized: false,
            }),
            uploadFn: async () => null,
          }),
        (err) => err instanceof ReturnPhotoError && err.code === 'UPLOAD_FAILED'
      );
    });
  });

  describe('validateReturnItemsPhotos', () => {
    it('blocks submission when any returned item is missing evidence_photo_url', () => {
      const items = [
        { checkout_item_id: '1', item_name: 'Drill', returned_quantity: 1, evidence_photo_url: 'https://r2.dev/a.jpg' },
        { checkout_item_id: '2', item_name: 'Meter', returned_quantity: 2, evidence_photo_url: '' },
        { checkout_item_id: '3', item_name: 'Cable', returned_quantity: 0, evidence_photo_url: '' },
      ];
      const res = validateReturnItemsPhotos(items);
      assert.equal(res.isValid, false);
      assert.equal(res.itemsToProcess.length, 2);
      assert.equal(res.missingPhotoItems.length, 1);
      assert.equal(res.missingPhotoItems[0].checkout_item_id, '2');
    });

    it('blocks submission when an item photo is still uploading or has an error', () => {
      const items = [
        {
          checkout_item_id: '1',
          item_name: 'Drill',
          returned_quantity: 1,
          evidence_photo_url: 'https://r2.dev/a.jpg',
          photoUploading: true,
        },
      ];
      const res = validateReturnItemsPhotos(items);
      assert.equal(res.isValid, false);
      assert.equal(res.uploadingItems.length, 1);
    });

    it('passes when every returned item has a valid uploaded photo URL', () => {
      const items = [
        { checkout_item_id: '1', item_name: 'Drill', returned_quantity: 1, evidence_photo_url: 'https://r2.dev/a.jpg' },
        { checkout_item_id: '2', item_name: 'Meter', returned_quantity: 2, evidence_photo_url: 'https://r2.dev/b.jpg' },
        { checkout_item_id: '3', item_name: 'Cable', returned_quantity: 0, evidence_photo_url: '' },
      ];
      const res = validateReturnItemsPhotos(items);
      assert.equal(res.isValid, true);
      assert.equal(res.missingPhotoItems.length, 0);
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes into B, KB, and MB', () => {
      assert.equal(formatFileSize(0), '0 KB');
      assert.equal(formatFileSize(512), '512 B');
      assert.equal(formatFileSize(1024 * 120), '120 KB');
      assert.equal(formatFileSize(1024 * 1024 * 2.5), '2.5 MB');
    });
  });
});
