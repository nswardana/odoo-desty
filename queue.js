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
    attempts: 1, // retry 1x only
    backoff: {
      type: "exponential",
      delay: 5000 // 5 detik
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// JOB DEDUPLICATION CACHE
const jobCache = new Set();

// ADD JOB WITH DEDUPLICATION
const addJobWithDeduplication = async (jobName, jobData, options = {}) => {
  try {
    // Create unique job ID based on order_sn
    const orderSn = jobData.order?.order_sn || jobData.orderSn || 'unknown';
    const uniqueJobId = `order_${orderSn}`;
    
    // Check if job already exists in cache
    if (jobCache.has(uniqueJobId)) {
      console.log(`⚠️ [${APP_ENV}] Duplicate job prevented: ${uniqueJobId}`);
      return null;
    }
    
    // Check if job already exists in queue
    const existingJobs = await orderQueue.getJobs(['waiting', 'active', 'completed']);
    const duplicateJob = existingJobs.find(job => 
      job.data?.order?.order_sn === orderSn || 
      job.data?.orderSn === orderSn
    );
    
    if (duplicateJob) {
      console.log(`⚠️ [${APP_ENV}] Duplicate job found in queue: ${orderSn}`);
      return null;
    }
    
    // Add job to queue
    const job = await orderQueue.add(uniqueJobId, jobData, options);
    
    // Add to cache
    jobCache.add(uniqueJobId);
    
    // Remove from cache after job completes (cleanup)
    setTimeout(() => {
      jobCache.delete(uniqueJobId);
    }, 30000); // 30 seconds cleanup
    
    console.log(`✅ [${APP_ENV}] Job added to queue: ${uniqueJobId}`);
    return job;
    
  } catch (error) {
    console.error(`❌ [${APP_ENV}] Error adding job to queue:`, error.message);
    throw error;
  }
};

// LOG QUEUE INFO
console.log(`📦 [${APP_ENV}] Queue initialized: ${QUEUE_NAME}`);

// DEBUG: Check function definition
console.log(`🔍 [${APP_ENV}] addJobWithDeduplication defined:`, typeof addJobWithDeduplication);
console.log(`🔍 [${APP_ENV}] Module exports keys:`, Object.keys(module.exports));

module.exports = {
  orderQueue,
  connection,
  QUEUE_NAME,
  addJobWithDeduplication
};