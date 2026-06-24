import { fetchAllPages } from '../../verify/pagination.js';
import { downloadBinary } from '../archive-download.js';

const MAX_FILES = 3000;
const MAX_FILE_BYTES = 512 * 1024;

function gitlabJsonHeaders(token) {
  return {
    'PRIVATE-TOKEN': token,
    Accept: 'application/json',
  };
}

function isLikelyText(path, bytes) {
  const lower = path.toLowerCase();
  if (bytes.length === 0) return true;
  if (bytes.length > MAX_FILE_BYTES) return false;
  for (const byte of bytes.slice(0, Math.min(bytes.length, 4096))) {
    if (byte === 0) return false;
  }
  return !/\.(png|jpe?g|gif|webp|ico|pdf|zip|jar|woff2?|ttf|eot|mp3|mp4|exe|dll|so|dylib|class)$/i.test(lower);
}

/**
 * 归档 API 被 406 拒绝时，通过 tree + raw 逐文件拉取。
 * @param {string} apiBase
 * @param {string} encodedProject
 * @param {string} branch
 * @param {string} token
 */
export async function fetchGitlabWorkspaceFiles(apiBase, encodedProject, branch, token) {
  const headers = gitlabJsonHeaders(token);
  const entries = await fetchAllPages(
    (page) => `${apiBase}/projects/${encodedProject}/repository/tree?recursive=true&ref=${encodeURIComponent(branch)}&per_page=100&page=${page}`,
    { headers },
    (data) => (Array.isArray(data) ? data : []),
  );

  const blobs = entries.filter((item) => item.type === 'blob' && item.path);
  if (blobs.length === 0) {
    throw new Error('仓库树为空，无法拉取文件');
  }
  if (blobs.length > MAX_FILES) {
    throw new Error(`文件数 ${blobs.length} 超过沙箱上限 ${MAX_FILES}，请本地 clone`);
  }

  /** @type {Record<string, { content: string, encoding: 'text'|'base64' }>} */
  const files = {};

  for (const blob of blobs) {
    const rawUrl = `${apiBase}/projects/${encodedProject}/repository/files/${encodeURIComponent(blob.path)}/raw?ref=${encodeURIComponent(branch)}`;
    const buffer = await downloadBinary(rawUrl, { 'PRIVATE-TOKEN': token });
    const bytes = new Uint8Array(buffer);

    if (bytes.byteLength > MAX_FILE_BYTES) {
      files[blob.path] = {
        content: `[沙箱跳过过大文件: ${blob.path} (${bytes.byteLength} bytes)]`,
        encoding: 'text',
      };
      continue;
    }

    if (isLikelyText(blob.path, bytes)) {
      files[blob.path] = {
        content: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
        encoding: 'text',
      };
    } else {
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      files[blob.path] = { content: btoa(binary), encoding: 'base64' };
    }
  }

  return files;
}

/**
 * @param {string} apiBase
 * @param {string} encodedProject
 * @param {string} ref
 * @param {string} token
 */
export async function downloadGitlabArchive(apiBase, encodedProject, ref, token) {
  const headers = { 'PRIVATE-TOKEN': token };
  const urls = [
    `${apiBase}/projects/${encodedProject}/repository/archive.zip?sha=${encodeURIComponent(ref)}`,
    `${apiBase}/projects/${encodedProject}/repository/archive?sha=${encodeURIComponent(ref)}&format=zip`,
  ];

  const errors = [];
  for (const url of urls) {
    try {
      return await downloadBinary(url, headers);
    } catch (err) {
      errors.push(err.message || String(err));
    }
  }

  throw new Error(errors[errors.length - 1] || 'GitLab 归档下载失败');
}

export async function downloadGitlabArchiveWithFallback(
  apiBase,
  encodedProject,
  branch,
  commitSha,
  token,
) {
  const refs = [commitSha, branch].filter(Boolean);
  const uniqueRefs = [...new Set(refs)];

  for (const ref of uniqueRefs) {
    try {
      const archiveBuffer = await downloadGitlabArchive(apiBase, encodedProject, ref, token);
      return { archiveBuffer, workspaceFiles: null };
    } catch (err) {
      if (!String(err.message).includes('406')) {
        // 非 406 也可能因 sha 无效，继续尝试下一 ref
      }
    }
  }

  const workspaceFiles = await fetchGitlabWorkspaceFiles(apiBase, encodedProject, branch, token);
  return { archiveBuffer: null, workspaceFiles };
}
