import { unzipSync } from 'fflate';
import { MAX_ARCHIVE_BYTES } from '../sandbox/unzip.js';
import { normalizeDirPath } from './commit.js';

function isPathExcluded(filePath, excludePrefixes) {
  return excludePrefixes.some((prefix) => (
    filePath === prefix || filePath.startsWith(`${prefix}/`)
  ));
}

const TEXT_PATTERN = /\.(js|jsx|ts|tsx|mjs|cjs|json|md|txt|html|htm|css|scss|less|xml|yaml|yml|svg|properties|gitignore|sql|vue|java|sh|bat|cmd|ini|conf|cfg)$/i;

function isLikelyText(path, bytes) {
  const name = path.split('/').pop() || path;
  if (TEXT_PATTERN.test(name)) return true;
  if (/^(dockerfile|makefile)$/i.test(name)) return true;
  if (bytes.byteLength === 0) return true;
  if (bytes.byteLength > 512 * 1024) return false;
  return !bytes.includes(0);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function toUploadEntry(relativePath, bytes) {
  if (isLikelyText(relativePath, bytes)) {
    return {
      relativePath,
      content: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
      encoding: /** @type {const} */ ('text'),
    };
  }
  return {
    relativePath,
    content: arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    encoding: /** @type {const} */ ('base64'),
  };
}

function stripSingleRootFolder(entries) {
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

function stripNamedPrefix(entries, folderName) {
  const prefix = `${folderName}/`;
  const paths = Object.keys(entries).filter((path) => !path.endsWith('/'));
  if (paths.length === 0) return entries;
  if (!paths.every((path) => path.startsWith(prefix))) return entries;

  const stripped = {};
  for (const [path, data] of Object.entries(entries)) {
    if (path.startsWith(prefix)) stripped[path.slice(prefix.length)] = data;
  }
  return stripped;
}

function normalizeZipEntries(entries) {
  let current = { ...entries };

  for (let i = 0; i < 3; i += 1) {
    const next = stripSingleRootFolder(current);
    if (Object.keys(next).length === Object.keys(current).length) break;
    current = next;
  }

  const distStripped = stripNamedPrefix(current, 'dist');
  if (Object.keys(distStripped).length > 0) {
    current = distStripped;
  }

  return current;
}

/**
 * @param {File} zipFile
 * @returns {Promise<Array<{ relativePath: string, content: string, encoding: 'text'|'base64' }>>}
 */
export async function readZipUploadFiles(zipFile) {
  if (!zipFile) throw new Error('请选择 ZIP 包');
  if (!/\.zip$/i.test(zipFile.name)) {
    throw new Error('请选择 .zip 文件');
  }

  const buffer = await zipFile.arrayBuffer();
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`ZIP 超过 ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)}MB 上限`);
  }

  const normalized = normalizeZipEntries(unzipSync(new Uint8Array(buffer)));
  const files = Object.entries(normalized)
    .filter(([path]) => path && !path.endsWith('/'))
    .map(([path, bytes]) => toUploadEntry(path.replace(/\\/g, '/'), bytes));

  if (files.length === 0) {
    throw new Error('ZIP 内没有可用文件');
  }

  return files;
}

/**
 * @param {File[]} fileList
 */
export async function readFolderUploadFiles(fileList) {
  if (!fileList.length) throw new Error('请选择本地文件夹');

  const files = [];
  for (const file of fileList) {
    const relative = file.webkitRelativePath.includes('/')
      ? file.webkitRelativePath.split('/').slice(1).join('/')
      : file.name;
    if (!relative) continue;

    const bytes = new Uint8Array(await file.arrayBuffer());
    files.push(toUploadEntry(relative.replace(/\\/g, '/'), bytes));
  }

  if (files.length === 0) {
    throw new Error('所选文件夹为空');
  }

  return files;
}

/**
 * @param {Array<{ relativePath: string, content: string, encoding: 'text'|'base64' }>} relativeFiles
 * @param {string} remoteBasePath
 * @param {string[]} excludePrefixes
 */
export function mapRelativeFilesToRemote(relativeFiles, remoteBasePath, excludePrefixes = []) {
  const base = normalizeDirPath(remoteBasePath);
  if (!base) throw new Error('请填写目标路径');

  const mapped = [];
  const blocked = [];

  for (const file of relativeFiles) {
    const remotePath = `${base}/${file.relativePath}`.replace(/\/+/g, '/');
    if (isPathExcluded(remotePath, excludePrefixes)) {
      blocked.push(remotePath);
      continue;
    }
    mapped.push({
      path: remotePath,
      content: file.content,
      encoding: file.encoding,
    });
  }

  if (blocked.length > 0) {
    throw new Error(`上传文件命中排除路径，请调整选择内容：\n${blocked.slice(0, 5).join('\n')}${blocked.length > 5 ? '\n...' : ''}`);
  }

  if (mapped.length === 0) {
    throw new Error('没有可上传的文件');
  }

  return mapped;
}

/**
 * @param {{ zipFile?: File|null, folderFiles?: File[], remoteBasePath: string, excludePrefixes?: string[] }} options
 */
export async function readLocalUploadSource(options) {
  const { zipFile, folderFiles = [], remoteBasePath, excludePrefixes = [] } = options;

  let relativeFiles;
  if (zipFile) {
    relativeFiles = await readZipUploadFiles(zipFile);
  } else if (folderFiles.length > 0) {
    relativeFiles = await readFolderUploadFiles(folderFiles);
  } else {
    throw new Error('请选择 ZIP 包或本地文件夹');
  }

  return mapRelativeFilesToRemote(relativeFiles, remoteBasePath, excludePrefixes);
}
