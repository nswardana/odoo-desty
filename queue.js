const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null
});

connection.on('connect', () => {
  console.log('Redis connected');
});

connection.on('error', (err) => {
  console.log('Redis error:', err);
});

const orderQueue = new Queue('orderQueue', {
  connection
});

module.exports = {
  orderQueue,
  connection
};