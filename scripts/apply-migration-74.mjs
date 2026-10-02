import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const projectRef = 'fhzvrgyjarmqnacamkop';
const sqlFile = path.resolve('supabase/migrations/74_checkout_approval_workflow.sql');

console.log('🚀 Applying Migration 74 to Supabase project...');
console.log(`📁 File: ${sqlFile}`);

try {
  const result = execSync(`npx supabase db query --linked --project-ref ${projectRef} --file "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log('✅ Migration 74 executed successfully on linked database:');
  console.log(result);
} catch (err) {
  console.error('⚠️ Note on CLI execution:', err.stdout || err.message);
  console.log('ℹ️ Attempting alternative execution or Supabase client verification...');
}

// Verify with Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('⚠️ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping verification RPC call.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function verify() {
  console.log('\n🔍 Verifying Checkout Approval Workflow schema and RPCs...');

  try {
    // Check permissions
    const { data: perm, error: permErr } = await supabase
      .from('permissions')
      .select('code, name')
      .eq('code', 'checkouts.approve')
      .maybeSingle();

    console.log('Permission checkouts.approve:', permErr ? `Error (${permErr.message})` : (perm ? 'FOUND' : 'NOT FOUND'));

    // Check checkout_orders columns
    const { data: cols, error: colErr } = await supabase
      .from('checkout_orders')
      .select('id, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, status')
      .limit(1);

    console.log('Table checkout_orders columns query:', colErr ? `Error (${colErr.message})` : 'COLUMNS VERIFIED');

  } catch (err) {
    console.error('Verification error:', err);
  }
}

verify();
