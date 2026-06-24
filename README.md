# Git Helper - Git 凭证管理与推送 Chrome 扩展

Chrome 扩展，用于统一管理 Git 托管平台的访问凭证，并在验证通过后执行 push 等 Git 操作。

**当前阶段（Phase 1）**：多凭证配置 + 凭证验证环境。  
**后续阶段**：基于已验证凭证，向 GitHub、Gitee、GitLab 等平台推送代码。

## 产品路线

| 阶段 | 目标 | 状态 |
|---|---|---|
| **Phase 1** | 多凭证配置、凭证验证、验证环境 | 已完成 |
| **Phase 2a** | 添加远程仓库地址、关联凭证、仓库验证 | 已完成 |
| **Phase 2b** | 沙箱环境拉取代码（API 归档，隔离不落盘） | 开发中 |
| **Phase 2c** | 向 GitHub / Gitee / GitLab 推送代码 | 规划中 |
| **Phase 3** | 自然语言操控 Git 网页（PR、Issue、Review 等） | 规划中 |

Phase 1 完成前，扩展的核心价值是：**安全保存多套凭证，并在隔离的验证环境中确认凭证可用**，为后续 push 和多平台操作打基础。

## 构建

```bash
cd extension
npm install
npm run build
```

构建产物在 `extension/dist/`，加载扩展时选择该目录。

开发模式（监听文件变化自动重新构建）：

```bash
cd extension
npm run dev
```

## 安装

1. 执行上述构建命令
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `extension/dist` 目录

## 配置凭证（Phase 1 核心）

### 入口

1. 点击扩展图标 → 侧边栏「凭证管理」，或右键扩展 → **选项**
2. 在凭证列表中点击 **添加凭证**

### 凭证字段

| 字段 | 说明 | 必填 |
|---|---|---|
| **名称** | 凭证别名，便于区分多套账号（如「公司 GitHub」「个人 Gitee」） | 是 |
| **平台用户名** | 平台账号名（如 GitHub login）；验证成功后自动填入，也可手动填写 | 否 |
| **平台** | `github` / `gitee` / `gitlab`（后续可扩展） | 是 |
| **认证方式** | `token`（Personal Access Token，推荐） | 是 |
| **Token** | 平台 Personal Access Token | 是 |
| **API Base URL** | 平台 API 地址；公有云用默认值，自建 GitLab 需填写 | 否 |
| **设为默认** | 同平台多凭证时，优先使用该凭证 | 否 |

### 各平台默认 API Base

| 平台 | 默认 API Base |
|---|---|
| GitHub | `https://api.github.com` |
| Gitee | `https://gitee.com/api/v5` |
| GitLab | `https://gitlab.com/api/v4` |

自建 GitLab 示例：`https://gitlab.example.com/api/v4`

### 多凭证规则

- 同一平台可配置 **多套凭证**（不同账号、不同 Token）
- 每套凭证有独立 **名称**，列表中可编辑、删除、设为默认
- 执行 push 或调用 API 时，按 **平台 + 默认凭证** 解析；也可在操作时手动选择凭证
- 删除凭证前需确认；删除后不影响本地 git 仓库，仅移除扩展内存储

### Token 权限建议（后续 push 所需）

| 平台 | 建议 Scope |
|---|---|
| GitHub | `repo`（私有库需完整 repo 权限） |
| Gitee | `projects` |
| GitLab | `api` 或 `write_repository` |

Phase 1 验证仅需能读取当前用户信息；Phase 2 push 前应在文档/UI 中提示 scope 是否足够。

## 验证环境（Phase 1 核心）

扩展提供独立的 **凭证验证** 流程，不依赖真实 push，用于确认 Token 有效、平台可达、权限基本满足。

### 验证入口

1. **选项页 / 凭证管理**：每条凭证旁的 **「验证」** 按钮
2. **侧边栏**：凭证卡片上的验证状态图标，点击可重新验证

### 验证流程

