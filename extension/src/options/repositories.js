import { PLATFORM_LABELS, platformColor, platformInitial } from '../lib/credentials/types.js';
import { listRepositoryBranches } from '../lib/repositories/branches.js';
import { getParseOptionsFromCredential, parseRemoteUrl } from '../lib/repositories/parse-url.js';
import {
  deleteRepository,
  getRepositories,
  saveRepository,
  suggestCredentialId,
} from '../lib/repositories/store.js';
import {
  formatRepoPath,
  REPO_VERIFY_STATUS_LABELS,
} from '../lib/repositories/types.js';
import { resolveRepositoryInput, runRepositoryVerify } from '../lib/repositories/verify-flow.js';
import { runSandboxPull } from '../lib/sandbox/pull-flow.js';

const repoListEl = document.getElementById('repoList');
const repoCountEl = document.getElementById('repoCount');
const repoForm = document.getElementById('repoForm');
const repoStatusEl = document.getElementById('repoStatus');
const repoVerifyCard = document.getElementById('repoVerifyCard');
const repoVerifyStatusEl = document.getElementById('repoVerifyStatus');
const repoVerifyMetaEl = document.getElementById('repoVerifyMeta');
const repoParsePreviewEl = document.getElementById('repoParsePreview');
const repoCredentialSelect = document.getElementById('repoCredentialId');
const repoBranchSelect = document.getElementById('repoBranchSelect');

/** @type {import('../lib/repositories/types.js').Repository[]} */
let repositories = [];
/** @type {import('../lib/credentials/types.js').Credential[]} */
let credentials = [];
/** @type {string|null} */
let editingRepoId = null;

const repoFields = {
  name: document.getElementById('repoName'),
  remoteUrl: document.getElementById('repoRemoteUrl'),
  credentialId: document.getElementById('repoCredentialId'),
  defaultBranch: document.getElementById('repoDefaultBranch'),
};

