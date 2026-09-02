import fs from 'fs';

const oldHash = "'$2a$10$w6T/HjU2Yy3s0tZt9aL1i.qZ3n4P4lE5A3vN2rJ9gB5cV6dE7fG8h'";
const newHash = "extensions.crypt('F0rth2026@dtrs', extensions.gen_salt('bf'))";

// Update 01_auth_schema_and_users.sql
let authSql = fs.readFileSync('backups/backup-2026-09-01T01-37-58-005Z/01_auth_schema_and_users.sql', 'utf8');
authSql = authSql.replaceAll(oldHash, newHash);
fs.writeFileSync('backups/backup-2026-09-01T01-37-58-005Z/01_auth_schema_and_users.sql', authSql, 'utf8');

// Update 03_supabase_full_disaster_recovery.sql
let drSql = fs.readFileSync('backups/backup-2026-09-01T01-37-58-005Z/03_supabase_full_disaster_recovery.sql', 'utf8');
drSql = drSql.replaceAll(oldHash, newHash);
fs.writeFileSync('backups/backup-2026-09-01T01-37-58-005Z/03_supabase_full_disaster_recovery.sql', drSql, 'utf8');

console.log('Successfully updated password hashes to extensions.crypt in all backup files!');
