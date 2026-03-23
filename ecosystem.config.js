module.exports = {
  apps: [
    {
      name: "sby-desty-api",
      script: "server.js",
      instances: "max", // gunakan semua core CPU
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "sby-desty-worker",
      script: "worker.js",
      instances: 1, // worker biasanya 1 dulu
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }

    // OPTIONAL kalau mau multiple worker pakai script custom
    // {
    //   name: "desty-workers",
    //   script: "scripts/startWorkers.js",
    //   instances: 1,
    //   exec_mode: "fork"
    // }
  ]
};