import { proto } from "@whiskeysockets/baileys";
import { log } from "../../logger.js";
import config from "../../settings.js";
import { db } from "../../../database/db.js";
import { addWarning, clearWarnings, MAX_WARNINGS } from "../../warnings.js";

const statusLinkRegex = /(?:^|[\s/])(?:(?:www\.|web\.)?whatsapp\.com\/(?:stories|status)\/|wa\.me\/stories\/)/i;

const WRAPPERS = [
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "ephemeralMessage",
  "documentWithCaptionMessage",
  "editedMessage",
  "futureProofMessage",
];

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];

/** يفتح الأغلفة (عرض مرة واحدة، مؤقّت، تعديل...) للوصول إلى الرسالة الفعلية. */
function unwrap(message) {
  let current = message || {};
  for (let depth = 0; depth < WRAPPERS.length; depth++) {
    const wrapper = WRAPPERS.find((type) => current?.[type]?.message);
    if (!wrapper) break;
    current = current[wrapper].message;
  }
  return current;
}

/** إشارة الحالة: عند ذكر المجموعة في ستوري، يصل حقل خاص لا نص له. */
export function isStatusMention(msg) {
  const raw = msg?.message || {};
  const inner = unwrap(raw);

  for (const message of [raw, inner]) {
    if (message?.groupStatusMentionMessage || message?.statusMentionMessage) return true;
  }

  // نسخة أقدم/أحدث قد تغلّف الإشارة داخل protocolMessage.
  for (const message of [raw, inner]) {
    const protocol = message?.protocolMessage;
    if (!protocol) continue;
    if (protocol.type === proto.Message.ProtocolMessage.Type.STATUS_MENTION_MESSAGE) return true;
    const nested = unwrap(protocol.message);
    if (nested?.groupStatusMentionMessage || nested?.statusMentionMessage) return true;
  }

  return false;
}

export function hasStatusLink(text = "") {
  return statusLinkRegex.test(String(text));
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
  if (String(global.mainBotNum || "") === num) return true;
  for (const bot of global.activeBots?.values?.() || []) {
    if (numOf(bot?.jid) === num) return true;
  }
  return false;
}

/** فحص مباشر من بيانات المجموعة: قد تكون isAdmin غير محسوبة للمرسل. */
async function isGroupAdminNow(sock, groupJid, sender) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const num = numOf(sender);
    const participant = meta?.participants?.find((p) =>
      numOf(p.id) === num || numOf(p.lid) === num || numOf(p.phoneNumber) === num
    );
    return participant?.admin === "admin" || participant?.admin === "superadmin";
  } catch {
    return false;
  }
}

export default {
  name: "مضاد-حالات",
  flag: "antistatus",

  // مثل مضاد الروابط: حذف الرسالة في كل مرة، وتحذير، ثم طرد بعد استنفاد التحذيرات.
  async check({ sock, msg, from, sender, body, isBotAdmin, isAdmin, isOwner, isMod, botLabel }) {
    if (!isStatusMention(msg) && !hasStatusLink(body)) return false;

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
      log.warn(`مضاد الحالات: تعذّر الحذف (${e.message})`);
    }

    const count = addWarning("antistatus", from, sender);

    try {
      if (count < MAX_WARNINGS) {
        await sock.sendMessage(from, {
          text: `⚠️ *تحذير ${count}/${MAX_WARNINGS}*\n> @${user} يُمنع ذكر المجموعة في الحالات (الستوري) أو نشر روابطها.`,
          mentions: [sender],
        });
        log.cmdExec({ cmdName: "antistatus-warn", sender: user, botLabel });
        return true;
      }

      clearWarnings("antistatus", from, sender);

      if (isBotAdmin) {
        await sock.groupParticipantsUpdate(from, [sender], "remove");
        await sock.sendMessage(from, {
          text: `🚫 *مضاد الحالات*\n> استُنفدت التحذيرات (${MAX_WARNINGS})، وطُرد @${user} لذكره المجموعة في حالته.`,
          mentions: [sender],
        });
        log.cmdExec({ cmdName: "antistatus-kick", sender: user, botLabel });
      } else {
        await sock.sendMessage(from, {
          text: `⚠️ *مضاد الحالات*\n> استُنفدت التحذيرات (${MAX_WARNINGS}) لـ @${user}، لكنني لست مشرفاً لطرده.`,
          mentions: [sender],
        });
      }
    } catch (e) {
      log.error(`مضاد الحالات: ${e.message}`);
    }

    return true;
  },
};
