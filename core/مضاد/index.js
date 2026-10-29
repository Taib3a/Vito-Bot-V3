import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { log } from "../logger.js";
import { db } from "../../database/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** كل ملف .js في core/مضاد/ (عدا هذا الملف) هو مضاد مستقل. */
async function loadModules() {
  const modules = [];

  let files;
  try {
    files = readdirSync(__dirname).filter((f) => f.endsWith(".js") && f !== "index.js");
  } catch (e) {
    log.warn(`تعذّر قراءة مجلد المضادات: ${e.message}`);
    return modules;
  }

  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(join(__dirname, file)).href);
      if (!mod.default?.name) {
        log.warn(`المضاد ${file} لا يصدّر default بـ name.`);
        continue;
      }
      modules.push(mod.default);
    } catch (e) {
      log.warn(`تعذّر تحميل المضاد ${file}: ${e.message}`);
    }
  }

  return modules;
}

const modules = await loadModules();

function cleanJid(jid = "") {
  if (!jid) return "";
  const at = jid.lastIndexOf("@");
  if (at === -1) return jid.split(":")[0];
  return `${jid.slice(0, at).split(":")[0]}@${jid.slice(at + 1)}`;
}

/** هل البوت مشرف في هذه المجموعة؟ */
async function isBotAdminIn(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const bot = cleanJid(sock.user?.id || "");
    const botNum = bot.split("@")[0];
    const p = meta?.participants?.find((x) => {
      const id = cleanJid(x.id || "");
      return id === bot || id.split("@")[0] === botNum;
    });
    return p?.admin === "admin" || p?.admin === "superadmin";
  } catch {
    return false;
  }
}

/**
 * يمرّر الرسالة على كل مضاد مفعّل في المجموعة.
 * يعيد true إذا تعامل أحدها مع الرسالة (فلا تُعالج كأمر).
 */
export async function runAntifeatures({ sock, msg, from, sender, body, isBotAdmin, botLabel }) {
  const groupData = db.getGroup(from);

  for (const mod of modules) {
    if (!mod.check) continue;
    if (mod.flag && !groupData?.[mod.flag]) continue;

    try {
      const handled = await mod.check({ sock, msg, from, sender, body, isBotAdmin, botLabel });
      if (handled) return true;
    } catch (e) {
      log.error(`خطأ في ${mod.name}: ${e.message}`);
    }
  }

  return false;
}

/**
 * يربط أحداث الدخول والخروج بكل مضاد يملك onJoin/onLeave.
 * كل معالج معزول بـ try/catch حتى لا يُسقط خطأ واحد البوت.
 */
export function registerAntifeatures(sock, botLabel = "MAIN") {
  sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
    if (!id?.endsWith("@g.us") || !Array.isArray(participants)) return;

    try {
      const groupData = db.getGroup(id);
      const isBotAdmin = await isBotAdminIn(sock, id);

      for (const mod of modules) {
        if (mod.flag && !groupData?.[mod.flag]) continue;

        const fn = action === "add" ? mod.onJoin : action === "remove" ? mod.onLeave : null;
        if (!fn) continue;

        try {
          await fn({ sock, groupJid: id, participants, isBotAdmin, botLabel });
        } catch (e) {
          log.error(`خطأ في ${mod.name}: ${e.message}`);
        }
      }
    } catch (e) {
      log.error(`[${botLabel}] خطأ في حدث المشاركين: ${e.message}`);
    }
  });

  log.info(`[${botLabel}] المضادات مُفعّلة: ${modules.map((m) => m.name).join("، ")}`);
}

/** سجل المضادات: يُستخدم بواسطة أمر التحكم الواحد في plugins/. */
export const antifeatures = modules.map((m) => ({ name: m.name, flag: m.flag }));
export const antifeatureNames = modules.map((m) => m.name);
