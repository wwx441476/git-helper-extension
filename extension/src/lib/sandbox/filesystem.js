const DB_NAME = 'gitHelperSandbox';
const STORE = 'files';
const DB_VERSION = 1;

function fileKey(repositoryId, path) {
  return `${repositoryId}\0${path}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('repositoryId', 'repositoryId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    fn(store, tx);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  }));
}

function runRead(fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = fn(store);
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  }));
}

/**
 * @param {string} repositoryId
 * @param {Record<string, { content: string, encoding: 'text'|'base64' }>} files
 */
export async function replaceWorkspaceFiles(repositoryId, files) {
  await clearWorkspace(repositoryId);
  await runTransaction('readwrite', (store) => {
    const now = Date.now();
    for (const [path, file] of Object.entries(files)) {
      store.put({
        key: fileKey(repositoryId, path),
        repositoryId,
        path,
        content: file.content,
        encoding: file.encoding,
        status: 'unchanged',
        updatedAt: now,
      });
    }
  });
}

export async function clearWorkspace(repositoryId) {
  const keys = await listWorkspaceKeys(repositoryId);
  if (keys.length === 0) return;

  await runTransaction('readwrite', (store) => {
    for (const key of keys) store.delete(key);
  });
}

async function listWorkspaceKeys(repositoryId) {
  return runRead((store) => {
    const index = store.index('repositoryId');
    return index.getAllKeys(repositoryId);
  });
}

/**
 * @param {string} repositoryId
 * @returns {Promise<Array<{ path: string, encoding: string, status: string, updatedAt: number }>>}
 */
export async function listWorkspaceFiles(repositoryId) {
  const rows = await runRead((store) => {
    const index = store.index('repositoryId');
    return index.getAll(repositoryId);
  });

  return (rows || [])
    .map((row) => ({
      path: row.path,
      encoding: row.encoding,
      status: row.status || 'unchanged',
      updatedAt: row.updatedAt || 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * @param {string} repositoryId
 * @param {string} path
 */
export async function getWorkspaceFile(repositoryId, path) {
  return runRead((store) => store.get(fileKey(repositoryId, path)));
}

/**
 * @param {string} repositoryId
 * @param {string} path
 * @param {string} content
 * @param {'text'|'base64'} [encoding]
 */
export async function saveWorkspaceFile(repositoryId, path, content, encoding = 'text') {
  const existing = await getWorkspaceFile(repositoryId, path);
  const status = existing?.status === 'added' ? 'added' : 'modified';

  await runTransaction('readwrite', (store) => {
    store.put({
      key: fileKey(repositoryId, path),
      repositoryId,
      path,
      content,
      encoding,
      status,
      updatedAt: Date.now(),
    });
  });
}

/**
 * @param {string} repositoryId
 * @param {string} path
 * @param {string} content
 * @param {'text'|'base64'} [encoding]
 */
export async function addWorkspaceFile(repositoryId, path, content, encoding = 'text') {
  const existing = await getWorkspaceFile(repositoryId, path);
  if (existing && existing.status !== 'deleted') {
    throw new Error('文件已存在');
  }

  await runTransaction('readwrite', (store) => {
    store.put({
      key: fileKey(repositoryId, path),
      repositoryId,
      path,
      content,
      encoding,
      status: 'added',
      updatedAt: Date.now(),
    });
  });
}

/**
 * @param {string} repositoryId
 * @param {string} path
 */
export async function deleteWorkspaceFile(repositoryId, path) {
  const existing = await getWorkspaceFile(repositoryId, path);
  if (!existing) throw new Error('文件不存在');

  if (existing.status === 'added') {
    await runTransaction('readwrite', (store) => {
      store.delete(fileKey(repositoryId, path));
    });
    return;
  }

  await runTransaction('readwrite', (store) => {
    store.put({
      ...existing,
      status: 'deleted',
      updatedAt: Date.now(),
    });
  });
}

export async function countWorkspaceFiles(repositoryId) {
  const files = await listWorkspaceFiles(repositoryId);
  return files.filter((file) => file.status !== 'deleted').length;
}
