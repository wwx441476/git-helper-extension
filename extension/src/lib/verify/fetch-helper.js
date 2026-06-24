/**
 * 将 fetch 底层错误转为可读提示。
 * "Failed to fetch" 表示请求未到达服务器，通常是网络/代理问题，而非 Token 无效。
 */
export function formatFetchError(err, apiBase) {
  const raw = err?.message || String(err);

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(raw)) {
    return [
      `无法连接 ${apiBase}`,
      '浏览器能打开该地址，但扩展请求失败。请尝试：',
      '1. 到 chrome://extensions 重新加载本扩展',
      '2. 重新输入完整 Token 后再点验证（勿使用脱敏后的 Token）',
      '3. 关闭可能拦截扩展请求的插件（广告拦截等）',
    ].join('\n');
  }

  if (/请求超时|timeout/i.test(raw)) {
    return `连接 ${apiBase} 超时，请检查网络或代理后重试`;
  }

  return raw;
}

export async function fetchJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    const base = new URL(url).origin;
    throw new Error(formatFetchError(err, base));
  }

  return res;
}
