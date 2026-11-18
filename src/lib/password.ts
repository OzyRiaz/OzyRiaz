import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export const hashPassword = (pw: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
};
export const verifyPassword = (pw: string, stored: string) => {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
};
