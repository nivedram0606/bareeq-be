import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load apps/api/.env (local Supabase credentials) before any module reads `env`.
// Variables already set in the process (e.g. in CI) take precedence.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

process.env.NODE_ENV = 'test';
