require("dotenv").config();
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { processMarketplaceOrder } = require("./services/orderService");

const connection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null
});

connection.on("connect", () => {
  console.log("✅ Redis connected (Worker)");
});

const worker = new Worker(
  "orderQueue",
  async job => {
    console.log("📦 Job received:", job.data);

    await processMarketplaceOrder(
      job.data.source,
      job.data.order
    );
  },
  { connection }
);

worker.on("completed", job => {
  console.log("✅ Job completed:", job.id);
});

worker.on("failed", (job, err) => {
  console.error("❌ Job failed:", err.message);
});

console.log("🚀 Worker running...");