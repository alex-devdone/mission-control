module.exports = {
  apps: [
    {
      name: 'mission-control',
      script: 'node_modules/.bin/next',
      args: 'start -p 17789',
      cwd: '/Users/betty/work/mission-control',
      env: {
        NODE_ENV: 'production',
        PORT: 17789,
      },
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
    },
  ],
};
