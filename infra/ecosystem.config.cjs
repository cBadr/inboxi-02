// PM2 process definitions for the Node apps (web + worker).
// Haraka and rspamd run under systemd (see infra/systemd/). Postgres, Redis,
// and nginx are installed as native system services.
//
// Usage on the server (from /opt/inboxi):
//   pnpm install && pnpm build
//   pm2 start infra/ecosystem.config.cjs
//   pm2 save && pm2 startup
//
// Environment is loaded from the repo-root .env and injected into every app so
// a single .env file configures the whole platform.

const path = require('path');
const root = path.resolve(__dirname, '..');
const fileEnv = require('dotenv').config({ path: path.join(root, '.env') }).parsed || {};
const env = { ...fileEnv, NODE_ENV: 'production' };

module.exports = {
  apps: [
    {
      name: 'inboxi-web',
      cwd: path.join(root, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      env,
      max_memory_restart: '512M',
    },
    {
      name: 'inboxi-worker',
      cwd: path.join(root, 'apps/worker'),
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env,
      max_memory_restart: '512M',
    },
  ],
};
