import log from "./الاضافات/الكونسل.js";
import { createPrompter, promptConnectionMethod, promptPhoneNumber } from "./الاضافات/الادخال.js";

// node:sqlite is still flagged experimental and prints an ExperimentalWarning
// on Node 22. The database module is imported dynamically below so this filter
// is installed first; drop only that warning and keep any other one visible.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning") return;
  console.warn(`${warning.name}: ${warning.message}`);
});

async function main() {
  log.name();
  console.log("\nاختر طريقة الاتصال:");
  console.log("  1. Pairing Code");
  console.log("  2. QR Code");

  const prompter = createPrompter();

  const method = await promptConnectionMethod(prompter);
  if (method === null) {
    prompter.close();
    log.error("No input received. Run the bot from an interactive terminal.", "index.js");
    process.exit(1);
  }

  let phoneNumber = null;
  if (method === "pairing") {
    phoneNumber = await promptPhoneNumber(prompter);
    if (phoneNumber === null) {
      prompter.close();
      log.error("Phone number is required for pairing code.", "index.js");
      process.exit(1);
    }
  }

  prompter.close();

  const { connect } = await import("./الاضافات/النظام.js");
  await connect({ method, phoneNumber });
}

main().catch((err) => {
  log.error(err.message, "index.js", err.stack);
  process.exit(1);
});
