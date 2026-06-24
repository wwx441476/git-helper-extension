import { resolveSandboxContext } from '../sandbox/context.js';
import { readLocalUploadSource } from './local-upload.js';
import {
  createGitlabCommitBatched,
  listGitlabFilesAtPath,
  normalizeDirPath,
} from './commit.js';

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

/**
 * @param {string} repositoryId
 * @param {string} targetPath
 * @param {string} [branchOverride]
 * @param {string} [excludeInput]
 */
export async function scanGitlabTargetPath(
  repositoryId,
  targetPath,
  branchOverride = '',
  excludeInput = '',
) {
  const { repository, credential, apiBase, branch } = await resolveSandboxContext(
    repositoryId,
    branchOverride,
  );

  if (repository.platform !== 'gitlab') {
    throw new Error('目录替换当前仅支持 GitLab 仓库');
  }

  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const encoded = encodeURIComponent(repository.fullPath);
  const allFiles = await listGitlabFilesAtPath(
    apiBase,
    encoded,
    branch,
    dirPath,
    credential.token,
  );
  const files = filterExcludedPaths(allFiles, excludePrefixes);
  const excludedFiles = allFiles.filter((path) => isPathExcluded(path, excludePrefixes));

  return {
    repository,
    branch,
    dirPath,
    files,
    excludedFiles,
    allFiles,
    excludedCount: excludedFiles.length,
    excludePrefixes,
  };
}

/**
 * @param {{ zipFile?: File|null, folderFiles?: File[] }} uploadSource
 * @param {string} remoteBasePath
 * @param {string[]} [excludePrefixes]
 */
export async function mapLocalUploadToRemoteFiles(uploadSource, remoteBasePath, excludePrefixes = []) {
  return readLocalUploadSource({
    zipFile: uploadSource.zipFile || null,
    folderFiles: uploadSource.folderFiles || [],
    remoteBasePath,
    excludePrefixes,
  });
}

/** @deprecated use mapLocalUploadToRemoteFiles */
export async function mapLocalFolderToRemoteFiles(fileList, remoteBasePath, excludePrefixes = []) {
  return mapLocalUploadToRemoteFiles({ folderFiles: fileList }, remoteBasePath, excludePrefixes);
}

/**
 * @param {string} repositoryId
 * @param {string} targetPath
 * @param {{ zipFile?: File|null, folderFiles?: File[] }} uploadSource
 * @param {string} commitMessage
 * @param {string} [branchOverride]
 * @param {string} [excludeInput]
 */
export async function replaceGitlabDirectory(
  repositoryId,
  targetPath,
  uploadSource,
  commitMessage,
  branchOverride = '',
  excludeInput = '',
) {
  const { repository, credential, apiBase, branch } = await resolveSandboxContext(
    repositoryId,
    branchOverride,
  );

  if (repository.platform !== 'gitlab') {
    throw new Error('目录替换当前仅支持 GitLab 仓库');
  }

  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const encoded = encodeURIComponent(repository.fullPath);
  const allRemoteFiles = await listGitlabFilesAtPath(
    apiBase,
    encoded,
    branch,
    dirPath,
    credential.token,
  );
  const remoteFiles = filterExcludedPaths(allRemoteFiles, excludePrefixes);
  const newFiles = await mapLocalUploadToRemoteFiles(uploadSource, dirPath, excludePrefixes);
  const message = (commitMessage || '').trim() || `replace ${dirPath}`;

  const deleteActions = remoteFiles
    .sort((a, b) => b.length - a.length)
    .map((filePath) => ({
      action: 'delete',
      file_path: filePath,
    }));

  const createActions = newFiles.map((file) => ({
    action: 'create',
    file_path: file.path,
    content: file.content,
    encoding: file.encoding,
  }));

  const commits = await createGitlabCommitBatched(
    apiBase,
    encoded,
    branch,
    message,
    [...deleteActions, ...createActions],
    credential.token,
  );

  const last = commits[commits.length - 1];

  return {
    deletedCount: remoteFiles.length,
    excludedCount: allRemoteFiles.length - remoteFiles.length,
    createdCount: newFiles.length,
    commitCount: commits.length,
    commitSha: (last.id || last.short_id || '').slice(0, 8),
    commitMessage: last.message || last.title || message,
    webUrl: last.web_url || '',
  };
}
