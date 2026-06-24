import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { normalizeEnvValue } from '../src/lib/path-replace/token-crypto.js';
import { loadDotEnv } from './load-dotenv.js';

const ZIP_PATH_PLACEHOLDERS = new Set([
  '',
  '/path/to/document-online-develop.zip',
  'C:\\path\\to\\document-online-develop.zip',
]);

function isUnsetZipPath(value) {
  const normalized = normalizeEnvValue(value);
  return ZIP_PATH_PLACEHOLDERS.has(normalized);
}

/**
 * @param {string} [cliZipOverride]
 */
export async function resolveCliZipPath(cliZipOverride = '') {
  loadDotEnv();
  let zipPath = normalizeEnvValue(cliZipOverride || process.env.ZIP_PATH || '');

  if (isUnsetZipPath(zipPath) && process.stdin.isTTY) {
    const rl = createInterface({ input, output });
    try {
      zipPath = normalizeEnvValue(await rl.question('ZIP_PATH 为空，请粘贴本地 ZIP 路径: '));
    } finally {
      rl.close();
    }
  }

  if (isUnsetZipPath(zipPath)) {
    throw new Error('缺少 ZIP 路径（请在 .env 设置 ZIP_PATH、使用 --zip，或在终端粘贴路径）');
  }

  return zipPath;
}

export { isUnsetZipPath };
