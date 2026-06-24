#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import {
  CLI_PACKAGE_ROOT,
  CLI_PACKAGE_SOURCE_FILES,
  buildCliPackageJson,
  buildCliPackageReadme,
} from '../src/lib/path-replace/package-files.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, '..');

/** @type {Record<string, Uint8Array>} */
const entries = {};

for (const relPath of CLI_PACKAGE_SOURCE_FILES) {
  const absPath = join(extensionRoot, relPath);
  entries[`${CLI_PACKAGE_ROOT}/${relPath}`] = readFileSync(absPath);
}

entries[`${CLI_PACKAGE_ROOT}/package.json`] = strToU8(buildCliPackageJson());
entries[`${CLI_PACKAGE_ROOT}/README.md`] = strToU8(buildCliPackageReadme());

const zipBuffer = zipSync(entries);
const outDir = join(extensionRoot, 'public');
const distDir = join(extensionRoot, 'dist');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'path-replace-cli-base.zip'), zipBuffer);
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'path-replace-cli-base.zip'), zipBuffer);

console.log(`CLI 基础包已生成 (${Object.keys(entries).length} 个文件)`);
