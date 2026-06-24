import {
  PLATFORM_LABELS,
  VERIFY_STATUS_LABELS,
  formatVerifyTime,
  platformColor,
  platformInitial,
} from '../lib/credentials/types.js';
import { runCredentialVerify } from '../lib/credentials/verify-flow.js';
import { getCredentialById } from '../lib/credentials/store.js';
import { getRepositories } from '../lib/repositories/store.js';
import { buildGitPushCommands } from '../lib/push/command.js';
import {
  formatRepoPath,
  REPO_VERIFY_STATUS_LABELS,
  resolveWorkingBranch,
} from '../lib/repositories/types.js';
import { runRepositoryVerify } from '../lib/repositories/verify-flow.js';
import { runSandboxPull } from '../lib/sandbox/pull-flow.js';
import { getAllSandboxSessions } from '../lib/sandbox/store.js';
import {
  formatBytes,
  formatPullTime,
  SANDBOX_PULL_STATUS_LABELS,
} from '../lib/sandbox/types.js';

const PATH_REPLACE_PLATFORMS = new Set(['gitlab', 'github', 'gitee']);

function supportsPathReplace(platform) {
  return PATH_REPLACE_PLATFORMS.has(platform);
}

const summaryEl = document.getElementById('summary');
const credCardsEl = document.getElementById('credCards');
const emptyStateEl = document.getElementById('emptyState');
const repoCardsEl = document.getElementById('repoCards');
const repoEmptyStateEl = document.getElementById('repoEmptyState');
const sandboxCardsEl = document.getElementById('sandboxCards');
const sandboxEmptyStateEl = document.getElementById('sandboxEmptyState');
const credentialsSection = document.getElementById('credentialsSection');
const repositoriesSection = document.getElementById('repositoriesSection');
const sandboxSection = document.getElementById('sandboxSection');
const tabButtons = document.querySelectorAll('.tab');

/** @type {import('../lib/credentials/types.js').Credential[]} */
let credentials = [];

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function switchTab(tab) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  credentialsSection.classList.toggle('hidden', tab !== 'credentials');
  repositoriesSection.classList.toggle('hidden', tab !== 'repositories');
  sandboxSection.classList.toggle('hidden', tab !== 'sandbox');
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab || 'credentials'));
});

function renderSummary(credentialList) {
  const verified = credentialList.filter((item) => item.verify?.status === 'verified').length;
  summaryEl.innerHTML = `
    <div class="summary-item"><strong>${credentialList.length}</strong><span>凭证总数</span></div>
    <div class="summary-item"><strong>${verified}</strong><span>已验证</span></div>
    <div class="summary-item"><strong>${credentialList.length - verified}</strong><span>待验证</span></div>
  `;
}

function renderCredentialCards(credentialList) {
  credCardsEl.innerHTML = '';

  if (credentialList.length === 0) {
    emptyStateEl.classList.remove('hidden');
    summaryEl.innerHTML = '';
    return;
  }

  emptyStateEl.classList.add('hidden');
  renderSummary(credentialList);

  for (const cred of credentialList) {
    const status = cred.verify?.status || 'unknown';
    const li = document.createElement('li');
    li.className = 'cred-card';
    li.innerHTML = `
      <div class="card-top">
        <div class="avatar" style="background:${platformColor(cred.platform)}">${platformInitial(cred.platform)}</div>
        <div class="card-info">
          <div class="card-name">${escapeHtml(cred.name)}</div>
          <div class="card-meta">${escapeHtml(PLATFORM_LABELS[cred.platform])}${cred.username || cred.verify?.username ? ` · @${escapeHtml(cred.username || cred.verify.username)}` : ''} · ${escapeHtml(cred.token)}</div>
        </div>
        ${cred.isDefault ? '<span class="badge">默认</span>' : ''}
      </div>
      <div class="card-bottom">
        <span class="verify-badge status-${status}">${escapeHtml(VERIFY_STATUS_LABELS[status] || status)}</span>
        <span class="verify-time">${formatVerifyTime(cred.verify?.at)}</span>
      </div>
      <div class="card-actions">
        <button type="button" class="btn secondary verify-btn" data-id="${cred.id}">验证</button>
        ${!cred.isDefault ? `<button type="button" class="btn ghost default-btn" data-id="${cred.id}">设为默认</button>` : ''}
      </div>
      <div class="card-message status-${status}">${escapeHtml(cred.verify?.message || '')}</div>
    `;

    li.querySelector('.verify-btn')?.addEventListener('click', () => verifyCredentialById(cred.id, li));
    li.querySelector('.default-btn')?.addEventListener('click', () => setDefault(cred.id));
    credCardsEl.appendChild(li);
  }
}

