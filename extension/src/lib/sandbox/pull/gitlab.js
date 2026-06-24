import {
  downloadGitlabArchiveWithFallback,
} from './gitlab-archive.js';

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

function gitlabJsonHeaders(token) {
  return {
    'PRIVATE-TOKEN': token,
    Accept: 'application/json',
  };
}

/**
 * @param {string} apiBase
 * @param {string} encodedProject
 * @param {string} branch
 * @param {Record<string, string>} headers
 */
async function resolveGitlabBranchCommit(apiBase, encodedProject, branch, headers) {
  const branchUrl = `${apiBase}/projects/${encodedProject}/repository/branches/${encodeURIComponent(branch)}`;
  const branchRes = await fetch(branchUrl, { headers });

  if (branchRes.ok) {
    const data = await branchRes.json();
    if (data?.commit) return data.commit;
  }

  const commitsRes = await fetch(
    `${apiBase}/projects/${encodedProject}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=1`,
    { headers },
  );

  if (commitsRes.ok) {
    const commits = await commitsRes.json();
    if (commits[0]) return commits[0];
  }

  if (branchRes.status === 404) {
    throw new Error(`远程不存在分支 ${branch}，请加载分支列表后选择有效分支`);
  }

  if (!commitsRes.ok) {
    throw new Error(`HTTP ${commitsRes.status}: ${await parseErrorResponse(commitsRes)}`);
  }

  throw new Error(`分支 ${branch} 无提交记录，请确认该分支已在远程创建并推送`);
}

/**
 * @param {{ token: string }} credential
 * @param {string} apiBase
 * @param {string} fullPath
 * @param {string} branch
 */
export async function pullGitlabSandbox(credential, apiBase, fullPath, branch) {
  const encoded = encodeURIComponent(fullPath);
  const headers = gitlabJsonHeaders(credential.token);

  const latest = await resolveGitlabBranchCommit(apiBase, encoded, branch, headers);
  const commitSha = latest.id || latest.short_id || '';

  const { archiveBuffer, workspaceFiles } = await downloadGitlabArchiveWithFallback(
    apiBase,
    encoded,
    branch,
    commitSha,
    credential.token,
  );

  const treeRes = await fetch(
    `${apiBase}/projects/${encoded}/repository/tree?ref=${encodeURIComponent(branch)}&per_page=100`,
    { headers },
  );
  if (!treeRes.ok) throw new Error(`HTTP ${treeRes.status}: ${await parseErrorResponse(treeRes)}`);
  const tree = await treeRes.json();
  const sampleFiles = (Array.isArray(tree) ? tree : []).slice(0, 20).map((item) => item.path || item.name);

  const archiveBytes = archiveBuffer?.byteLength
    || Object.keys(workspaceFiles || {}).length * 1024;

  return {
    branch,
    commitSha: commitSha.slice(0, 8),
    commitMessage: latest.message?.split('\n')[0] || latest.title || '',
    commitAuthor: latest.author_name || latest.author?.name || '',
    fileCount: workspaceFiles ? Object.keys(workspaceFiles).length : (Array.isArray(tree) ? tree.length : sampleFiles.length),
    archiveBytes,
    sampleFiles: workspaceFiles ? Object.keys(workspaceFiles).slice(0, 20) : sampleFiles,
    archiveBuffer,
    workspaceFiles,
  };
}
