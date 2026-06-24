import { downloadArchive } from '../archive-download.js';

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

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * @param {{ token: string }} credential
 * @param {string} apiBase
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 */
export async function pullGithubSandbox(credential, apiBase, owner, repo, branch) {
  const headers = authHeaders(credential.token);

  const commitsRes = await fetch(
    `${apiBase}/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
    { headers },
  );
  if (!commitsRes.ok) throw new Error(`HTTP ${commitsRes.status}: ${await parseErrorResponse(commitsRes)}`);
  const commits = await commitsRes.json();
  const latest = commits[0];
  if (!latest) throw new Error(`分支 ${branch} 无提交记录`);

  const archiveBuffer = await downloadArchive(
    `${apiBase}/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`,
    headers,
  );

  const contentsRes = await fetch(
    `${apiBase}/repos/${owner}/${repo}/contents?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  if (!contentsRes.ok) throw new Error(`HTTP ${contentsRes.status}: ${await parseErrorResponse(contentsRes)}`);
  const contents = await contentsRes.json();
  const sampleFiles = (Array.isArray(contents) ? contents : []).slice(0, 20).map((item) => item.path || item.name);

  return {
    branch,
    commitSha: (latest.sha || '').slice(0, 8),
    commitMessage: latest.commit?.message?.split('\n')[0] || '',
    commitAuthor: latest.commit?.author?.name || latest.author?.login || '',
    fileCount: Array.isArray(contents) ? contents.length : sampleFiles.length,
    archiveBytes: archiveBuffer.byteLength,
    sampleFiles,
    archiveBuffer,
  };
}
