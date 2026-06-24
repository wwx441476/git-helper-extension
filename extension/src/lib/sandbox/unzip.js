import { unzipSync } from 'fflate';

export const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.md', '.txt', '.html', '.htm', '.css', '.scss', '.less',
  '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', '.gitignore',
  '.sh', '.bash', '.py', '.java', '.go', '.rs', '.sql', '.vue',
  '.svg', '.csv', '.properties', '.conf', '.cfg', '.log',
]);

function stripArchiveRoot(entries) {
  const paths = Object.keys(entries).filter((path) => !path.endsWith('/'));
  if (paths.length === 0) return entries;

  const first = paths[0];
  const slash = first.indexOf('/');
  if (slash <= 0) return entries;

  const prefix = first.slice(0, slash + 1);
  if (!paths.every((path) => path.startsWith(prefix))) return entries;

  const stripped = {};
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith('/')) continue;
    stripped[path.slice(prefix.length)] = data;
  }
  return stripped;
}

function isLikelyText(path, bytes) {
  const lower = path.toLowerCase();
  if (TEXT_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')))) return true;
  if (lower.endsWith('dockerfile') || lower.endsWith('makefile')) return true;
  if (bytes.length === 0) return true;
  if (bytes.length > 512 * 1024) return false;

  const sample = bytes.slice(0, Math.min(bytes.length, 4096));
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}

function decodeText(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Record<string, { content: string, encoding: 'text'|'base64' }>}
 */
export function extractArchiveFiles(buffer) {
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`归档超过 ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)}MB 上限，请缩小仓库或在本地 clone`);
  }

  const entries = stripArchiveRoot(unzipSync(new Uint8Array(buffer)));
  const files = {};

  for (const [path, bytes] of Object.entries(entries)) {
    if (!path || path.endsWith('/')) continue;
    if (isLikelyText(path, bytes)) {
      files[path] = { content: decodeText(bytes), encoding: 'text' };
    } else {
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      files[path] = { content: btoa(binary), encoding: 'base64' };
    }
  }

  return files;
}
