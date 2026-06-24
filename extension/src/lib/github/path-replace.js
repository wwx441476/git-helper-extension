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

const MAX_CHANGES_PER_COMMIT = 80;

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

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * @param {string} apiBase
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} token
 */
async function getBranchHead(apiBase, owner, repo, branch, token) {
  const headers = githubHeaders(token);
  const refRes = await fetch(
    `${apiBase}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers },
  );
  if (!refRes.ok) {
    throw new Error(`HTTP ${refRes.status}: ${await parseErrorResponse(refRes)}`);
  }
  const ref = await refRes.json();
  const commitSha = ref.object?.sha;
  if (!commitSha) throw new Error(`分支 ${branch} 无有效提交`);

  const commitRes = await fetch(
    `${apiBase}/repos/${owner}/${repo}/git/commits/${commitSha}`,
    { headers },
  );
  if (!commitRes.ok) {
    throw new Error(`HTTP ${commitRes.status}: ${await parseErrorResponse(commitRes)}`);
  }
  const commit = await commitRes.json();
  return { commitSha, treeSha: commit.tree?.sha, headers };
}

/**
 * @param {string} apiBase
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} dirPath
 * @param {string} token
 */
export async function listGithubFilesAtPath(apiBase, owner, repo, branch, dirPath, token) {
  const { treeSha, headers } = await getBranchHead(apiBase, owner, repo, branch, token);
  const treeRes = await fetch(
    `${apiBase}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    { headers },
  );
  if (!treeRes.ok) {
    throw new Error(`HTTP ${treeRes.status}: ${await parseErrorResponse(treeRes)}`);
  }
  const tree = await treeRes.json();
  if (tree.truncated) {
    throw new Error('远程目录过大，GitHub 树 listing 被截断，请缩小目标路径');
  }

  const normalized = normalizeDirPath(dirPath);
  const prefix = normalized ? `${normalized}/` : '';
  return (tree.tree || [])
    .filter((item) => item.type === 'blob' && item.path)
    .map((item) => item.path)
    .filter((path) => !normalized || path === normalized || path.startsWith(prefix));
}

function chunkItems(items, size = MAX_CHANGES_PER_COMMIT) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {string} apiBase
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} message
 * @param {string[]} deletePaths
 * @param {Array<{ path: string, content: string, encoding: 'text'|'base64' }>} createFiles
 * @param {string} token
 */
async function createGithubReplaceCommits(
  apiBase,
  owner,
  repo,
  branch,
  message,
  deletePaths,
  createFiles,
  token,
) {
  let { commitSha, treeSha, headers } = await getBranchHead(apiBase, owner, repo, branch, token);

  /** @type {Array<{ kind: 'delete', path: string } | { kind: 'create', file: { path: string, content: string, encoding: 'text'|'base64' } }>} */
  const operations = [
    ...[...deletePaths].sort((a, b) => b.length - a.length).map((path) => ({ kind: 'delete', path })),
    ...createFiles.map((file) => ({ kind: 'create', file })),
  ];
  const chunks = chunkItems(operations);
  const commits = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    /** @type {Array<Record<string, unknown>>} */
    const treeEntries = [];

    for (const op of chunk) {
      if (op.kind === 'delete') {
        treeEntries.push({ path: op.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }

      const blobRes = await fetch(`${apiBase}/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: op.file.content,
          encoding: op.file.encoding === 'base64' ? 'base64' : 'utf-8',
        }),
      });
      if (!blobRes.ok) {
        throw new Error(`HTTP ${blobRes.status}: ${await parseErrorResponse(blobRes)}`);
      }
      const blob = await blobRes.json();
      treeEntries.push({
        path: op.file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }

    const treeRes = await fetch(`${apiBase}/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ base_tree: treeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) {
      throw new Error(`HTTP ${treeRes.status}: ${await parseErrorResponse(treeRes)}`);
    }
    const newTree = await treeRes.json();

    const partMessage = chunks.length > 1 ? `${message} (${i + 1}/${chunks.length})` : message;
    const commitRes = await fetch(`${apiBase}/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: partMessage,
        tree: newTree.sha,
        parents: [commitSha],
      }),
    });
    if (!commitRes.ok) {
      throw new Error(`HTTP ${commitRes.status}: ${await parseErrorResponse(commitRes)}`);
    }
    const newCommit = await commitRes.json();

    const refRes = await fetch(
      `${apiBase}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommit.sha }),
      },
    );
    if (!refRes.ok) {
      throw new Error(`HTTP ${refRes.status}: ${await parseErrorResponse(refRes)}`);
    }

    commits.push(newCommit);
    commitSha = newCommit.sha;
    treeSha = newTree.sha;
  }

  if (commits.length === 0) {
    throw new Error('没有可提交的变更');
  }

  return commits;
}

