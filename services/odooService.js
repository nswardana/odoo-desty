const xmlrpc = require("xmlrpc");

let cachedUid = null;

function getCommonClient() {
  return xmlrpc.createSecureClient({
    host: new URL(process.env.ODOO_URL).hostname,
    port: 443,
    path: "/xmlrpc/2/common"
  });
}

function getObjectClient() {
  return xmlrpc.createSecureClient({
    host: new URL(process.env.ODOO_URL).hostname,
    port: 443,
    path: "/xmlrpc/2/object"
  });
}

async function authenticate() {
  if (cachedUid) {
    return cachedUid;
  }

  return new Promise((resolve, reject) => {
    const common = getCommonClient();

    common.methodCall(
      "authenticate",
      [
        process.env.ODOO_DB,
        process.env.ODOO_USERNAME,
        process.env.ODOO_PASSWORD,
        {}
      ],
      (err, uid) => {
        if (err) {
          console.log("❌ Odoo Auth Error:", err);
          reject(err);
        } else {
          console.log("✅ Odoo Authenticated. UID:", uid);
          cachedUid = uid;
          resolve(uid);
        }
      }
    );
  });
}

async function execute(model, method, args) {
  try {
    const uid = await authenticate();

    return new Promise((resolve, reject) => {
      const object = getObjectClient();

      object.methodCall(
        "execute_kw",
        [
          process.env.ODOO_DB,
          uid,
          process.env.ODOO_PASSWORD,
          model,
          method,
          args
        ],
        (err, value) => {
          if (err) {
            console.log(`❌ Odoo Error [${model}.${method}]`, err);
            reject(err);
          } else {
            console.log(`✅ Odoo Success [${model}.${method}]`);
            resolve(value);
          }
        }
      );
    });
  } catch (error) {
    console.log("❌ Odoo Authentication Failed:", error);
    throw error;
  }
}

async function findOrCreatePartner(order) {
  try {
    const name =
      order.buyer_username ||
      order.customer_name ||
      "Marketplace Customer";

    console.log(`🔍 Searching partner: ${name}`);

    const existing = await execute("res.partner", "search", [
      [["name", "=", name]]
    ]);

    if (existing.length) {
      console.log(`✅ Partner found: ${existing[0]}`);
      return existing[0];
    }

    console.log(`👤 Creating partner: ${name}`);

    const partnerId = await execute("res.partner", "create", [
      {
        name: name,
        company_type: "person"
      }
    ]);

    console.log(`✅ Partner created: ${partnerId}`);

    return partnerId;
  } catch (error) {
    console.log("❌ Error in findOrCreatePartner:", error);
    throw error;
  }
}

module.exports = { execute, findOrCreatePartner };