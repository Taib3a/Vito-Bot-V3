// منشن شخصي بالبطاقات: بطاقة لكل عضو تحمل صورته واسمه ووسمًا حقيقيًا.
// داخل المجموعات فقط — لا يرسل شيئًا في الخاص.
import { log } from "../../Corleone/logger.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const DELAY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanJid(jid = "") {
  if (!jid) return "";
  const at = jid.lastIndexOf("@");
  if (at === -1) return jid.split(":")[0];
  return `${jid.slice(0, at).split(":")[0]}@${jid.slice(at + 1)}`;
}

const bare = (jid) => cleanJid(jid).split("@")[0];

export default {
  name: ["منشن-بطاقات", "بطاقات"],
  description: "منشن كل عضو ببطاقة تحمل صورته واسمه",
  category: "مجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, args, groupMeta, reply }) {
    if (!String(from).endsWith("@g.us")) return reply({ text: "👥 داخل المجموعات فقط." });

    const limit = Math.min(Math.max(parseInt(args[0], 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const meta = groupMeta || (await sock.groupMetadata(from));
    const members = (meta?.participants || []).slice(0, limit);
    if (!members.length) return reply({ text: "❌ لا يوجد أعضاء." });

    const failed = [];
    let sent = 0;

    for (const [i, p] of members.entries()) {
      const jid = cleanJid(p.id);
      if (!jid) continue;
      const name = p.name || p.notify || p.phoneNumber || bare(jid);
      const caption = `👤 *${name}*\n@${bare(jid)}`;

      try {
        let image;
        try {
          image = { url: await sock.profilePictureUrl(p.phoneNumber || jid, "image") };
        } catch {
          image = undefined;
        }
        await sock.sendMessage(
          from,
          image ? { image, caption, mentions: [jid] } : { text: caption, mentions: [jid] },
          i === 0 ? { quoted: msg } : {}
        );
        sent += 1;
      } catch (e) {
        failed.push(`${bare(jid)}: ${e.message}`);
      }
      if (i < members.length - 1) await sleep(DELAY_MS);
    }

    log.info(`بطاقات المنشن: ${sent}/${members.length} → ${from}`);
    if (failed.length) {
      await reply({ text: `⚠️ فشل ${failed.length}:\n${failed.slice(0, 5).join("\n")}` });
    }
  },
};
