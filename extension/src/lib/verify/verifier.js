import { resolveApiBase } from '../credentials/store.js';
import { getSettings } from '../settings.js';
import { formatFetchError } from './fetch-helper.js';
import { verifyGithub } from './github.js';
import { verifyGitee } from './gitee.js';
import { verifyGitlab } from './gitlab.js';
import { isMockToken, verifyMock } from './mock.js';

const TIMEOUT_MS = 15000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), ms);
    }),
  ]);
}

async function verifyByPlatform(credential, apiBase) {
  switch (credential.platform) {
    case 'github':
      return verifyGithub(credential, apiBase);
    case 'gitee':
      return verifyGitee(credential, apiBase);
    case 'gitlab':
      return verifyGitlab(credential, apiBase);
    default:
      throw new Error(`不支持的平台: ${credential.platform}`);
  }
}

/**
 * @param {import('../credentials/types.js').Credential} credential
 */
export async function verifyCredential(credential) {
  if (!credential.token?.trim()) {
    throw new Error('请填写 Token');
  }

  const settings = await getSettings();
  const useMock = settings.useMockVerify || isMockToken(credential.token);

  if (useMock) {
    const result = await withTimeout(verifyMock(credential));
    return {
      status: /** @type {const} */ ('verified'),
      username: result.username,
      avatarUrl: result.avatarUrl || '',
      message: '',
      at: Date.now(),
    };
  }

  const apiBase = resolveApiBase(credential);

  try {
    const result = await withTimeout(verifyByPlatform(credential, apiBase));
    return {
      status: /** @type {const} */ ('verified'),
      username: result.username,
      avatarUrl: result.avatarUrl || '',
      message: '',
      at: Date.now(),
    };
  } catch (err) {
    const apiBase = resolveApiBase(credential);
    return {
      status: /** @type {const} */ ('failed'),
      username: '',
      avatarUrl: '',
      message: formatFetchError(err, apiBase),
      at: Date.now(),
    };
  }
}
