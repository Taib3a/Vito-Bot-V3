function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

export default {
  name: ["tagall", "todos", "invocar", "mentionall", "الكل", "منشن"],
  description: { es: "Mencionar a todos los participantes del grupo", ar: "يذكر جميع مشاركي المجموعة" },
  category: "grupos, المجموعات",
  adminOnly: true,
  groupOnly: true,

  async run({ sock, from, msg, text = "", args = [], reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      const mensaje = text.trim() || args.join(" ").trim();

      if (!mensaje) {
        return reply({
          text:
            tr(`⛧ Uso correcto:\n`, `⛧ الاستخدام الصحيح:\n`) +
            `> *tagall* reunioon!`,
        });
      }

      await react("💥");

      const metadata = await sock.groupMetadata(from);

      const participants = metadata.participants
        .map((p) => cleanJid(p.id))
        .filter(Boolean);

      const report = `⛧ *Invocación general*

*${mensaje}*

⛧ miembros › \`${participants.length}\`

${participants.map((jid) => `> @${jid.split("@")[0]}`).join("\n")}`;

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
        text: tr(`Failed`, `فشل`),
      });
    }
  },
};