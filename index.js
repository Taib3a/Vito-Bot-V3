import readline from "readline";
import log from "./الاضافات/الكونسل.js";
import { connect } from "./الاضافات/النظام.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  log.name();
  console.log("\nاختر طريقة الاتصال:");
  console.log("  1. Pairing Code");
  console.log("  2. QR Code");

  const choice = (await ask("\nادخل الرقم (1 او 2): ")).trim();
  const method = choice === "1" ? "pairing" : "qr";

  let phoneNumber = null;
  if (method === "pairing") {
    phoneNumber = (await ask("ادخل رقم الهاتف (مع رمز الدولة، بدون +): ")).trim();
    if (!phoneNumber) {
      log.error("Phone number is required for pairing code.", "index.js");
      rl.close();
      process.exit(1);
    }
  }

  rl.close();
  await connect({ method, phoneNumber });
}

main().catch((err) => {
  log.error(err.message, "index.js", err.stack);
  process.exit(1);
});
