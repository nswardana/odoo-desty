module.exports = {
  apps: [
    {
      name: "sby-desty-api",
      script: "server.js",
      cwd: "/home/odoo/odoo-desty-sby",
      instances: "max",
      exec_mode: "cluster",
      watch: false,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "300M",

      out_file: "./logs/api-out.log",
      error_file: "./logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",

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
      max_memory_restart: "300M",

      out_file: "./logs/worker-out.log",
      error_file: "./logs/worker-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      env: {
        NODE_ENV: "production"
      }
    }
  ]
};