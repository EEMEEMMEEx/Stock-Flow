import fs from 'fs';

function validateSqlFile(filePath) {
  console.log('\n--- Checking ' + filePath + ' ---');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let errors = 0;
  
  lines.forEach((line, lineNum) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('INSERT INTO')) return;
    
    // Extract table and column list
    const colMatch = trimmed.match(/^INSERT INTO\s+([\w\.]+)\s*\(([^)]+)\)/i);
    if (!colMatch) return;
    
    const tableName = colMatch[1];
    const cols = colMatch[2].split(',').map(c => c.trim()).filter(Boolean);
    
    // Check if it has VALUES clause
    const valIdx = trimmed.toUpperCase().indexOf('VALUES');
    if (valIdx === -1) return;
    
    let valPart = trimmed.substring(valIdx + 6).trim();
    if (valPart.startsWith('(')) {
      valPart = valPart.substring(1);
    }
    
    // Find the matching end paren before ON CONFLICT or ;
    let endIdx = -1;
    let depth = 1;
    let inString = false;
    let strChar = '';
    
    for (let i = 0; i < valPart.length; i++) {
      const char = valPart[i];
      if (!inString && (char === "'" || char === '"')) {
        inString = true;
        strChar = char;
      } else if (inString && char === strChar) {
        if (char === "'" && valPart[i+1] === "'") {
          i++;
        } else {
          inString = false;
        }
      } else if (!inString) {
        if (char === '(') depth++;
        else if (char === ')') {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }
    
    if (endIdx === -1) {
      // If it's a multi-line insert where values are on subsequent lines, skip single-line check
      return;
    }
    
    const valuesString = valPart.substring(0, endIdx);
    
    // Now split valuesString by top-level commas
    const vals = [];
    let current = '';
    inString = false;
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;
    
    for (let i = 0; i < valuesString.length; i++) {
      const char = valuesString[i];
      if (!inString && (char === "'" || char === '"')) {
        inString = true;
        strChar = char;
        current += char;
      } else if (inString && char === strChar) {
        if (char === "'" && valuesString[i+1] === "'") {
          current += char + "'";
          i++;
        } else {
          inString = false;
          current += char;
        }
      } else if (inString) {
        current += char;
      } else {
        if (char === '(') parenDepth++;
        else if (char === ')') parenDepth--;
        else if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
        else if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth--;
        
        if (char === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
          vals.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    if (current.trim()) {
      vals.push(current.trim());
    }
    
    if (cols.length !== vals.length) {
      errors++;
      console.error(`MISMATCH at line ${lineNum + 1} (${tableName}): ${cols.length} cols vs ${vals.length} vals`);
      console.error(`Columns (${cols.length}): ${cols.join(', ')}`);
      console.error(`Values (${vals.length}): ${vals.join(' || ')}\n`);
    }
  });
  
  if (errors === 0) {
    console.log(`[OK] ALL INSERT statements in ${filePath} have EXACT column/value matching!`);
  } else {
    console.log(`[FAIL] Found ${errors} mismatches in ${filePath}`);
  }
}

validateSqlFile('backups/backup-2026-09-01T01-37-58-005Z/01_auth_schema_and_users.sql');
validateSqlFile('backups/backup-2026-09-01T01-37-58-005Z/02_data_inserts.sql');
validateSqlFile('backups/backup-2026-09-01T01-37-58-005Z/03_supabase_full_disaster_recovery.sql');
