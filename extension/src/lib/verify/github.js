import { fetchJson } from './fetch-helper.js';

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

/**
 * @param {{ token: string }} credential
 * @param {string} apiBase
 */
export async function verifyGithub(credential, apiBase) {
  const res = await fetchJson(`${apiBase}/user`, {
    headers: {
      Authorization: `Bearer ${credential.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const detail = await parseErrorResponse(res);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  const data = await res.json();
  if (!data.login) throw new Error('响应缺少 login 字段');

  return {
    username: data.login,
    avatarUrl: data.avatar_url || '',
  };
}
