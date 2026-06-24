/** @typedef {'github'|'gitee'|'gitlab'} Platform */
/** @typedef {'token'} AuthType */
/** @typedef {'unknown'|'verifying'|'verified'|'failed'} VerifyStatus */

/**
 * @typedef {Object} VerifyResult
 * @property {VerifyStatus} status
 * @property {number} [at]
 * @property {string} [username]
 * @property {string} [avatarUrl]
 * @property {string} [message]
 */

/**
 * @typedef {Object} Credential
 * @property {string} id
 * @property {string} name
 * @property {string} username 平台用户名（验证后自动填入，也可手动填写）
 * @property {Platform} platform
 * @property {AuthType} authType
 * @property {string} token
 * @property {string} apiBase
 * @property {boolean} isDefault
 * @property {VerifyResult} verify
 * @property {number} createdAt
 * @property {number} updatedAt
 */

export const PLATFORMS = /** @type {const} */ ([
  'github',
  'gitee',
  'gitlab',
]);

export const PLATFORM_LABELS = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

export const DEFAULT_API_BASES = {
  github: 'https://api.github.com',
  gitee: 'https://gitee.com/api/v5',
  gitlab: 'https://gitlab.com/api/v4',
};

export const VERIFY_STATUS_LABELS = {
  unknown: '未验证',
  verifying: '验证中',
  verified: '已验证',
  failed: '验证失败',
};

export function createEmptyVerify() {
  return {
    status: /** @type {VerifyStatus} */ ('unknown'),
    at: 0,
    username: '',
    avatarUrl: '',
    message: '',
  };
}

export function createCredential(partial = {}) {
  const now = Date.now();
  return {
    id: partial.id || `cred_${crypto.randomUUID()}`,
    name: partial.name || '未命名凭证',
    username: partial.username || '',
    platform: partial.platform || 'github',
    authType: 'token',
    token: partial.token || '',
    apiBase: partial.apiBase || '',
    isDefault: Boolean(partial.isDefault),
    verify: partial.verify || createEmptyVerify(),
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
  };
}

export function resolveApiBase(credential) {
  const trimmed = (credential.apiBase || '').trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');
  return DEFAULT_API_BASES[credential.platform] || DEFAULT_API_BASES.github;
}

export function maskToken(token) {
  if (!token) return '';
  if (token.length <= 8) return '*'.repeat(token.length);
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export function isMaskedToken(token) {
  return typeof token === 'string' && /\*{2,}/.test(token);
}

export function resolveInputToken(inputToken, existingToken = '') {
  const trimmed = (inputToken || '').trim();
  if (trimmed && !isMaskedToken(trimmed)) return trimmed;
  return existingToken || '';
}

export function toPublicCredential(credential) {
  return {
    ...credential,
    token: maskToken(credential.token),
    tokenMasked: true,
  };
}

export function platformColor(platform) {
  const colors = {
    github: '#6366f1',
    gitee: '#f97316',
    gitlab: '#f43f5e',
  };
  return colors[platform] || '#6b7280';
}

export function platformInitial(platform) {
  return PLATFORM_LABELS[platform]?.[0] || '?';
}

export function formatVerifyTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
