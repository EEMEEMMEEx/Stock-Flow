import fs from 'fs';
import path from 'path';

// Find all supabase.rpc calls in src/
const rpcCalls = new Set();
function scanDir(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) scanDir(fullPath);
    else if (file.name.endsWith('.jsx') || file.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const regex = /supabase\s*\.\s*rpc\s*\(\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        rpcCalls.add(match[1]);
      }
    }
  }
}
scanDir('src');

console.log('Total unique RPCs called in frontend:', rpcCalls.size);
const sortedRpcs = [...rpcCalls].sort();
console.log(sortedRpcs);

// Check which files in supabase/migrations/ define each RPC
const defs = {};
function scanMigrations(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) scanMigrations(fullPath);
    else if (file.name.endsWith('.sql')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const rpc of sortedRpcs) {
        if (content.includes(`FUNCTION public.${rpc}`) || content.includes(`FUNCTION ${rpc}`)) {
          defs[rpc] = defs[rpc] || [];
          defs[rpc].push(path.relative('supabase', fullPath).replace(/\\/g, '/'));
        }
      }
    }
  }
}
scanMigrations('supabase');

console.log('\n--- RPC Definitions Found ---');
for (const rpc of sortedRpcs) {
  console.log(`${rpc}: ${defs[rpc] ? defs[rpc].join(', ') : 'NOT FOUND IN ANY MIGRATION'}`);
}
