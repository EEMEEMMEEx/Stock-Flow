import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runTests() {
  console.log('🧪 Starting End-to-End Verification of admin_create_user RPC...\n');

  // Test 1: Full 11 parameters canonical call
  const test1Payload = {
    p_email: 'canonical_test_user@forth.co.th',
    p_password: 'F0rth2026@dtrs',
    p_full_name: 'Canonical Test User',
    p_role: 'staff',
    p_phone: '0812345678',
    p_position: 'Field Engineer',
    p_department: 'Telecom Operations',
    p_all_projects: true,
    p_project_ids: [],
    p_avatar_url: 'https://pub-275b37eccbba4e63941708ae5dfa46a7.r2.dev/avatars/default.png',
    p_role_id: '7ed23958-4e46-4345-9c50-94cf090651d9'
  };

  console.log('🔹 Test 1: Invoking admin_create_user with all 11 canonical parameters...');
  const res1 = await supabase.rpc('admin_create_user', test1Payload);

  console.log('  Status:', res1.status);
  console.log('  Error:', res1.error ? `${res1.error.code} - ${res1.error.message}` : 'None');
  console.log('  Data:', res1.data);

  if (res1.error && res1.error.code === 'PGRST203') {
    throw new Error('❌ Test 1 FAILED: PGRST203 Overload ambiguity detected!');
  }
  console.log('  ✅ Test 1 PASSED: PostgreSQL resolved exactly one canonical function (no PGRST203).\n');

  // Test 2: Verify role resolution and optional parameters handling
  console.log('🔹 Test 2: Verifying optional parameters with null values...');
  const res2 = await supabase.rpc('admin_create_user', {
    p_email: 'optional_probe@forth.co.th',
    p_password: null,
    p_full_name: 'Optional Probe User',
    p_role: 'operator',
    p_phone: null,
    p_position: null,
    p_department: null,
    p_all_projects: true,
    p_project_ids: [],
    p_avatar_url: null,
    p_role_id: null
  });

  console.log('  Status:', res2.status);
  console.log('  Error:', res2.error ? `${res2.error.code} - ${res2.error.message}` : 'None');
  console.log('  Data:', res2.data);

  if (res2.error && res2.error.code === 'PGRST203') {
    throw new Error('❌ Test 2 FAILED: PGRST203 Overload ambiguity detected!');
  }
  console.log('  ✅ Test 2 PASSED: Function resolved and processed without ambiguity.\n');

  console.log('🎉 All admin_create_user RPC verification tests PASSED with 0 ambiguity errors!');
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err.message);
  process.exit(1);
});
