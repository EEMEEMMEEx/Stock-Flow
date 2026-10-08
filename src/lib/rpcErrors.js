// Shared helpers for surfacing Supabase/PostgreSQL RPC failures to the user.
// Kept dependency-free so it can be unit-checked in Node and reused by hooks
// and pages without pulling in React.

// PostgreSQL undefined_column / undefined_table / undefined_function + PostgREST
// "not found" codes. A schema mismatch means the deployed database does not
// match the migration the frontend was built against.
const SCHEMA_MISMATCH_CODES = new Set(['42703', '42P01', '42883', 'PGRST202', 'PGRST204']);

const SCHEMA_MISMATCH_PATTERN = /(column|relation|function|operator) .* does not exist|could not find the (function|table)/i;

export const isSchemaMismatchError = (error) => {
  if (!error) return false;
  if (SCHEMA_MISMATCH_CODES.has(String(error.code || ''))) return true;
  return SCHEMA_MISMATCH_PATTERN.test(String(error.message || ''));
};

// Strips the "EXCEPTION:" / "P0001:" prefixes Supabase adds, so the raw
// database sentence can be shown to an operator without noise.
export const cleanRpcMessage = (error) => {
  if (!error) return '';
  return String(error.message || '')
    .replace(/.*(?:EXCEPTION|Error|P0001|PGRST\d+):\s*/i, '')
    .trim();
};
