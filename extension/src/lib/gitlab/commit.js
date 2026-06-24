import { fetchAllPages } from '../verify/pagination.js';

const MAX_ACTIONS_PER_COMMIT = 80;

function gitlabJsonHeaders(token) {
  return {
    'PRIVATE-TOKEN': token,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
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

function normalizeDirPath(path) {
  return (path || '').trim().replace(/^\/+|\/+$/g, '');
}

/**
 * @param {string} apiBase
 * @param {string} encodedProject
 * @param {string} branch
 * @param {string} dirPath
 * @param {string} token
 */
export async function listGitlabFilesAtPath(apiBase, encodedProject, branch, dirPath, token) {
  const normalized = normalizeDirPath(dirPath);
  const headers = { 'PRIVATE-TOKEN': token, Accept: 'application/json' };

  const entries = await fetchAllPages(
    (page) => {
      const params = new URLSearchParams({
        recursive: 'true',
        ref: branch,
        per_page: '100',
        page: String(page),
      });
      if (normalized) params.set('path', normalized);
      return `${apiBase}/projects/${encodedProject}/repository/tree?${params}`;
    },
    { headers },
    (data) => (Array.isArray(data) ? data : []),
  );

  const prefix = normalized ? `${normalized}/` : '';
  return entries
    .filter((item) => item.type === 'blob' && item.path)
    .map((item) => item.path)
    .filter((path) => !normalized || path === normalized || path.startsWith(prefix));
}

/**
 * @param {string} apiBase
 * @param {string} encodedProject
 * @param {string} branch
 * @param {string} message
 * @param {Array<Record<string, unknown>>} actions
 * @param {string} token
 */
export async function createGitlabCommit(apiBase, encodedProject, branch, message, actions, token) {
  const res = await fetch(`${apiBase}/projects/${encodedProject}/repository/commits`, {
    method: 'POST',
    headers: gitlabJsonHeaders(token),
    body: JSON.stringify({
      branch,
      commit_message: message,
      actions,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await parseErrorResponse(res)}`);
  }

  return res.json();
}

function chunkActions(actions, size = MAX_ACTIONS_PER_COMMIT) {
  const chunks = [];
  for (let i = 0; i < actions.length; i += size) {
    chunks.push(actions.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {string} apiBase
 * @param {string} encodedProject
 * @param {string} branch
 * @param {string} message
 * @param {Array<Record<string, unknown>>} actions
 * @param {string} token
 */
export async function createGitlabCommitBatched(
  apiBase,
  encodedProject,
  branch,
  message,
  actions,
  token,
) {
  if (actions.length === 0) {
    throw new Error('没有可提交的变更');
  }

  const chunks = chunkActions(actions);
  const commits = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const partMessage = chunks.length > 1
      ? `${message} (${i + 1}/${chunks.length})`
      : message;
    const commit = await createGitlabCommit(
      apiBase,
      encodedProject,
      branch,
      partMessage,
      chunks[i],
      token,
    );
    commits.push(commit);
  }

  return commits;
}

export { normalizeDirPath, MAX_ACTIONS_PER_COMMIT };
