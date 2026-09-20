import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const vite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/vite/bin/vite.js');
const result = spawnSync(process.execPath, [vite, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_WEBKILN_API_URL: '', VITE_WEBKILN_CLOUD_MODE: 'true' },
});
process.exit(result.status ?? 1);
