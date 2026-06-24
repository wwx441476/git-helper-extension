import {
  createCredential,
  createEmptyVerify,
  resolveApiBase,
  resolveInputToken,
  toPublicCredential,
} from './types.js';

const STORAGE_KEY = 'credentials';

async function loadAll() {
  const data = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  const list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  return list.map((item) => createCredential(item));
}

async function persist(credentials) {
  await chrome.storage.local.set({ [STORAGE_KEY]: credentials });
}

export async function getCredentials(includeToken = false) {
  const credentials = await loadAll();
  if (includeToken) return credentials;
  return credentials.map(toPublicCredential);
}

export async function getCredentialById(id, includeToken = false) {
  const credentials = await loadAll();
  const found = credentials.find((item) => item.id === id);
  if (!found) return null;
  return includeToken ? found : toPublicCredential(found);
}

export async function saveCredential(input) {
  const credentials = await loadAll();
  const now = Date.now();
  const idx = credentials.findIndex((item) => item.id === input.id);

  if (idx === -1) {
    const created = createCredential({
      ...input,
      createdAt: now,
      updatedAt: now,
      verify: createEmptyVerify(),
    });

    if (created.isDefault || !credentials.some((item) => item.platform === created.platform)) {
      created.isDefault = true;
      for (const item of credentials) {
        if (item.platform === created.platform) item.isDefault = false;
      }
    }

    credentials.push(created);
    await persist(credentials);
    return toPublicCredential(created);
  }

  const existing = credentials[idx];
  const token = resolveInputToken(input.token, existing.token);
  const updated = createCredential({
    ...existing,
    ...input,
    id: existing.id,
    token,
    authType: 'token',
    verify: input.verify || existing.verify || createEmptyVerify(),
    createdAt: existing.createdAt,
    updatedAt: now,
  });

  if (updated.isDefault) {
    for (const item of credentials) {
      if (item.platform === updated.platform && item.id !== updated.id) {
        item.isDefault = false;
      }
    }
  }

  credentials[idx] = updated;
  await persist(credentials);
  return toPublicCredential(updated);
}

export async function deleteCredential(id) {
  const credentials = await loadAll();
  const target = credentials.find((item) => item.id === id);
  if (!target) throw new Error('凭证不存在');

  const next = credentials.filter((item) => item.id !== id);
  if (target.isDefault) {
    const samePlatform = next.filter((item) => item.platform === target.platform);
    if (samePlatform.length > 0) samePlatform[0].isDefault = true;
  }

  await persist(next);
  return { ok: true };
}

export async function setDefaultCredential(id) {
  const credentials = await loadAll();
  const target = credentials.find((item) => item.id === id);
  if (!target) throw new Error('凭证不存在');

  for (const item of credentials) {
    item.isDefault = item.platform === target.platform && item.id === id;
    if (item.id === id) item.updatedAt = Date.now();
  }

  await persist(credentials);
  return toPublicCredential(target);
}

export async function updateVerifyResult(id, verifyPatch) {
  const credentials = await loadAll();
  const idx = credentials.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error('凭证不存在');

  credentials[idx] = {
    ...credentials[idx],
    verify: {
      ...createEmptyVerify(),
      ...credentials[idx].verify,
      ...verifyPatch,
      at: verifyPatch.at ?? Date.now(),
    },
    updatedAt: Date.now(),
  };

  await persist(credentials);
  return toPublicCredential(credentials[idx]);
}

export async function getDefaultCredential(platform, includeToken = false) {
  const credentials = await loadAll();
  const found = credentials.find((item) => item.platform === platform && item.isDefault)
    || credentials.find((item) => item.platform === platform);
  if (!found) return null;
  return includeToken ? found : toPublicCredential(found);
}

export { resolveApiBase };
