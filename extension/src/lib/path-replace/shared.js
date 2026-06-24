import { normalizeDirPath } from '../gitlab/commit.js';

/**
 * @param {string} input
 * @param {string} targetPath
 * @returns {string[]}
 */
export function parseExcludePaths(input, targetPath) {
  const base = normalizeDirPath(targetPath);
  const lines = String(input || '')
    .split(/[\n,]+/)
    .map((line) => normalizeDirPath(line.trim()))
    .filter(Boolean);

  return [...new Set(lines.map((line) => {
    if (line === base || line.startsWith(`${base}/`)) return line;
    return `${base}/${line}`.replace(/\/+/g, '/');
  }))];
}

/**
 * @param {string} filePath
 * @param {string[]} excludePrefixes
 */
export function isPathExcluded(filePath, excludePrefixes) {
  return excludePrefixes.some((prefix) => (
    filePath === prefix || filePath.startsWith(`${prefix}/`)
  ));
}

/**
 * @param {string[]} filePaths
 * @param {string[]} excludePrefixes
 */
export function filterExcludedPaths(filePaths, excludePrefixes) {
  if (!excludePrefixes.length) return filePaths;
  return filePaths.filter((path) => !isPathExcluded(path, excludePrefixes));
}

export { normalizeDirPath };
