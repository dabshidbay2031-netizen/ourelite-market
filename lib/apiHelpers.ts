/**
 * Extracts a readable string from any Supabase / unknown error.
 * Supabase returns a PostgrestError object — not a native JS Error —
 * so `String(e)` gives "[object Object]". This helper fixes that.
 */
export function errMsg(e: unknown): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const obj = e as Record<string, unknown>;
  if (typeof obj.message === 'string') return obj.message;
  if (typeof obj.details === 'string') return obj.details;
  return JSON.stringify(e);
}

/** Returns true if the Supabase/PostgREST error is a missing-column error */
export function isMissingColumnError(e: unknown): boolean {
  const obj = e as Record<string, unknown>;
  const code = String(obj?.code ?? '');
  const msg  = errMsg(e);
  return code === '42703'                         // PostgreSQL undefined_column
    || code === 'PGRST204'                        // PostgREST schema-cache miss
    || msg.includes('schema cache')               // PostgREST column not found
    || msg.includes('Could not find the')         // same
    || msg.includes('does not exist');            // column/table doesn't exist
}

/** Returns true if the error is a FK violation (new category not in categories table) */
export function isForeignKeyError(e: unknown): boolean {
  const obj = e as Record<string, unknown>;
  const code = String(obj?.code ?? '');
  const msg  = errMsg(e);
  return code === '23503'                         // PostgreSQL foreign_key_violation
    || msg.includes('foreign key constraint');
}

/** Returns true if the error is a missing-table error (42P01) */
export function isMissingTableError(e: unknown): boolean {
  const obj = e as Record<string, unknown>;
  return typeof obj?.code === 'string' && obj.code === '42P01'
    || typeof obj?.message === 'string' && (obj.message as string).includes('schema cache');
}

/** Returns true if the error is a UUID type mismatch */
export function isUUIDError(e: unknown): boolean {
  const msg = errMsg(e);
  return msg.includes('invalid input syntax for type uuid')
    || msg.includes('uuid');
}
