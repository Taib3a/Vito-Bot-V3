import log from "./الاضافات/الكونسل.js";

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

  // connect() decides everything itself: it only asks for 1/2 when the session
  // is not registered yet, and just reconnects when it already is.
  await connect();
}

main().catch((err) => {
  log.error(err.message, "index.js", err.stack);
  process.exit(1);
});
