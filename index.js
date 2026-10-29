import log from "./الاضافات/الكونسل.js";
import { createPrompter, promptConnectionMethod, promptPhoneNumber } from "./الاضافات/الادخال.js";
import { useSQLiteAuthState } from "./الاضافات/الجلسة.js";
import { MAIN_AUTH_FOLDER } from "./الاضافات/النظام.js";

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

  const { connect } = await import("./الاضافات/النظام.js");

  // A registered session is already linked. Ask nothing and just reconnect, so
  // a restart never re-prompts for a pairing code the user does not need.
  const { state } = await useSQLiteAuthState(MAIN_AUTH_FOLDER);
  if (state.creds?.registered) {
    log.info("Session already registered — reconnecting...");
    await connect({ method: "pairing", phoneNumber: null });
    return;
  }

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

  await connect({ method, phoneNumber });
}

main().catch((err) => {
  log.error(err.message, "index.js", err.stack);
  process.exit(1);
});
