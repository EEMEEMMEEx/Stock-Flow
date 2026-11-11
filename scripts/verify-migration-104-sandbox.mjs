// ==============================================================================
// Verification sandbox for Migration 104 (Allow Relative Storage Keys in Return Orders)
//   node scripts/verify-migration-104-sandbox.mjs
// ==============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
};

const migration104 = read('supabase/migrations/104_allow_relative_storage_keys_in_return_order.sql');

// 1. Static checks
check(
  'migration 104 exists and updates process_return_order',
  migration104.includes('CREATE OR REPLACE FUNCTION public.process_return_order')
);

check(
  'migration 104 removes restrictive http/https requirement and accepts relative storage keys',
  !migration104.includes("LIKE 'http://%'") && migration104.includes("IF v_evidence_photo_url IS NULL OR TRIM(v_evidence_photo_url) = ''")
);

// 2. Migration version prefix uniqueness
const migrationFiles = readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const seenVersions = new Map();
const duplicates = [];
for (const file of migrationFiles) {
  const version = file.split('_')[0];
  if (seenVersions.has(version)) {
    duplicates.push(`${version}: ${seenVersions.get(version)} vs ${file}`);
  } else {
    seenVersions.set(version, file);
  }
}
check(
  'all migrations have unique numeric prefix version',
  duplicates.length === 0,
  duplicates.join(', ') || 'all unique'
);

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');

async function loadPGlite() {
  if (existsSync(PGLITE_ENTRY)) {
    const mod = await import(pathToFileURL(PGLITE_ENTRY).href);
    return mod.PGlite;
  }
  try {
    const mod = await import('@electric-sql/pglite');
    return mod.PGlite;
  } catch {
    return null;
  }
}

// 3. Dynamic PGlite sandbox execution
async function runSandbox() {
  const PGlite = await loadPGlite();
  if (!PGlite) {
    console.log('\n[INFO] PGlite module not found in test environment, skipping dynamic SQL execution.');
    return;
  }
  console.log('\nRunning PGlite SQL Sandbox for Migration 104...');
  const db = new PGlite();

  // Basic mock schema for checkout flow
  await db.exec(`
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY, email TEXT);

    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version TEXT PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS public.profiles (
      id UUID PRIMARY KEY,
      role TEXT DEFAULT 'USER',
      status TEXT DEFAULT 'active'
    );

    CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm TEXT)
    RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT true; $$;

    CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
    RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT false; $$;

    CREATE OR REPLACE FUNCTION public.push_notifications(p_recipients UUID[], p_type TEXT, p_title TEXT, p_msg TEXT, p_link TEXT, p_order UUID, p_proj UUID, p_meta JSONB)
    RETURNS VOID LANGUAGE sql AS $$ SELECT NULL; $$;

    CREATE TABLE IF NOT EXISTS public.checkout_orders (
      id UUID PRIMARY KEY,
      order_number TEXT,
      project_id UUID,
      borrower_id UUID,
      created_by UUID,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS public.checkout_items (
      id UUID PRIMARY KEY,
      checkout_order_id UUID,
      item_id UUID,
      quantity_borrowed NUMERIC,
      quantity_returned NUMERIC DEFAULT 0,
      quantity_damaged NUMERIC DEFAULT 0,
      quantity_lost NUMERIC DEFAULT 0,
      quantity_consumed NUMERIC DEFAULT 0,
      serial_number TEXT
    );

    CREATE TABLE IF NOT EXISTS public.checkout_return_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      checkout_order_id UUID,
      checkout_item_id UUID,
      returned_quantity NUMERIC,
      item_condition TEXT,
      destination_project_id UUID,
      submitted_by UUID,
      received_by UUID,
      returned_at TIMESTAMPTZ,
      damage_notes TEXT,
      replaced_serial_number TEXT,
      returned_serial_number TEXT,
      evidence_photo_url TEXT,
      verification_status TEXT,
      caim_sync_status TEXT,
      is_reverted BOOLEAN DEFAULT false
    );
  `);

  // Apply Migration 104
  await db.exec(migration104);
  check('PGlite: migration 104 applied successfully without syntax errors', true);

  // Set up mock test data
  const userId = '11111111-1111-1111-1111-111111111111';
  const orderId = '22222222-2222-2222-2222-222222222222';
  const itemId = '33333333-3333-3333-3333-333333333333';
  const checkoutItemId = '44444444-4444-4444-4444-444444444444';

  await db.exec(`
    INSERT INTO public.profiles (id, role, status) VALUES ('${userId}', 'ADMIN', 'active');
    INSERT INTO public.checkout_orders (id, order_number, borrower_id, created_by, status)
    VALUES ('${orderId}', 'CHK-202611-TEST', '${userId}', '${userId}', 'active');
    INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed)
    VALUES ('${checkoutItemId}', '${orderId}', '${itemId}', 5);
  `);

  // Mock auth.uid() function in postgres
  await db.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT '${userId}'::UUID; $$;
  `);

  // Test 1: Submit return with relative storage object key
  const relativeKeyRes = await db.query(`SELECT public.process_return_order($1::jsonb) AS res`, [
    JSON.stringify({
      order_id: orderId,
      returns: [
        {
          checkout_item_id: checkoutItemId,
          returned_quantity: 1,
          condition: 'normal',
          evidence_photo_url: 'attachments/return_CHK-202611-TEST_proof.jpg',
        },
      ],
    }),
  ]);
  const log1 = await db.query(`
    SELECT evidence_photo_url, verification_status FROM public.checkout_return_logs
    WHERE checkout_order_id = '${orderId}'
  `);
  check(
    'PGlite: process_return_order succeeds with relative storage key and records pending_review',
    log1.rows.length === 1 &&
      log1.rows[0].evidence_photo_url === 'attachments/return_CHK-202611-TEST_proof.jpg' &&
      log1.rows[0].verification_status === 'pending_review'
  );

  // Test 2: Submit return with full URL (backward compatibility)
  await db.query(`SELECT public.process_return_order($1::jsonb) AS res`, [
    JSON.stringify({
      order_id: orderId,
      returns: [
        {
          checkout_item_id: checkoutItemId,
          returned_quantity: 1,
          condition: 'normal',
          evidence_photo_url: 'https://cdn.example.com/attachments/proof2.jpg',
        },
      ],
    }),
  ]);
  const log2 = await db.query(`
    SELECT evidence_photo_url FROM public.checkout_return_logs
    WHERE checkout_order_id = '${orderId}' AND evidence_photo_url LIKE 'https://%'
  `);
  check(
    'PGlite: process_return_order succeeds with legacy full URL',
    log2.rows.length === 1
  );

  // Test 3: Reject empty photo
  let emptyPhotoRejected = false;
  try {
    await db.query(`SELECT public.process_return_order($1::jsonb)`, [
      JSON.stringify({
        order_id: orderId,
        returns: [
          {
            checkout_item_id: checkoutItemId,
            returned_quantity: 1,
            condition: 'normal',
            evidence_photo_url: '   ',
          },
        ],
      }),
    ]);
  } catch (err) {
    emptyPhotoRejected = /Missing return proof photo/.test(err.message);
  }
  check('PGlite: process_return_order rejects empty photo string', emptyPhotoRejected);

  console.log('\n============================================================');
  const allPassed = results.every((r) => r.pass);
  console.log(`MIGRATION 104 VERIFICATION: ${results.filter((r) => r.pass).length}/${results.length} PASS`);
  if (!allPassed) {
    process.exit(1);
  }
}

runSandbox().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