function renderRepositoryCards(repositories) {
  repoCardsEl.innerHTML = '';

  if (repositories.length === 0) {
    repoEmptyStateEl.classList.remove('hidden');
    return;
  }

  repoEmptyStateEl.classList.add('hidden');

  for (const repo of repositories) {
    const status = repo.verify?.status || 'unknown';
    const cred = credentials.find((item) => item.id === repo.credentialId);
    const li = document.createElement('li');
    li.className = 'cred-card';
    li.innerHTML = `
      <div class="card-top">
        <div class="avatar" style="background:${platformColor(repo.platform)}">${platformInitial(repo.platform)}</div>
        <div class="card-info">
          <div class="card-name">${escapeHtml(repo.name)}</div>
          <div class="card-meta">${escapeHtml(formatRepoPath(repo))}</div>
          <div class="card-meta">${escapeHtml(repo.remoteUrl)}</div>
        </div>
      </div>
      <div class="card-bottom">
        <span class="verify-badge status-${status}">${escapeHtml(REPO_VERIFY_STATUS_LABELS[status] || status)}</span>
        <span class="verify-time">${repo.defaultBranch ? `分支 ${escapeHtml(repo.defaultBranch)}` : (repo.verify?.defaultBranch ? `默认 ${escapeHtml(repo.verify.defaultBranch)}` : '—')}</span>
      </div>
      <div class="card-meta card-cred">${cred ? `凭证：${escapeHtml(cred.name)}` : '未关联凭证'}</div>
      <div class="card-actions">
        <button type="button" class="btn secondary verify-repo-btn" data-id="${repo.id}">验证</button>
        ${status === 'verified' ? `<button type="button" class="btn secondary copy-push-btn" data-id="${repo.id}">复制 push 命令</button>` : ''}
        ${status === 'verified' && supportsPathReplace(repo.platform) ? `<button type="button" class="btn secondary path-replace-btn" data-id="${repo.id}">目录替换</button>` : ''}
        ${status === 'verified' ? `<button type="button" class="btn primary pull-repo-btn" data-id="${repo.id}">沙箱拉取</button>` : ''}
      </div>
      <div class="card-message status-${status}">${escapeHtml(repo.verify?.message || '')}</div>
    `;

    li.querySelector('.verify-repo-btn')?.addEventListener('click', () => verifyRepositoryById(repo.id, li));
    li.querySelector('.copy-push-btn')?.addEventListener('click', () => copyPushCommand(repo.id, li));
    li.querySelector('.pull-repo-btn')?.addEventListener('click', () => {
      switchTab('sandbox');
      pullSandboxById(repo.id);
    });
    li.querySelector('.path-replace-btn')?.addEventListener('click', () => openPathReplace(repo.id));
    repoCardsEl.appendChild(li);
  }
}

