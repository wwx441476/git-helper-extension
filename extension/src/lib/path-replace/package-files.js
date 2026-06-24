/** CLI 独立包所需源码文件（相对 extension 根目录） */
export const CLI_PACKAGE_ROOT = 'path-replace-cli';

export const CLI_PACKAGE_SOURCE_FILES = [
  'scripts/gitlab-path-replace.mjs',
  'scripts/github-path-replace.mjs',
  'scripts/gitee-path-replace.mjs',
  'scripts/zip-from-path.js',
  'src/lib/path-replace/shared.js',
  'src/lib/path-replace/direct.js',
  'src/lib/path-replace/token-crypto.js',
  'scripts/env-token.js',
  'scripts/load-dotenv.js',
  'scripts/zip-path.js',
  'scripts/env-get.mjs',
  'scripts/setup-portable-node.ps1',
  'src/lib/gitlab/commit.js',
  'src/lib/gitlab/local-upload.js',
  'src/lib/github/path-replace.js',
  'src/lib/gitee/path-replace.js',
  'src/lib/sandbox/unzip.js',
  'src/lib/verify/pagination.js',
  'src/lib/verify/fetch-helper.js',
];

export function buildCliPackageJson(version = '0.1.0') {
  return JSON.stringify({
    name: 'git-helper-path-replace-cli',
    version,
    private: true,
    type: 'module',
    description: 'Git Helper 目录替换 CLI（无需浏览器插件）',
    engines: { node: '>=18' },
    dependencies: {
      fflate: '^0.8.3',
    },
  }, null, 2);
}

export function buildCliPackageReadme() {
  return `# Git Helper · 目录替换 CLI

无需安装 Chrome 插件，在终端完成远程目录替换（扫描 → 删除 → 上传 ZIP）。

## 环境要求

- **macOS / Linux**：需已安装 Node.js 18+
- **Windows**：无需预装 Node.js；\`run.bat\` 会在首次运行时自动下载便携版 Node（约 30MB，需联网）
- 对应平台的 Personal Access Token（需仓库写入权限）

## Token 配置（.env）

支持 **明文** 或 **加密** 两种写法：

\`\`\`bash
# 明文
GITHUB_TOKEN=ghp_xxxx

# 加密（分享推荐，他人看不到原始 Token）
GITHUB_TOKEN=enc:v1:...
SHARE_PASSWORD=你设置的分享密码
\`\`\`

加密 Token 使用 AES-256-GCM + PBKDF2 生成。分享软件包时 \`.env\` 内为加密 Token，**不含** \`SHARE_PASSWORD\`；请通过其他渠道把分享密码告诉对方，对方写入 \`.env\` 后执行 \`./run.sh\`。

## 快速开始

1. 解压本目录
2. 编辑 \`.env\`，设置 \`ZIP_PATH\`（可留空，运行时会提示粘贴）
3. 执行：

\`\`\`bash
chmod +x run.sh   # macOS / Linux
./run.sh
\`\`\`

Windows 可双击或运行 \`run.bat\`（无 Node 时会自动下载便携版到 \`tools/node\`）。

macOS / Linux 首次运行会自动 \`npm install\` 安装 \`fflate\` 依赖。
Windows 同理（使用系统或便携版 Node）。

## 文件说明

| 文件 | 说明 |
|------|------|
| \`.env\` | Token 与 ZIP 路径（**分享给他人前请删除 Token**） |
| \`run.sh\` / \`run.bat\` | 一键执行脚本 |
| \`command.txt\` | 等价的完整终端命令 |
| \`config.json\` | 仓库与路径配置（只读参考） |
| \`scripts/\` | 各平台 CLI 入口 |

## 手动执行

\`\`\`bash
npm install
# 参考 command.txt 中的命令
\`\`\`

## 支持平台

- GitLab：\`scripts/gitlab-path-replace.mjs\`
- GitHub：\`scripts/github-path-replace.mjs\`
- Gitee：\`scripts/gitee-path-replace.mjs\`
`;
}
