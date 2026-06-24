import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeEnvValue } from '../src/lib/path-replace/token-crypto.js';

/**
 * 安全解析 .env（避免 bash source 破坏 Token 中的特殊字符）。
 * @param {string} [dir]
 */
export function loadDotEnv(dir = process.cwd()) {
  const envPath = join(dir, '.env');
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = normalizeEnvValue(value);
    }
  }
}

export { normalizeEnvValue };
