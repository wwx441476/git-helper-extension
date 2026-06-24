export const ENC_PREFIX = 'enc:v1:';

/**
 * @param {string} value
 */
export function normalizeEnvValue(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .replace(/^["']|["']$/g, '');
}

/**
 * @param {string} value
 */
export function isEncryptedToken(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * @param {Uint8Array} bytes
 */
function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @param {string} b64
 */
function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @param {string} password
 * @param {string} token
 */
export async function encryptToken(password, token) {
  const trimmedPassword = String(password || '').trim();
  const trimmedToken = String(token || '').trim();
  if (!trimmedPassword) throw new Error('加密需要分享密码');
  if (!trimmedToken) throw new Error('缺少 Token');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(trimmedPassword, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(trimmedToken),
  );

  const bytes = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  bytes.set(salt, 0);
  bytes.set(iv, salt.length);
  bytes.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return `${ENC_PREFIX}${toBase64(bytes)}`;
}

/**
 * @param {string} password
 * @param {string} encryptedValue
 */
export async function decryptToken(password, encryptedValue) {
  if (!isEncryptedToken(encryptedValue)) {
    throw new Error('不是有效的加密 Token（应以 enc:v1: 开头）');
  }

  const trimmedPassword = String(password || '').trim();
  if (!trimmedPassword) throw new Error('解密需要 SHARE_PASSWORD');

  const raw = fromBase64(encryptedValue.slice(ENC_PREFIX.length));
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const data = raw.slice(28);
  const key = await deriveKey(trimmedPassword, salt);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plainBuffer);
}

/**
 * @param {string} tokenEnv
 * @param {string} [cliTokenOverride]
 * @param {string} [sharePasswordOverride]
 */
export async function resolveCliToken(tokenEnv, cliTokenOverride = '', sharePasswordOverride = '') {
  const override = normalizeEnvValue(cliTokenOverride);
  const candidate = override || normalizeEnvValue(process.env[tokenEnv] || '');

  if (!candidate) {
    throw new Error(`缺少 ${tokenEnv}（支持明文或 enc:v1: 加密格式）`);
  }

  if (!isEncryptedToken(candidate)) {
    return candidate;
  }

  const password = normalizeEnvValue(
    sharePasswordOverride
    || process.env.SHARE_PASSWORD
    || '',
  );

  if (!password) {
    throw new Error(`加密 Token 需要设置 SHARE_PASSWORD 环境变量（或使用 --share-password）`);
  }

  return decryptToken(password, candidate);
}
