module.exports = {
  apps: [
    // =========================
    // SBY (SUDAH ADA)
    // =========================
    {
      name: "sby-desty-api",
      script: "server.js",
      cwd: "/home/odoo/odoo-desty-sby",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 5000
      }
    },
    {
      name: "sby-desty-worker",
      script: "worker.js",
      cwd: "/home/odoo/odoo-desty-sby",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    },

    // =========================
    // NON-SBY (BARU)
    // =========================
    {
      name: "desty-api",
      script: "server.js",
      cwd: "/home/odoo/odoo-desty",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 7000 // 🔥 beda port
      }
    },
    {
      name: "desty-worker",
      script: "worker.js",
      cwd: "/home/odoo/odoo-desty",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};