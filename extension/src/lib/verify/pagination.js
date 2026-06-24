import { fetchJson } from './fetch-helper.js';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 100;

function parseNextUrl(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/**
 * @param {(page: number) => string} buildUrl
 * @param {RequestInit} [options]
 * @param {(data: unknown) => unknown[]} [mapItems]
 */
export async function fetchAllPages(buildUrl, options = {}, mapItems = (data) => (
  Array.isArray(data) ? data : []
)) {
  const items = [];
  let page = 1;
  let nextUrl = null;

  while (page <= MAX_PAGES) {
    const url = nextUrl || buildUrl(page);
    const res = await fetchJson(url, options);

    if (!res.ok) {
      if (page > 1 && (res.status === 404 || res.status === 400)) break;
      throw new Error(`HTTP ${res.status}`);
    }

    const pageItems = mapItems(await res.json());
    if (pageItems.length === 0) break;

    items.push(...pageItems);

    const linkNext = parseNextUrl(res.headers.get('Link') || '');
    if (linkNext) {
      nextUrl = linkNext;
      page += 1;
      continue;
    }
    nextUrl = null;

    const nextPageHeader = res.headers.get('X-Next-Page');
    if (nextPageHeader && nextPageHeader !== '') {
      page = parseInt(nextPageHeader, 10) || page + 1;
      continue;
    }

    page += 1;
  }

  return items;
}

export { DEFAULT_PAGE_SIZE, MAX_PAGES };
