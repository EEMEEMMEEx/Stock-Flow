import fs from 'fs';
import path from 'path';

// 1. Extract all frontend RPC calls and their arguments
const frontendRpcs = {};

function scanDir(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) scanDir(fullPath);
    else if (file.name.endsWith('.jsx') || file.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      // Match supabase.rpc('rpc_name', { ... })
      const regex = /supabase\s*\.\s*rpc\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*(\{[\s\S]*?\}|[\w\.]+))?/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const rpcName = match[1];
        const argText = match[2];
        let keys = [];
        if (argText && argText.startsWith('{')) {
          // Extract top level keys
          const keyMatches = argText.match(/(\b\w+\b)\s*:/g);
          if (keyMatches) {
            keys = keyMatches.map(k => k.replace(':', '').trim());
          }
        }
        frontendRpcs[rpcName] = frontendRpcs[rpcName] || [];
        frontendRpcs[rpcName].push({
          file: path.relative('.', fullPath).replace(/\\/g, '/'),
          keys
        });
      }
    }
  }
}
scanDir('src');

// 2. Extract SQL function signatures from migrations
const sqlSignatures = {};
function scanSql(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const funcName = match[1];
    const rawParams = match[2].trim();
    if (!rawParams) {
      sqlSignatures[funcName] = [];
      continue;
    }
    const params = rawParams.split(',').map(p => {
      const parts = p.trim().split(/\s+/);
      return parts[0]; // parameter name e.g. p_target_id
    }).filter(Boolean);
    sqlSignatures[funcName] = params;
  }
}

// Check all migrations in order
for (const f of fs.readdirSync('supabase/migrations').sort()) {
  if (f.endsWith('.sql')) {
    scanSql(path.join('supabase/migrations', f));
  }
}

console.log('=== Comparing Frontend RPC Calls vs Database Function Parameter Names ===\n');
for (const [rpcName, calls] of Object.entries(frontendRpcs)) {
  const sqlParams = sqlSignatures[rpcName];
  console.log(`RPC: ${rpcName}`);
  console.log(`  SQL Parameters in DB:`, sqlParams ? sqlParams.join(', ') : 'NOT FOUND IN SQL');
  for (const call of calls) {
    console.log(`  Called in ${call.file} with keys: [${call.keys.join(', ')}]`);
    if (sqlParams && call.keys.length > 0) {
      for (const k of call.keys) {
        if (!sqlParams.includes(k) && !sqlParams.includes('payload') && !sqlParams.includes('p_payload')) {
          console.warn(`    ⚠️ MISMATCH: Key '${k}' is NOT in SQL parameters [${sqlParams.join(', ')}]!`);
        }
      }
    }
  }
  console.log('');
}
