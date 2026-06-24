#!/usr/bin/env node

import { replaceGiteeDirectoryDirect } from '../src/lib/gitee/path-replace.js';
import { readZipUploadFilesFromPath } from './zip-from-path.js';

function printHelp() {
  console.log(`Gitee 目录替换 CLI

用法:
  GITEE_TOKEN=xxx node scripts/gitee-path-replace.mjs [选项]

选项:
  --zip <path>       本地 ZIP 包路径（必填）
  --api-base <url>   Gitee API 根地址
  --owner <name>     仓库 owner
  --repo <name>      仓库名
  --branch <name>    分支名
  --target <path>    远程目标目录
  --exclude <paths>  排除路径
  --message <text>   提交说明
  --token <token>    Token（或环境变量 GITEE_TOKEN）
  -h, --help         显示帮助
`);
}

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const opts = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = argv[i + 1];
    if (arg === '--zip') { opts.zip = next; i += 1; }
    else if (arg === '--api-base') { opts.apiBase = next; i += 1; }
    else if (arg === '--owner') { opts.owner = next; i += 1; }
    else if (arg === '--repo') { opts.repo = next; i += 1; }
    else if (arg === '--branch') { opts.branch = next; i += 1; }
    else if (arg === '--target') { opts.target = next; i += 1; }
    else if (arg === '--exclude') { opts.exclude = next; i += 1; }
    else if (arg === '--message') { opts.message = next; i += 1; }
    else if (arg === '--token') { opts.token = next; i += 1; }
    else throw new Error(`未知参数: ${arg}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) { printHelp(); return; }

  const token = String(opts.token || process.env.GITEE_TOKEN || '').trim();
  const zipPath = String(opts.zip || '').trim();
  const relativeFiles = await readZipUploadFilesFromPath(zipPath);

  const result = await replaceGiteeDirectoryDirect({
    apiBase: String(opts.apiBase || 'https://gitee.com/api/v5').trim(),
    token,
    owner: String(opts.owner || '').trim(),
    repo: String(opts.repo || '').trim(),
    branch: String(opts.branch || '').trim(),
    targetPath: String(opts.target || '').trim(),
    relativeFiles,
    excludeInput: String(opts.exclude || ''),
    commitMessage: String(opts.message || ''),
  });

  console.log(`完成 · 删除 ${result.deletedCount} · 上传 ${result.createdCount} · ${result.commitCount} 次提交 · ${result.commitSha}`);
  if (result.webUrl) console.log(result.webUrl);
}

main().catch((err) => {
  console.error(`错误: ${err.message || err}`);
  process.exit(1);
});
