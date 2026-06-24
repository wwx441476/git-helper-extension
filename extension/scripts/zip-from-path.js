import { readFile } from 'node:fs/promises';
import { readZipUploadFilesFromBuffer } from '../src/lib/gitlab/local-upload.js';

/**
 * @param {string} zipPath
 */
export async function readZipUploadFilesFromPath(zipPath) {
  const path = String(zipPath || '').trim();
  if (!path) throw new Error('请指定 ZIP 路径');
  if (!/\.zip$/i.test(path)) throw new Error('请指定 .zip 文件');

  const buffer = await readFile(path);
  return readZipUploadFilesFromBuffer(buffer);
}
