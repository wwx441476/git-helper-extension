import { getCredentialById, resolveApiBase } from '../credentials/store.js';
import { resolveWorkingBranch } from '../repositories/types.js';
import { getParseOptionsFromCredential, parseRemoteUrl, applyParsedUrl } from '../repositories/parse-url.js';
import { getRepositoryById } from '../repositories/store.js';
import { createRepository } from '../repositories/types.js';

/**
 * @param {string} repositoryId
 * @param {string} [branchOverride]
 */
export async function resolveSandboxContext(repositoryId, branchOverride = '') {
  const repository = await getRepositoryById(repositoryId);
  if (!repository) throw new Error('仓库不存在');
  if (!repository.credentialId) throw new Error('仓库未关联凭证');
  if (repository.verify?.status !== 'verified') throw new Error('请先验证仓库');

  const credential = await getCredentialById(repository.credentialId, true);
  if (!credential) throw new Error('关联凭证不存在');
  if (credential.verify?.status !== 'verified') throw new Error('请先验证关联凭证');

  const parsed = parseRemoteUrl(repository.remoteUrl, getParseOptionsFromCredential(credential));
  const merged = applyParsedUrl(createRepository(repository), parsed);

  const branch = branchOverride
    || resolveWorkingBranch(repository, repository.verify?.defaultBranch);

  return {
    repository: merged,
    credential,
    apiBase: resolveApiBase(credential),
    branch,
  };
}
