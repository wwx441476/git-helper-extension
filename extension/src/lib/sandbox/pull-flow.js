import { resolveSandboxContext } from './context.js';
import { replaceWorkspaceFiles } from './filesystem.js';
import { pullRepositorySandbox } from './pull.js';
import { extractArchiveFiles } from './unzip.js';
import { saveSandboxSession, updateSandboxPull } from './store.js';
import { formatRepoPath } from '../repositories/types.js';

/**
 * 沙箱拉取：下载归档、解压到 IndexedDB，供沙箱页编辑。
 * @param {string} repositoryId
 * @param {string} [branchOverride]
 */
export async function runSandboxPull(repositoryId, branchOverride = '') {
  const { repository, credential, apiBase, branch } = await resolveSandboxContext(
    repositoryId,
    branchOverride,
  );

  await updateSandboxPull(repositoryId, {
    status: 'pulling',
    branch,
    message: '',
  }, {
    repositoryName: repository.name,
    fullPath: formatRepoPath(repository),
    branch,
  });

  try {
    const result = await pullRepositorySandbox(repository, credential, apiBase, branch);

    let files;
    if (result.workspaceFiles) {
      files = result.workspaceFiles;
    } else {
      if (!result.archiveBuffer) {
        throw new Error('未获取到代码归档');
      }
      files = extractArchiveFiles(result.archiveBuffer);
    }

    const workspaceFileCount = Object.keys(files).length;
    if (workspaceFileCount === 0) {
      throw new Error('归档为空，未解压出任何文件');
    }

    await replaceWorkspaceFiles(repositoryId, files);

    const session = await saveSandboxSession({
      repositoryId,
      repositoryName: repository.name,
      fullPath: formatRepoPath(repository),
      pull: {
        status: 'success',
        at: Date.now(),
        branch: result.branch,
        commitSha: result.commitSha,
        commitMessage: result.commitMessage,
        commitAuthor: result.commitAuthor,
        fileCount: workspaceFileCount,
        archiveBytes: result.archiveBytes,
        sampleFiles: result.sampleFiles,
        hasWorkspace: true,
        message: '',
      },
      updatedAt: Date.now(),
    });

    return { ok: true, session, result: { ...result, fileCount: workspaceFileCount } };
  } catch (err) {
    const session = await updateSandboxPull(repositoryId, {
      status: 'failed',
      branch,
      message: err.message || '拉取失败',
    }, {
      repositoryName: repository.name,
      fullPath: formatRepoPath(repository),
      branch,
    });

    return { ok: false, session, error: err.message || '拉取失败' };
  }
}
