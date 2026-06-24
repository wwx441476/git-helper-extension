import { normalizeDirPath } from '../gitlab/commit.js';
import { filterExcludedPaths, isPathExcluded, parseExcludePaths } from '../path-replace/shared.js';
import { readLocalUploadSource, mapRelativeFilesToRemote } from '../gitlab/local-upload.js';

async function mapLocalUploadToRemoteFiles(uploadSource, remoteBasePath, excludePrefixes = []) {
  return readLocalUploadSource({
    zipFile: uploadSource.zipFile || null,
    folderFiles: uploadSource.folderFiles || [],
    remoteBasePath,
    excludePrefixes,
  });
}

async function parseErrorResponse(res) {
  let detail = '';
  try {
    const data = await res.json();
    detail = data.message || data.error || JSON.stringify(data);
  } catch {
    detail = await res.text().catch(() => '');
  }
  return detail || res.statusText || '请求失败';
}

function buildGiteeUrl(apiBase, owner, repo, path, token, branch) {
  const url = new URL(`${apiBase}/repos/${owner}/${repo}/contents/${path}`);
  url.searchParams.set('access_token', token);
  if (branch) url.searchParams.set('ref', branch);
  return url.toString();
}

/**
 * @param {string} apiBase
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} dirPath
 * @param {string} token
 * @returns {Promise<Array<{ path: string, sha: string }>>}
 */
export async function listGiteeFilesAtPath(apiBase, owner, repo, branch, dirPath, token) {
  const normalized = normalizeDirPath(dirPath);
  if (!normalized) throw new Error('请填写目标路径');

  /** @type {Array<{ path: string, sha: string }>} */
  const files = [];

  async function walk(currentPath) {
    const url = buildGiteeUrl(apiBase, owner, repo, currentPath, token, branch);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 404) return;
      throw new Error(`HTTP ${res.status}: ${await parseErrorResponse(res)}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      if (data.type === 'file' && data.path && data.sha) {
        files.push({ path: data.path, sha: data.sha });
      }
      return;
    }

    for (const item of data) {
      if (item.type === 'file' && item.path && item.sha) {
        files.push({ path: item.path, sha: item.sha });
      } else if (item.type === 'dir' && item.path) {
        await walk(item.path);
      }
    }
  }

  await walk(normalized);
  return files;
}

function toGiteeContent(content, encoding) {
  if (encoding === 'base64') return content;
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(content, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(content)));
}

/**
 * @param {{ repository: import('../repositories/types.js').Repository, credential: import('../credentials/types.js').Credential, apiBase: string, branch: string }} ctx
 */
export async function scanGiteeTargetPath(ctx, targetPath, excludeInput = '') {
  const { repository, credential, apiBase, branch } = ctx;
  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const allEntries = await listGiteeFilesAtPath(
    apiBase,
    repository.owner,
    repository.repo,
    branch,
    dirPath,
    credential.token,
  );
  const allFiles = allEntries.map((item) => item.path);
  const files = filterExcludedPaths(allFiles, excludePrefixes);
  const excludedFiles = allFiles.filter((path) => isPathExcluded(path, excludePrefixes));

  return {
    repository,
    branch,
    dirPath,
    files,
    excludedFiles,
    allFiles,
    excludedCount: excludedFiles.length,
    excludePrefixes,
  };
}

/**
 * @param {{ repository: import('../repositories/types.js').Repository, credential: import('../credentials/types.js').Credential, apiBase: string, branch: string }} ctx
 */
export async function replaceGiteeDirectory(
  ctx,
  targetPath,
  uploadSource,
  commitMessage,
  excludeInput = '',
) {
  const { repository, credential, apiBase, branch } = ctx;
  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const newFiles = await mapLocalUploadToRemoteFiles(uploadSource, dirPath, excludePrefixes);
  return applyGiteeDirectoryReplace(
    apiBase,
    repository.owner,
    repository.repo,
    branch,
    dirPath,
    credential.token,
    newFiles,
    commitMessage,
    excludePrefixes,
  );
}

async function applyGiteeDirectoryReplace(
  apiBase,
  owner,
  repo,
  branch,
  dirPath,
  token,
  newFiles,
  commitMessage,
  excludePrefixes,
) {
  const allEntries = await listGiteeFilesAtPath(apiBase, owner, repo, branch, dirPath, token);
  const allRemotePaths = allEntries.map((item) => item.path);
  const remotePaths = filterExcludedPaths(allRemotePaths, excludePrefixes);
  const remoteEntries = allEntries.filter((item) => remotePaths.includes(item.path));
  const message = (commitMessage || '').trim() || `replace ${dirPath}`;

  const commits = [];

  for (const entry of [...remoteEntries].sort((a, b) => b.path.length - a.path.length)) {
    const url = buildGiteeUrl(apiBase, owner, repo, entry.path, token, branch);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        message,
        sha: entry.sha,
        branch,
      }),
    });
    if (!res.ok) {
      throw new Error(`删除 ${entry.path} 失败: HTTP ${res.status}: ${await parseErrorResponse(res)}`);
    }
    commits.push(await res.json());
  }

  for (const file of newFiles) {
    const url = buildGiteeUrl(apiBase, owner, repo, file.path, token, branch);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        message,
        content: toGiteeContent(file.content, file.encoding),
        branch,
      }),
    });
    if (!res.ok) {
      throw new Error(`上传 ${file.path} 失败: HTTP ${res.status}: ${await parseErrorResponse(res)}`);
    }
    commits.push(await res.json());
  }

  if (commits.length === 0) {
    throw new Error('没有可提交的变更');
  }

  const last = commits[commits.length - 1];
  const commitSha = (last.commit?.sha || last.sha || '').slice(0, 8);

  return {
    deletedCount: remoteEntries.length,
    excludedCount: allEntries.length - remoteEntries.length,
    createdCount: newFiles.length,
    commitCount: commits.length,
    commitSha,
    commitMessage: last.commit?.message || message,
    webUrl: last.commit?.html_url || '',
  };
}

export async function replaceGiteeDirectoryDirect(options) {
  const {
    apiBase,
    token,
    owner,
    repo,
    branch,
    targetPath,
    relativeFiles,
    commitMessage = '',
    excludeInput = '',
  } = options;

  if (!token) throw new Error('缺少 GITEE_TOKEN');
  if (!owner || !repo) throw new Error('缺少 --owner / --repo');
  if (!branch) throw new Error('缺少 --branch');
  if (!relativeFiles?.length) throw new Error('没有可上传的文件');

  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const newFiles = mapRelativeFilesToRemote(relativeFiles, dirPath, excludePrefixes);

  return applyGiteeDirectoryReplace(
    apiBase,
    owner,
    repo,
    branch,
    dirPath,
    token,
    newFiles,
    commitMessage,
    excludePrefixes,
  );
}
