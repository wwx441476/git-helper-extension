import { resolveCliToken, normalizeEnvValue } from '../src/lib/path-replace/token-crypto.js';
import { loadDotEnv } from './load-dotenv.js';

export { resolveCliToken, normalizeEnvValue };

export function prepareCliEnv() {
  loadDotEnv();
}

/**
 * @param {string} tokenEnv
 * @param {string} [cliTokenOverride]
 * @param {string} [sharePasswordOverride]
 */
export async function resolveCliTokenFromEnv(tokenEnv, cliTokenOverride = '', sharePasswordOverride = '') {
  prepareCliEnv();
  const override = normalizeEnvValue(cliTokenOverride);
  const envToken = normalizeEnvValue(process.env[tokenEnv] || '');
  const envSharePassword = normalizeEnvValue(process.env.SHARE_PASSWORD || '');
  return resolveCliToken(
    tokenEnv,
    override || envToken,
    normalizeEnvValue(sharePasswordOverride) || envSharePassword,
  );
}

