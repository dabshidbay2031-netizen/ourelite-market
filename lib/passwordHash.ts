import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf  = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  try {
    const buf    = (await scryptAsync(plain, salt, 64)) as Buffer;
    const keyBuf = Buffer.from(key, 'hex');
    return timingSafeEqual(buf, keyBuf);
  } catch {
    return false;
  }
}
