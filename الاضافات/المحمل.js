import { readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

async function loadFromDir(dir, commands) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      await loadFromDir(fullPath, commands);
    } else if (entry.endsWith(".js")) {
      try {
        const mod = await import(`file://${fullPath}`);
        if (mod.default?.name && typeof mod.default.execute === "function") {
          commands[mod.default.name] = mod.default;
        }
        for (const key of Object.keys(mod)) {
          if (key === "default") continue;
          const cmd = mod[key];
          if (cmd?.name && typeof cmd.execute === "function") {
            commands[cmd.name] = cmd;
          }
        }
      } catch {
        // skip broken modules
      }
    }
  }
}

export async function loadCommands() {
  const commands = {};
  await loadFromDir(join(PROJECT_ROOT, "الاوامر"), commands);
  await loadFromDir(join(PROJECT_ROOT, "plugins"), commands);
  return commands;
}

export async function loadAntiFeatures() {
  const features = [];
  const dir = join(PROJECT_ROOT, "الاضافات", "مضاد");
  let entries;
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".js"));
  } catch {
    return features;
  }

  for (const file of entries) {
    try {
      const mod = await import(`file://${join(dir, file)}`);
      if (mod.default?.name) {
        features.push(mod.default);
      }
    } catch {
      // skip
    }
  }
  return features;
}
