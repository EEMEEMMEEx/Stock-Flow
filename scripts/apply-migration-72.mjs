import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const projectRef = 'fhzvrgyjarmqnacamkop';
const sqlFile = path.resolve('supabase/migrations/72_resolve_complete_inventory_request_overload.sql');

console.log('🚀 Applying Migration 72 to Supabase project...');
console.log(`📁 File: ${sqlFile}`);

try {
  const result = execSync(`npx supabase db query --linked --project-ref ${projectRef} --file "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log('✅ Migration 72 executed successfully:');
  console.log(result);
} catch (err) {
  console.error('❌ Error executing Migration 72:', err.stdout || err.message);
  process.exit(1);
}

// Verify with Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('⚠️ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping verification RPC call.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verify() {
  console.log('\n🔍 Verifying complete_inventory_request RPC...');
  const dummyId = '00000000-0000-0000-0000-000000000000';

  // 1. Call without remarks (p_remarks: null)
  const res1 = await supabase.rpc('complete_inventory_request', {
    p_request_id: dummyId,
    p_remarks: null
  });
  console.log('Test 1 (Without remarks - p_remarks: null):', res1.error ? `Handled (${res1.error.code}: ${res1.error.message})` : 'Success');
  if (res1.error && res1.error.code === 'PGRST203') {
    throw new Error('❌ Test 1 FAILED: PGRST203 overload error still present!');
  }

  // 2. Call with remarks
  const res2 = await supabase.rpc('complete_inventory_request', {
    p_request_id: dummyId,
    p_remarks: 'Verification test remarks'
  });
  console.log('Test 2 (With remarks):', res2.error ? `Handled (${res2.error.code}: ${res2.error.message})` : 'Success');
  if (res2.error && res2.error.code === 'PGRST203') {
    throw new Error('❌ Test 2 FAILED: PGRST203 overload error still present!');
  }

  console.log('🎉 Migration 72 verified! No PGRST203 errors.');
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
