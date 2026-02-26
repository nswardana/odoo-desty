const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB
});

async function checkOrder(orderId) {
  const res = await pool.query(
    "SELECT 1 FROM orders WHERE order_id=$1",
    [orderId]
  );
  return res.rowCount > 0;
}

async function saveOrder(orderId, source, saleId) {
  await pool.query(
    "INSERT INTO orders(order_id, source, sale_id) VALUES ($1,$2,$3)",
    [orderId, source, saleId]
  );
}

module.exports = { checkOrder, saveOrder };