```
选择凭证 → 调用平台 API（如 GET /user）→ 解析响应 → 更新验证状态
```

| 步骤 | 说明 |
|---|---|
| 1. 发起验证 | 使用凭证 Token 请求平台「当前用户」接口 |
| 2. 成功 | 显示用户名、头像（如有）、验证时间；状态标记为 **已验证** |
| 3. 失败 | 显示 HTTP 状态码与错误信息（如 401 无效 Token、403 权限不足、网络超时） |
| 4. 缓存 | 验证结果写入 `chrome.storage.local`，列表展示最近验证时间与状态 |

### 各平台验证接口

| 平台 | 验证请求 | 成功判定 |
|---|---|---|
| GitHub | `GET /user`，Header: `Authorization: Bearer <token>` | 200 且返回 `login` |
| Gitee | `GET /user`，Query: `access_token=<token>` | 200 且返回 `login` |
| GitLab | `GET /user`，Header: `PRIVATE-TOKEN: <token>` | 200 且返回 `username` |

### 验证环境 vs 生产使用

| 能力 | 验证环境 | 生产 push（Phase 2） |
|---|---|---|
| 调用只读 API（/user） | ✅ | ✅ |
| 实际上传对象 / 创建 commit | ❌ | ✅ |
| 修改远程仓库 | ❌ | ✅ |
| 失败是否影响远程 | 否 | 视操作而定 |

验证环境 **只做连通性与身份校验**，便于开发调试和用户自检，避免未验证凭证直接进入 push 流程。

### 本地 Mock 验证（开发用）

`extension/demo/verify/` 提供本地 Mock 服务页面，模拟各平台 `/user` 响应：

```bash
# 开发时在 Chrome 中打开
extension/demo/verify/index.html
```

| Mock 场景 | 用途 |
|---|---|
| 200 成功 | 验证 UI 成功态、用户名展示 |
| 401 无效 Token | 验证错误提示 |
| 403 权限不足 | 验证 scope 相关提示 |
| 网络超时 | 验证重试与超时 UI |

Options 页可切换 **「使用 Mock 验证端点」**（仅开发构建或开发者选项），将 API Base 指向本地 demo，无需真实 Token 即可联调 UI。

## 使用（Phase 1）

1. 安装并加载扩展
2. 打开 **选项** → **添加凭证**，填写平台、名称、Token
3. 点击 **验证**，确认状态为 **已验证**
4. 可继续添加多套凭证（如 GitHub 工作账号 + Gitee 个人账号）
5. 在凭证列表查看各凭证的验证状态与最近验证时间

Phase 2 起，在已验证凭证基础上配置仓库地址并 push（见下方说明）。

## 配置仓库（Phase 2a）

### 入口

1. 打开 **选项** → 切换到 **仓库** 标签
2. 点击 **+** 添加仓库

### 仓库字段

| 字段 | 说明 | 必填 |
|---|---|---|
| **名称** | 仓库别名（默认识别为 repo 名） | 是 |
| **仓库地址** | HTTPS 或 SSH 远程地址 | 是 |
| **关联凭证** | 同平台已验证凭证 | 是 |
| **默认分支** | 如 `main`；验证成功后自动填入 | 否 |

### 支持的地址格式

| 平台 | 示例 |
|---|---|
| GitHub | `https://github.com/owner/repo.git` |
| GitHub SSH | `git@github.com:owner/repo.git` |
| Gitee | `https://gitee.com/owner/repo.git` |
| GitLab | `https://gitlab.com/group/project.git` |
| 自建 GitLab | `git@git.example.com:group/project.git`（凭证 API Base 填 `https://git.example.com/api/v4`） |

填写地址后先选择 **关联凭证**（自建 GitLab 必选），会自动识别平台与项目路径。

### 仓库验证

点击 **验证仓库** 会调用平台 API 确认：

- 仓库是否存在
- 关联凭证是否有访问权限
- 默认分支名称（写入「默认分支」字段）

