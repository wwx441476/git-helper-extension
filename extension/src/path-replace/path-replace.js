import { getRepositoryById } from '../lib/repositories/store.js';
import { getCredentialById, resolveApiBase } from '../lib/credentials/store.js';
import { maskToken } from '../lib/credentials/types.js';
import { getParseOptionsFromCredential, parseRemoteUrl, applyParsedUrl } from '../lib/repositories/parse-url.js';
import { createRepository } from '../lib/repositories/types.js';
import { buildPathReplaceCliCommand } from '../lib/gitlab/cli-command.js';
import { downloadPathReplacePackage } from '../lib/path-replace/package-builder.js';
import {
  mapLocalUploadToRemoteFiles,
  parseExcludePaths,
  replaceDirectory,
  scanTargetPath,
} from '../lib/path-replace/index.js';

const params = new URLSearchParams(window.location.search);
const repositoryId = params.get('repo') || '';

const repoMetaEl = document.getElementById('repoMeta');
const targetPathEl = document.getElementById('targetPath');
const branchEl = document.getElementById('branch');
const excludePathsEl = document.getElementById('excludePaths');
const commitMessageEl = document.getElementById('commitMessage');
const scanResultEl = document.getElementById('scanResult');
const scanDetailsEl = document.getElementById('scanDetails');
const deleteListEl = document.getElementById('deleteList');
const keepListEl = document.getElementById('keepList');
const deleteListTitleEl = document.getElementById('deleteListTitle');
const keepListTitleEl = document.getElementById('keepListTitle');
const localZipEl = document.getElementById('localZip');
const localFolderEl = document.getElementById('localFolder');
const localPreviewEl = document.getElementById('localPreview');
const statusBarEl = document.getElementById('statusBar');
const replaceForm = document.getElementById('replaceForm');
const submitBtn = document.getElementById('submitBtn');
const scanBtn = document.getElementById('scanBtn');
const cliCommandEl = document.getElementById('cliCommand');
const copyCmdBtn = document.getElementById('copyCmdBtn');
const downloadPkgBtn = document.getElementById('downloadPkgBtn');
const tokenModePlainEl = document.getElementById('tokenModePlain');
const tokenModeEncryptEl = document.getElementById('tokenModeEncrypt');
const sharePasswordEl = document.getElementById('sharePassword');
const sharePasswordFieldEl = document.getElementById('sharePasswordField');

/** @type {{ apiBase: string, projectPath: string, defaultBranch: string, token: string, platform: string, owner: string, repo: string } | null} */
let repoContext = null;

/** @type {{ deleteCount: number, excludedCount: number, deleteFiles: string[], excludedFiles: string[] }} */
let scanSummary = { deleteCount: 0, excludedCount: 0, deleteFiles: [], excludedFiles: [] };

/** @type {{ zipFile: File|null, folderFiles: File[], uploadCount: number, sourceLabel: string }} */
let uploadSource = { zipFile: null, folderFiles: [], uploadCount: 0, sourceLabel: '' };

function setStatus(text, type = '') {
  statusBarEl.textContent = text;
  statusBarEl.className = `status-bar ${type}`;
}

function stripBasePath(basePath, filePath) {
  const base = basePath.replace(/\/+$/, '');
  if (filePath === base) return filePath.split('/').pop() || filePath;
  if (filePath.startsWith(`${base}/`)) return filePath.slice(base.length + 1);
  return filePath;
}

function renderFileList(listEl, files, basePath) {
  listEl.innerHTML = '';
  if (files.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = '（无）';
    empty.style.color = '#6b7280';
    listEl.appendChild(empty);
    return;
  }

  for (const file of files) {
    const li = document.createElement('li');
    li.textContent = stripBasePath(basePath, file);
    li.title = file;
    listEl.appendChild(li);
  }
}

