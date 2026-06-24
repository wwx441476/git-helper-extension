import { MAX_ARCHIVE_BYTES } from './unzip.js';

function validateBuffer(buffer) {
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`归档超过 ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)}MB 上限`);
  }
  return buffer;
}

function buildDownloadError(res, detail) {
  const message = detail || res?.statusText || '请求失败';
  return new Error(`下载归档失败 HTTP ${res?.status || '—'}: ${String(message).slice(0, 200)}`);
}

/**
 * XHR 不携带 Sec-Fetch-Mode:cors，可绕过自建 GitLab 防盗链 406。
 * @param {string} url
 * @param {Record<string, string>} headers
 */
export function downloadArchiveViaXhr(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(validateBuffer(xhr.response));
        } catch (err) {
          reject(err);
        }
        return;
      }
      reject(buildDownloadError({ status: xhr.status }, xhr.responseText || xhr.statusText));
    };

    xhr.onerror = () => reject(new Error('下载归档网络错误'));
    xhr.send();
  });
}

async function downloadArchiveViaFetch(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      ...headers,
      Accept: 'application/zip, application/octet-stream, application/gzip, */*',
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw buildDownloadError(res, detail);
  }

  return validateBuffer(await res.arrayBuffer());
}

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 */
export async function downloadArchive(url, headers = {}) {
  const errors = [];

  try {
    return await downloadArchiveViaXhr(url, headers);
  } catch (err) {
    errors.push(err.message || String(err));
  }

  try {
    return await downloadArchiveViaFetch(url, headers);
  } catch (err) {
    errors.push(err.message || String(err));
  }

  throw new Error(errors[errors.length - 1] || '下载归档失败');
}

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 */
export async function downloadBinary(url, headers = {}) {
  try {
    return await downloadArchiveViaXhr(url, headers);
  } catch {
    return downloadArchiveViaFetch(url, headers);
  }
}
