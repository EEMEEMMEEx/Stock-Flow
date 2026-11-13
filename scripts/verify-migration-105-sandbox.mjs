// ==============================================================================
// Verification sandbox for Migration 105 (Web Push Notification Subscriptions)
//   node scripts/verify-migration-105-sandbox.mjs
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

const migration105 = read('supabase/migrations/105_web_push_notifications.sql');

// 1. Static checks
check(
  'migration 105 is wrapped in BEGIN/COMMIT transaction',
  /\bBEGIN;/.test(migration105) && /\bCOMMIT;/.test(migration105)
);

check(
  'migration 105 creates public.push_subscriptions with RLS and grants',
  migration105.includes('CREATE TABLE IF NOT EXISTS public.push_subscriptions') &&
    migration105.includes('ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY') &&
    migration105.includes('REVOKE ALL ON public.push_subscriptions FROM anon') &&
    migration105.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated')
);

check(
  'migration 105 adds push_dispatched_at and updates push_notifications()',
  migration105.includes('ADD COLUMN IF NOT EXISTS push_dispatched_at TIMESTAMPTZ') &&
    migration105.includes('idx_notifications_pending_push') &&
    migration105.includes('CREATE OR REPLACE FUNCTION public.push_notifications') &&
    migration105.includes('push_dispatched_at = NULL')
);

