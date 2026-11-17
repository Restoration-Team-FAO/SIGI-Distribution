import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';
const SCRYPT_KEY_LENGTH = 64;
const PASSWORD_SCHEME = 'scrypt';
const PASSWORD_COST = 16384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;

export function hashPassword(password: string) {
  const normalized = password.trim();
  const salt = randomBytes(16);
  const derivedKey = scryptSync(normalized, salt, SCRYPT_KEY_LENGTH, {
    N: PASSWORD_COST,
    r: PASSWORD_BLOCK_SIZE,
    p: PASSWORD_PARALLELIZATION,
  });

  return [
    PASSWORD_SCHEME,
    String(PASSWORD_COST),
    String(PASSWORD_BLOCK_SIZE),
    String(PASSWORD_PARALLELIZATION),
    salt.toString('base64'),
    derivedKey.toString('base64'),
  ].join('$');
}

export function verifyPassword(password: string, encodedHash: string) {
  const [scheme, costRaw, blockSizeRaw, parallelizationRaw, saltRaw, hashRaw] =
    encodedHash.split('$');

  if (
    scheme !== PASSWORD_SCHEME ||
    !costRaw ||
    !blockSizeRaw ||
    !parallelizationRaw ||
    !saltRaw ||
    !hashRaw
  ) {
    return false;
  }

  const salt = Buffer.from(saltRaw, 'base64');
  const expected = Buffer.from(hashRaw, 'base64');
  const derivedKey = scryptSync(password.trim(), salt, expected.length, {
    N: Number(costRaw),
    r: Number(blockSizeRaw),
    p: Number(parallelizationRaw),
  });

  if (derivedKey.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expected);
}

export function createOpaqueToken(prefix: 'at' | 'rt') {
  return `sigi_${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashOpaqueToken(token: string, secret: string) {
  return createHmac('sha256', secret).update(token).digest('hex');
}
