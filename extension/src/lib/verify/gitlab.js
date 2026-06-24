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
export async function verifyGitlab(credential, apiBase) {
  const res = await fetchJson(`${apiBase}/user`, {
    headers: {
      'PRIVATE-TOKEN': credential.token,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const detail = await parseErrorResponse(res);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  const data = await res.json();
  if (!data.username) throw new Error('响应缺少 username 字段');

  return {
    username: data.username,
    avatarUrl: data.avatar_url || '',
  };
}
