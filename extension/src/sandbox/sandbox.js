import { getRepositoryById } from '../lib/repositories/store.js';
import { getSandboxSession } from '../lib/sandbox/store.js';
import {
  addWorkspaceFile,
  deleteWorkspaceFile,
  getWorkspaceFile,
  listWorkspaceFiles,
  saveWorkspaceFile,
} from '../lib/sandbox/filesystem.js';
import { formatBytes } from '../lib/sandbox/types.js';

const params = new URLSearchParams(window.location.search);
const repositoryId = params.get('repo') || '';

const emptyStateEl = document.getElementById('emptyState');
const workspaceEl = document.getElementById('workspace');
const repoMetaEl = document.getElementById('repoMeta');
const fileListEl = document.getElementById('fileList');
const fileStatsEl = document.getElementById('fileStats');
const fileSearchEl = document.getElementById('fileSearch');
const currentFileEl = document.getElementById('currentFile');
const fileStatusEl = document.getElementById('fileStatus');
const editorEl = document.getElementById('editor');
const binaryNoticeEl = document.getElementById('binaryNotice');
const statusBarEl = document.getElementById('statusBar');
const saveFileBtn = document.getElementById('saveFileBtn');
const deleteFileBtn = document.getElementById('deleteFileBtn');

/** @type {Array<{ path: string, encoding: string, status: string }>} */
let files = [];
/** @type {string|null} */
let selectedPath = null;
/** @type {string} */
let originalContent = '';
let dirty = false;