check(
  'migration 105 defines SECURITY DEFINER subscription RPCs with pinned search_path',
  migration105.includes('CREATE OR REPLACE FUNCTION public.upsert_push_subscription') &&
    migration105.includes('CREATE OR REPLACE FUNCTION public.remove_push_subscription') &&
    migration105.includes('SECURITY DEFINER') &&
    migration105.includes('SET search_path = public, auth, pg_temp')
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
    const allPassed = results.every((r) => r.pass);
    if (!allPassed) process.exit(1);
    return;
  }

  console.log('\nRunning PGlite SQL Sandbox for Migration 105...');
  const db = new PGlite();

  await db.exec(`
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY, email TEXT);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT NULL::UUID; $$;

    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version TEXT PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS public.profiles (
      id UUID PRIMARY KEY,
      role TEXT DEFAULT 'USER',
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS public.projects (
      id UUID PRIMARY KEY,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS public.notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      target_path TEXT,
      reference_id UUID,
      project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_event_reference
      ON public.notifications (user_id, event_type, reference_id);
  `);

  // Apply Migration 105 twice to confirm idempotency
  await db.exec(migration105);
  await db.exec(migration105);
  check('PGlite: migration 105 applies cleanly and idempotently', true);

  const migRecord = await db.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '105'`
  );
  check('PGlite: migration 105 recorded in schema_migrations', migRecord.rows.length === 1);

  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';
  const refId = '33333333-3333-3333-3333-333333333333';
  const endpointA = 'https://fcm.googleapis.com/fcm/send/device-a';

  await db.exec(`
    INSERT INTO public.profiles (id, role, status) VALUES
      ('${userA}', 'ADMIN', 'active'),
      ('${userB}', 'USER', 'active');
  `);

  // Test 1: Unauthenticated RPC call fails
  let unauthRejected = false;
  try {
    await db.query(`SELECT public.upsert_push_subscription($1, $2, $3)`, [
      endpointA,
      'p256dh-key',
      'auth-key',
    ]);
  } catch (err) {
    unauthRejected = /Unauthorized/i.test(err.message);
  }
  check('PGlite: upsert_push_subscription rejects unauthenticated caller', unauthRejected);

  // Test 2: Authenticated userA upserts and updates same endpoint idempotently
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT '${userA}'::UUID; $$;`);

  const upsert1 = await db.query(
    `SELECT public.upsert_push_subscription($1, $2, $3, $4, $5) AS res`,
    [endpointA, 'p256dh-v1', 'auth-v1', 'Mozilla/5.0', 'iPhone 15']
  );
  const upsert2 = await db.query(
    `SELECT public.upsert_push_subscription($1, $2, $3, $4, $5) AS res`,
    [endpointA, 'p256dh-v2', 'auth-v2', null, 'iPhone 15 Pro']
  );
  const subsAfterUpsert = await db.query(
    `SELECT user_id, p256dh, auth, user_agent, device_label, is_active FROM public.push_subscriptions WHERE endpoint = $1`,
    [endpointA]
  );
  check(
    'PGlite: upsert_push_subscription creates and updates single row idempotently',
    upsert1.rows[0].res.success === true &&
      upsert2.rows[0].res.success === true &&
      subsAfterUpsert.rows.length === 1 &&
      subsAfterUpsert.rows[0].user_id === userA &&
      subsAfterUpsert.rows[0].p256dh === 'p256dh-v2' &&
      subsAfterUpsert.rows[0].user_agent === 'Mozilla/5.0' &&
      subsAfterUpsert.rows[0].device_label === 'iPhone 15 Pro' &&
      subsAfterUpsert.rows[0].is_active === true
  );

  // Test 3: Blank fields rejected
  let invalidInputRejected = false;
  try {
    await db.query(`SELECT public.upsert_push_subscription($1, $2, $3)`, ['   ', 'p256dh', 'auth']);
  } catch (err) {
    invalidInputRejected = /Invalid push subscription/i.test(err.message);
  }
  check('PGlite: upsert_push_subscription rejects blank endpoint', invalidInputRejected);

  // Test 4: Cross-user remove_push_subscription does not delete userA's subscription
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT '${userB}'::UUID; $$;`);
  const crossDelete = await db.query(
    `SELECT public.remove_push_subscription($1) AS res`,
    [endpointA]
  );
  const stillExists = await db.query(
    `SELECT id FROM public.push_subscriptions WHERE endpoint = $1`,
    [endpointA]
  );
  check(
    'PGlite: remove_push_subscription prevents cross-user deletion',
    crossDelete.rows[0].res.deleted === 0 && stillExists.rows.length === 1
  );

  // Test 5: Owner remove_push_subscription deletes row
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT '${userA}'::UUID; $$;`);
  const ownerDelete = await db.query(
    `SELECT public.remove_push_subscription($1) AS res`,
    [endpointA]
  );
  const afterDelete = await db.query(
    `SELECT id FROM public.push_subscriptions WHERE endpoint = $1`,
    [endpointA]
  );
  check(
    'PGlite: remove_push_subscription deletes owner subscription',
    ownerDelete.rows[0].res.deleted === 1 && afterDelete.rows.length === 0
  );

  // Test 6: push_notifications resets push_dispatched_at = NULL on conflict update
  await db.query(
    `SELECT public.push_notifications($1::uuid[], $2, $3, $4, $5, $6::uuid)`,
    [[userA], 'withdrawal.submitted', 'New Request', 'Initial message', '/withdrawals', refId]
  );
  await db.query(
    `UPDATE public.notifications SET read_at = NOW(), push_dispatched_at = NOW() WHERE user_id = $1 AND reference_id = $2`,
    [userA, refId]
  );
  await db.query(
    `SELECT public.push_notifications($1::uuid[], $2, $3, $4, $5, $6::uuid)`,
    [[userA], 'withdrawal.submitted', 'Updated Request', 'Re-triggered message', '/withdrawals', refId]
  );
  const notifRow = await db.query(
    `SELECT title, read_at, push_dispatched_at FROM public.notifications WHERE user_id = $1 AND reference_id = $2`,
    [userA, refId]
  );
  check(
    'PGlite: push_notifications resets read_at and push_dispatched_at on conflict update',
    notifRow.rows.length === 1 &&
      notifRow.rows[0].title === 'Updated Request' &&
      notifRow.rows[0].read_at === null &&
      notifRow.rows[0].push_dispatched_at === null
  );

  console.log('\n============================================================');
  const allPassed = results.every((r) => r.pass);
  console.log(`MIGRATION 105 VERIFICATION: ${results.filter((r) => r.pass).length}/${results.length} PASS`);
  if (!allPassed) {
    process.exit(1);
  }
}

runSandbox().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