| 平台 | 验证 API |
|---|---|
| GitHub | `GET /repos/{owner}/{repo}` |
| Gitee | `GET /repos/{owner}/{repo}` |
| GitLab | `GET /projects/{encoded_path}` |

## 沙箱拉取（Phase 2b）

扩展提供 **隔离沙箱环境**，通过平台 API 拉取指定分支的代码归档，用于验证读权限与分支可达性。

> 沙箱拉取 **不写入本地磁盘**（Chrome 扩展无法直接 `git clone`），仅在扩展内记录拉取结果元数据。

### 入口

1. **侧边栏 → 沙箱** 标签：对已验证仓库点击 **拉取代码**
2. **选项 → 仓库**：保存并验证后，点击 **沙箱拉取**

### 拉取流程

```
已验证仓库 + 凭证 → 读取分支最新提交 → 获取目录树/归档大小 → 写入沙箱会话
```

| 步骤 | 说明 |
|---|---|
| 1 | 校验仓库与凭证均已验证 |
| 2 | 按默认分支（或表单填写分支）请求平台 API |
| 3 | 获取最新 commit、根目录文件列表、归档体积 |
| 4 | 结果保存在 `sandboxSessions`，侧边栏展示 |

### 平台 API

| 平台 | 拉取方式 |
|---|---|
| GitHub | commits + contents + zipball HEAD |
| Gitee | commits + contents + zipball HEAD |
| GitLab | commits + repository/tree + archive.zip HEAD |

### Mock 沙箱（开发用）

选项页可开启 **「使用 Mock 沙箱拉取」**，或使用 Mock Token，无需真实下载。

## 使用（Phase 2 规划 - 推送）

> 以下能力尚未实现，作为后续开发目标。

1. 在侧边栏选择 **已验证** 的凭证与目标平台
2. 选择本地仓库路径（或通过 Native Messaging / 文件 API 对接，方案待定）
3. 输入或选择分支，执行 push
4. 扩展使用对应平台 API 或 git 协议完成上传

| 平台 | Push 方式（规划） |
|---|---|
| GitHub | HTTPS + Token / GitHub API |
| Gitee | HTTPS + Token |
| GitLab | HTTPS + Token / 自建实例 API |

## 项目结构

```
├── extension/
│   ├── manifest.json
│   ├── vite.config.js
│   ├── package.json
│   ├── public/icons/
│   ├── demo/
│   │   └── verify/              # 凭证验证 Mock 环境（Phase 1）
│   │       ├── index.html
│   │       └── mock-api.js
│   └── src/
│       ├── background/          # Service Worker
│       ├── sidepanel/           # 侧边栏（凭证状态、后续 push 入口）
│       ├── options/             # 选项页（凭证 CRUD、验证触发）
│       └── lib/
│           ├── credentials/     # Phase 1 核心
│           │   ├── store.js         # 多凭证增删改查、默认凭证
│           │   ├── types.js         # 凭证数据结构
│           │   └── crypto.js        # 可选：本地加密存储
│           ├── verify/            # Phase 1 核心
│           │   ├── verifier.js      # 统一验证入口
│           │   ├── github.js        # GitHub /user 适配
│           │   ├── gitee.js         # Gitee /user 适配
│           │   ├── gitlab.js        # GitLab /user 适配
│           │   └── mock.js          # Mock 端点（开发）
│           ├── push/              # Phase 2（占位）
│           │   └── README.md
│           └── settings.js        # 全局设置（Mock 开关等）
└── dist/
```

## 开发指南

### 技术栈

- **Manifest V3** + **Vite** + **@crxjs/vite-plugin**
- **chrome.storage.local** 存储凭证与验证结果
- **Options 页** + **Side Panel** 作为 Phase 1 主要 UI
- 平台连通性通过 **fetch** 调用各 Git 托管 API

### Phase 1 架构

