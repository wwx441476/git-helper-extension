/**
 * @typedef {Object} ParsedRemoteUrl
 * @property {import('../credentials/types.js').Platform} platform
 * @property {string} host
 * @property {string} owner
 * @property {string} repo
 * @property {string} fullPath
 * @property {string} normalizedUrl
 */

/**
 * @typedef {Object} ParseRemoteUrlOptions
 * @property {import('../credentials/types.js').Platform} [hintPlatform]
 * @property {string} [credentialApiBase]
 */

export function extractHostFromApiBase(apiBase) {
  const trimmed = (apiBase || '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).hostname;
  } catch {
    return '';
  }
}

/**
 * @param {string} host
 * @param {ParseRemoteUrlOptions} [options]
 */
function detectPlatform(host, options = {}) {
  const { hintPlatform, credentialApiBase } = options;

  if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
  if (host === 'gitee.com' || host.endsWith('.gitee.com')) return 'gitee';
  if (host === 'gitlab.com' || host.includes('gitlab')) return 'gitlab';

  const apiHost = extractHostFromApiBase(credentialApiBase);
  if (apiHost && apiHost === host && hintPlatform) {
    return hintPlatform;
  }

  // 自建 GitLab / 企业 Git 域名：通过关联凭证平台推断
  if (hintPlatform) {
    return hintPlatform;
  }

  return null;
}

function buildNormalizedUrl(host, fullPath) {
  return `https://${host}/${fullPath}.git`;
}

/**
 * @param {string} input
 * @param {ParseRemoteUrlOptions} [options]
 * @returns {ParsedRemoteUrl}
 */
export function parseRemoteUrl(input, options = {}) {
  const raw = (input || '').trim();
  if (!raw) throw new Error('请填写仓库地址');

  const sshMatch = raw.match(/^git@([^:/]+)[:/](.+?)$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const fullPath = sshMatch[2].replace(/\.git$/i, '');
    return finalize(host, fullPath, options);
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('仓库地址格式无效，请使用 HTTPS 或 git@host:owner/repo.git');
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error('仅支持 HTTPS 或 SSH 仓库地址');
  }

  const host = url.hostname;
  const pathParts = url.pathname.replace(/^\//, '').replace(/\.git$/i, '').split('/').filter(Boolean);
  if (pathParts.length < 2) {
    throw new Error('无法从地址解析项目路径，示例：https://git.example.com/group/project.git');
  }

  return finalize(host, pathParts.join('/'), options);
}

/**
 * @param {string} host
 * @param {string} fullPath
 * @param {ParseRemoteUrlOptions} [options]
 * @returns {ParsedRemoteUrl}
 */
function finalize(host, fullPath, options = {}) {
  const platform = detectPlatform(host, options);
  if (!platform) {
    throw new Error(
      `无法识别平台：${host}。请先选择关联凭证（自建 GitLab 请在凭证中配置 API Base，如 https://${host}/api/v4）`,
    );
  }

  const parts = fullPath.split('/').filter(Boolean);
  if (platform === 'github' || platform === 'gitee') {
    if (parts.length !== 2) {
      throw new Error(`${platform === 'github' ? 'GitHub' : 'Gitee'} 地址格式应为 host/owner/repo`);
    }
    const [owner, repo] = parts;
    return {
      platform,
      host,
      owner,
      repo,
      fullPath: `${owner}/${repo}`,
      normalizedUrl: buildNormalizedUrl(host, `${owner}/${repo}`),
    };
  }

  const repo = parts[parts.length - 1];
  const owner = parts.slice(0, -1).join('/');
  return {
    platform,
    host,
    owner,
    repo,
    fullPath: parts.join('/'),
    normalizedUrl: buildNormalizedUrl(host, parts.join('/')),
  };
}

export function applyParsedUrl(repository, parsed) {
  return {
    ...repository,
    remoteUrl: parsed.normalizedUrl,
    platform: parsed.platform,
    host: parsed.host,
    owner: parsed.owner,
    repo: parsed.repo,
    fullPath: parsed.fullPath,
    name: repository.name && repository.name !== '未命名仓库'
      ? repository.name
      : parsed.repo,
  };
}

export function getParseOptionsFromCredential(credential) {
  if (!credential) return {};
  return {
    hintPlatform: credential.platform,
    credentialApiBase: credential.apiBase || '',
  };
}
