// ==============================================================================
// Verification script for Photo-Based Return Verification (Migration 100 + UI)
//   node scripts/verify-photo-return-verification-sandbox.mjs
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
};

const compressionLib = read('src/lib/imageCompression.js');
const migration100 = read('supabase/migrations/100_photo_return_verification_workflow.sql');
const returnModal = read('src/components/checkouts/CheckoutReturnModal.jsx');
const reviewModal = read('src/components/checkouts/CheckoutReturnReviewModal.jsx');
const detailModal = read('src/components/checkouts/CheckoutDetailModal.jsx');
const activeList = read('src/components/checkouts/CheckoutActiveList.jsx');
const checkoutsPage = read('src/pages/Checkouts.jsx');
const scrapPage = read('src/pages/Scrap.jsx');

// 1. Client-side compression & upload utility guards
check(
  'imageCompression exports compression and validation helpers',
  [
    'validateReturnPhotoFile',
    'calculateCompressedDimensions',
    'compressImageFile',
    'compressAndUploadReturnPhoto',
    'validateReturnItemsPhotos',
    'ReturnPhotoError',
  ].every((fn) => compressionLib.includes(fn))
);
check(
  'imageCompression resizes via Canvas and outputs compressed JPEG to Cloudflare R2 attachments folder',
  /DEFAULT_MAX_DIMENSION = 1280/.test(compressionLib) &&
    /DEFAULT_IMAGE_QUALITY = 0\.75/.test(compressionLib) &&
    /'attachments'/.test(compressionLib)
);

// 2. Database migration 100 guards
check(
  'migration 100 adds evidence_photo_url and verification_status columns to checkout_return_logs',
  /ADD COLUMN IF NOT EXISTS evidence_photo_url TEXT/.test(migration100) &&
    /ADD COLUMN IF NOT EXISTS verification_status TEXT/.test(migration100)
);
check(
  'migration 100 enforces photo presence in process_return_order and sets pending_review',
  /Missing return proof photo/.test(migration100) &&
    /'pending_review'/.test(migration100) &&
    /FUNCTION public\.process_return_order/.test(migration100)
);
check(
  'migration 100 defines confirm_checkout_return RPC that updates status to returned and credits stock',
  /FUNCTION public\.confirm_checkout_return/.test(migration100) &&
    /verification_status = 'confirmed'/.test(migration100) &&
    /WHEN \(v_new_returned_total \+ v_new_damaged_total \+ v_new_lost_total \+ v_new_consumed_total\) >= quantity_borrowed THEN 'returned'/.test(
      migration100
    )
);

// 3. UI workflow guards
check(
  'CheckoutReturnModal compresses and uploads 1 photo per returned item and blocks submission until all photos are attached',
  /compressAndUploadReturnPhoto/.test(returnModal) &&
    /validateReturnItemsPhotos/.test(returnModal) &&
    /photoValidation\.missingPhotoItems\.length > 0 \|\| !photoValidation\.isValid/.test(returnModal) &&
    /evidence_photo_url:\s*i\.evidence_photo_url\.trim\(\)/.test(returnModal)
);
check(
  'CheckoutReturnReviewModal displays proof photos and invokes confirm_checkout_return',
  /confirm_checkout_return/.test(reviewModal) &&
    /evidence_photo_url/.test(reviewModal) &&
    /checkouts\.confirmReturn/.test(reviewModal)
);
check(
  'CheckoutDetailModal displays proof photos, verification badges, and admin Confirm Return button',
  /confirm_checkout_return/.test(detailModal) &&
    /log\.evidence_photo_url/.test(detailModal) &&
    /pendingAdminReviewBadge/.test(detailModal) &&
    /confirmedReturnBadge/.test(detailModal)
);
check(
  'CheckoutActiveList shows pending return review badge and Review & Confirm Return button',
  /pendingReturnReviewBadge/.test(activeList) && /reviewReturnBtn/.test(activeList)
);
check(
  'Checkouts page selects checkout_return_logs and mounts CheckoutReturnReviewModal',
  /checkout_return_logs \(\*\)/.test(checkoutsPage) && /<CheckoutReturnReviewModal/.test(checkoutsPage)
);
check(
  'Scrap page excludes unconfirmed pending_review return logs from repair/CAIM queues',
  (scrapPage.match(/\.neq\('verification_status', 'pending_review'\)/g) || []).length >= 2
);

// 4. Optional PGlite SQL execution test if PGlite is installed
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

