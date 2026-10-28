import { readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import log from "./الكونسل.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const COMMANDS_DIR = join(PROJECT_ROOT, "الاوامر");

function isValidCommand(mod) {
  return mod?.name && typeof mod.execute === "function";
}

async function loadFromDir(dir, commands) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    log.warn(`تعذّر قراءة مجلد الأوامر ${relative(PROJECT_ROOT, dir)}: ${err.message}`);
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let st;
    try {
      st = statSync(fullPath);
    } catch (err) {
      log.warn(`تعذّر قراءة ${relative(PROJECT_ROOT, fullPath)}: ${err.message}`);
      continue;
    }

    if (st.isDirectory()) {
      await loadFromDir(fullPath, commands);
      continue;
    }

    if (!entry.endsWith(".js")) continue;

    let mod;
    try {
      mod = await import(`file://${fullPath}`);
    } catch (err) {
      log.warn(`تعذّر تحميل الأمر ${relative(PROJECT_ROOT, fullPath)}: ${err.message}`);
      continue;
    }

    let loaded = 0;
    if (isValidCommand(mod.default)) {
      commands[mod.default.name] = mod.default;
      loaded++;
    }
    for (const key of Object.keys(mod)) {
      if (key === "default") continue;
      if (isValidCommand(mod[key])) {
        commands[mod[key].name] = mod[key];
        loaded++;
      }
    }

    if (loaded === 0) {
      log.warn(`الملف ${relative(PROJECT_ROOT, fullPath)} لا يصدّر أي أمر صالح (name + execute).`);
    }
  }
}

export async function loadCommands() {
  const commands = {};
  await loadFromDir(COMMANDS_DIR, commands);
  log.info(`Loaded ${Object.keys(commands).length} command(s) from ${relative(PROJECT_ROOT, COMMANDS_DIR)}.`);
  return commands;
}
