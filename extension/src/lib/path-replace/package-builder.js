import { unzipSync, zipSync, strToU8 } from 'fflate';
import { buildPathReplaceCliCommand } from '../gitlab/cli-command.js';
import { encryptToken } from './token-crypto.js';
import {
  CLI_PACKAGE_ROOT,
  buildCliPackageJson,
  buildCliPackageReadme,
} from './package-files.js';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function envValue(value) {
  const text = String(value ?? '');
  if (/[\s#='"\\]/.test(text)) {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return text;
}

function envLine(key, value) {
  return `${key}=${envValue(value)}`;
}

/**
 * @param {Record<string, unknown>} options
 * @param {{ includeToken?: boolean, encrypt?: boolean, sharePassword?: string }} [opts]
 */
export async function buildPackageEnvFile(options, opts = {}) {
  const {
    includeToken = true,
    encrypt = false,
    sharePassword = '',
  } = opts;
  const tokenEnv = options.tokenEnv || 'GITLAB_TOKEN';
  /** @type {string[]} */
  const lines = [
    '# GITLAB_TOKEN / GITHUB_TOKEN / GITEE_TOKEN：平台 Personal Access Token（不是登录密码）',
    '# 明文示例：GITLAB_TOKEN=glpat-xxxxxxxx',
    '# 加密示例：GITLAB_TOKEN=enc:v1:... 且需 SHARE_PASSWORD=分享密码',
    '# ZIP_PATH：本地 ZIP 绝对路径（留空则运行时会提示粘贴）',
    'ZIP_PATH=',
    '',
  ];

  if (includeToken && options.token) {
    if (encrypt) {
      const enc = await encryptToken(sharePassword, String(options.token));
      lines.splice(1, 0,
        `# ${tokenEnv}（已加密）`,
        `${tokenEnv}=${enc}`,
        `# 分享密码（与上方表单填写一致，可直接执行 ./run.sh）`,
        envLine('SHARE_PASSWORD', sharePassword),
      );
    } else {
      lines.splice(1, 0,
        `# ${tokenEnv}（明文）`,
        `${tokenEnv}=${options.token}`,
      );
    }
  } else {
    lines.splice(1, 0, `${tokenEnv}=your-token-here`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * @param {Record<string, unknown>} options
 */
export function buildPackageConfigJson(options) {
  return JSON.stringify({
    platform: options.platform,
    apiBase: options.apiBase,
    projectPath: options.projectPath || '',
    owner: options.owner || '',
    repo: options.repo || '',
    branch: options.branch,
    targetPath: options.targetPath,
    excludeInput: options.excludeInput || '',
    commitMessage: options.commitMessage || '',
    scriptPath: options.scriptPath,
    tokenEnv: options.tokenEnv,
  }, null, 2);
}

/**
 * @param {Record<string, unknown>} options
 */
export function buildRunSh(options) {
  const args = [
    '  --zip "${ZIP_PATH:-}" \\',
    `  --api-base ${shellQuote(options.apiBase)} \\`,
  ];

  if (options.platform === 'github' || options.platform === 'gitee') {
    args.push(`  --owner ${shellQuote(options.owner)} \\`);
    args.push(`  --repo ${shellQuote(options.repo)} \\`);
  } else {
    args.push(`  --project ${shellQuote(options.projectPath)} \\`);
  }

  args.push(`  --branch ${shellQuote(options.branch)} \\`);
  args.push(`  --target ${shellQuote(options.targetPath)} \\`);

  if (options.excludeInput) {
    args.push(`  --exclude ${shellQuote(options.excludeInput)} \\`);
  }
  if (options.commitMessage) {
    args.push(`  --message ${shellQuote(options.commitMessage)}`);
  } else {
    const last = args.length - 1;
    args[last] = args[last].replace(/ \\$/, '');
  }

  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cd "$(dirname "$0")"',
    '',
    '# Token / ZIP_PATH 由 node 从 .env 安全读取（勿 source .env，避免破坏 Token）',
    '',
    'if [[ ! -d node_modules ]]; then',
    '  echo "正在安装依赖..."',
    '  npm install --silent 2>/dev/null || npm install',
    'fi',
    '',
    `node ${options.scriptPath} \\`,
    ...args,
    '',
  ].join('\n');
}

/**
 * @param {Record<string, unknown>} options
 */
export function buildRunBat(options) {
  const scriptPath = String(options.scriptPath || 'scripts/gitlab-path-replace.mjs').replace(/\//g, '\\');
  /** @type {string[]} */
  const nodeArgs = [
    `"${scriptPath}"`,
    '--zip "%ZIP_PATH%"',
    `--api-base "${String(options.apiBase || '').replace(/"/g, '\\"')}"`,
  ];

  if (options.platform === 'github' || options.platform === 'gitee') {
    nodeArgs.push(`--owner "${String(options.owner || '').replace(/"/g, '\\"')}"`);
    nodeArgs.push(`--repo "${String(options.repo || '').replace(/"/g, '\\"')}"`);
  } else {
    nodeArgs.push(`--project "${String(options.projectPath || '').replace(/"/g, '\\"')}"`);
  }

  nodeArgs.push(`--branch "${String(options.branch || '').replace(/"/g, '\\"')}"`);
  nodeArgs.push(`--target "${String(options.targetPath || '').replace(/"/g, '\\"')}"`);

  if (options.excludeInput) {
    nodeArgs.push(`--exclude "${String(options.excludeInput).replace(/"/g, '\\"')}"`);
  }
  if (options.commitMessage) {
    nodeArgs.push(`--message "${String(options.commitMessage).replace(/"/g, '\\"')}"`);
  }

  const nodeCmd = nodeArgs.join(' ^\r\n  ');

  return [
    '@echo off',
    'setlocal EnableExtensions EnableDelayedExpansion',
    'chcp 65001 >nul 2>&1',
    'cd /d "%~dp0"',
    'set "EXIT_CODE=0"',
    '',
    'echo Git Helper - 目录替换',
    'echo.',
    '',
    'call :init_node',
    'if errorlevel 1 (',
    '  set "EXIT_CODE=1"',
    '  goto :finish',
    ')',
    '',
    'if not exist node_modules (',
    '  echo 正在安装依赖...',
    '  call "!NPM_CMD!" install',
    '  if errorlevel 1 (',
    '    echo [错误] npm install 失败',
    '    set "EXIT_CODE=1"',
    '    goto :finish',
    '  )',
    ')',
    '',
    'REM Token / SHARE_PASSWORD 由 node 从 .env 安全读取',
    'set "ZIP_PATH="',
    'for /f "usebackq delims=" %%Z in (`"!NODE_EXE!" scripts\\env-get.mjs ZIP_PATH 2^>nul`) do set "ZIP_PATH=%%Z"',
    'if "!ZIP_PATH!"=="" (',
    '  set /p "ZIP_PATH=请粘贴本地 ZIP 路径: "',
    ')',
    'if "!ZIP_PATH!"=="" (',
    '  echo [错误] 未提供 ZIP 路径',
    '  set "EXIT_CODE=1"',
    '  goto :finish',
    ')',
    '',
    'echo.',
    'echo 开始执行...',
    'echo.',
    '',
    `"!NODE_EXE!" ${nodeCmd}`,
    'set "EXIT_CODE=!ERRORLEVEL!"',
    'goto :finish',
    '',
    ':init_node',
    'set "NODE_EXE="',
    'set "NPM_CMD="',
    'where node >nul 2>&1',
    'if not errorlevel 1 (',
    '  set "NODE_EXE=node"',
    '  set "NPM_CMD=npm"',
    '  echo 使用系统 Node.js',
    '  exit /b 0',
    ')',
    'if exist "tools\\node\\node.exe" (',
    '  set "NODE_EXE=%CD%\\tools\\node\\node.exe"',
    '  set "NPM_CMD=%CD%\\tools\\node\\npm.cmd"',
    '  echo 使用便携版 Node.js',
    '  exit /b 0',
    ')',
    'echo 未检测到 Node.js，正在准备便携版（约 30MB，首次需联网）...',
    'powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\\setup-portable-node.ps1"',
    'if errorlevel 1 (',
    '  echo [错误] 便携版 Node.js 下载失败，请检查网络或手动安装 https://nodejs.org/',
    '  exit /b 1',
    ')',
    'if exist "tools\\node\\node.exe" (',
    '  set "NODE_EXE=%CD%\\tools\\node\\node.exe"',
    '  set "NPM_CMD=%CD%\\tools\\node\\npm.cmd"',
    '  echo 便携版 Node.js 已就绪',
    '  exit /b 0',
    ')',
    'echo [错误] 无法准备 Node.js',
    'exit /b 1',
    '',
    ':finish',
    'echo.',
    'if not "!EXIT_CODE!"=="0" (',
    '  echo 执行失败，请查看上方错误信息。',
    ') else (',
    '  echo 执行完成。',
    ')',
    'echo.',
    'pause',
    'exit /b !EXIT_CODE!',
    '',
  ].join('\r\n');
}

/**
 * @param {string} baseZipUrl
 * @param {Record<string, unknown>} options
 * @param {{ includeToken?: boolean, encrypt?: boolean, sharePassword?: string, filename?: string }} [opts]
 */
export async function downloadPathReplacePackage(baseZipUrl, options, opts = {}) {
  const {
    includeToken = true,
    encrypt = false,
    sharePassword = '',
    filename = 'path-replace-cli.zip',
  } = opts;

  if (encrypt && !String(sharePassword || '').trim()) {
    throw new Error('加密 Token 需要填写分享密码');
  }

  const res = await fetch(baseZipUrl);
  if (!res.ok) {
    throw new Error('无法加载 CLI 基础包，请重新构建扩展');
  }

  const baseEntries = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const envContent = await buildPackageEnvFile(options, {
    includeToken,
    encrypt,
    sharePassword,
  });

  const commandText = encrypt
    ? [
      '# 本包使用加密 Token，.env 已写入 SHARE_PASSWORD',
      '# ZIP_PATH 默认为空，运行 ./run.sh 时会提示粘贴路径',
      '',
    ].join('\n')
    : [
      '# ZIP_PATH 默认为空，运行 ./run.sh 时会提示粘贴路径',
      buildPathReplaceCliCommand({
        ...options,
        zipPath: '',
        token: includeToken ? options.token : '',
        forPackage: true,
      }),
      '',
    ].join('\n');

  const userFiles = {
    '.env': envContent,
    'config.json': buildPackageConfigJson({ ...options, tokenEncrypted: encrypt }),
    'command.txt': `${commandText}\n`,
    'run.sh': buildRunSh(options),
    'run.bat': buildRunBat(options),
    '分享给他人.md': buildShareGuide(options, encrypt),
  };

  /** @type {Record<string, Uint8Array>} */
  const merged = { ...baseEntries };
  for (const [name, content] of Object.entries(userFiles)) {
    merged[`${CLI_PACKAGE_ROOT}/${name}`] = strToU8(content);
  }

  const zipped = zipSync(merged);
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildShareGuide(options, encrypt) {
  const tokenEnv = options.tokenEnv || 'GITLAB_TOKEN';
  if (encrypt) {
    return [
      '# 分享给他人（加密 Token）',
      '',
      '本包 `.env` 中 Token 已加密，**他人无法看到原始 Token**。',
      '',
      '`.env` 已自动写入 `SHARE_PASSWORD`（与下载时填写的分享密码一致）。',
      '`.env` 中 `ZIP_PATH` 默认为空，运行 `./run.sh` 或 `run.bat` 时会提示粘贴本地 ZIP 路径。',
      '',
      '**Windows 无需预装 Node.js**：双击 `run.bat` 会自动下载便携版 Node 到 `tools/node`（首次约 30MB，需联网）。',
      '',
    '若通过公开渠道转发压缩包，建议先删除 `.env` 中的 `SHARE_PASSWORD` 行，',
    '再通过私下渠道单独告知分享密码。',
    '',
    '执行 `./run.sh` 或 `run.bat`。',
    ].join('\n');
  }

  return [
    '# 分享给他人（明文 Token）',
    '',
    '当前包内 Token 为 **明文**，转发前建议改为加密模式重新下载。',
    '',
    '若仍要分享：',
    '1. 确认对方可信',
    '2. 对方运行 `./run.sh`，按提示粘贴 `ZIP_PATH`',
    '3. 对方安装 Node.js 18+ 后运行 `./run.sh`',
    '',
  ].join('\n');
}

export {
  buildCliPackageJson,
  buildCliPackageReadme,
  CLI_PACKAGE_ROOT,
};
