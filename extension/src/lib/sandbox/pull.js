import { getSettings } from '../settings.js';
import { pullGiteeSandbox } from './pull/gitee.js';
import { pullGithubSandbox } from './pull/github.js';
import { pullGitlabSandbox } from './pull/gitlab.js';
import { isMockSandboxPull, pullMockSandbox } from './pull/mock.js';

/**
 * @param {import('../repositories/types.js').Repository} repository
 * @param {import('../credentials/types.js').Credential} credential
 * @param {string} apiBase
 * @param {string} branch
 */
export async function pullRepositorySandbox(repository, credential, apiBase, branch) {
  const settings = await getSettings();
  if (settings.useMockSandboxPull || isMockSandboxPull(credential.token)) {
    return pullMockSandbox(branch);
  }

  switch (repository.platform) {
    case 'github':
      return pullGithubSandbox(credential, apiBase, repository.owner, repository.repo, branch);
    case 'gitee':
      return pullGiteeSandbox(credential, apiBase, repository.owner, repository.repo, branch);
    case 'gitlab':
      return pullGitlabSandbox(credential, apiBase, repository.fullPath, branch);
    default:
      throw new Error(`不支持的平台: ${repository.platform}`);
  }
}
