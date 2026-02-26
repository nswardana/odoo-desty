# Marketplace Bridge (Shopee & Tokopedia → Odoo v12)

## Setup

1. Copy .env.example to .env and fill credentials
2. Create PostgreSQL database:

CREATE DATABASE marketplace;

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(100) UNIQUE,
  source VARCHAR(50),
  sale_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

3. Install dependencies:
npm install

4. Start API:
npm start

5. Start Worker:
npm run worker

Production:
pm2 start server.js --name api
pm2 start worker.js --name worker
