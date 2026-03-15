
import { createClient } from '@supabase/supabase-js';

import fs from 'fs';
import path from 'path';

// Minimal env parser since we might not have dotenv installed in devDependencies
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim();
            }
        });
        return env;
    } catch (e) {
        console.error('Could not read .env file');
        return {};
    }
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable(tableName) {
    console.log(`Checking table: ${tableName}...`);
    const { data, error } = await supabase.from(tableName).select('count', { count: 'exact', head: true });

    if (error) {
        console.error(`[X] Error accessing ${tableName}:`, error.message);
        return false;
    } else {
        console.log(`[✓] Table ${tableName} is accessible.`);
        return true;
    }
}

async function runChecks() {
    console.log('Starting System Health Check...');
    console.log('Supabase URL:', supabaseUrl);

    const tables = ['products', 'transactions', 'transaction_items', 'assets'];
    let allPass = true;

    for (const table of tables) {
        const pass = await checkTable(table);
        if (!pass) allPass = false;
    }

    if (allPass) {
        console.log('\nAll checks PASSED! Database connection and schema appear correct.');
    } else {
        console.error('\nSome checks FAILED. Please review the errors above.');
        process.exit(1);
    }
}

runChecks();
