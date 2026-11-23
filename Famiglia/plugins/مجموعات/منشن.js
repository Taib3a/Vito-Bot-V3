function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

export default {
  name: ["منشن"],
  description: "يذكر جميع مشاركي المجموعة",
  category: "المجموعات",
  adminOnly: true,
  groupOnly: true,

  async run({ sock, from, msg, text = "", args = [], reply, react }) {

    try {
      const mensaje = text.trim() || args.join(" ").trim();

      if (!mensaje) {
        return reply({
          text:
            `📢 الاستخدام الصحيح:\n` +
            `> *.منشن مرحباً بكم*`,
        });
      }

      await react("💥");

      const metadata = await sock.groupMetadata(from);

      const participants = metadata.participants
        .map((p) => cleanJid(p.id))
        .filter(Boolean);

      const report = `📢 *منشن*\n\n*${mensaje}*\n\n👥 الأعضاء › ${participants.length}\n\n${participants.map((jid) => `> @${jid.split("@")[0]}`).join("\n")}`;

      await sock.sendMessage(
        from,
        {
          text: report,
          mentions: participants,
        },
        { quoted: msg }
      );

      await react("✅");
    } catch (e) {
      console.error(e);
      await react("❌");
      await reply({
        text: ( `فشل`),
      });
    }
  },
};