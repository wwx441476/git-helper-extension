function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * 生成可在终端执行的目录替换命令（用户主要修改 --zip 路径）。
 * @param {{
 *   platform?: string,
 *   zipPath?: string,
 *   apiBase: string,
 *   projectPath?: string,
 *   owner?: string,
 *   repo?: string,
 *   branch: string,
 *   targetPath: string,
 *   excludeInput?: string,
 *   commitMessage?: string,
 *   scriptPath?: string,
 *   tokenEnv?: string,
 *   token?: string,
 *   forPackage?: boolean,
 * }} options
 */
export function buildPathReplaceCliCommand(options) {
  const {
    platform = 'gitlab',
    zipPath = '/path/to/document-online-develop.zip',
    apiBase,
    projectPath = '',
    owner = '',
    repo = '',
    branch,
    targetPath,
    excludeInput = '',
    commitMessage = '',
    scriptPath = 'scripts/gitlab-path-replace.mjs',
    tokenEnv = 'GITLAB_TOKEN',
    token = '',
    forPackage = false,
  } = options;

  const tokenValue = String(token || '').trim();
  const tokenLine = tokenValue
    ? `${tokenEnv}=${shellQuote(tokenValue)} \\`
    : `${tokenEnv}="your-token" \\`;

  /** @type {string[]} */
  const lines = [];
  if (!forPackage) {
    lines.push('cd extension && \\');
  }
  lines.push(
    tokenLine,
    `node ${scriptPath} \\`,
    `  --zip ${shellQuote(zipPath)} \\`,
    `  --api-base ${shellQuote(apiBase)} \\`,
  );

  if (platform === 'github' || platform === 'gitee') {
    lines.push(`  --owner ${shellQuote(owner)} \\`);
    lines.push(`  --repo ${shellQuote(repo)} \\`);
  } else {
    lines.push(`  --project ${shellQuote(projectPath)} \\`);
  }

  lines.push(
    `  --branch ${shellQuote(branch)} \\`,
    `  --target ${shellQuote(targetPath)} \\`,
  );

  const exclude = String(excludeInput || '').trim();
  if (exclude) {
    lines.push(`  --exclude ${shellQuote(exclude)} \\`);
  }

  const message = String(commitMessage || '').trim();
  if (message) {
    lines.push(`  --message ${shellQuote(message)}`);
  } else {
    const last = lines.length - 1;
    lines[last] = lines[last].replace(/ \\$/, '');
  }

  return lines.join('\n');
}
