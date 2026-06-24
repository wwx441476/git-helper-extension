#!/usr/bin/env node

import { loadDotEnv } from './load-dotenv.js';
import { normalizeEnvValue } from '../src/lib/path-replace/token-crypto.js';

loadDotEnv();
const key = process.argv[2];
if (!key) process.exit(0);
process.stdout.write(normalizeEnvValue(process.env[key] || ''));
