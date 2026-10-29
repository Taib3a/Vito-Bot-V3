import { printBanner, log } from "./core/logger.js";
import { createConnection } from "./core/connection.js";
import { loadPlugins, watchPlugins } from "./core/pluginLoader.js";
import { launchAllSubbots, registerMainBot } from "./core/subbotManager.js";
import fs from "fs";
import path from "path";

/**
 * Silence the node:sqlite ExperimentalWarning.
 *
 * Node prints "SQLite is an experimental feature" on every run, which buries
 * the bot's own output in the console. Only that one warning is dropped —
 * everything else still reaches stderr.
 */
const originalEmit = process.emit;
process.emit = function (name, data, ...rest) {
  if (
    name === "warning" &&
    data?.name === "ExperimentalWarning" &&
    /SQLite/i.test(data?.message || "")
  ) {
    return false;
  }
  return originalEmit.call(process, name, data, ...rest);
};

// A rejected promise or a stray throw must never take the whole bot down.
process.on("uncaughtException", (err) => {
  log.error(`خطأ غير متوقع: ${err?.message}`, "index.js", err?.stack);
});
process.on("unhandledRejection", (reason) => {
  log.error(`وعد مرفوض غير معالج: ${reason?.message || reason}`, "index.js");
});

const tmpDir = path.resolve("./tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
process.env.TMPDIR = tmpDir;

for (const file of fs.readdirSync(tmpDir)) {
  try {
    fs.unlinkSync(path.join(tmpDir, file));
  } catch {}
}

setInterval(() => {
  if (!fs.existsSync(tmpDir)) return;
  for (const file of fs.readdirSync(tmpDir)) {
    try {
      const filePath = path.join(tmpDir, file);
      if (Date.now() - fs.statSync(filePath).mtimeMs > 3600000) fs.unlinkSync(filePath);
    } catch {}
  }
}, 6 * 60 * 60 * 1000);

async function main() {
  await printBanner();

  log.info("تحميل الإضافات...");
  await loadPlugins();
  watchPlugins();

  log.info("تشغيل البوت الرئيسي...");
  const sock = await createConnection({
    sessionDir: "./sessions/main",
    botLabel: "MAIN",
    isSubbot: false,
  });

  if (sock) {
    registerMainBot(sock, "MAIN");
    log.info("[MAIN] تم التسجيل في البوتات النشطة");
  }

  launchAllSubbots();
}

main().catch((e) => {
  log.error(`خطأ قاتل: ${e.message}`, "index.js", e.stack);
  process.exit(1);
});
