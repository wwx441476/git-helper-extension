/** @typedef {'unknown'|'pulling'|'success'|'failed'} SandboxPullStatus */

/**
 * @typedef {Object} SandboxPullResult
 * @property {SandboxPullStatus} status
 * @property {number} [at]
 * @property {string} branch
 * @property {string} commitSha
 * @property {string} commitMessage
 * @property {string} commitAuthor
 * @property {number} fileCount
 * @property {number} archiveBytes
 * @property {string[]} sampleFiles
 * @property {boolean} [hasWorkspace]
 * @property {string} [message]
 */

/**
 * @typedef {Object} SandboxSession
 * @property {string} repositoryId
 * @property {string} repositoryName
 * @property {string} fullPath
 * @property {SandboxPullResult} pull
 * @property {number} updatedAt
 */

export const SANDBOX_PULL_STATUS_LABELS = {
  unknown: '未拉取',
  pulling: '拉取中',
  success: '拉取成功',
  failed: '拉取失败',
};

export function createEmptySandboxPull(branch = 'main') {
  return {
    status: /** @type {SandboxPullStatus} */ ('unknown'),
    at: 0,
    branch,
    commitSha: '',
    commitMessage: '',
    commitAuthor: '',
    fileCount: 0,
    archiveBytes: 0,
    sampleFiles: [],
    message: '',
  };
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPullTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