```
Options / Side Panel
        ↓
  credentials/store.js（多凭证 CRUD）
        ↓
  verify/verifier.js（按 platform 分发）
        ↓
  github.js | gitee.js | gitlab.js | mock.js
        ↓
  更新验证状态 → storage → UI 刷新
```

### 凭证数据模型（建议）

```js
{
  id: "cred_xxx",           // 唯一 ID
  name: "公司 GitHub",       // 用户自定义名称
  username: "octocat",      // 平台用户名（验证后自动填入）
  platform: "github",       // github | gitee | gitlab
  authType: "token",
  token: "ghp_...",         // 仅存 chrome.storage.local
  apiBase: "",              // 空则使用平台默认
  isDefault: true,          // 同 platform 下仅一个 default
  verify: {
    status: "verified",     // unknown | verifying | verified | failed
    at: 1719225600000,      // 最近验证时间戳
    username: "octocat",    // 验证成功时的平台用户名
    message: ""             // 失败时的错误摘要
  },
  createdAt: 1719225600000,
  updatedAt: 1719225600000
}
```

列表接口返回给 UI 时，**Token 应脱敏**（如 `ghp_****abcd`），完整 Token 仅在编辑时回显。

### Phase 1 开发步骤

1. **脚手架**：初始化 `extension/`，配置 manifest（`storage` 权限 + 各平台 host_permissions）
2. **凭证存储**：实现 `credentials/store.js`（列表、添加、编辑、删除、默认凭证）
3. **Options UI**：凭证表格 + 表单 + 验证按钮 + 状态展示
4. **平台适配器**：分别实现 GitHub / Gitee / GitLab 的 `/user` 验证
5. **统一验证器**：`verifier.js` 根据 `platform` 与 `apiBase` 路由，写入 `verify` 字段
6. **Mock 环境**：`demo/verify/` + `mock.js`，支持离线联调
7. **侧边栏**：只读展示凭证与验证状态（Phase 1 可不实现 push）

### host_permissions（建议）

```json
[
  "https://api.github.com/*",
  "https://gitee.com/*",
  "https://gitlab.com/*"
]
```

自建 GitLab 若需支持任意域名，Phase 2 可考虑 `https://*/*` 或用户配置的 apiBase 动态申请（Manifest 限制下可能需 optional_host_permissions）。

### 本地调试

```bash
cd extension
npm run dev
```

1. Chrome 加载 `extension/dist`
2. 打开选项页，添加测试凭证
3. **真实验证**：填入各平台有效 Token，点击验证
4. **Mock 验证**：开启 Mock 开关，打开 `demo/verify/index.html`，使用假 Token 测试各状态 UI

### 安全说明

- Token 仅保存在本机 `chrome.storage.local`，不上传第三方服务器
- UI 展示 Token 时默认脱敏；导出/复制需二次确认（若后续支持）
- 验证环境只调用只读 API，不执行 push、不删除远程资源
- 请勿在公共设备上保存 Token；Phase 2 可考虑可选主密码加密

### 后续扩展（Phase 2+）

| 方向 | 说明 |
|---|---|
| **Push GitHub / Gitee / GitLab** | 基于已验证凭证，统一 push 抽象 + 平台实现 |
| **凭证自动匹配** | 根据 remote URL  hostname 自动选择对应平台凭证 |
| **SSH 密钥** | 除 Token 外支持 SSH（依赖 Native Messaging 或外部 helper） |
| **OAuth 授权流** | 浏览器内 OAuth 获取 Token，减少手动粘贴 |
| **Git 网页自动化** | PR、Issue、Review 等（Phase 3，可参考 PagePilot 架构） |

## 参考

- [PagePilot](../chrome-use-extension) — 同系列扩展，Phase 3 网页自动化可参考其 Agent 架构
- [GitHub REST API - Users](https://docs.github.com/en/rest/users/users)
- [Gitee API - 获取当前用户](https://gitee.com/api/v5/swagger#/getV5User)
- [GitLab API - Current user](https://docs.gitlab.com/ee/api/users.html#for-user)
