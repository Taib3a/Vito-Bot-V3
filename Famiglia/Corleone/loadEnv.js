import fs from "node:fs";

/** يُحمَّل قبل بقية الوحدات كي تقرأ متغيّرات .env عند التحميل. */
if (typeof process.loadEnvFile === "function" && fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}
