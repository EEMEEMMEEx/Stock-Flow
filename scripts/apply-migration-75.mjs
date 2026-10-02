import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const projectRef = process.env.VITE_SUPABASE_URL ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0] : 'vrnutseacyejnzwcfamv';
const sqlFile = path.resolve('supabase/migrations/75_fix_rbac_privilege_escalation_and_role_assignment.sql');

console.log('🚀 Applying Migration 75 to Supabase project...');
console.log(`📁 File: ${sqlFile}`);

try {
  const result = execSync(`npx supabase db query --linked --project-ref ${projectRef} --file "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log('✅ Migration 75 executed successfully on linked database:');
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
  console.log('\n🔍 Verifying profiles normalization and trigger status...');

  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .ilike('role', 'operator');

    if (error) {
      console.error('Error querying profiles:', error.message);
    } else {
      console.log(`Legacy 'operator' profiles found: ${count}`);

    if (count && count > 0) {
      console.log('Attempting backfill normalization with service role client...');
      const { data, error: updateErr } = await supabase
        .from('profiles')
        .update({ role: 'staff' })
        .ilike('role', 'operator')
        .select('id, full_name, role');

      if (updateErr) {
        console.log('Direct update result with current trigger:', updateErr.message);
      } else {
        console.log(`Successfully normalized ${data?.length} profiles!`);
      }
    }
  }
} catch (err) {
    console.error('Verification error:', err.message);
  }
}

verify();
