const xmlrpc = require("xmlrpc");

const common = xmlrpc.createSecureClient({
  host: "rap.beepetmart.com",
  port: 443,
  path: "/xmlrpc/2/common"
});

const models = xmlrpc.createSecureClient({
  host: "rap.beepetmart.com",
  port: 443,
  path: "/xmlrpc/2/object"
});

const db = "RAP";
const username = "bintangtimurjaya.cv@gmail.com";
const password = "b33p3t103d";

common.methodCall("authenticate", [db, username, password, {}], function (err, uid) {
  if (err) {
    console.error("Auth Error:", err);
    return;
  }

  console.log("Authenticated UID:", uid);

  models.methodCall(
    "execute_kw",
    [
      db,
      uid,
      password,
      "res.partner",
      "search",
      [[["name", "=", "Test Customer Shopee"]]]
    ],
    function (err, result) {
      if (err) {
        console.error("Search Error:", err);
      } else {
        console.log("Search Result:", result);
      }
    }
  );
});