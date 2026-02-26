require("dotenv").config();
const express = require("express");
const { orderQueue } = require("./queue");

const app = express();
app.use(express.json());

app.post("/webhook/shopee", async (req, res) => {
  console.log("📥 Shopee webhook received");

  await orderQueue.add("order", {
    source: "shopee",
    order: req.body
  });

  console.log("✅ Job added to queue");
  res.json({ status: "queued" });
});

app.post("/webhook/tokopedia", async (req, res) => {
  console.log("📥 Tokopedia webhook received");

  await orderQueue.add("order", {
    source: "tokopedia",
    order: req.body
  });

  console.log("✅ Job added to queue");
  res.json({ status: "queued" });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 API running on port " + (process.env.PORT || 3000));
});