function setStatus(text, type = '') {
  statusBarEl.textContent = text;
  statusBarEl.className = `status-bar ${type}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function statusLabel(status) {
  switch (status) {
    case 'added': return '新增';
    case 'modified': return '已修改';
    case 'deleted': return '已删除';
    default: return '';
  }
}

function updateEditorState() {
  const hasSelection = Boolean(selectedPath);
  const selected = files.find((file) => file.path === selectedPath);
  const isDeleted = selected?.status === 'deleted';
  const isBinary = selected?.encoding === 'base64';

  saveFileBtn.disabled = !hasSelection || isDeleted || isBinary || !dirty;
  deleteFileBtn.disabled = !hasSelection || isDeleted;
  editorEl.disabled = !hasSelection || isDeleted || isBinary;
  binaryNoticeEl.classList.toggle('hidden', !hasSelection || !isBinary);
}

function renderFileList() {
  const keyword = fileSearchEl.value.trim().toLowerCase();
  fileListEl.innerHTML = '';

  const visible = files.filter((file) => (
    file.status !== 'deleted' && (!keyword || file.path.toLowerCase().includes(keyword))
  ));

  for (const file of visible) {
    const li = document.createElement('li');
    li.className = `file-item ${file.status} ${file.path === selectedPath ? 'active' : ''}`;
    li.textContent = file.path;
    li.title = `${file.path}${statusLabel(file.status) ? ` (${statusLabel(file.status)})` : ''}`;
    li.addEventListener('click', () => selectFile(file.path));
    fileListEl.appendChild(li);
  }

  const changed = files.filter((file) => file.status !== 'unchanged').length;
  fileStatsEl.textContent = `${visible.length} 个文件 · ${changed} 处变更`;
}

async function selectFile(path) {
  if (dirty && selectedPath && !confirm('当前文件有未保存修改，是否放弃？')) {
    return;
  }

  const row = await getWorkspaceFile(repositoryId, path);
  if (!row || row.status === 'deleted') {
    setStatus('文件不存在或已删除', 'err');
    return;
  }

  selectedPath = path;
  originalContent = row.content;
  dirty = false;

  currentFileEl.textContent = path;
  fileStatusEl.textContent = [
    row.encoding === 'base64' ? '二进制' : '文本',
    statusLabel(row.status),
  ].filter(Boolean).join(' · ');

  if (row.encoding === 'base64') {
    editorEl.value = '';
  } else {
    editorEl.value = row.content;
  }

  renderFileList();
  updateEditorState();
}

async function loadWorkspace() {
  if (!repositoryId) {
    emptyStateEl.classList.remove('hidden');
    setStatus('缺少仓库参数 ?repo=', 'err');
    return;
  }

  const [repository, session, workspaceFiles] = await Promise.all([
    getRepositoryById(repositoryId),
    getSandboxSession(repositoryId),
    listWorkspaceFiles(repositoryId),
  ]);

  if (!repository) {
    emptyStateEl.classList.remove('hidden');
    setStatus('仓库不存在', 'err');
    return;
  }

  if (!session?.pull?.hasWorkspace || workspaceFiles.length === 0) {
    emptyStateEl.classList.remove('hidden');
    repoMetaEl.textContent = repository.name;
    setStatus('请先在侧边栏执行「拉取代码」', 'err');
    return;
  }

  files = workspaceFiles;
  emptyStateEl.classList.add('hidden');
  workspaceEl.classList.remove('hidden');

  const pull = session.pull;
  repoMetaEl.textContent = `${repository.name} · ${pull.branch} · ${pull.commitSha} · ${formatBytes(pull.archiveBytes)}`;
  renderFileList();
  setStatus(`已加载 ${files.filter((f) => f.status !== 'deleted').length} 个文件，可直接编辑、新建或删除`, 'ok');
}

async function saveCurrentFile() {
  if (!selectedPath || !dirty) return;

  const content = editorEl.value;
  await saveWorkspaceFile(repositoryId, selectedPath, content, 'text');
  originalContent = content;
  dirty = false;

  const item = files.find((file) => file.path === selectedPath);
  if (item && item.status !== 'added') item.status = 'modified';

  renderFileList();
  updateEditorState();
  setStatus(`已保存 ${selectedPath}`, 'ok');
}

async function deleteCurrentFile() {
  if (!selectedPath) return;
  if (!confirm(`确定删除 ${selectedPath} ？`)) return;

  await deleteWorkspaceFile(repositoryId, selectedPath);

  const item = files.find((file) => file.path === selectedPath);
  if (item?.status === 'added') {
    files = files.filter((file) => file.path !== selectedPath);
  } else if (item) {
    item.status = 'deleted';
  }

  selectedPath = null;
  originalContent = '';
  dirty = false;
  editorEl.value = '';
  currentFileEl.textContent = '未选择文件';
  fileStatusEl.textContent = '';

  renderFileList();
  updateEditorState();
  setStatus('文件已删除（沙箱内）', 'ok');
}

async function addFile() {
  const path = prompt('新建文件路径（例如 src/utils/helper.js）');
  if (!path) return;

  const normalized = path.trim().replace(/^\/+/, '');
  if (!normalized) return;

  const exists = files.some((file) => file.path === normalized && file.status !== 'deleted');
  if (exists) {
    setStatus('文件已存在', 'err');
    return;
  }

  await addWorkspaceFile(repositoryId, normalized, '', 'text');
  files.push({ path: normalized, encoding: 'text', status: 'added', updatedAt: Date.now() });
  files.sort((a, b) => a.path.localeCompare(b.path));

  await selectFile(normalized);
  editorEl.focus();
  setStatus(`已新建 ${normalized}`, 'ok');
}

editorEl.addEventListener('input', () => {
  dirty = editorEl.value !== originalContent;
  updateEditorState();
});

saveFileBtn.addEventListener('click', () => {
  saveCurrentFile().catch((err) => setStatus(err.message || '保存失败', 'err'));
});

deleteFileBtn.addEventListener('click', () => {
  deleteCurrentFile().catch((err) => setStatus(err.message || '删除失败', 'err'));
});

document.getElementById('addFileBtn').addEventListener('click', () => {
  addFile().catch((err) => setStatus(err.message || '新建失败', 'err'));
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadWorkspace().catch((err) => setStatus(err.message || '刷新失败', 'err'));
});

document.getElementById('closeBtn').addEventListener('click', () => window.close());

fileSearchEl.addEventListener('input', renderFileList);

loadWorkspace().catch((err) => setStatus(err.message || '加载失败', 'err'));
