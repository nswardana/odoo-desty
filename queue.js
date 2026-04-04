require("dotenv").config();
const { Queue } = require("bullmq");
const IORedis = require("ioredis");

// ENV CONFIG
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const QUEUE_NAME = process.env.QUEUE_NAME || "orderQueue";
const APP_ENV = process.env.APP_ENV || "UNKNOWN";

// REDIS CONNECTION
const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null
});

// LOGGING
connection.on("connect", () => {
  console.log(`✅ [${APP_ENV}] Redis connected (${REDIS_HOST}:${REDIS_PORT})`);
});

connection.on("error", (err) => {
  console.error(`❌ [${APP_ENV}] Redis error:`, err.message);
});

// QUEUE
const orderQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3, // retry 3x
    backoff: {
      type: "exponential",
      delay: 5000 // 5 detik
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// LOG QUEUE INFO
console.log(`📦 [${APP_ENV}] Queue initialized: ${QUEUE_NAME}`);

module.exports = {
  orderQueue,
  connection,
  QUEUE_NAME
};