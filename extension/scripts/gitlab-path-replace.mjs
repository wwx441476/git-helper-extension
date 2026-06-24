#!/usr/bin/env node

import { replaceGitlabDirectoryDirect } from '../src/lib/path-replace/direct.js';
import { readZipUploadFilesFromPath } from './zip-from-path.js';
import { resolveCliTokenFromEnv, prepareCliEnv } from './env-token.js';
import { resolveCliZipPath } from './zip-path.js';

function printHelp() {
  console.log(`GitLab 目录替换 CLI（与扩展「目录替换」页面逻辑一致）

用法:
  GITLAB_TOKEN=xxx node scripts/gitlab-path-replace.mjs [选项]

选项:
  --zip <path>         本地 ZIP 包路径（必填，唯一常改项）
  --api-base <url>     GitLab API 根地址，如 https://git.example.com/api/v4
  --project <path>     项目路径，如 group/subgroup/repo
  --branch <name>      分支名
  --target <path>      远程目标目录
  --exclude <paths>    排除路径，逗号或换行分隔（相对目标路径）
  --message <text>     提交说明
  --token <token>      Token（明文或 enc:v1: 加密；也可用环境变量 GITLAB_TOKEN）
  --share-password <p> 解密加密 Token 的分享密码（或环境变量 SHARE_PASSWORD）
  -h, --help           显示帮助

示例:
  cd extension
  GITLAB_TOKEN=glpat-xxx node scripts/gitlab-path-replace.mjs \\
    --zip "/path/to/document-online-develop.zip" \\
    --api-base "https://git.yyrd.com/api/v4" \\
    --project "yygov/YonDiF/SJ/CP/dmp-dq" \\
    --branch "develop-v5-test" \\
    --target "src/main/resources/static/atelier" \\
    --exclude "docOnline" \\
    --message "replace atelier static files"
`);
}

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const opts = {};

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      continue;
    }

    const next = argv[i + 1];
    if (arg === '--zip') { opts.zip = next; i += 1; }
    else if (arg === '--api-base') { opts.apiBase = next; i += 1; }
    else if (arg === '--project') { opts.project = next; i += 1; }
    else if (arg === '--branch') { opts.branch = next; i += 1; }
    else if (arg === '--target') { opts.target = next; i += 1; }
    else if (arg === '--exclude') { opts.exclude = next; i += 1; }
    else if (arg === '--message') { opts.message = next; i += 1; }
    else if (arg === '--token') { opts.token = next; i += 1; }
    else if (arg === '--share-password') { opts.sharePassword = next; i += 1; }
    else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    return;
  }

  prepareCliEnv();

  const token = await resolveCliTokenFromEnv(
    'GITLAB_TOKEN',
    String(opts.token || ''),
    String(opts.sharePassword || ''),
  );
  const apiBase = String(opts.apiBase || '').trim();
  const projectPath = String(opts.project || '').trim();
  const branch = String(opts.branch || '').trim();
  const targetPath = String(opts.target || '').trim();

  const missing = [];
  if (!apiBase) missing.push('--api-base');
  if (!projectPath) missing.push('--project');
  if (!branch) missing.push('--branch');
  if (!targetPath) missing.push('--target');
  if (missing.length > 0) {
    throw new Error(`缺少必填参数: ${missing.join(', ')}（使用 --help 查看说明）`);
  }

  const zipPath = await resolveCliZipPath(String(opts.zip || ''));

  console.log('正在扫描远程目录并提交变更...');
  console.log(`  项目: ${projectPath}`);
  console.log(`  分支: ${branch}`);
  console.log(`  目标: ${targetPath}`);
  console.log(`  ZIP:  ${zipPath}`);
  console.log(`  Token: ${token.slice(0, 4)}****${token.slice(-4)} (${token.length} 字符)`);

  const relativeFiles = await readZipUploadFilesFromPath(zipPath);

  const result = await replaceGitlabDirectoryDirect({
    apiBase,
    token,
    projectPath,
    branch,
    targetPath,
    relativeFiles,
    excludeInput: String(opts.exclude || ''),
    commitMessage: String(opts.message || ''),
  });

  console.log('');
  console.log('完成');
  console.log(`  删除: ${result.deletedCount} 个文件`);
  console.log(`  保留: ${result.excludedCount} 个文件（排除）`);
  console.log(`  上传: ${result.createdCount} 个文件`);
  console.log(`  提交: ${result.commitCount} 次 · ${result.commitSha}`);
  if (result.webUrl) {
    console.log(`  链接: ${result.webUrl}`);
  }
}

main().catch((err) => {
  console.error(`错误: ${err.message || err}`);
  process.exit(1);
});
