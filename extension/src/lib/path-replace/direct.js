import { mapRelativeFilesToRemote } from '../gitlab/local-upload.js';
import {
  createGitlabCommitBatched,
  listGitlabFilesAtPath,
  normalizeDirPath,
} from '../gitlab/commit.js';
import { filterExcludedPaths, parseExcludePaths } from './shared.js';

export { replaceGithubDirectoryDirect } from '../github/path-replace.js';
export { replaceGiteeDirectoryDirect } from '../gitee/path-replace.js';

/**
 * CLI / 脚本入口：GitLab 专用。
 */
export async function replaceGitlabDirectoryDirect(options) {
  const {
    apiBase,
    token,
    projectPath,
    branch,
    targetPath,
    relativeFiles,
    commitMessage = '',
    excludeInput = '',
  } = options;

  const trimmedToken = (token || '').trim();
  if (!trimmedToken) throw new Error('缺少 GitLab Token（环境变量 GITLAB_TOKEN 或 --token）');

  const trimmedApiBase = (apiBase || '').trim().replace(/\/+$/, '');
  if (!trimmedApiBase) throw new Error('缺少 API 地址（--api-base）');

  const trimmedProject = (projectPath || '').trim();
  if (!trimmedProject) throw new Error('缺少项目路径（--project）');

  const trimmedBranch = (branch || '').trim();
  if (!trimmedBranch) throw new Error('缺少分支（--branch）');

  const dirPath = normalizeDirPath(targetPath);
  if (!dirPath) throw new Error('请填写目标路径');

  const excludePrefixes = parseExcludePaths(excludeInput, dirPath);
  const encoded = encodeURIComponent(trimmedProject);
  const allRemoteFiles = await listGitlabFilesAtPath(
    trimmedApiBase,
    encoded,
    trimmedBranch,
    dirPath,
    trimmedToken,
  );
  const remoteFiles = filterExcludedPaths(allRemoteFiles, excludePrefixes);
  if (!relativeFiles?.length) throw new Error('没有可上传的文件');
  const newFiles = mapRelativeFilesToRemote(relativeFiles, dirPath, excludePrefixes);
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
    trimmedApiBase,
    encoded,
    trimmedBranch,
    message,
    [...deleteActions, ...createActions],
    trimmedToken,
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
