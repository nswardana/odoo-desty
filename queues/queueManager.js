// queues/queueManager.js
// Multi-queue management system for different operation types

const queueModule = require('../queue');
const { orderQueue } = queueModule;
const { addJobWithDedlication } = queueModule;
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

class QueueManager {
  constructor() {
    this.connection = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      password: process.env.REDIS_PASSWORD || undefined
    });

    this.queues = new Map();
    this.workers = new Map();
    
    // Define queue configurations
    this.queueConfigs = {
      'marketplace-order-queue': {
        name: 'marketplace-order-queue',
        concurrency: 5,
        settings: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      },
      'marketplace-stock-queue': {
        name: 'marketplace-stock-queue',
        concurrency: 3,
        settings: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      },
      'marketplace-cancel-queue': {
        name: 'marketplace-cancel-queue',
        concurrency: 10,
        settings: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 500
          }
        }
      },
      'marketplace-product-queue': {
        name: 'marketplace-product-queue',
        concurrency: 2,
        settings: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000
          }
        }
      },
      'marketplace-notification-queue': {
        name: 'marketplace-notification-queue',
        concurrency: 8,
        settings: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 1,
          backoff: {
            type: 'fixed',
            delay: 100
          }
        }
      }
    };

    this.initializeQueues();
  }

  // Initialize all queues
  initializeQueues() {
    try {
      console.log('🔄 Initializing queue manager...');
      
      Object.entries(this.queueConfigs).forEach(([key, config]) => {
        const queue = new Queue(config.name, {
          connection: this.connection,
          defaultJobOptions: config.settings
        });

        this.queues.set(key, queue);
        console.log(`✅ Queue initialized: ${config.name}`);
      });

      console.log(`🚀 Queue manager initialized with ${this.queues.size} queues`);
    } catch (error) {
      console.error('❌ Error initializing queue manager:', error.message);
      throw error;
    }
  }

  // Get queue by name
  getQueue(queueName) {
    return this.queues.get(queueName);
  }

  // Add job to specific queue
  async addJob(queueName, jobData, options = {}) {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      let job;
      
      // Use deduplication for order queue
      if (queueName === 'orderQueue' || queueName === 'order') {
        job = await addJobWithDedlication(queueName, jobData, options);
      } else {
        // Use regular add for other queues
        job = await queue.add(jobData, options);
      }
      
      if (job) {
        console.log(`📦 Job added to ${queueName}:`, {
          id: job.id,
          data: jobData,
          options: options
        });
      } else {
        console.log(`⚠️ Duplicate job prevented in ${queueName}:`, jobData);
      }

      return job;
    } catch (error) {
      console.error(`❌ Error adding job to ${queueName}:`, error.message);
      throw error;
    }
  }

  // Add high priority job
  async addHighPriorityJob(queueName, jobData) {
    return await this.addJob(queueName, jobData, {
      priority: 10,
      repeat: false
    });
  }

  // Add delayed job
  async addDelayedJob(queueName, jobData, delayMs) {
    return await this.addJob(queueName, jobData, {
      delay: delayMs,
      repeat: false
    });
  }

  // Add recurring job
  async addRecurringJob(queueName, jobData, cronExpression) {
    return await this.addJob(queueName, jobData, {
      repeat: { cron: cronExpression },
      jobId: `${queueName}-recurring`
    });
  }

  // Get queue statistics
  async getQueueStats(queueName) {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      const stats = {
        queueName,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length,
        timestamp: new Date().toISOString()
      };

      console.log(`📊 Queue stats for ${queueName}:`, stats);
      return stats;
    } catch (error) {
      console.error(`❌ Error getting stats for ${queueName}:`, error.message);
      throw error;
    }
  }

  // Get all queue statistics
  async getAllQueueStats() {
    try {
      const allStats = {};
      
      for (const queueName of this.queues.keys()) {
        allStats[queueName] = await this.getQueueStats(queueName);
      }

      return allStats;
    } catch (error) {
      console.error('❌ Error getting all queue stats:', error.message);
      throw error;
    }
  }

  // Pause queue
  async pauseQueue(queueName) {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      await queue.pause();
      console.log(`⏸️ Queue paused: ${queueName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error pausing queue ${queueName}:`, error.message);
      throw error;
    }
  }

  // Clear queue
  async clearQueue(queueName) {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      await queue.clean(0, 'completed'); // Clean completed jobs
      await queue.clean(0, 'failed');    // Clean failed jobs
      
      console.log(`🧹 Queue cleared: ${queueName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error clearing queue ${queueName}:`, error.message);
      throw error;
    }
  }

  // Create worker for queue
  createWorker(queueName, processor) {
    try {
      const config = this.queueConfigs[queueName];
      if (!config) {
        throw new Error(`Queue config not found: ${queueName}`);
      }

      const worker = new Worker(config.name, processor, {
        connection: this.connection,
        concurrency: config.concurrency,
        settings: config.settings
      });

      // Worker event handlers
      worker.on('completed', (job) => {
        console.log(`✅ Job completed in ${queueName}:`, {
          id: job.id,
          data: job.data,
          queue: queueName
        });
      });

      worker.on('failed', (job, err) => {
        console.error(`❌ Job failed in ${queueName}:`, {
          id: job.id,
          data: job.data,
          error: err.message,
          queue: queueName
        });
      });

      worker.on('error', (err) => {
        console.error(`❌ Worker error in ${queueName}:`, err.message);
      });

      worker.on('stalled', (job) => {
        console.warn(`⚠️ Job stalled in ${queueName}:`, {
          id: job.id,
          data: job.data,
          queue: queueName
        });
      });

      this.workers.set(queueName, worker);
      console.log(`👷 Worker created for ${queueName} (concurrency: ${config.concurrency})`);
      
      return worker;
    } catch (error) {
      console.error(`❌ Error creating worker for ${queueName}:`, error.message);
      throw error;
    }
  }

  // Close all queues and workers
  async close() {
    try {
      console.log('🔄 Closing queue manager...');
      
      // Close all workers
      for (const [queueName, worker] of this.workers.entries()) {
        await worker.close();
        console.log(`🔌 Worker closed for ${queueName}`);
      }

      // Close all queues
      for (const [queueName, queue] of this.queues.entries()) {
        await queue.close();
        console.log(`🔌 Queue closed: ${queueName}`);
      }

      // Close Redis connection
      await this.connection.quit();
      console.log('🔌 Redis connection closed');
      
    } catch (error) {
      console.error('❌ Error closing queue manager:', error.message);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        queues: {},
        redis: {
          connected: this.connection.status === 'ready'
        }
      };

      // Check each queue health
      for (const queueName of this.queues.keys()) {
        const queue = this.queues.get(queueName);
        const worker = this.workers.get(queueName);
        
        health.queues[queueName] = {
          status: queue ? 'active' : 'inactive',
          worker_status: worker ? 'active' : 'inactive',
          stats: await this.getQueueStats(queueName)
        };
      }

      return health;
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Get queue configuration
  getQueueConfig(queueName) {
    return this.queueConfigs[queueName];
  }

  // List all available queues
  listQueues() {
    return Array.from(this.queues.keys());
  }
}

module.exports = new QueueManager();
