function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {import('../credentials/types.js').Platform} platform
 * @param {string} [credentialUsername]
 */
export function resolveGitAuthUsername(platform, credentialUsername = '') {
  if (platform === 'github') return 'x-access-token';
  const user = String(credentialUsername || '').trim();
  if (user) return user;
  return 'oauth2';
}

/**
 * @param {string} remoteUrl
 * @param {string} host
 * @param {string} fullPath
 */
export function getCleanHttpsRemoteUrl(remoteUrl, host, fullPath) {
  const fallback = `https://${host}/${fullPath}.git`;

  if (!remoteUrl || remoteUrl.startsWith('git@')) {
    return fallback;
  }

  try {
    const url = new URL(remoteUrl);
    if (!/^https?:$/i.test(url.protocol)) return fallback;
    url.username = '';
    url.password = '';
    let href = url.toString();
    if (href.endsWith('/')) href = href.slice(0, -1);
    return href;
  } catch {
    return fallback;
  }
}

/**
 * @param {{
 *   platform: import('../credentials/types.js').Platform,
 *   host: string,
 *   fullPath: string,
 *   remoteUrl?: string,
 *   token: string,
 *   username?: string,
 * }} options
 */
export function buildAuthenticatedGitUrl(options) {
  const {
    platform,
    host,
    fullPath,
    remoteUrl = '',
    token,
    username = '',
  } = options;

  const cleanUrl = getCleanHttpsRemoteUrl(remoteUrl, host, fullPath);
  const authUser = resolveGitAuthUsername(platform, username);
  const userEnc = encodeURIComponent(authUser);
  const tokenEnc = encodeURIComponent(String(token || '').trim());

  try {
    const url = new URL(cleanUrl);
    url.username = userEnc;
    url.password = tokenEnc;
    return url.toString();
  } catch {
    return `https://${userEnc}:${tokenEnc}@${host}/${fullPath}.git`;
  }
}

/**
 * 生成可在终端执行的 git push 命令（含 Token，用于新环境配置 remote）。
 * @param {{
 *   platform: import('../credentials/types.js').Platform,
 *   host: string,
 *   fullPath: string,
 *   remoteUrl?: string,
 *   repo?: string,
 *   token: string,
 *   username?: string,
 *   branch?: string,
 *   repoLabel?: string,
 * }} options
 */
export function buildGitPushCommands(options) {
  const {
    platform,
    host,
    fullPath,
    remoteUrl = '',
    repo = '',
    token,
    username = '',
    branch = 'main',
    repoLabel = '',
  } = options;

  const branchName = String(branch || 'main').trim() || 'main';
  const authUrl = buildAuthenticatedGitUrl({
    platform,
    host,
    fullPath,
    remoteUrl,
    token,
    username,
  });
  const dirName = String(repo || fullPath.split('/').pop() || 'repo').trim();
  const label = repoLabel || fullPath || dirName;

  return [
    '# Git Helper · push 命令（含 Token，请勿分享或提交到仓库）',
    `# 仓库: ${label} · 分支: ${branchName}`,
    '',
    '# --- 新环境：克隆 ---',
    `git clone ${shellQuote(authUrl)}`,
    `cd ${shellQuote(dirName)}`,
    '',
    '# --- 已有本地仓库：设置 origin 并 push ---',
    `git remote set-url origin ${shellQuote(authUrl)}`,
    `git push origin ${shellQuote(branchName)}`,
    '',
    '# --- 或：一次性 push（不修改 origin）---',
    `git push ${shellQuote(authUrl)} HEAD:${branchName}`,
  ].join('\n');
}
