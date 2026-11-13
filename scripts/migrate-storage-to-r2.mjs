import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'stockflow-assets';
const publicBaseUrl = (
  process.env.VITE_R2_PUBLIC_URL ||
  process.env.R2_PUBLIC_URL ||
  'https://pub-275b37eccbba4e63941708ae5dfa46a7.r2.dev'
).replace(/\/+$/, '');

const BACKUP_DIR = path.resolve('scripts/migration-backups');
const LATEST_BACKUP_FILE = path.join(BACKUP_DIR, 'latest-storage-rollback.json');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isRollback = args.has('--rollback');

if (!supabaseUrl || !supabaseKey) {
  console.error('[Error] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let s3Client = null;
if (accountId && accessKeyId && secretAccessKey) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/**
 * Normalizes any storage URL or path into a clean relative object key
 */
function extractObjectKey(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const trimmed = urlOrKey.trim();
  if (!trimmed) return '';

  if (trimmed.includes('/stockflow-assets/')) {
    const after = trimmed.split('/stockflow-assets/')[1] || '';
    return after.split('?')[0].replace(/^\/+/, '');
  }

  if (/^https?:\/\/[^/]+\/(.+)$/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname.replace(/^\/+/, '').split('?')[0];
    } catch {
      // Fallback
    }
  }

  return trimmed.split('?')[0].replace(/^\/+/, '');
}

/**
 * Check whether an object key is publicly reachable on R2 CDN (HTTP 200)
 */
async function checkExistsOnR2(objectKey) {
  if (!objectKey) return false;
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  try {
    const res = await fetch(`${publicBaseUrl}/${encodedKey}`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check whether an object key is publicly reachable on Supabase Storage Fallback (HTTP 200)
 */
async function checkExistsOnSupabaseFallback(objectKey) {
  if (!objectKey) return false;
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const fallbackBase = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/stockflow-assets`;
  try {
    const res = await fetch(`${fallbackBase}/${encodedKey}`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Upload buffer to Cloudflare R2 directly via S3 API
 */
async function uploadToR2(buffer, key, contentType) {
  if (!s3Client) {
    throw new Error('Missing Cloudflare R2 credentials in environment variables');
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  });

  return await s3Client.send(command);
}

/**
 * Rollback all migrated rows to their original URLs from the latest backup snapshot
 */
async function executeRollback() {
  console.log('======================================================');
  console.log('🔄 Executing Storage Rollback from Snapshot');
  console.log('======================================================');

  if (!fs.existsSync(LATEST_BACKUP_FILE)) {
    console.error(`[Error] Rollback file not found at: ${LATEST_BACKUP_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(LATEST_BACKUP_FILE, 'utf8');
  const backupRecords = JSON.parse(raw);

  if (!Array.isArray(backupRecords) || backupRecords.length === 0) {
    console.log('[Notice] No records found in latest rollback snapshot.');
    return;
  }

  console.log(`Found ${backupRecords.length} records in rollback snapshot.\n`);

  let restoredCount = 0;
  let failedCount = 0;

  for (const record of backupRecords) {
    const { table, id, column, original_url } = record;
    console.log(`[Rollback] Restoring ${table}.${column} (ID: ${id}) -> ${original_url}`);

    if (isDryRun) {
      console.log('  -> [DRY-RUN] Skipped live update');
      restoredCount++;
      continue;
    }

    try {
      const { error } = await supabase
        .from(table)
        .update({ [column]: original_url })
        .eq('id', id);

      if (error) throw error;
      console.log('  -> [OK] Successfully restored');
      restoredCount++;
    } catch (err) {
      console.error(`  -> [FAIL] Failed to restore row: ${err.message}`);
      failedCount++;
    }
  }

  console.log('\n======================================================');
  console.log(`Rollback Complete: ${restoredCount} restored, ${failedCount} failed.`);
  console.log('======================================================');
}

/**
 * Main migration logic
 */
async function executeMigration() {
  console.log('======================================================');
  console.log('🚀 Storage Migration & Object Key Normalization');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulate Only)' : 'LIVE EXECUTION'}`);
  console.log('======================================================\n');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const backupRecords = [];

  // 1. Inspect Supabase Storage bucket 'stockflow-assets'
  console.log('--- Step 1: Listing files in Supabase Storage "stockflow-assets" ---');
  const supabaseFiles = [];
  const foldersToScan = ['attachments', 'items', 'avatars', 'documents', 'uploads'];
  for (const folder of foldersToScan) {
    try {
      const { data: files, error: listErr } = await supabase.storage
        .from('stockflow-assets')
        .list(folder);

      if (!listErr && Array.isArray(files)) {
        const found = files
          .filter((f) => f.name && !f.name.startsWith('.'))
          .map((f) => `${folder}/${f.name}`);
        if (found.length > 0) {
          console.log(`  • Found ${found.length} file(s) in "${folder}/"`);
          supabaseFiles.push(...found);
        }
      }
    } catch (err) {
      console.warn(`[Supabase Storage] List warning for ${folder}:`, err.message);
    }
  }
  const supabaseFilesSet = new Set(supabaseFiles);
  console.log(`Total files identified in Supabase Storage: ${supabaseFiles.length}\n`);

  // Target tables and columns to scan & normalize
  const targets = [
    {
      table: 'checkout_return_logs',
      column: 'evidence_photo_url',
      label: 'Return Proof Photos'
    },
    {
      table: 'items',
      column: 'image_url',
      label: 'Item Catalog Images'
    },
    {
      table: 'profiles',
      column: 'avatar_url',
      label: 'User Avatars'
    },
    {
      table: 'profiles',
      column: 'signature_url',
      label: 'Digital Signatures'
    }
  ];

  let totalProcessed = 0;
  let migratedCount = 0;
  let r2UploadedCount = 0;
  let fallbackVerifiedCount = 0;
  let failedCount = 0;
  let directS3AuthFailed = false;

  for (const target of targets) {
    console.log(`--- Step 2: Scanning ${target.table}.${target.column} (${target.label}) ---`);
    const { data: rows, error: queryErr } = await supabase
      .from(target.table)
      .select(`id, ${target.column}`)
      .not(target.column, 'is', null)
      .neq(target.column, '');

    if (queryErr) {
      console.error(`Failed to query ${target.table}:`, queryErr.message);
      continue;
    }

    const rowsToProcess = [];
    let fullUrlCount = 0;
    let missingOnR2Count = 0;

    for (const row of rows || []) {
      const rawVal = String(row[target.column] || '').trim();
      if (!rawVal) continue;

      const isFullUrl =
        rawVal.startsWith('http://') ||
        rawVal.startsWith('https://') ||
        rawVal.includes('stockflow-assets');
      const objectKey = extractObjectKey(rawVal);
      if (!objectKey) continue;

      const isReferencedLegacyFile =
        supabaseFilesSet.has(objectKey) || target.table === 'checkout_return_logs';

      let needsR2Sync = false;
      if (isReferencedLegacyFile) {
        const existsOnR2 = await checkExistsOnR2(objectKey);
        if (!existsOnR2) {
          needsR2Sync = true;
          missingOnR2Count++;
        }
      }

      if (isFullUrl) fullUrlCount++;
      if (isFullUrl || needsR2Sync) {
        rowsToProcess.push({ row, originalUrl: rawVal, objectKey, isFullUrl, needsR2Sync });
      }
    }

    console.log(`Found ${rows?.length || 0} total record(s).`);
    console.log(
      `Found ${fullUrlCount} record(s) with full URLs to normalize, ` +
      `${missingOnR2Count} referenced record(s) missing on R2 CDN.\n`
    );

    for (const entry of rowsToProcess) {
      const { row, originalUrl, objectKey, isFullUrl, needsR2Sync } = entry;
      totalProcessed++;

      let fileBuffer = null;
      let contentType = 'application/octet-stream';

      if (needsR2Sync || originalUrl.includes('supabase.co/storage') || supabaseFilesSet.has(objectKey)) {
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from('stockflow-assets')
            .download(objectKey);

          if (!dlErr && blob) {
            const ab = await blob.arrayBuffer();
            fileBuffer = Buffer.from(ab);
            contentType = blob.type || 'image/jpeg';
          } else if (isFullUrl) {
            const res = await fetch(originalUrl.split('?')[0]);
            if (res.ok) {
              const ab = await res.arrayBuffer();
              fileBuffer = Buffer.from(ab);
              contentType = res.headers.get('content-type') || 'image/jpeg';
            }
          }
        } catch (dlEx) {
          console.warn(`  • Download warning for ${objectKey}:`, dlEx.message);
        }
      }

      if (needsR2Sync) {
        if (isDryRun) {
          console.log(`  • [DRY-RUN] Would upload ${objectKey} (${fileBuffer?.length || 0} bytes) to R2`);
        } else {
          let uploadedDirect = false;
          if (fileBuffer && s3Client && !directS3AuthFailed) {
            try {
              await uploadToR2(fileBuffer, objectKey, contentType);
              uploadedDirect = true;
              r2UploadedCount++;
              console.log(`  • [SYNCED TO R2] Uploaded to R2: ${objectKey}`);
            } catch (r2Err) {
              const isAuthError =
                r2Err?.name === 'Unauthorized' ||
                r2Err?.Code === 'Unauthorized' ||
                r2Err?.$metadata?.httpStatusCode === 401 ||
                /unauthorized|access denied|invalidaccesskeyid|signaturedoesnotmatch/i.test(r2Err?.message || '');
              if (isAuthError) {
                directS3AuthFailed = true;
                console.warn('  • [R2 AUTH WARN] R2 S3 API returned 401 Unauthorized; verifying Supabase Storage Public Fallback...');
              } else {
                console.warn(`  • [R2 WARN] Direct upload failed for ${objectKey}: ${r2Err.message}`);
              }
            }
          }

          if (!uploadedDirect) {
            const fallbackOk = await checkExistsOnSupabaseFallback(objectKey);
            if (fallbackOk) {
              fallbackVerifiedCount++;
              console.log(
                `  • [FALLBACK ACTIVE — HTTP 200] ${objectKey} (served via stockflow-assets; awaiting new R2_ACCESS_KEY_ID for R2 copy)`
              );
            } else {
              console.error(`  • [MISSING] ${objectKey} unavailable on both R2 CDN and Supabase Storage fallback.`);
              failedCount++;
            }
          }
        }
      }

      if (objectKey !== originalUrl) {
        backupRecords.push({
          table: target.table,
          id: row.id,
          column: target.column,
          original_url: originalUrl,
          new_key: objectKey,
          migrated_at: new Date().toISOString(),
        });

        if (isDryRun) {
          migratedCount++;
          continue;
        }

        try {
          const { error: updateErr } = await supabase
            .from(target.table)
            .update({ [target.column]: objectKey })
            .eq('id', row.id);

          if (updateErr) throw updateErr;
          migratedCount++;
        } catch (dbErr) {
          console.error(`  • [DB FAIL] Failed to update ${target.table} (${row.id}):`, dbErr.message);
          failedCount++;
        }
      }
    }
  }

  // 3. Save rollback backup file
  if (backupRecords.length > 0 && !isDryRun) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const timestampedBackupFile = path.join(BACKUP_DIR, `storage-migration-backup-${timestamp}.json`);

    fs.writeFileSync(timestampedBackupFile, JSON.stringify(backupRecords, null, 2), 'utf8');
    fs.writeFileSync(LATEST_BACKUP_FILE, JSON.stringify(backupRecords, null, 2), 'utf8');

    console.log('\n--- Step 3: Rollback Snapshots Saved ---');
    console.log(`  • Timestamped Backup : ${timestampedBackupFile}`);
    console.log(`  • Latest Rollback    : ${LATEST_BACKUP_FILE}`);
  }

  console.log('\n======================================================');
  console.log('Migration Summary:');
  console.log(`  • Total Processed    : ${totalProcessed}`);
  console.log(`  • DB Rows Normalized : ${migratedCount}`);
  console.log(`  • R2 Uploads Done    : ${r2UploadedCount}`);
  console.log(`  • Fallback Verified  : ${fallbackVerifiedCount} (active on Supabase Storage HTTP 200)`);
  console.log(`  • Failures           : ${failedCount}`);
  console.log('  • Rollback Available : node scripts/migrate-storage-to-r2.mjs --rollback');
  console.log('======================================================\n');

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

if (isRollback) {
  executeRollback().catch((err) => {
    console.error('[Fatal Rollback Error]', err);
    process.exit(1);
  });
} else {
  executeMigration().catch((err) => {
    console.error('[Fatal Migration Error]', err);
    process.exit(1);
  });
}
