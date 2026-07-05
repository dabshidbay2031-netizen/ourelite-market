import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

/**
 * JSON response with an ETag so pollers can skip re-downloading unchanged
 * payloads. When the client's If-None-Match matches, replies 304 with an
 * empty body — the product catalog is ~500 KB, so live polling (every 15 s
 * in AppContext) would otherwise re-transfer it each tick.
 */
export function jsonWithEtag(
  req: Request,
  data: unknown,
  headers: Record<string, string> = {},
): NextResponse {
  const body = JSON.stringify(data);
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, ...headers } });
  }
  return new NextResponse(body, {
    headers: { 'Content-Type': 'application/json', ETag: etag, ...headers },
  });
}

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

/**
 * Central server-side error log. Swap the body for Sentry et al. when a DSN is
 * configured — call sites stay unchanged.
 */
export function logError(scope: string, e: unknown): void {
  console.error(`[${scope}]`, errMsg(e));
}

/**
 * Message safe to send to the client. In production it returns a generic
 * fallback (so raw DB/internal strings never leak); in dev it returns the real
 * message for debugging. Always log the real error server-side via logError.
 */
export function clientError(scope: string, e: unknown, fallback = 'Something went wrong'): string {
  logError(scope, e);
  return process.env.NODE_ENV === 'production' ? fallback : errMsg(e);
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
