import { createEmptySandboxPull } from './types.js';

const STORAGE_KEY = 'sandboxSessions';

async function loadAll() {
  const data = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const map = data[STORAGE_KEY] && typeof data[STORAGE_KEY] === 'object'
    ? data[STORAGE_KEY]
    : {};
  return map;
}

async function persist(map) {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

export async function getSandboxSession(repositoryId) {
  const map = await loadAll();
  return map[repositoryId] || null;
}

export async function getAllSandboxSessions() {
  const map = await loadAll();
  return Object.values(map);
}

export async function saveSandboxSession(session) {
  const map = await loadAll();
  map[session.repositoryId] = {
    ...session,
    updatedAt: Date.now(),
  };
  await persist(map);
  return map[session.repositoryId];
}

export async function updateSandboxPull(repositoryId, pullPatch, meta = {}) {
  const map = await loadAll();
  const existing = map[repositoryId] || {
    repositoryId,
    repositoryName: meta.repositoryName || '',
    fullPath: meta.fullPath || '',
    pull: createEmptySandboxPull(meta.branch || 'main'),
    updatedAt: Date.now(),
  };

  map[repositoryId] = {
    ...existing,
    ...meta,
    repositoryId,
    pull: {
      ...createEmptySandboxPull(existing.pull?.branch || meta.branch || 'main'),
      ...existing.pull,
      ...pullPatch,
      at: pullPatch.at ?? Date.now(),
    },
    updatedAt: Date.now(),
  };

  await persist(map);
  return map[repositoryId];
}

export async function clearSandboxSession(repositoryId) {
  const map = await loadAll();
  delete map[repositoryId];
  await persist(map);
}
