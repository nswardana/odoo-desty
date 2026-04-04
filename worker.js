require("dotenv").config();
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const marketplaceService = require("./services/marketplaceService");

// 🔥 gunakan ENV queue name
const QUEUE_NAME = process.env.QUEUE_NAME || "orderQueue";

// 🔥 optional: env label (biar kelihatan di log)
const APP_ENV = process.env.APP_ENV || "unknown";

const connection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

connection.on("connect", () => {
  console.log(`✅ Redis connected (Worker - ${APP_ENV})`);
});

const worker = new Worker(
  QUEUE_NAME,
  async job => {
    console.log(
      `📦 [${APP_ENV}] Job received (${QUEUE_NAME}):`,
      JSON.stringify(job.data, null, 2)
    );

    try {
      await marketplaceService.processOrder(
        job.data.source,
        job.data.order
      );

      console.log(`✅ [${APP_ENV}] Order processed successfully`);
    } catch (error) {
      console.error(`❌ [${APP_ENV}] Order processing failed:`, error.message);
      throw error;
    }
  },
  {
    connection,

    // 🔥 penting biar tidak overload
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5")
  }
);

worker.on("completed", job => {
  console.log(`✅ [${APP_ENV}] Job completed:`, job.id);
});

worker.on("failed", (job, err) => {
  console.error(`❌ [${APP_ENV}] Job failed:`, err.message);
});

console.log(`🚀 Worker running (${APP_ENV})...`);
console.log(`📦 Queue: ${QUEUE_NAME}`);
console.log(
  "📊 Supported marketplaces:",
  marketplaceService.getSupportedMarketplaces().join(", ")
);