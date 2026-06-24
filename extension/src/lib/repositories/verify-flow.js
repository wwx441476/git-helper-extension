import {
  applyParsedUrl,
  getParseOptionsFromCredential,
  parseRemoteUrl,
} from './parse-url.js';
import { getRepositoryById, saveRepository, updateRepoVerifyResult } from './store.js';
import { createRepository } from './types.js';
import { resolveWorkingBranch } from './types.js';
import { verifyRepository } from './verify.js';

function getCredentialFromList(credentials, credentialId) {
  return credentials.find((item) => item.id === credentialId) || null;
}

export async function runRepositoryVerify(repositoryInput, credentials = []) {
  const credential = getCredentialFromList(credentials, repositoryInput.credentialId)
    || null;

  let parsed;
  try {
    parsed = parseRemoteUrl(
      repositoryInput.remoteUrl,
      getParseOptionsFromCredential(credential),
    );
  } catch (err) {
    throw new Error(err.message || '仓库地址无效');
  }

  const prepared = applyParsedUrl(createRepository(repositoryInput), parsed);
  const userBranch = (repositoryInput.defaultBranch || '').trim();
  const saved = await saveRepository(prepared);

  await updateRepoVerifyResult(saved.id, { status: 'verifying', message: '' });
  const { repository, verify } = await verifyRepository(saved);

  const updated = await saveRepository({
    ...repository,
    id: saved.id,
    defaultBranch: resolveWorkingBranch(
      { ...repository, defaultBranch: userBranch || repository.defaultBranch },
      verify.defaultBranch,
    ),
    verify,
  });

  return { verify, repository: updated };
}

export async function parseAndPreviewUrl(remoteUrl, credential = null) {
  return parseRemoteUrl(remoteUrl, getParseOptionsFromCredential(credential));
}

export async function resolveRepositoryInput(formData, credentials) {
  const credential = getCredentialFromList(credentials, formData.credentialId);
  const parsed = parseRemoteUrl(
    formData.remoteUrl,
    getParseOptionsFromCredential(credential),
  );

  const credentialId = formData.credentialId
    || credentials.find((item) => item.platform === parsed.platform && item.isDefault)?.id
    || credentials.find((item) => item.platform === parsed.platform)?.id
    || '';

  const repository = applyParsedUrl(createRepository({
    ...formData,
    credentialId,
  }), parsed);
  const { verify, ...withoutVerify } = repository;
  return withoutVerify;
}