function renderSandboxCards(repositories, sessions) {
  sandboxCardsEl.innerHTML = '';
  const verified = repositories.filter((item) => item.verify?.status === 'verified');

  if (verified.length === 0) {
    sandboxEmptyStateEl.classList.remove('hidden');
    return;
  }

  sandboxEmptyStateEl.classList.add('hidden');
  const sessionMap = Object.fromEntries(sessions.map((item) => [item.repositoryId, item]));

  for (const repo of verified) {
    const session = sessionMap[repo.id];
    const pull = session?.pull;
    const status = pull?.status || 'unknown';
    const li = document.createElement('li');
    li.className = 'cred-card';
    li.dataset.repoId = repo.id;

    const detail = pull?.status === 'success'
      ? [
        `分支 ${pull.branch}`,
        `提交 ${pull.commitSha}`,
        pull.commitMessage ? `"${pull.commitMessage}"` : '',
        `归档 ${formatBytes(pull.archiveBytes)}`,
        pull.hasWorkspace ? `沙箱 ${pull.fileCount || 0} 个文件` : '',
        pull.sampleFiles?.length ? `示例：${pull.sampleFiles.slice(0, 3).join(', ')}` : '',
      ].filter(Boolean).join('\n')
      : (pull?.message || '');

    li.innerHTML = `
      <div class="card-top">
        <div class="avatar" style="background:${platformColor(repo.platform)}">${platformInitial(repo.platform)}</div>
        <div class="card-info">
          <div class="card-name">${escapeHtml(repo.name)}</div>
          <div class="card-meta">${escapeHtml(formatRepoPath(repo))}</div>
          <div class="card-meta">分支 ${escapeHtml(repo.defaultBranch || pull?.branch || '—')}</div>
        </div>
      </div>
      <div class="card-bottom">
        <span class="verify-badge status-${status === 'success' ? 'verified' : status === 'failed' ? 'failed' : status}">${escapeHtml(SANDBOX_PULL_STATUS_LABELS[status] || status)}</span>
        <span class="verify-time">${formatPullTime(pull?.at)}</span>
      </div>
      <div class="card-actions">
        <button type="button" class="btn primary sandbox-pull-btn" data-id="${repo.id}">拉取代码</button>
        ${pull?.status === 'success' && pull?.hasWorkspace ? `<button type="button" class="btn secondary sandbox-open-btn" data-id="${repo.id}">打开沙箱</button>` : ''}
        ${supportsPathReplace(repo.platform) ? `<button type="button" class="btn secondary path-replace-btn" data-id="${repo.id}">目录替换</button>` : ''}
      </div>
      <div class="card-message status-${status === 'success' ? 'verified' : status} sandbox-detail">${escapeHtml(detail)}</div>
    `;

    li.querySelector('.sandbox-pull-btn')?.addEventListener('click', () => pullSandboxById(repo.id, li));
    li.querySelector('.sandbox-open-btn')?.addEventListener('click', () => openSandboxWorkspace(repo.id));
    li.querySelector('.path-replace-btn')?.addEventListener('click', () => openPathReplace(repo.id));
    sandboxCardsEl.appendChild(li);
  }
}

function openSandboxWorkspace(repositoryId) {
  const url = chrome.runtime.getURL(`src/sandbox/index.html?repo=${encodeURIComponent(repositoryId)}`);
  chrome.tabs.create({ url });
}

function openPathReplace(repositoryId) {
  const url = chrome.runtime.getURL(`src/path-replace/index.html?repo=${encodeURIComponent(repositoryId)}`);
  chrome.tabs.create({ url });
}

async function copyPushCommand(repositoryId, cardEl) {
  const msgEl = cardEl?.querySelector('.card-message');
  const btn = cardEl?.querySelector('.copy-push-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '复制中...';
  }

  try {
    const repositories = await getRepositories();
    const repo = repositories.find((item) => item.id === repositoryId);
    if (!repo) throw new Error('仓库不存在');
    if (repo.verify?.status !== 'verified') throw new Error('请先验证仓库');

    const cred = await getCredentialById(repo.credentialId, true);
    if (!cred?.token) throw new Error('关联凭证无可用 Token');

    const branch = resolveWorkingBranch(repo);
    const text = buildGitPushCommands({
      platform: repo.platform,
      host: repo.host,
      fullPath: repo.fullPath,
      remoteUrl: repo.remoteUrl,
      repo: repo.repo,
      token: cred.token,
      username: cred.username || cred.verify?.username || '',
      branch,
      repoLabel: repo.name || formatRepoPath(repo),
    });

    await navigator.clipboard.writeText(text);
    if (msgEl) {
      msgEl.textContent = `push 命令已复制（含 Token · 分支 ${branch}）`;
      msgEl.className = 'card-message status-verified';
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = err.message || '复制失败';
      msgEl.className = 'card-message status-failed';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '复制 push 命令';
    }
  }
}

