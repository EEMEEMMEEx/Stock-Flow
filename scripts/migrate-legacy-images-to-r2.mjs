import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env
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

if (!supabaseUrl || !supabaseKey) {
  console.error('[Error] Missing Supabase URL or Service Role Key in .env');
  process.exit(1);
}

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('[Error] Missing Cloudflare R2 Credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function uploadBufferToR2(buffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await s3Client.send(command);
  return `${publicBaseUrl}/${key}?t=${Date.now()}`;
}

async function migrateItemsBase64Images() {
  console.log('\n======================================================');
  console.log('1. Starting Migration for Items (Base64 -> Cloudflare R2)');
  console.log('======================================================');

  const { data: items, error } = await supabase
    .from('items')
    .select('id, name, sku, image_url')
    .not('image_url', 'is', null);

  if (error) {
    console.error('Failed to fetch items:', error.message);
    return;
  }

  const base64Items = (items || []).filter(item => 
    typeof item.image_url === 'string' && item.image_url.startsWith('data:image/')
  );

  console.log(`Found ${items?.length || 0} total items with images.`);
  console.log(`Found ${base64Items.length} items with legacy Base64 image data.\n`);

  if (base64Items.length === 0) {
    console.log('No Base64 images to migrate in items table. Skipping.');
    return;
  }

  let migratedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < base64Items.length; i++) {
    const item = base64Items[i];
    try {
      // Parse Base64 Data URI: data:image/png;base64,iVBORw...
      const matches = item.image_url.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s);
      if (!matches) {
        console.warn(`[Skip] Item ID ${item.id} (${item.name}) - Invalid Base64 format`);
        continue;
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      
      let ext = 'png';
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      else if (mimeType.includes('webp')) ext = 'webp';
      else if (mimeType.includes('gif')) ext = 'gif';
      else if (mimeType.includes('svg')) ext = 'svg';

      const safeSku = (item.sku || item.id || 'item').replace(/[^a-zA-Z0-9_-]/g, '_');
      const key = `items/item-${safeSku}-${Date.now()}.${ext}`;

      console.log(`[${i + 1}/${base64Items.length}] Uploading image for: ${item.name} (${item.sku || item.id})...`);
      const r2Url = await uploadBufferToR2(buffer, key, mimeType);

      // Update Supabase items table with new R2 URL
      const { error: updateError } = await supabase
        .from('items')
        .update({ image_url: r2Url })
        .eq('id', item.id);

      if (updateError) {
        throw updateError;
      }

      console.log(`   -> Successfully migrated to: ${r2Url}`);
      migratedCount++;
    } catch (err) {
      console.error(`   -> Error migrating item ${item.id}:`, err.message);
      failedCount++;
    }
  }

  console.log(`\nItems Migration Complete: ${migratedCount} succeeded, ${failedCount} failed.`);
}

async function migrateProfileAvatars() {
  console.log('\n======================================================');
  console.log('2. Starting Migration for Profiles (Supabase Storage -> Cloudflare R2)');
  console.log('======================================================');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .not('avatar_url', 'is', null);

  if (error) {
    console.error('Failed to fetch profiles:', error.message);
    return;
  }

  // Filter profiles that have avatar on Supabase Storage or Base64
  const legacyProfiles = (profiles || []).filter(p => 
    typeof p.avatar_url === 'string' && 
    (p.avatar_url.includes('supabase.co/storage') || p.avatar_url.startsWith('data:image/'))
  );

  console.log(`Found ${profiles?.length || 0} total profiles with avatars.`);
  console.log(`Found ${legacyProfiles.length} profiles with Supabase Storage / Base64 avatars.\n`);

  if (legacyProfiles.length === 0) {
    console.log('No legacy avatars to migrate in profiles table. Skipping.');
    return;
  }

  let migratedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < legacyProfiles.length; i++) {
    const profile = legacyProfiles[i];
    try {
      let buffer;
      let mimeType = 'image/png';
      let ext = 'png';

      if (profile.avatar_url.startsWith('data:image/')) {
        // Base64
        const matches = profile.avatar_url.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s);
        if (matches) {
          mimeType = matches[1];
          buffer = Buffer.from(matches[2], 'base64');
          if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
          else if (mimeType.includes('webp')) ext = 'webp';
        }
      } else {
        // Fetch from Supabase Storage URL
        console.log(`[${i + 1}/${legacyProfiles.length}] Downloading avatar for: ${profile.full_name} (${profile.id})...`);
        const cleanUrl = profile.avatar_url.split('?')[0];
        const res = await fetch(cleanUrl);
        if (!res.ok) {
          throw new Error(`Failed to download avatar from ${cleanUrl} (Status: ${res.status})`);
        }
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        mimeType = res.headers.get('content-type') || 'image/png';
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
        else if (mimeType.includes('webp')) ext = 'webp';
      }

      if (!buffer) {
        console.warn(`[Skip] Profile ID ${profile.id} - Could not read image buffer`);
        continue;
      }

      const key = `avatars/${profile.id}/avatar.${ext}`;
      const r2Url = await uploadBufferToR2(buffer, key, mimeType);

      // Update Supabase profiles table with new R2 URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: r2Url })
        .eq('id', profile.id);

      if (updateError) {
        throw updateError;
      }

      console.log(`   -> Successfully migrated to: ${r2Url}`);
      migratedCount++;
    } catch (err) {
      console.error(`   -> Error migrating avatar for profile ${profile.id}:`, err.message);
      failedCount++;
    }
  }

  console.log(`\nProfiles Migration Complete: ${migratedCount} succeeded, ${failedCount} failed.`);
}

async function runAll() {
  console.log('>>> [START] Cloudflare R2 Auto-Migration (Zero Data Loss) <<<');
  try {
    await migrateItemsBase64Images();
    await migrateProfileAvatars();
    console.log('\n>>> [SUCCESS] All legacy media successfully migrated to Cloudflare R2! <<<\n');
  } catch (err) {
    console.error('\n>>> [FATAL ERROR] Migration failed:', err);
  }
}

runAll();
