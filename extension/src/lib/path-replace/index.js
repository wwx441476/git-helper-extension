import { resolveSandboxContext } from '../sandbox/context.js';
import { readLocalUploadSource } from '../gitlab/local-upload.js';
import {
  createGitlabCommitBatched,
  listGitlabFilesAtPath,
  normalizeDirPath,
} from '../gitlab/commit.js';
import {
  filterExcludedPaths,
  isPathExcluded,
  parseExcludePaths,
} from '../path-replace/shared.js';
import { scanGithubTargetPath, replaceGithubDirectory } from '../github/path-replace.js';
import { scanGiteeTargetPath, replaceGiteeDirectory } from '../gitee/path-replace.js';

export {
  parseExcludePaths,
  filterExcludedPaths,
  isPathExcluded,
  normalizeDirPath,
} from '../path-replace/shared.js';

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
 * @param {{ repository: import('../repositories/types.js').Repository, credential: import('../credentials/types.js').Credential, apiBase: string, branch: string }} ctx
 */
export async function scanGitlabTargetPathFromContext(ctx, targetPath, excludeInput = '') {
  const { repository, credential, apiBase, branch } = ctx;
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
 * @param {{ repository: import('../repositories/types.js').Repository, credential: import('../credentials/types.js').Credential, apiBase: string, branch: string }} ctx
 */
export async function replaceGitlabDirectoryFromContext(
  ctx,
  targetPath,
  uploadSource,
  commitMessage,
  excludeInput = '',
) {
  const { repository, credential, apiBase, branch } = ctx;
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

/**
 * @param {string} repositoryId
 * @param {string} targetPath
 * @param {string} [branchOverride]
 * @param {string} [excludeInput]
 */
export async function scanTargetPath(
  repositoryId,
  targetPath,
  branchOverride = '',
  excludeInput = '',
) {
  const ctx = await resolveSandboxContext(repositoryId, branchOverride);

  switch (ctx.repository.platform) {
    case 'gitlab':
      return scanGitlabTargetPathFromContext(ctx, targetPath, excludeInput);
    case 'github':
      return scanGithubTargetPath(ctx, targetPath, excludeInput);
    case 'gitee':
      return scanGiteeTargetPath(ctx, targetPath, excludeInput);
    default:
      throw new Error(`目录替换暂不支持 ${ctx.repository.platform}`);
  }
}

/** @deprecated use scanTargetPath */
export async function scanGitlabTargetPath(
  repositoryId,
  targetPath,
  branchOverride = '',
  excludeInput = '',
) {
  return scanTargetPath(repositoryId, targetPath, branchOverride, excludeInput);
}

/**
 * @param {string} repositoryId
 * @param {string} targetPath
 * @param {{ zipFile?: File|null, folderFiles?: File[] }} uploadSource
 * @param {string} commitMessage
 * @param {string} [branchOverride]
 * @param {string} [excludeInput]
 */
export async function replaceDirectory(
  repositoryId,
  targetPath,
  uploadSource,
  commitMessage,
  branchOverride = '',
  excludeInput = '',
) {
  const ctx = await resolveSandboxContext(repositoryId, branchOverride);

  switch (ctx.repository.platform) {
    case 'gitlab':
      return replaceGitlabDirectoryFromContext(ctx, targetPath, uploadSource, commitMessage, excludeInput);
    case 'github':
      return replaceGithubDirectory(ctx, targetPath, uploadSource, commitMessage, excludeInput);
    case 'gitee':
      return replaceGiteeDirectory(ctx, targetPath, uploadSource, commitMessage, excludeInput);
    default:
      throw new Error(`目录替换暂不支持 ${ctx.repository.platform}`);
  }
}

/** @deprecated use replaceDirectory */
export async function replaceGitlabDirectory(
  repositoryId,
  targetPath,
  uploadSource,
  commitMessage,
  branchOverride = '',
  excludeInput = '',
) {
  return replaceDirectory(repositoryId, targetPath, uploadSource, commitMessage, branchOverride, excludeInput);
}

export { replaceGitlabDirectoryDirect } from './direct.js';
