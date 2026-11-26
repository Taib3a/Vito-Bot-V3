import { log } from "../../logger.js";
import config from "../../settings.js";
import { db } from "../../../database/db.js";
import { addWarning, clearWarnings, MAX_WARNINGS } from "../../warnings.js";

const linkRegex = /(?:^|[\s/])(?:chat\.whatsapp\.com\/[0-9A-Za-z]{20,24}|(?:www\.|web\.)?whatsapp\.com\/channel\/[0-9A-Za-z]{10,30})(?:[\s?]|$)/i;

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];

export function hasWhatsappLink(text = "") {
  return linkRegex.test(text);
}

function ownerNumbers() {
  return [config.ownerNumber, config.coOwners]
    .flat()
    .filter(Boolean)
    .map((n) => numOf(String(n)));
}

/** هل المرسل أحد البوتات النشطة (الرئيسي أو الفرعي)؟ */
function isActiveBot(sender) {
  const num = numOf(sender);
  if (!num) return false;
  const main = String(global.mainBotNum || "");
  if (main && num === main) return true;
  for (const b of global.activeBots?.values?.() || []) {
    if (numOf(b?.jid) === num) return true;
  }
  return false;
}

/** فحص مباشر من بيانات المجموعة: قد تكون isAdmin غير محسوبة للمرسل. */
async function isGroupAdminNow(sock, groupJid, sender) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const num = numOf(sender);
    const p = meta?.participants?.find((x) =>
      numOf(x.id) === num || numOf(x.lid) === num || numOf(x.phoneNumber) === num
    );
    return p?.admin === "admin" || p?.admin === "superadmin";
  } catch {
    return false;
  }
}

export default {
  name: "مضاد-روابط",
  flag: "antilink",

  // ثلاث تحذيرات (يحذف الرسالة في كل مرة)، ثم طرد.
  async check({ sock, msg, from, sender, body, isBotAdmin, isAdmin, isOwner, isMod, botLabel }) {
    if (!hasWhatsappLink(body)) return false;

    // استثناءات: البوت نفسه، المالك، مشرف المجموعة، عائلة الإشراف.
    if (numOf(sender) === numOf(sock.user?.id)) return false;
    if (isOwner || isAdmin || isMod) return false;
    if (ownerNumbers().includes(numOf(sender))) return false;
    if (db.hasRole(sender, "mod") || db.hasRole(numOf(sender), "mod")) return false;
    if (isActiveBot(sender)) return false;
    if (await isGroupAdminNow(sock, from, sender)) return false;

    const user = numOf(sender);

    try {
      await sock.sendMessage(from, {
        delete: { remoteJid: from, id: msg.key.id, participant: sender, fromMe: false },
      });
    } catch (e) {
      log.warn(`مضاد الروابط: تعذّر الحذف (${e.message})`);
    }

    const count = addWarning("antilink", from, sender);

    try {
      if (count < MAX_WARNINGS) {
        await sock.sendMessage(from, {
          text: `⚠️ *تحذير ${count}/${MAX_WARNINGS}*\n> @${user} يُمنع نشر روابط المجموعات.`,
          mentions: [sender],
        });
        log.cmdExec({ cmdName: "antilink-warn", sender: user, botLabel });
        return true;
      }

      clearWarnings("antilink", from, sender);

      if (isBotAdmin) {
        await sock.groupParticipantsUpdate(from, [sender], "remove");
        await sock.sendMessage(from, {
          text: `🚫 *مضاد الروابط*\n> استُنفدت التحذيرات (${MAX_WARNINGS})، وطُرد @${user}.`,
          mentions: [sender],
        });
        log.cmdExec({ cmdName: "antilink-kick", sender: user, botLabel });
      } else {
        await sock.sendMessage(from, {
          text: `⚠️ *مضاد الروابط*\n> استُنفدت التحذيرات (${MAX_WARNINGS}) لـ @${user}، لكنني لست مشرفاً لطرده.`,
          mentions: [sender],
        });
      }
    } catch (e) {
      log.error(`مضاد الروابط: ${e.message}`);
    }

    return true;
  },
};
