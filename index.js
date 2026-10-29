import log from "./الاضافات/الكونسل.js";

// node:sqlite is still flagged experimental and prints an ExperimentalWarning
// on Node 22. The database module is imported dynamically below so this filter
// is installed first; drop only that warning and keep any other one visible.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning") return;
  console.warn(`${warning.name}: ${warning.message}`);
});

// The bot is a long-lived process: a throw from inside a Baileys callback or a
// rejected promise must not take the whole session down. Log and keep running.
process.on("uncaughtException", (err) => {
  log.error(err?.message ?? String(err), "uncaughtException", err?.stack);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  log.error(err.message, "unhandledRejection", err.stack);
});

async function main() {
  log.name();

  const { connect } = await import("./الاضافات/النظام.js");

  // connect() decides everything itself: it only asks for 1/2 when the session
  // is not registered yet, and just reconnects when it already is.
  await connect();
}

main().catch((err) => {
  log.error(err.message, "index.js", err.stack);
  process.exit(1);
});
