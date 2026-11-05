const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'a3tranz-api',
      cwd: path.join(__dirname, 'api'),
      script: 'src/main.ts',
      interpreter: 'node',
      interpreter_args: '--env-file-if-exists=.env --experimental-strip-types',

      exec_mode: 'fork',
      instances: 1,

      env: {
        NODE_ENV: 'production',
        PORT: 4001,
      },

      max_memory_restart: '512M',
      exp_backoff_restart_delay: 200,
      time: true,
    },
    {
      name: 'a3tranz-admin',
      cwd: path.join(__dirname, 'admin-web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