function setRepoStatus(text, type = '') {
  repoStatusEl.textContent = text;
  repoStatusEl.className = `status ${type}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderCredentialOptions(selectedId = '') {
  repoCredentialSelect.innerHTML = '<option value="">请选择凭证</option>';
  for (const cred of credentials) {
    const option = document.createElement('option');
    option.value = cred.id;
    const account = cred.username || cred.verify?.username || '';
    const verifyLabel = cred.verify?.status === 'verified' ? '已验证' : '未验证';
    option.textContent = `${cred.name} (${PLATFORM_LABELS[cred.platform]}${account ? ` · @${account}` : ''} · ${verifyLabel})`;
    if (cred.id === selectedId) option.selected = true;
    repoCredentialSelect.appendChild(option);
  }
}

function renderRepoVerifyCard(repository) {
  if (!repository) {
    repoVerifyCard.classList.add('hidden');
    return;
  }

  repoVerifyCard.classList.remove('hidden');
  const status = repository.verify?.status || 'unknown';
  repoVerifyStatusEl.textContent = REPO_VERIFY_STATUS_LABELS[status] || status;
  repoVerifyStatusEl.className = `verify-status status-${status}`;

  const parts = [];
  if (repository.defaultBranch) parts.push(`工作分支：${repository.defaultBranch}`);
  if (repository.verify?.defaultBranch) {
    parts.push(`远程默认分支：${repository.verify.defaultBranch}`);
  }
  if (repository.verify?.description) parts.push(repository.verify.description);
  if (repository.verify?.message) parts.push(repository.verify.message);
  repoVerifyMetaEl.textContent = parts.join('\n') || '尚未验证';
}

function getSelectedCredential() {
  return credentials.find((item) => item.id === repoFields.credentialId.value) || null;
}

function updateParsePreview() {
  const raw = repoFields.remoteUrl.value.trim();
  if (!raw) {
    repoParsePreviewEl.textContent = '';
    return;
  }

  try {
    const parsed = parseRemoteUrl(raw, getParseOptionsFromCredential(getSelectedCredential()));
    const selfHosted = parsed.host !== 'github.com'
      && parsed.host !== 'gitee.com'
      && parsed.host !== 'gitlab.com';
    const extra = selfHosted ? ' · 自建实例' : '';
    repoParsePreviewEl.textContent = `识别：${PLATFORM_LABELS[parsed.platform]}${extra} · ${parsed.fullPath} · ${parsed.normalizedUrl}`;
    repoParsePreviewEl.className = 'parse-preview ok';

    if (!repoFields.credentialId.value) {
      const suggested = suggestCredentialId(credentials, parsed.platform);
      if (suggested) repoFields.credentialId.value = suggested;
    }

    if (!repoFields.name.value.trim() || repoFields.name.value.trim() === '未命名仓库') {
      repoFields.name.value = parsed.repo;
    }
  } catch (err) {
    repoParsePreviewEl.textContent = err.message;
    repoParsePreviewEl.className = 'parse-preview err';
  }
}

function syncBranchSelectValue(branch) {
  const value = (branch || '').trim();
  repoFields.defaultBranch.value = value;
  if (!value) return;
  const exists = Array.from(repoBranchSelect.options).some((opt) => opt.value === value);
  if (exists) repoBranchSelect.value = value;
}

function fillBranchSelect(branches, selected = '') {
  const selectedTrim = (selected || '').trim();
  const merged = sortBranchNames(
    selectedTrim && !branches.includes(selectedTrim)
      ? [selectedTrim, ...branches]
      : branches,
  );

  repoBranchSelect.innerHTML = '<option value="">从列表选择分支</option>';
  for (const name of merged) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === selectedTrim) option.selected = true;
    repoBranchSelect.appendChild(option);
  }
}

function sortBranchNames(names) {
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillRepoForm(repository) {
  repoFields.name.value = repository.name || '';
  repoFields.remoteUrl.value = repository.remoteUrl || '';
  syncBranchSelectValue(repository.defaultBranch || '');
  renderCredentialOptions(repository.credentialId || '');
  editingRepoId = repository.id;
  updateParsePreview();
  renderRepoVerifyCard(repository);
}

function getRepoFormData() {
  return {
    id: editingRepoId || undefined,
    name: repoFields.name.value.trim() || '未命名仓库',
    remoteUrl: repoFields.remoteUrl.value.trim(),
    credentialId: repoFields.credentialId.value,
    defaultBranch: repoFields.defaultBranch.value.trim(),
  };
}

function renderRepoList() {
  repoCountEl.textContent = `${repositories.length} 个`;
  repoListEl.innerHTML = '';

  if (repositories.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'cred-empty';
    empty.textContent = '暂无仓库，点击右上角 + 添加';
    repoListEl.appendChild(empty);
    return;
  }

  for (const repo of repositories) {
    const li = document.createElement('li');
    li.className = `cred-item${repo.id === editingRepoId ? ' active' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.style.background = platformColor(repo.platform);
    avatar.textContent = platformInitial(repo.platform);

    const cred = credentials.find((item) => item.id === repo.credentialId);
    const status = repo.verify?.status || 'unknown';
    const info = document.createElement('div');
    info.className = 'cred-info';
    info.innerHTML = `
      <div class="cred-name">${escapeHtml(repo.name)}</div>
      <div class="cred-meta">${escapeHtml(PLATFORM_LABELS[repo.platform])} · ${escapeHtml(formatRepoPath(repo))}</div>
      <div class="cred-meta">${cred ? escapeHtml(cred.name) : '未关联凭证'}</div>
      <div class="cred-verify status-${status}">${escapeHtml(REPO_VERIFY_STATUS_LABELS[status] || status)}</div>
    `;

    li.appendChild(avatar);
    li.appendChild(info);
    li.addEventListener('click', () => selectRepository(repo.id));
    repoListEl.appendChild(li);
  }
}

async function selectRepository(id) {
  const repo = repositories.find((item) => item.id === id);
  if (!repo) return;
  fillRepoForm(repo);
  renderRepoList();
  setRepoStatus('');
}

async function loadRepositories() {
  repositories = await getRepositories();
  renderRepoList();
}

