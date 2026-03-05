// scripts/startWorkers.js
// Script to start all queue workers

require('dotenv').config();
const masterWorker = require('../workers/masterWorker');

async function startWorkers() {
  try {
    console.log('🚀 Starting Marketplace Workers...');
    console.log('📊 Environment:');
    console.log(`  REDIS_HOST: ${process.env.REDIS_HOST || '127.0.0.1'}`);
    console.log(`  REDIS_PORT: ${process.env.REDIS_PORT || 6379}`);
    console.log(`  PG_HOST: ${process.env.PG_HOST || 'localhost'}`);
    console.log(`  PG_DB: ${process.env.PG_DB || 'marketplace'}`);
    console.log('');

    // Start all workers
    await masterWorker.start();

    console.log('✅ All workers started successfully!');
    console.log('');
    console.log('📋 Available Queues:');
    console.log('  - marketplace-order-queue (Order processing)');
    console.log('  - marketplace-stock-queue (Stock updates)');
    console.log('  - marketplace-cancel-queue (Order cancellations)');
    console.log('');
    console.log('🔧 Worker Management:');
    console.log('  - Health monitoring enabled (30s interval)');
    console.log('  - Graceful shutdown with SIGINT');
    console.log('');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n📡 SIGINT received - shutting down gracefully...');
      await masterWorker.gracefulShutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n📡 SIGTERM received - shutting down gracefully...');
      await masterWorker.gracefulShutdown();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start workers:', error.message);
    process.exit(1);
  }
}

// Start the workers
startWorkers();
