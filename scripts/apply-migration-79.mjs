import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';
const sqlFile = path.resolve('supabase/migrations/79_caim_inbound_webhook_processing.sql');

console.log('🚀 Applying Migration 79 (CAIM Inbound Webhook) to Supabase project:', projectRef);
console.log('📁 File:', sqlFile);

// Prefer a direct database URL (SUPABASE_DB_URL) because the Management API path
// ("db query --linked") requires dashboard privileges that the current account may not hold.
const dbUrl = process.env.SUPABASE_DB_URL;
const queryCommand = dbUrl
  ? `npx supabase db query --db-url "${dbUrl}" --file "${sqlFile}"`
  : `npx supabase db query --linked --project-ref ${projectRef} --file "${sqlFile}"`;

if (!dbUrl) {
  console.warn('ℹ️ SUPABASE_DB_URL is not set; falling back to --linked (may return HTTP 403 for this account).');
  console.warn('ℹ️ Fallback: paste the migration into Supabase Dashboard > SQL Editor.');
}

try {
  const result = execSync(queryCommand, { encoding: 'utf8', stdio: 'pipe' });
  console.log('✅ Migration 79 executed successfully:');
  console.log(result);
} catch (err) {
  console.error('⚠️ Migration execution note:', err.stdout || err.message);
}

// Verify the RPC exists by sending an intentionally invalid event (validation raises before any insert).
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('⚠️ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping RPC verification.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error } = await supabase.rpc('process_caim_webhook_event', {
  p_payload: { event: 'probe.invalid' },
});

const message = error?.message || '';
if (message.includes('Unsupported event')) {
  console.log('✅ Verification: public.process_caim_webhook_event is live and rejects unsupported events.');
} else if (message) {
  console.error('❌ Verification failed:', message);
  process.exitCode = 1;
} else {
  console.error('❌ Verification failed: probe event was not rejected.');
  process.exitCode = 1;
}