function renderScanDetails(result) {
  const deleteFiles = [...result.files].sort((a, b) => a.localeCompare(b));
  const excludedFiles = [...result.excludedFiles].sort((a, b) => a.localeCompare(b));

  scanSummary = {
    deleteCount: deleteFiles.length,
    excludedCount: excludedFiles.length,
    deleteFiles,
    excludedFiles,
  };

  deleteListTitleEl.textContent = `将删除（${deleteFiles.length}）`;
  keepListTitleEl.textContent = `将保留（${excludedFiles.length}）`;
  renderFileList(deleteListEl, deleteFiles, result.dirPath);
  renderFileList(keepListEl, excludedFiles, result.dirPath);
  scanDetailsEl.classList.remove('hidden');

  scanResultEl.textContent = excludedFiles.length > 0
    ? `将删除 ${deleteFiles.length} 个文件，保留 ${excludedFiles.length} 个（已排除）`
    : `将删除 ${deleteFiles.length} 个远程文件`;
}

function clearScanDetails(message = '尚未扫描') {
  scanSummary = { deleteCount: 0, excludedCount: 0, deleteFiles: [], excludedFiles: [] };
  scanResultEl.textContent = message;
  scanDetailsEl.classList.add('hidden');
  deleteListEl.innerHTML = '';
  keepListEl.innerHTML = '';
}

function getExcludeInput() {
  return excludePathsEl.value.trim();
}

function getTokenEnvName(platform) {
  if (platform === 'github') return 'GITHUB_TOKEN';
  if (platform === 'gitee') return 'GITEE_TOKEN';
  return 'GITLAB_TOKEN';
}

function getCliScriptPath(platform) {
  if (platform === 'github') return 'scripts/github-path-replace.mjs';
  if (platform === 'gitee') return 'scripts/gitee-path-replace.mjs';
  return 'scripts/gitlab-path-replace.mjs';
}

function getEffectiveBranch() {
  return branchEl.value.trim() || repoContext?.defaultBranch || '';
}

function getCliCommandOptions(includeFullToken = false) {
  if (!repoContext) return null;

  const token = repoContext.token || '';
  const tokenEnv = getTokenEnvName(repoContext.platform);
  return {
    platform: repoContext.platform,
    apiBase: repoContext.apiBase,
    projectPath: repoContext.projectPath,
    owner: repoContext.owner,
    repo: repoContext.repo,
    branch: getEffectiveBranch(),
    targetPath: targetPathEl.value.trim(),
    excludeInput: getExcludeInput(),
    commitMessage: commitMessageEl.value.trim(),
    scriptPath: getCliScriptPath(repoContext.platform),
    tokenEnv,
    token: includeFullToken ? token : (token ? maskToken(token) : ''),
  };
}

function renderCliCommand() {
  const options = getCliCommandOptions(false);
  if (!options) {
    cliCommandEl.textContent = '无法生成命令：仓库未就绪';
    return;
  }

  cliCommandEl.textContent = buildPathReplaceCliCommand(options);
}

async function copyCliCommand() {
  if (!repoContext?.token) {
    setStatus('无法复制：关联凭证无可用 Token', 'err');
    return;
  }

  const options = getCliCommandOptions(true);
  if (!options) {
    setStatus('命令尚未就绪', 'err');
    return;
  }

  const text = buildPathReplaceCliCommand(options);

  try {
    await navigator.clipboard.writeText(text);
    setStatus(`命令已复制（含 ${getTokenEnvName(repoContext.platform)}）`, 'ok');
  } catch {
    setStatus('复制失败，请手动选中命令复制', 'err');
  }
}

function getTokenMode() {
  return tokenModePlainEl?.checked ? 'plain' : 'encrypt';
}

function getSharePassword() {
  return sharePasswordEl?.value.trim() || '';
}

function updateSharePasswordField() {
  if (!sharePasswordFieldEl) return;
  sharePasswordFieldEl.classList.toggle('hidden', getTokenMode() === 'plain');
}

