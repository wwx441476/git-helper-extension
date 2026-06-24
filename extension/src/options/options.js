import {
  DEFAULT_API_BASES,
  PLATFORM_LABELS,
  VERIFY_STATUS_LABELS,
  formatVerifyTime,
  isMaskedToken,
  platformColor,
  platformInitial,
} from '../lib/credentials/types.js';
import { resolveFormToken, runCredentialVerify } from '../lib/credentials/verify-flow.js';
import { initRepositories, refreshRepositoryCredentials } from './repositories.js';

const addBtn = document.getElementById('addBtn');
const addRepoBtn = document.getElementById('addRepoBtn');
const credentialsPanel = document.getElementById('credentialsPanel');
const repositoriesPanel = document.getElementById('repositoriesPanel');
const tabButtons = document.querySelectorAll('.tab');
const credListEl = document.getElementById('credList');
const credCountEl = document.getElementById('credCount');
const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const verifyCard = document.getElementById('verifyCard');
const verifyStatusEl = document.getElementById('verifyStatus');
const verifyMetaEl = document.getElementById('verifyMeta');
const useMockVerifyEl = document.getElementById('useMockVerify');
const useMockSandboxPullEl = document.getElementById('useMockSandboxPull');
const apiBaseHintEl = document.getElementById('apiBaseHint');

/** @type {import('../lib/credentials/types.js').Credential[]} */
let credentials = [];
/** @type {string|null} */
let editingId = null;
/** @type {boolean} */
let tokenDirty = false;

const fields = {
  name: document.getElementById('name'),
  username: document.getElementById('username'),
  platform: document.getElementById('platform'),
  token: document.getElementById('token'),
  apiBase: document.getElementById('apiBase'),
  isDefault: document.getElementById('isDefault'),
};

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function updateApiBaseHint() {
  const platform = fields.platform.value;
  apiBaseHintEl.textContent = `${PLATFORM_LABELS[platform]} 默认：${DEFAULT_API_BASES[platform]}`;
}

function renderVerifyCard(credential) {
  if (!credential) {
    verifyCard.classList.add('hidden');
    return;
  }

  verifyCard.classList.remove('hidden');
  const status = credential.verify?.status || 'unknown';
  verifyStatusEl.textContent = VERIFY_STATUS_LABELS[status] || status;
  verifyStatusEl.className = `verify-status status-${status}`;

  const parts = [];
  if (credential.verify?.username) parts.push(`用户：${credential.verify.username}`);
  if (credential.verify?.at) parts.push(`时间：${formatVerifyTime(credential.verify.at)}`);
  if (credential.verify?.message) parts.push(credential.verify.message);
  verifyMetaEl.textContent = parts.join('\n') || '尚未验证';
}

function fillForm(credential, includeToken = false) {
  fields.name.value = credential.name || '';
  fields.username.value = credential.username || credential.verify?.username || '';
  fields.platform.value = credential.platform || 'github';
  fields.apiBase.value = credential.apiBase || '';
  fields.isDefault.checked = Boolean(credential.isDefault);
  if (includeToken && credential.token && !isMaskedToken(credential.token)) {
    fields.token.value = credential.token;
  } else if (!includeToken) {
    fields.token.value = '';
  }
  tokenDirty = false;
  editingId = credential.id;
  updateApiBaseHint();
  renderVerifyCard(credential);
}

function getFormData() {
  return {
    id: editingId || undefined,
    name: fields.name.value.trim() || '未命名凭证',
    username: fields.username.value.trim(),
    platform: fields.platform.value,
    authType: 'token',
    token: fields.token.value.trim(),
    apiBase: fields.apiBase.value.trim(),
    isDefault: fields.isDefault.checked,
  };
}

function renderCredList() {
  credCountEl.textContent = `${credentials.length} 个`;
  credListEl.innerHTML = '';

  if (credentials.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'cred-empty';
    empty.textContent = '暂无凭证，点击右上角 + 添加';
    credListEl.appendChild(empty);
    return;
  }

  for (const cred of credentials) {
    const li = document.createElement('li');
    li.className = `cred-item${cred.id === editingId ? ' active' : ''}`;
    li.dataset.id = cred.id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.style.background = platformColor(cred.platform);
    avatar.textContent = platformInitial(cred.platform);

    const info = document.createElement('div');
    info.className = 'cred-info';
    const status = cred.verify?.status || 'unknown';
    const accountLabel = cred.username || cred.verify?.username || '';
    info.innerHTML = `
      <div class="cred-name">${escapeHtml(cred.name)}</div>
      <div class="cred-meta">${escapeHtml(PLATFORM_LABELS[cred.platform])}${accountLabel ? ` · @${escapeHtml(accountLabel)}` : ''} · ${escapeHtml(cred.token)}</div>
      <div class="cred-verify status-${status}">${escapeHtml(VERIFY_STATUS_LABELS[status] || status)}</div>
    `;

    li.appendChild(avatar);
    li.appendChild(info);

    if (cred.isDefault) {
      const badge = document.createElement('span');
      badge.className = 'cred-badge';
      badge.textContent = '默认';
      li.appendChild(badge);
    }

    li.addEventListener('click', () => selectCredential(cred.id));
    credListEl.appendChild(li);
  }
}

