import { zipSync } from 'fflate';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isMockSandboxPull(token) {
  return typeof token === 'string' && token.startsWith('mock:');
}

function buildMockArchive(branch) {
  const files = {
    'README.md': `# Mock Sandbox\n\nBranch: ${branch}\n`,
    'package.json': JSON.stringify({ name: 'mock-sandbox', version: '1.0.0' }, null, 2),
    'src/index.js': "console.log('hello sandbox');\n",
    '.gitignore': 'node_modules/\n',
  };

  const zipEntries = {};
  const root = `mock-${branch}/`;
  for (const [path, content] of Object.entries(files)) {
    zipEntries[`${root}${path}`] = new TextEncoder().encode(content);
  }

  return zipSync(zipEntries).buffer;
}

export async function pullMockSandbox(branch) {
  await sleep(600);
  const archiveBuffer = buildMockArchive(branch);
  return {
    branch,
    commitSha: 'mock1234',
    commitMessage: 'mock: sandbox pull success',
    commitAuthor: 'mock-user',
    fileCount: 4,
    archiveBytes: archiveBuffer.byteLength,
    sampleFiles: ['README.md', 'package.json', 'src/index.js'],
    archiveBuffer,
  };
}
