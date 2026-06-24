/** @typedef {'unknown'|'verifying'|'verified'|'failed'} RepoVerifyStatus */

/**
 * @typedef {Object} RepoVerifyResult
 * @property {RepoVerifyStatus} status
 * @property {number} [at]
 * @property {string} [defaultBranch]
 * @property {string} [description]
 * @property {string} [message]
 */

/**
 * @typedef {Object} Repository
 * @property {string} id
 * @property {string} name
 * @property {string} remoteUrl
 * @property {import('../credentials/types.js').Platform} platform
 * @property {string} host
 * @property {string} owner
 * @property {string} repo
 * @property {string} fullPath
 * @property {string} credentialId
 * @property {string} defaultBranch
 * @property {RepoVerifyResult} verify
 * @property {number} createdAt
 * @property {number} updatedAt
 */

export const REPO_VERIFY_STATUS_LABELS = {
  unknown: '未验证',
  verifying: '验证中',
  verified: '已验证',
  failed: '验证失败',
};

export function createEmptyRepoVerify() {
  return {
    status: /** @type {RepoVerifyStatus} */ ('unknown'),
    at: 0,
    defaultBranch: '',
    description: '',
    message: '',
  };
}

export function createRepository(partial = {}) {
  const now = Date.now();
  return {
    id: partial.id || `repo_${crypto.randomUUID()}`,
    name: partial.name || '未命名仓库',
    remoteUrl: partial.remoteUrl || '',
    platform: partial.platform || 'github',
    host: partial.host || '',
    owner: partial.owner || '',
    repo: partial.repo || '',
    fullPath: partial.fullPath || '',
    credentialId: partial.credentialId || '',
    defaultBranch: partial.defaultBranch || '',
    verify: partial.verify || createEmptyRepoVerify(),
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
  };
}

export function formatRepoPath(repository) {
  return repository.fullPath || `${repository.owner}/${repository.repo}`;
}

/** 用户配置分支 > 远程默认 > main */
export function resolveWorkingBranch(repository, remoteDefaultBranch = '') {
  const userBranch = (repository.defaultBranch || '').trim();
  if (userBranch) return userBranch;
  const remote = (remoteDefaultBranch || repository.verify?.defaultBranch || '').trim();
  return remote || 'main';
}
