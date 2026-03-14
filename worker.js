require("dotenv").config();
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const marketplaceService = require("./services/marketplaceService");

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

    try {
      await marketplaceService.processOrder(
        job.data.source,
        job.data.order
      );
      
      console.log("✅ Order processed successfully");
    } catch (error) {
      console.error("❌ Order processing failed:", error.message);
      throw error;
    }
  },
  { connection }
);

worker.on("completed", job => {
  console.log("✅ Job completed:", job.id);
});

worker.on("failed", (job, err) => {
  console.error("❌ Job failed:", err.message);
});

console.log("🚀 Desty Worker running...");
console.log("📊 Supported marketplaces:", marketplaceService.getSupportedMarketplaces().join(", "));