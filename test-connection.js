/**
 * Standalone connection / pairing-code test.
 *
 * Verifies that a pairing code can be requested WITHOUT hitting the
 * Baileys 428 "Connection Closed" error. The 428 happens when
 * requestPairingCode() sends a node before the websocket is actually open.
 *
 * Usage:
 *   node test-connection.js                 # uses the test number below
 *   node test-connection.js 967735541558    # custom number
 *
 * The script uses an ISOLATED session folder under ./test-session so it
 * never touches the real session in database/sessions-taib.
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { rmSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = join(__dirname, "test-session");
const PHONE_NUMBER = process.argv[2] || "967735541558";
const CLOSE_AFTER_MS = 10_000;
const OPEN_TIMEOUT_MS = 15_000;
const DELAY_AFTER_CREATE_MS = Number(process.env.PAIRING_DELAY_MS ?? 0);

const started = Date.now();
const ts = () => `+${String(Date.now() - started).padStart(5, " ")}ms`;
const step = (msg) => console.log(`${ts()}  ${msg}`);

/** Wait until the underlying websocket reports open (or fail on timeout). */
function waitForSocketOpen(sock, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (sock.ws?.isOpen) return resolve(true);

    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (sock.ws?.isOpen) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error(`socket did not open within ${timeoutMs}ms`));
      }
    }, 100);
  });
}

async function main() {
  step(`test start — number=${PHONE_NUMBER}`);
  step(`using isolated session: ${SESSION_DIR}`);

  // WhatsApp drops web-client sessions from datacenter IPs. Printing the
  // egress IP makes that failure mode obvious instead of looking like a bug.
  try {
    const res = await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(4000) });
    const info = await res.json();
    step(`egress IP: ${info.ip} (${info.org || "unknown"}) — datacenter IPs may be rejected by WhatsApp`);
  } catch {
    step("egress IP: (could not determine)");
  }

  rmSync(SESSION_DIR, { recursive: true, force: true });
  mkdirSync(SESSION_DIR, { recursive: true });

  step("fetching latest Baileys version...");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  step(`Baileys protocol v${version.join(".")} (${isLatest ? "latest" : "current"})`);

  step("loading auth state...");
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  step("creating socket...");
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: process.env.BAILEYS_LOG || "silent" }),
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  let sawOpen = false;
  sock.ev.on("connection.update", (u) => {
    const err = u.lastDisconnect?.error;
    const code = err?.output?.statusCode;
    if (u.connection) step(`connection.update -> ${u.connection}${code ? ` (code ${code})` : ""}`);
    if (err) {
      step(`   error.message = ${err.message}`);
      step(`   error.output  = ${JSON.stringify(err.output || {})}`);
    }
    if (u.qr) step("received QR (ignored in pairing test)");
    if (u.connection === "open") sawOpen = true;
  });

  // Raw websocket diagnostics: the actual close code from the server.
  setTimeout(() => {
    const ws = sock.ws?.socket;
    if (ws && typeof ws.on === "function") {
      ws.on("close", (code, reason) => {
        step(`   RAW ws close -> code=${code} reason=${reason?.toString() || ""}`);
      });
    }
  }, 50);

  const registered = !!sock.authState?.creds?.registered;
  step(`creds.registered = ${registered}`);

  let pairingCode = null;

  if (registered) {
    step("session already registered — skipping pairing request");
  } else {
    step(`waiting for socket to open (timeout ${OPEN_TIMEOUT_MS}ms)...`);
    try {
      await waitForSocketOpen(sock, OPEN_TIMEOUT_MS);
      step("socket is OPEN");
    } catch (err) {
      step(`!! socket never opened: ${err.message}`);
    }

    step(`waiting ${DELAY_AFTER_CREATE_MS}ms before requesting pairing code...`);
    await new Promise((r) => setTimeout(r, DELAY_AFTER_CREATE_MS));

    // The server drops the socket within a few hundred ms, so the request can
    // lose the race. Retry a couple of times to show whether the flow can
    // succeed on this network at all.
    for (let attempt = 1; attempt <= 3 && !pairingCode; attempt++) {
      step(`sending pairing-code request for ${PHONE_NUMBER} (attempt ${attempt})...`);
      try {
        pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
        step(`✅ PAIRING CODE RECEIVED: ${pairingCode}`);
      } catch (err) {
        const code = err?.output?.statusCode;
        step(`❌ attempt ${attempt} FAILED: ${err.message}${code ? ` (statusCode ${code}${code === 428 ? " = connectionClosed" : ""})` : ""}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  step(`keeping connection alive for ${CLOSE_AFTER_MS}ms...`);
  await new Promise((r) => setTimeout(r, CLOSE_AFTER_MS));

  step("closing connection cleanly...");
  try {
    await sock.end(new Error("test complete"));
  } catch {
    // ignore close errors
  }
  rmSync(SESSION_DIR, { recursive: true, force: true });
  step("done");

  console.log("\n===== RESULT =====");
  console.log(`registered session : ${registered}`);
  console.log(`socket opened      : ${sawOpen || registered}`);
  console.log(`pairing code       : ${pairingCode ?? "(none)"}`);
  console.log(`428 error          : ${pairingCode === null && !registered ? "POSSIBLE" : "no"}`);
  console.log("==================\n");

  process.exit(pairingCode || registered ? 0 : 1);
}

main().catch((err) => {
  console.error(`${ts()}  FATAL: ${err.stack || err.message}`);
  process.exit(2);
});