async function downloadCliPackage() {
  if (!repoContext?.token) {
    setStatus('无法下载：关联凭证无可用 Token', 'err');
    return;
  }

  const options = getCliCommandOptions(true);
  if (!options) {
    setStatus('软件包尚未就绪', 'err');
    return;
  }

  const encrypt = getTokenMode() === 'encrypt';
  const sharePassword = getSharePassword();
  if (encrypt && !sharePassword) {
    setStatus('加密模式需要填写分享密码', 'err');
    sharePasswordEl?.focus();
    return;
  }

  const repoLabel = options.owner && options.repo
    ? `${options.owner}-${options.repo}`
    : (options.projectPath || 'repo').replace(/\//g, '-');
  const suffix = encrypt ? '-encrypted' : '';
  const filename = `path-replace-cli-${repoLabel}${suffix}.zip`;

  downloadPkgBtn.disabled = true;
  setStatus('正在打包下载...', 'testing');

  try {
    const baseZipUrl = chrome.runtime.getURL('path-replace-cli-base.zip');
    await downloadPathReplacePackage(baseZipUrl, options, {
      includeToken: true,
      encrypt,
      sharePassword,
      filename,
    });
    setStatus(
      encrypt
        ? `软件包已下载（加密 Token）：${filename}`
        : `软件包已下载（明文 Token）：${filename}`,
      'ok',
    );
  } catch (err) {
    setStatus(err.message || '下载失败', 'err');
  } finally {
    downloadPkgBtn.disabled = false;
  }
}

function getUploadSource() {
  return {
    zipFile: uploadSource.zipFile,
    folderFiles: uploadSource.folderFiles,
  };
}

async function previewUploadSource() {
  if (!uploadSource.uploadCount) {
    localPreviewEl.textContent = '未选择 ZIP 或文件夹';
    return;
  }

  try {
    const excludePrefixes = parseExcludePaths(getExcludeInput(), targetPathEl.value);
    const mapped = await mapLocalUploadToRemoteFiles(getUploadSource(), targetPathEl.value, excludePrefixes);
    const preview = mapped.slice(0, 30).map((item) => item.path).join('\n');
    const suffix = mapped.length > 30 ? `\n... 共 ${mapped.length} 个文件` : `\n共 ${mapped.length} 个文件`;
    localPreviewEl.textContent = `${uploadSource.sourceLabel}\n${preview}${suffix}`;
  } catch (err) {
    localPreviewEl.textContent = err.message || '读取上传内容失败';
  }
}

async function initPage() {
  if (!repositoryId) {
    setStatus('缺少仓库参数 ?repo=', 'err');
    return;
  }

  const repository = await getRepositoryById(repositoryId);
  if (!repository) {
    setStatus('仓库不存在', 'err');
    return;
  }

  repoMetaEl.textContent = `${repository.name} · ${repository.defaultBranch || 'main'}`;
  if (!branchEl.value) {
    branchEl.value = repository.defaultBranch || '';
  }

  if (!repository.credentialId) {
    cliCommandEl.textContent = '无法生成命令：仓库未关联凭证';
    return;
  }

  const credential = await getCredentialById(repository.credentialId, true);
  if (!credential) {
    cliCommandEl.textContent = '无法生成命令：关联凭证不存在';
    return;
  }

  const parsed = parseRemoteUrl(
    repository.remoteUrl,
    getParseOptionsFromCredential(credential),
  );
  const merged = applyParsedUrl(createRepository(repository), parsed);

  repoContext = {
    apiBase: resolveApiBase(credential),
    projectPath: merged.fullPath,
    owner: merged.owner,
    repo: merged.repo,
    platform: repository.platform,
    defaultBranch: repository.defaultBranch || '',
    token: credential.token || '',
  };
  renderCliCommand();
}

async function scanRemote() {
  scanBtn.disabled = true;
  setStatus('正在扫描远程目录...', 'testing');

  try {
    const result = await scanTargetPath(
      repositoryId,
      targetPathEl.value,
      branchEl.value.trim(),
      getExcludeInput(),
    );
    renderScanDetails(result);
    setStatus(`扫描完成：${result.dirPath}`, 'ok');
  } catch (err) {
    clearScanDetails('扫描失败');
    setStatus(err.message || '扫描失败', 'err');
  } finally {
    scanBtn.disabled = false;
  }
}

localZipEl.addEventListener('change', async () => {
  const file = localZipEl.files?.[0] || null;
  if (!file) {
    uploadSource = { zipFile: null, folderFiles: [], uploadCount: 0, sourceLabel: '' };
    localPreviewEl.textContent = '未选择 ZIP 或文件夹';
    return;
  }

  localFolderEl.value = '';
  uploadSource = {
    zipFile: file,
    folderFiles: [],
    uploadCount: 1,
    sourceLabel: `ZIP：${file.name}`,
  };
  await previewUploadSource();
});

localFolderEl.addEventListener('change', async () => {
  const files = Array.from(localFolderEl.files || []);
  if (files.length === 0) {
    uploadSource = { zipFile: null, folderFiles: [], uploadCount: 0, sourceLabel: '' };
    localPreviewEl.textContent = '未选择 ZIP 或文件夹';
    return;
  }

  localZipEl.value = '';
  uploadSource = {
    zipFile: null,
    folderFiles: files,
    uploadCount: files.length,
    sourceLabel: `文件夹：${files[0].webkitRelativePath.split('/')[0] || '已选'}`,
  };
  await previewUploadSource();
});

excludePathsEl.addEventListener('input', () => {
  clearScanDetails('路径已变更，请重新扫描');
  if (uploadSource.uploadCount) previewUploadSource();
  renderCliCommand();
});

targetPathEl.addEventListener('input', () => {
  clearScanDetails('目标路径已变更，请重新扫描');
  if (uploadSource.uploadCount) previewUploadSource();
  renderCliCommand();
});

branchEl.addEventListener('input', renderCliCommand);
commitMessageEl.addEventListener('input', renderCliCommand);
copyCmdBtn.addEventListener('click', copyCliCommand);
downloadPkgBtn.addEventListener('click', downloadCliPackage);
tokenModePlainEl?.addEventListener('change', updateSharePasswordField);
tokenModeEncryptEl?.addEventListener('change', updateSharePasswordField);
updateSharePasswordField();

replaceForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!uploadSource.uploadCount) {
    setStatus('请先选择 ZIP 包或本地文件夹', 'err');
    return;
  }

  const excludeText = getExcludeInput();
  const confirmText = [
    `目标路径：${targetPathEl.value.trim()}`,
    `分支：${branchEl.value.trim() || '（仓库默认）'}`,
    excludeText ? `排除路径：\n${excludeText}` : '排除路径：无',
    `上传来源：${uploadSource.sourceLabel}`,
    `将删除远程 ${scanSummary.deleteCount || '（未扫描，提交时计算）'} 个文件`,
    scanSummary.excludedCount ? `将保留 ${scanSummary.excludedCount} 个文件（排除）` : '',
    '',
    '确定继续？',
  ].filter(Boolean).join('\n');

  if (!confirm(confirmText)) return;

  submitBtn.disabled = true;
  setStatus('正在提交变更（可能需要几十秒）...', 'testing');

  try {
    const result = await replaceDirectory(
      repositoryId,
      targetPathEl.value,
      getUploadSource(),
      commitMessageEl.value,
      branchEl.value.trim(),
      excludeText,
    );

    setStatus(
      `完成 · 删除 ${result.deletedCount} · 保留 ${result.excludedCount} · 上传 ${result.createdCount} · 提交 ${result.commitSha}`,
      'ok',
    );
  } catch (err) {
    setStatus(err.message || '提交失败', 'err');
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('scanBtn').addEventListener('click', scanRemote);
document.getElementById('closeBtn').addEventListener('click', () => window.close());

initPage().catch((err) => setStatus(err.message || '初始化失败', 'err'));