const PGlite = await loadPGlite();
if (PGlite) {
  console.log('\nRunning PGlite SQL Sandbox for Migration 100...');
  const db = new PGlite();
  const fixtureSql = read('supabase/tests/fixtures/mock_supabase_schema.sql');
  await db.exec(fixtureSql);

  await db.exec(`
    ALTER TABLE public.checkout_orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_id UUID;
    ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS created_by UUID;
    ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS actual_returned_date TIMESTAMPTZ;
    ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

    ALTER TABLE public.checkout_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS quantity_consumed NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS replaced_serial_number TEXT;
    ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

    ALTER TABLE public.checkout_return_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS replaced_serial_number TEXT;
    ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS is_reverted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_sync_status TEXT;

    CREATE TABLE IF NOT EXISTS public.stock_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID,
      item_id UUID,
      transaction_type TEXT,
      quantity NUMERIC,
      reference_id UUID,
      reference_type TEXT,
      created_by UUID,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission TEXT)
    RETURNS BOOLEAN
    LANGUAGE sql
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id AND UPPER(role) IN ('ADMIN', 'SUPER', 'SUPERADMIN')
      );
    $$;

    CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
    RETURNS BOOLEAN
    LANGUAGE sql
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id AND UPPER(role) IN ('SUPER', 'SUPERADMIN')
      );
    $$;
  `);

  await db.exec(migration100);

  const adminId = '00000000-0000-0000-0000-000000000001';
  const borrowerId = '00000000-0000-0000-0000-000000000002';
  const projectId = '00000000-0000-0000-0000-000000000010';
  const itemId = '00000000-0000-0000-0000-000000000020';
  const orderId = '00000000-0000-0000-0000-000000000030';
  const checkoutItemId = '00000000-0000-0000-0000-000000000040';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${adminId}', 'admin@stockflow.test'),
      ('${borrowerId}', 'borrower@stockflow.test');

    INSERT INTO public.profiles (id, role, status) VALUES
      ('${adminId}', 'ADMIN', 'active'),
      ('${borrowerId}', 'USER', 'active');

    INSERT INTO public.projects (id, name, project_code, status) VALUES
      ('${projectId}', 'Main Warehouse', 'WH-01', 'active');

    INSERT INTO public.items (id, name, unit) VALUES
      ('${itemId}', 'Optical Power Meter', 'pcs');

    INSERT INTO public.checkout_orders (id, order_number, project_id, borrower_id, borrower_name, status, created_by) VALUES
      ('${orderId}', 'CO-TEST-100', '${projectId}', '${borrowerId}', 'Borrower User', 'active', '${borrowerId}');

    INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, status) VALUES
      ('${checkoutItemId}', '${orderId}', '${itemId}', 2, 0, 'borrowed');
  `);

  // Authenticate as borrower
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${borrowerId}', false);`);

  // 4a. Missing photo must fail
  let missingPhotoFailed = false;
  try {
    await db.query(`SELECT public.process_return_order($1::jsonb)`, [
      JSON.stringify({
        order_id: orderId,
        returns: [
          {
            checkout_item_id: checkoutItemId,
            returned_quantity: 2,
            condition: 'normal',
          },
        ],
      }),
    ]);
  } catch (err) {
    missingPhotoFailed = /Missing return proof photo/.test(err.message);
  }
  check('PGlite: process_return_order rejects return without evidence_photo_url', missingPhotoFailed);

  // 4b. Borrower submits return WITH photo -> creates pending_review log, item stays borrowed
  const submitRes = await db.query(`SELECT public.process_return_order($1::jsonb) AS res`, [
    JSON.stringify({
      order_id: orderId,
      returns: [
        {
          checkout_item_id: checkoutItemId,
          returned_quantity: 2,
          condition: 'normal',
          evidence_photo_url: 'https://r2.example.com/attachments/proof-1.jpg',
        },
      ],
    }),
  ]);
  const submitPayload = submitRes.rows[0]?.res;
  const itemBeforeConfirm = (
    await db.query(`SELECT status, quantity_returned FROM public.checkout_items WHERE id = $1`, [checkoutItemId])
  ).rows[0];
  const stockTxBeforeConfirm = (
    await db.query(`SELECT count(*)::int AS cnt FROM public.stock_transactions WHERE reference_id = $1`, [orderId])
  ).rows[0];

  check(
    'PGlite: process_return_order records pending_review and does NOT mark item returned or credit stock prematurely',
    submitPayload?.pending_review === true &&
      itemBeforeConfirm?.status === 'borrowed' &&
      Number(itemBeforeConfirm?.quantity_returned) === 0 &&
      stockTxBeforeConfirm?.cnt === 0
  );

  // 4c. Borrower cannot confirm return
  let unauthorizedConfirmFailed = false;
  try {
    await db.query(`SELECT public.confirm_checkout_return($1::jsonb)`, [
      JSON.stringify({ order_id: orderId }),
    ]);
  } catch (err) {
    unauthorizedConfirmFailed = /Unauthorized/i.test(err.message);
  }
  check('PGlite: non-admin cannot call confirm_checkout_return', unauthorizedConfirmFailed);

  // 4d. Admin confirms return -> item becomes returned, stock is credited, order completes
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
  const confirmRes = await db.query(`SELECT public.confirm_checkout_return($1::jsonb) AS res`, [
    JSON.stringify({ order_id: orderId }),
  ]);
  const confirmPayload = confirmRes.rows[0]?.res;
  const itemAfterConfirm = (
    await db.query(`SELECT status, quantity_returned FROM public.checkout_items WHERE id = $1`, [checkoutItemId])
  ).rows[0];
  const orderAfterConfirm = (
    await db.query(`SELECT status, actual_returned_date FROM public.checkout_orders WHERE id = $1`, [orderId])
  ).rows[0];
  const stockTxAfterConfirm = (
    await db.query(`SELECT quantity FROM public.stock_transactions WHERE reference_id = $1`, [orderId])
  ).rows[0];

  assert.equal(confirmPayload?.success, true);
  check(
    'PGlite: admin confirm_checkout_return updates item status to returned, credits stock, and completes order',
    itemAfterConfirm?.status === 'returned' &&
      Number(itemAfterConfirm?.quantity_returned) === 2 &&
      orderAfterConfirm?.status === 'completed' &&
      Boolean(orderAfterConfirm?.actual_returned_date) &&
      Number(stockTxAfterConfirm?.quantity) === 2
  );
}

const failed = results.filter((r) => !r.pass);
console.log('\n' + '='.repeat(60));
console.log(`PHOTO RETURN VERIFICATION CHECKS: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  failed.forEach((f) => console.error(` - [FAIL] ${f.name} :: ${f.detail}`));
  process.exit(1);
}
process.exit(0);