async function pullSandboxById(id, cardEl) {
  const btn = cardEl?.querySelector('.sandbox-pull-btn')
    || document.querySelector(`.cred-card[data-repo-id="${id}"] .sandbox-pull-btn`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '拉取中...';
  }

  const msgEl = cardEl?.querySelector('.sandbox-detail')
    || document.querySelector(`.cred-card[data-repo-id="${id}"] .sandbox-detail`);

  try {
    const result = await runSandboxPull(id);
    await loadSandbox();

    if (!result.ok && msgEl) {
      msgEl.textContent = result.error || '拉取失败';
      msgEl.className = 'card-message status-failed sandbox-detail';
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = err.message;
      msgEl.className = 'card-message status-failed sandbox-detail';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '拉取代码';
    }
  }
}

async function verifyCredentialById(id, cardEl) {
  const btn = cardEl.querySelector('.verify-btn');
  btn.disabled = true;
  btn.textContent = '验证中...';

  try {
    const full = await getCredentialById(id, true);
    if (!full) throw new Error('凭证不存在');
    const { verify } = await runCredentialVerify(full);

    if (verify.status !== 'verified') {
      const msgEl = cardEl.querySelector('.card-message');
      msgEl.textContent = verify.message || '验证失败';
      msgEl.className = 'card-message status-failed';
    }

    await loadCredentials();
  } catch (err) {
    const msgEl = cardEl.querySelector('.card-message');
    msgEl.textContent = err.message;
    msgEl.className = 'card-message status-failed';
  } finally {
    btn.disabled = false;
    btn.textContent = '验证';
  }
}

async function verifyRepositoryById(id, cardEl) {
  const btn = cardEl.querySelector('.verify-repo-btn');
  btn.disabled = true;
  btn.textContent = '验证中...';

  try {
    const repositories = await getRepositories();
    const repo = repositories.find((item) => item.id === id);
    if (!repo) throw new Error('仓库不存在');

    const { verify } = await runRepositoryVerify(repo, credentials);
    if (verify.status !== 'verified') {
      const msgEl = cardEl.querySelector('.card-message');
      msgEl.textContent = verify.message || '验证失败';
      msgEl.className = 'card-message status-failed';
    }

    await loadRepositories();
    await loadSandbox();
  } catch (err) {
    const msgEl = cardEl.querySelector('.card-message');
    msgEl.textContent = err.message;
    msgEl.className = 'card-message status-failed';
  } finally {
    btn.disabled = false;
    btn.textContent = '验证';
  }
}

async function setDefault(id) {
  const res = await send('SET_DEFAULT_CREDENTIAL', { id });
  if (!res?.ok) return;
  await loadCredentials();
}

async function loadCredentials() {
  const res = await send('GET_CREDENTIALS');
  if (!res?.ok) return;
  credentials = res.credentials || [];
  renderCredentialCards(credentials);
}

async function loadRepositories() {
  const repositories = await getRepositories();
  renderRepositoryCards(repositories);
  return repositories;
}

async function loadSandbox() {
  const [repositories, sessions] = await Promise.all([
    getRepositories(),
    getAllSandboxSessions(),
  ]);
  renderSandboxCards(repositories, sessions);
}

async function loadAll() {
  await loadCredentials();
  const repositories = await loadRepositories();
  await loadSandbox();
  return repositories;
}

document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('openOptionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('openRepoOptionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('openSandboxOptionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

loadAll();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.credentials) loadCredentials();
  if (changes.repositories) {
    loadRepositories();
    loadSandbox();
  }
  if (changes.sandboxSessions) loadSandbox();
});