async function selectCredential(id) {
  const res = await send('GET_CREDENTIAL', { id, includeToken: true });
  if (!res?.ok) {
    setStatus(res?.error || '加载失败', 'err');
    return;
  }
  fillForm(res.credential, true);
  renderCredList();
  setStatus('');
}

async function loadCredentials() {
  const res = await send('GET_CREDENTIALS');
  if (!res?.ok) throw new Error(res?.error || '加载凭证失败');
  credentials = res.credentials || [];
  renderCredList();
  refreshRepositoryCredentials(credentials);
}

function switchTab(tab) {
  const isCredentials = tab === 'credentials';
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  credentialsPanel.classList.toggle('hidden', !isCredentials);
  repositoriesPanel.classList.toggle('hidden', isCredentials);
  addBtn.classList.toggle('hidden', !isCredentials);
  addRepoBtn.classList.toggle('hidden', isCredentials);
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab || 'credentials'));
});

async function loadSettings() {
  const res = await send('GET_SETTINGS');
  if (res?.ok) {
    useMockVerifyEl.checked = Boolean(res.settings?.useMockVerify);
    useMockSandboxPullEl.checked = Boolean(res.settings?.useMockSandboxPull);
  }
}

fields.platform.addEventListener('change', updateApiBaseHint);
fields.token.addEventListener('input', () => { tokenDirty = true; });

useMockVerifyEl.addEventListener('change', async () => {
  await send('SAVE_SETTINGS', { settings: { useMockVerify: useMockVerifyEl.checked } });
  setStatus(useMockVerifyEl.checked ? '已开启 Mock 验证' : '已关闭 Mock 验证', 'ok');
});

useMockSandboxPullEl.addEventListener('change', async () => {
  await send('SAVE_SETTINGS', { settings: { useMockSandboxPull: useMockSandboxPullEl.checked } });
  setStatus(useMockSandboxPullEl.checked ? '已开启 Mock 沙箱拉取' : '已关闭 Mock 沙箱拉取', 'ok');
});

document.getElementById('addBtn').addEventListener('click', async () => {
  const res = await send('SAVE_CREDENTIAL', {
    credential: {
      name: '新凭证',
      platform: 'github',
      token: '',
      isDefault: credentials.filter((item) => item.platform === 'github').length === 0,
    },
  });
  if (!res?.ok) {
    setStatus(res?.error || '添加失败', 'err');
    return;
  }
  await loadCredentials();
  await selectCredential(res.credential.id);
  setStatus('已添加新凭证，请填写 Token 并验证', 'ok');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = getFormData();
  data.token = await resolveFormToken(data);

  if (!data.token && !editingId) {
    setStatus('请填写 Token', 'err');
    return;
  }

  if (!data.token) {
    setStatus('请填写 Token', 'err');
    return;
  }

  const res = await send('SAVE_CREDENTIAL', { credential: data });
  if (!res?.ok) {
    setStatus(res?.error || '保存失败', 'err');
    return;
  }

  await loadCredentials();
  await selectCredential(res.credential.id);
  setStatus('已保存', 'ok');
});

document.getElementById('verifyBtn').addEventListener('click', async () => {
  if (!editingId) {
    setStatus('请先保存凭证', 'err');
    return;
  }

  const verifyData = getFormData();
  verifyData.token = await resolveFormToken(verifyData);

  if (!verifyData.token) {
    setStatus('请填写 Token', 'err');
    return;
  }

  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  setStatus('正在验证...', 'testing');

  try {
    const { verify } = await runCredentialVerify(verifyData);

    await loadCredentials();
    await selectCredential(editingId);

    if (verify.status === 'verified') {
      fields.username.value = verify.username || fields.username.value;
      setStatus(`验证成功 · 用户 ${verify.username}`, 'ok');
    } else {
      setStatus(verify.message || '验证失败', 'err');
    }
  } catch (err) {
    setStatus(err.message || '验证失败', 'err');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('确定删除该凭证？')) return;

  const res = await send('DELETE_CREDENTIAL', { id: editingId });
  if (!res?.ok) {
    setStatus(res?.error || '删除失败', 'err');
    return;
  }

  editingId = null;
  await loadCredentials();
  const next = credentials[0];
  if (next) {
    await selectCredential(next.id);
  } else {
    form.reset();
    verifyCard.classList.add('hidden');
  }
  setStatus('已删除', 'ok');
});

async function init() {
  await loadSettings();
  await loadCredentials();
  if (credentials[0]) await selectCredential(credentials[0].id);
  await initRepositories(credentials);
  switchTab('credentials');
}

init().catch((err) => setStatus(err.message, 'err'));
