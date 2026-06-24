import { getCredentialById, resolveApiBase } from '../credentials/store.js';
import { fetchJson } from '../verify/fetch-helper.js';
import { applyParsedUrl, extractHostFromApiBase, getParseOptionsFromCredential, parseRemoteUrl } from './parse-url.js';
import { createRepository } from './types.js';

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

async function verifyGithubRepo(credential, apiBase, owner, repo) {
  const res = await fetchJson(`${apiBase}/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${credential.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await parseErrorResponse(res)}`);
  const data = await res.json();
  return {
    defaultBranch: data.default_branch || '',
    description: data.description || data.full_name || '',
  };
}

async function verifyGiteeRepo(credential, apiBase, owner, repo) {
  const url = new URL(`${apiBase}/repos/${owner}/${repo}`);
  url.searchParams.set('access_token', credential.token);
  const res = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await parseErrorResponse(res)}`);
  const data = await res.json();
  return {
    defaultBranch: data.default_branch || '',
    description: data.description || data.full_name || data.path || '',
  };
}

async function verifyGitlabRepo(credential, apiBase, fullPath) {
  const encoded = encodeURIComponent(fullPath);
  const res = await fetchJson(`${apiBase}/projects/${encoded}`, {
    headers: {
      'PRIVATE-TOKEN': credential.token,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await parseErrorResponse(res)}`);
  const data = await res.json();
  return {
    defaultBranch: data.default_branch || '',
    description: data.description || data.path_with_namespace || '',
  };
}

/**
 * @param {import('./types.js').Repository} repositoryInput
 */
export async function verifyRepository(repositoryInput) {
  const repository = createRepository(repositoryInput);
  if (!repository.remoteUrl?.trim()) throw new Error('请填写仓库地址');
  if (!repository.credentialId) throw new Error('请选择关联凭证');

  const credential = await getCredentialById(repository.credentialId, true);
  if (!credential) throw new Error('关联凭证不存在');

  const parsed = parseRemoteUrl(repository.remoteUrl, getParseOptionsFromCredential(credential));
  const merged = applyParsedUrl(repository, parsed);

  if (credential.platform !== merged.platform) {
    throw new Error(`凭证平台 ${credential.platform} 与仓库平台 ${merged.platform} 不一致`);
  }

  if (credential.verify?.status !== 'verified') {
    throw new Error('请先验证关联凭证');
  }

  const apiBase = resolveApiBase(credential);
  const apiHost = extractHostFromApiBase(apiBase);
  if (merged.platform === 'gitlab' && apiHost && merged.host !== apiHost) {
    throw new Error(
      `仓库主机 ${merged.host} 与凭证 API 主机 ${apiHost} 不一致，请检查凭证 API Base（如 https://${merged.host}/api/v4）`,
    );
  }

  try {
    let result;
    switch (merged.platform) {
      case 'github':
        result = await verifyGithubRepo(credential, apiBase, merged.owner, merged.repo);
        break;
      case 'gitee':
        result = await verifyGiteeRepo(credential, apiBase, merged.owner, merged.repo);
        break;
      case 'gitlab':
        result = await verifyGitlabRepo(credential, apiBase, merged.fullPath);
        break;
      default:
        throw new Error(`不支持的平台: ${merged.platform}`);
    }

    return {
      repository: merged,
      verify: {
        status: /** @type {const} */ ('verified'),
        defaultBranch: result.defaultBranch,
        description: result.description,
        message: '',
        at: Date.now(),
      },
    };
  } catch (err) {
    return {
      repository: merged,
      verify: {
        status: /** @type {const} */ ('failed'),
        defaultBranch: '',
        description: '',
        message: err.message || '仓库验证失败',
        at: Date.now(),
      },
    };
  }
}
