import { readdirSync, watch, existsSync, statSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { log } from "./logger.js";
import { ARABIC_ALIASES } from "./aliases.js";

const plugins = new Map();
const PLUGINS_DIR = path.resolve("./plugins");
const watchTimers = new Map();
const dynamicPrefixes = [];

export async function loadPlugins() {
  plugins.clear();
  dynamicPrefixes.length = 0;
  await loadDir(PLUGINS_DIR);
  registerArabicAliases();

  // Count unique plugins, not aliases: a command with two names would
  // otherwise be reported twice.
  const unique = new Set(plugins.values());
  log.ok(`تم تحميل الإضافات: ${unique.size} أمر (${plugins.size} اسم)`);
}

/**
 * Point each Arabic alias at the same plugin object as its canonical name.
 * An alias whose target is missing is skipped rather than registered as a
 * dead command, so `menu` never advertises something that cannot run.
 */
function registerArabicAliases() {
  let added = 0;
  for (const [alias, canonical] of Object.entries(ARABIC_ALIASES)) {
    const plugin = plugins.get(String(canonical).toLowerCase());
    if (!plugin) continue;
    if (!plugins.has(alias)) added++;
    plugins.set(alias, plugin);
  }
  if (added > 0) log.info(`أُضيف ${added} اسم أمر بالعربية`);
}

async function loadDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const tasks = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tasks.push(loadDir(full));
    else if (entry.name.endsWith(".js")) tasks.push(loadPlugin(full));
  }
  await Promise.all(tasks);
}

async function loadPlugin(filePath) {
  try {
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) return;

    // Cache-busting query so a hot-reloaded file is re-imported.
    const url = pathToFileURL(filePath).href + `?t=${Date.now()}`;
    const mod = await import(url);

    if (!mod.default?.name || !mod.default?.run) {
      log.warn(`إضافة بلا بنية صحيحة: ${filePath}`);
      return;
    }

    for (const [key, val] of plugins.entries()) {
      if (val === mod.default) plugins.delete(key);
    }

    const names = Array.isArray(mod.default.name) ? mod.default.name : [mod.default.name];
    for (const n of names) plugins.set(String(n).toLowerCase(), mod.default);

    // A plugin may own a whole id namespace: a button click sends back
    // "say_woody", which is not a declared name but belongs to "say".
    const prefixes = Array.isArray(mod.default.dynamicPrefixes) ? mod.default.dynamicPrefixes : [];
    for (const p of prefixes) dynamicPrefixes.push({ prefix: String(p).toLowerCase(), plugin: mod.default });
  } catch (e) {
    log.error(`خطأ في تحميل ${filePath}: ${e.message}`);
  }
}

export function watchPlugins() {
  try {
    watch(PLUGINS_DIR, { recursive: true }, (event, filename) => {
      if (!filename || !filename.endsWith(".js")) return;

      const fullPath = path.resolve(PLUGINS_DIR, filename);
      if (watchTimers.has(fullPath)) clearTimeout(watchTimers.get(fullPath));

      const timer = setTimeout(async () => {
        watchTimers.delete(fullPath);
        if (!existsSync(fullPath)) {
          log.info(`حُذفت إضافة: ${filename}`);
          await loadPlugins();
          return;
        }
        log.info(`تحديث إضافة: ${filename}`);
        await loadPlugin(fullPath);
      }, 150);

      watchTimers.set(fullPath, timer);
    });
    log.info("التحديث المباشر للإضافات مُفعّل");
  } catch (e) {
    // Recursive watch is not available on every platform — not fatal.
    log.warn(`تعذّر تفعيل التحديث المباشر: ${e.message}`);
  }
}

export function getPlugins() {
  return plugins;
}

/**
 * Resolve a command name, falling back to a plugin's dynamic id namespace.
 * Returns undefined when nothing owns the name.
 */
export function findPlugin(name) {
  const key = String(name || "").toLowerCase();
  const direct = plugins.get(key);
  if (direct) return direct;

  // Longest prefix wins, so "say-buttons" beats "say".
  let best = null;
  for (const { prefix, plugin } of dynamicPrefixes) {
    if (key.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
      best = { prefix, plugin };
    }
  }
  return best?.plugin;
}
