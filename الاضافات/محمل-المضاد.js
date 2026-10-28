import { readdirSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import log from "./الكونسل.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const ANTI_DIR = join(PROJECT_ROOT, "الاضافات", "مضاد");

export async function loadAntiFeatures() {
  const features = [];
  let entries;
  try {
    entries = readdirSync(ANTI_DIR).filter((f) => f.endsWith(".js"));
  } catch (err) {
    log.warn(`تعذّر قراءة مجلد الميزات المضادة: ${err.message}`);
    return features;
  }

  for (const file of entries) {
    try {
      const mod = await import(`file://${join(ANTI_DIR, file)}`);
      if (mod.default?.name) {
        features.push(mod.default);
      } else {
        log.warn(`الميزة المضادة ${relative(PROJECT_ROOT, join(ANTI_DIR, file))} لا تصدّر default بـ name.`);
      }
    } catch (err) {
      log.warn(`تعذّر تحميل الميزة المضادة ${relative(PROJECT_ROOT, join(ANTI_DIR, file))}: ${err.message}`);
    }
  }

  log.info(`Loaded ${features.length} anti-feature(s).`);
  return features;
}
