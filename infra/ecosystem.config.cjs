// PM2 process definitions for the Node apps (web + worker).
// Haraka and rspamd run under systemd (see infra/systemd/). Postgres, Redis,
// and nginx are installed as native system services.
//
// Usage on the server:
//   pnpm install && pnpm build
//   pm2 start infra/ecosystem.config.cjs
//   pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'inboxi-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
    },
    {
      name: 'inboxi-worker',
      cwd: './apps/worker',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
    },
  ],
};
