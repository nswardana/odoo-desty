module.exports = {
  apps: [
    {
      name: "sby-desty-api",
      script: "server.js",
      cwd: "/home/odoo/odoo-desty-sby",

      // ⚠️ HARUS number, bukan string
      instances: 2,
      exec_mode: "cluster",

      watch: false,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      // 🔥 dinaikkan biar tidak sering restart
      max_memory_restart: "500M",

      out_file: "./logs/api-out.log",
      error_file: "./logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,

      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "sby-desty-worker",
      script: "worker.js",
      cwd: "/home/odoo/odoo-desty-sby",

      instances: 1,
      exec_mode: "fork",

      watch: false,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      max_memory_restart: "500M",

      out_file: "./logs/worker-out.log",
      error_file: "./logs/worker-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,

      env: {
        NODE_ENV: "production"
      }
    }
  ]
};