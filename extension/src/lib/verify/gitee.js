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
export async function verifyGitee(credential, apiBase) {
  const url = new URL(`${apiBase}/user`);
  url.searchParams.set('access_token', credential.token);

  const res = await fetchJson(url.toString(), {
    headers: { Accept: 'application/json' },
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
