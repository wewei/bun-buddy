module.exports = {
  apps: [{
    name: 'bun-buddy-server',
    script: 'src/service/index.ts',
    interpreter: 'bun',
    interpreter_args: 'run',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      CLI_MODE: 'false'
    },
    env_production: {
      NODE_ENV: 'production',
      CLI_MODE: 'false'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // 进程保活相关配置
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    // 优雅关闭配置
    kill_timeout: 5000,
    listen_timeout: 3000,
    // 健康检查
    health_check_grace_period: 3000
  }]
};