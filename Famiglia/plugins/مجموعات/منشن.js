const pendingMentions = new Map();
const PENDING_TTL_MS = 5 * 60_000;

const TYPES = {
  "منشن-مشرفين": { admins: true, label: "المشرفين" },
  "منشن-أعضاء": { admins: false, label: "الأعضاء" },
};

function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];

  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

const isAdmin = (participant) =>
  participant?.admin === "admin" || participant?.admin === "superadmin";

function imageFor(kind) {
  const images = global.botImages || [];
  const index = kind === "admins" ? 0 : kind === "members" ? 1 : 2;
  return images[index] || images[0] || undefined;
}

async function sendMention({ sock, from, msg, text, onlyAdmins, image }) {
  const metadata = await sock.groupMetadata(from);
  const participants = (metadata.participants || [])
    .filter((p) => (onlyAdmins ? isAdmin(p) : !isAdmin(p)))
    .map((p) => cleanJid(p.id))
    .filter(Boolean);

  const label = onlyAdmins ? "المشرفين" : "الأعضاء";

  if (!participants.length) {
    return await sock.sendMessage(from, {
      text: `📢 لا يوجد ${label} لمنشنهم في هذه المجموعة.`,
    });
  }

  const report =
    `📢 *منشن ${label}*\n\n` +
    `*${text}*\n\n` +
    `👥 العدد › ${participants.length}\n\n` +
    participants.map((jid) => `> @${jid.split("@")[0]}`).join("\n");

  try {
    if (image) {
      await sock.sendMessage(
        from,
        { image: { url: image }, caption: report, mentions: participants },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        from,
        { text: report, mentions: participants },
        { quoted: msg }
      );
    }
  } catch {
    await sock.sendMessage(
      from,
      { text: report, mentions: participants },
      { quoted: msg }
    );
  }
}

export default {
  name: ["منشن", ...Object.keys(TYPES)],
  description: "منشن المشرفين أو الأعضاء مع صورة ورسالة",
  category: "المجموعات",
  adminOnly: true,
  groupOnly: true,

  async run({ sock, from, msg, sender, cmdName, text = "", args = [], reply, react }) {
    const pendingKey = `${from}:${sender || msg.key.participant || ""}`;

    if (TYPES[cmdName]) {
      const pending = pendingMentions.get(pendingKey);

      if (!pending || pending.expires < Date.now()) {
        pendingMentions.delete(pendingKey);
        return await reply({
          text: "📢 انتهت صلاحية الاختيار. اكتب `.منشن <الرسالة>` من جديد.",
        });
      }

      await react("📢");
      try {
        await sendMention({
          sock,
          from,
          msg,
          text: pending.text,
          onlyAdmins: TYPES[cmdName].admins,
          image: imageFor(TYPES[cmdName].admins ? "admins" : "members"),
        });
        pendingMentions.delete(pendingKey);
        await react("✅");
      } catch (e) {
        await react("❌");
        await reply({ text: `❌ تعذّر إرسال المنشن:\n${e.message}` });
      }
      return;
    }

    const message = text.trim() || args.join(" ").trim();

    if (!message) {
      return await reply({
        text: "📢 الاستخدام الصحيح:\n> *.منشن مرحباً بكم*",
      });
    }

    pendingMentions.set(pendingKey, { text: message, expires: Date.now() + PENDING_TTL_MS });

    const buttons = [
      { text: "👑 منشن المشرفين", id: ".منشن-مشرفين" },
      { text: "👥 منشن الأعضاء", id: ".منشن-أعضاء" },
    ];

    if (typeof sock.sendButtonMessage !== "function") {
      return await reply({
        text: "📢 اختر نوع المنشن:\n.منشن-مشرفين\n.منشن-أعضاء",
      });
    }

    return await sock.sendButtonMessage(
      from,
      `📢 *منشن*\n\n*${message}*\n\nاختر من تريد منشنهم:`,
      buttons,
      {
        footer: "المشرفون أو الأعضاء",
        quoted: msg,
        image: imageFor("prompt"),
      }
    );
  },
};
