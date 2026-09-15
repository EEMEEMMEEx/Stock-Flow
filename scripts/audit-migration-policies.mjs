import fs from 'fs';
import path from 'path';

const migrationsDir = 'supabase/migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

let totalIssues = 0;
const issuesList = [];

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Find all CREATE POLICY [IF NOT EXISTS] "policy name" ON table
  const createPolicyRegex = /CREATE\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;]+))\s+ON\s+([^\s;]+)/gi;
  let match;
  while ((match = createPolicyRegex.exec(content)) !== null) {
    const policyName = match[1] || match[2] || match[3];
    const tableName = match[4];
    
    // Check if there is a DROP POLICY IF EXISTS before this statement
    const beforeContent = content.substring(0, match.index);
    const escapedName = policyName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const escapedTable = tableName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // Pattern matches DROP POLICY IF EXISTS "policyName" ON tableName or table without schema
    const dropRegex = new RegExp(`DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?["']?` + escapedName + `["']?\\s+ON\\s+(?:public\\.)?` + escapedTable.replace('public.', ''), 'i');
    
    if (!dropRegex.test(beforeContent)) {
      issuesList.push({ file, policyName, tableName });
      totalIssues++;
    }
  }
}

console.log(`Audited ${files.length} migration files.`);
if (issuesList.length > 0) {
  console.log(`Found ${issuesList.length} policies without DROP POLICY IF EXISTS:`);
  for (const item of issuesList) {
    console.log(`  - [${item.file}] Policy: "${item.policyName}" ON ${item.tableName}`);
  }
} else {
  console.log('All CREATE POLICY statements have preceding DROP POLICY IF EXISTS statements!');
}
