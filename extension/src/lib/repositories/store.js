import { createEmptyRepoVerify, createRepository } from './types.js';

const STORAGE_KEY = 'repositories';

async function loadAll() {
  const data = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  const list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  return list.map((item) => createRepository(item));
}

async function persist(repositories) {
  await chrome.storage.local.set({ [STORAGE_KEY]: repositories });
}

export async function getRepositories() {
  return loadAll();
}

export async function getRepositoryById(id) {
  const repositories = await loadAll();
  return repositories.find((item) => item.id === id) || null;
}

export async function saveRepository(input) {
  const repositories = await loadAll();
  const now = Date.now();
  const idx = repositories.findIndex((item) => item.id === input.id);

  if (idx === -1) {
    const created = createRepository({
      ...input,
      createdAt: now,
      updatedAt: now,
      verify: createEmptyRepoVerify(),
    });
    repositories.push(created);
    await persist(repositories);
    return created;
  }

  const existing = repositories[idx];
  const updated = createRepository({
    ...existing,
    ...input,
    id: existing.id,
    verify: 'verify' in input
      ? (input.verify ?? createEmptyRepoVerify())
      : (existing.verify || createEmptyRepoVerify()),
    createdAt: existing.createdAt,
    updatedAt: now,
  });

  repositories[idx] = updated;
  await persist(repositories);
  return updated;
}

export async function deleteRepository(id) {
  const repositories = await loadAll();
  if (!repositories.some((item) => item.id === id)) {
    throw new Error('仓库不存在');
  }
  await persist(repositories.filter((item) => item.id !== id));
  return { ok: true };
}

export async function updateRepoVerifyResult(id, verifyPatch) {
  const repositories = await loadAll();
  const idx = repositories.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error('仓库不存在');

  repositories[idx] = {
    ...repositories[idx],
    verify: {
      ...createEmptyRepoVerify(),
      ...repositories[idx].verify,
      ...verifyPatch,
      at: verifyPatch.at ?? Date.now(),
    },
    updatedAt: Date.now(),
  };

  await persist(repositories);
  return repositories[idx];
}

export async function unlinkCredentialFromRepos(credentialId) {
  const repositories = await loadAll();
  let changed = false;
  for (const repo of repositories) {
    if (repo.credentialId === credentialId) {
      repo.credentialId = '';
      repo.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) await persist(repositories);
}

export function suggestCredentialId(credentials, platform) {
  const matched = credentials.filter((item) => item.platform === platform);
  const verified = matched.filter((item) => item.verify?.status === 'verified');
  const preferred = verified.find((item) => item.isDefault) || verified[0] || matched.find((item) => item.isDefault) || matched[0];
  return preferred?.id || '';
}