/**
 * @param {{ repository: import('../repositories/types.js').Repository, credential: import('../credentials/types.js').Credential, apiBase: string, branch: string }} ctx
 */
export async function scanGithubTargetPath(ctx, targetPath, excludeInput = '') {
  const { repository, credential, apiBase, branch } = ctx;
  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const allFiles = await listGithubFilesAtPath(
    apiBase,
    repository.owner,
    repository.repo,
    branch,
    dirPath,
    credential.token,
  );
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
export async function replaceGithubDirectory(
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
  const allRemoteFiles = await listGithubFilesAtPath(
    apiBase,
    repository.owner,
    repository.repo,
    branch,
    dirPath,
    credential.token,
  );
  const remoteFiles = filterExcludedPaths(allRemoteFiles, excludePrefixes);
  const newFiles = await mapLocalUploadToRemoteFiles(uploadSource, dirPath, excludePrefixes);
  const message = (commitMessage || '').trim() || `replace ${dirPath}`;

  const commits = await createGithubReplaceCommits(
    apiBase,
    repository.owner,
    repository.repo,
    branch,
    message,
    remoteFiles,
    newFiles,
    credential.token,
  );

  const last = commits[commits.length - 1];

  return {
    deletedCount: remoteFiles.length,
    excludedCount: allRemoteFiles.length - remoteFiles.length,
    createdCount: newFiles.length,
    commitCount: commits.length,
    commitSha: (last.sha || '').slice(0, 8),
    commitMessage: last.message || message,
    webUrl: last.html_url || `https://${repository.host || 'github.com'}/${repository.owner}/${repository.repo}/commit/${last.sha}`,
  };
}

/**
 * CLI 入口：直接传入 relativeFiles。
 */
export async function replaceGithubDirectoryDirect(options) {
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

  if (!token) throw new Error('缺少 GITHUB_TOKEN');
  if (!owner || !repo) throw new Error('缺少 --owner / --repo');
  if (!branch) throw new Error('缺少 --branch');

  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');
  if (!relativeFiles?.length) throw new Error('没有可上传的文件');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const allRemoteFiles = await listGithubFilesAtPath(apiBase, owner, repo, branch, dirPath, token);
  const remoteFiles = filterExcludedPaths(allRemoteFiles, excludePrefixes);
  const newFiles = mapRelativeFilesToRemote(relativeFiles, dirPath, excludePrefixes);
  const message = (commitMessage || '').trim() || `replace ${dirPath}`;

  const commits = await createGithubReplaceCommits(
    apiBase,
    owner,
    repo,
    branch,
    message,
    remoteFiles,
    newFiles,
    token,
  );

  const last = commits[commits.length - 1];

  return {
    deletedCount: remoteFiles.length,
    excludedCount: allRemoteFiles.length - remoteFiles.length,
    createdCount: newFiles.length,
    commitCount: commits.length,
    commitSha: (last.sha || '').slice(0, 8),
    commitMessage: last.message || message,
    webUrl: last.html_url || `https://github.com/${owner}/${repo}/commit/${last.sha}`,
  };
}