export async function initRepositories(loadedCredentials) {
  credentials = loadedCredentials;

  document.getElementById('addRepoBtn')?.addEventListener('click', async () => {
    const created = await saveRepository({
      name: '未命名仓库',
      remoteUrl: '',
      credentialId: '',
    });
    await loadRepositories();
    await selectRepository(created.id);
    setRepoStatus('已添加仓库，请填写地址并关联凭证', 'ok');
  });

  repoFields.remoteUrl.addEventListener('input', updateParsePreview);
  repoFields.remoteUrl.addEventListener('blur', updateParsePreview);
  repoFields.credentialId.addEventListener('change', updateParsePreview);
  repoBranchSelect.addEventListener('change', () => {
    if (repoBranchSelect.value) syncBranchSelectValue(repoBranchSelect.value);
  });
  repoFields.defaultBranch.addEventListener('input', () => {
    if (repoFields.defaultBranch.value !== repoBranchSelect.value) {
      repoBranchSelect.value = '';
    }
  });

  document.getElementById('loadBranchesBtn')?.addEventListener('click', async () => {
    if (!editingRepoId) {
      setRepoStatus('请先保存仓库', 'err');
      return;
    }

    const btn = document.getElementById('loadBranchesBtn');
    btn.disabled = true;
    setRepoStatus('正在加载分支列表...', 'testing');

    try {
      const saved = await saveRepository(await resolveRepositoryInput(getRepoFormData(), credentials));
      const branches = await listRepositoryBranches(editingRepoId);
      const selected = repoFields.defaultBranch.value.trim();
      fillBranchSelect(branches, selected);
      await loadRepositories();
      fillRepoForm(saved);
      const extra = selected && !branches.includes(selected) ? '（含手动填写分支）' : '';
      setRepoStatus(`已加载 ${branches.length} 个分支${extra}`, 'ok');
    } catch (err) {
      setRepoStatus(err.message || '加载分支失败', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  repoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const saved = await saveRepository(await resolveRepositoryInput(getRepoFormData(), credentials));
      await loadRepositories();
      await selectRepository(saved.id);
      setRepoStatus('已保存', 'ok');
    } catch (err) {
      setRepoStatus(err.message || '保存失败', 'err');
    }
  });

  document.getElementById('verifyRepoBtn')?.addEventListener('click', async () => {
    if (!editingRepoId) {
      setRepoStatus('请先保存仓库', 'err');
      return;
    }

    const btn = document.getElementById('verifyRepoBtn');
    btn.disabled = true;
    setRepoStatus('正在验证仓库...', 'testing');

    try {
      const input = await resolveRepositoryInput(getRepoFormData(), credentials);
      const { verify, repository } = await runRepositoryVerify(input, credentials);
      await loadRepositories();
      fillRepoForm(repository);

      if (verify.status === 'verified') {
        syncBranchSelectValue(repository.defaultBranch);
        const remoteDefault = verify.defaultBranch ? `（远程默认：${verify.defaultBranch}）` : '';
        setRepoStatus(`验证成功 · 工作分支 ${repository.defaultBranch || '—'} ${remoteDefault}`, 'ok');
      } else {
        setRepoStatus(verify.message || '验证失败', 'err');
      }
    } catch (err) {
      setRepoStatus(err.message || '验证失败', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('pullRepoBtn')?.addEventListener('click', async () => {
    if (!editingRepoId) {
      setRepoStatus('请先保存仓库', 'err');
      return;
    }

    const btn = document.getElementById('pullRepoBtn');
    btn.disabled = true;
    setRepoStatus('沙箱拉取中...', 'testing');

    try {
      const input = await resolveRepositoryInput(getRepoFormData(), credentials);
      await saveRepository(input);
      const result = await runSandboxPull(editingRepoId, input.defaultBranch);

      if (result.ok) {
        const pull = result.session.pull;
        setRepoStatus(
          `拉取成功 · ${pull.branch} · ${pull.commitSha} · 沙箱 ${pull.fileCount} 个文件`,
          'ok',
        );
      } else {
        setRepoStatus(result.error || '拉取失败', 'err');
      }
    } catch (err) {
      setRepoStatus(err.message || '拉取失败', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('deleteRepoBtn')?.addEventListener('click', async () => {
    if (!editingRepoId) return;
    if (!confirm('确定删除该仓库？')) return;

    await deleteRepository(editingRepoId);
    editingRepoId = null;
    await loadRepositories();
    const next = repositories[0];
    if (next) {
      await selectRepository(next.id);
    } else {
      repoForm.reset();
      repoVerifyCard.classList.add('hidden');
      repoParsePreviewEl.textContent = '';
    }
    setRepoStatus('已删除', 'ok');
  });

  renderCredentialOptions();
  await loadRepositories();
  if (repositories[0]) await selectRepository(repositories[0].id);
}

export function refreshRepositoryCredentials(loadedCredentials) {
  credentials = loadedCredentials;
  renderCredentialOptions(repoFields.credentialId.value);
}

export async function reloadRepositories() {
  await loadRepositories();
}
