/**
 * Crash-safety smoke test.
 *
 * Boots the real loaders and database in an isolated temp DB, then runs a
 * synthetic message through the handler. Exits non-zero on any crash, so CI
 * (or `npm test`) catches a regression without needing a WhatsApp session.
 *
 * Guards against unhandled rejections and uncaught exceptions too, which is
 * what a Segmentation Fault-free bot must never emit.
 */
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const tmp = mkdtempSync(join(tmpdir(), "vito-smoke-"));
process.env.BOT_DB_PATH = join(tmp, "smoke.db");

let crashes = 0;
process.on("uncaughtException", (err) => {
  crashes++;
  console.error("UNCAUGHT EXCEPTION:", err.message);
});
process.on("unhandledRejection", (err) => {
  crashes++;
  console.error("UNHANDLED REJECTION:", err?.message ?? err);
});

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

try {
  const { loadCommands } = await import("../الاضافات/المحمل.js");
  const { loadAntiFeatures } = await import("../الاضافات/محمل-المضاد.js");
  const db = await import("../database/db.js");
  const { handleMessage } = await import("../الاضافات/المعالج.js");

  const commands = await loadCommands();
  const antiFeatures = await loadAntiFeatures();
  check("commands load", Object.keys(commands).length > 0, `${Object.keys(commands).length} loaded`);
  check("anti-features load", antiFeatures.length > 0, `${antiFeatures.length} loaded`);

  // every command must expose name + execute
  const badCommands = Object.values(commands).filter(
    (c) => !c?.name || typeof c.execute !== "function"
  );
  check("commands well-formed", badCommands.length === 0, `${badCommands.length} invalid`);

  // database round-trip on the real prepared statements
  await db.registerGroup("123@g.us", "Smoke Group");
  await db.setGroupActive("123@g.us", true);
  const active = await db.isGroupActive("123@g.us");
  check("database round-trip", active === true, `isGroupActive=${active}`);

  await db.registerSubBot("967700000000", "/tmp/x", "ABCD1234");
  const sub = await db.getSubBot("967700000000");
  check("sub-bot round-trip", sub?.phone === "967700000000", `status=${sub?.status}`);

  // single-file SQLite auth state (replaces useMultiFileAuthState)
  const { useSQLiteAuthState } = await import("../الاضافات/الجلسة.js");
  const sessionDir = join(tmp, "session");
  const { state, saveCreds } = await useSQLiteAuthState(sessionDir);
  await state.keys.set({ "pre-key": { "1": { private: { type: "Buffer", data: [1, 2, 3] } } } });
  await saveCreds();
  const restored = await state.keys.get("pre-key", ["1"]);
  const restoredBytes = Buffer.isBuffer(restored["1"]?.private)
    ? [...restored["1"].private]
    : null;
  check(
    "session key round-trip",
    JSON.stringify(restoredBytes) === "[1,2,3]",
    `private=${JSON.stringify(restoredBytes)}`
  );
  check("session is one file", existsSync(join(sessionDir, "auth.db")), "auth.db written");

  // the connection module must point at a visible sessions/ folder at the root
  const { readFileSync } = await import("fs");
  const systemSrc = readFileSync(new URL("../الاضافات/النظام.js", import.meta.url), "utf8");
  check(
    "sessions live at ./sessions",
    /join\(__dirname, "\.\.", "sessions"\)/.test(systemSrc),
    "sessions/main/auth.db"
  );

  // drive a synthetic command message through the real handler
  const sent = [];
  const fakeSock = {
    sendMessage: async (jid, payload) => {
      sent.push({ jid, payload });
      return { key: { id: "smoke" } };
    },
    sendPresenceUpdate: async () => {},
    groupMetadata: async () => ({ participants: [] }),
    groupParticipantsUpdate: async () => {},
    user: { id: "1@s.whatsapp.net" },
  };
  const fakeMsg = {
    key: { remoteJid: "123@g.us", fromMe: false, id: "SMOKE1", participant: "9@s.whatsapp.net" },
    pushName: "Smoke",
    message: { conversation: ".ping" },
  };
  await handleMessage(fakeSock, fakeMsg);
  check("handler runs .ping", sent.length > 0, `${sent.length} reply(ies)`);
} catch (err) {
  check("boot", false, err.message);
}

await new Promise((r) => setTimeout(r, 300));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
console.log(`crashes: ${crashes}`);
rmSync(tmp, { recursive: true, force: true });

process.exit(failed === 0 && crashes === 0 ? 0 : 1);
