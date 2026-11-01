export default {
  name: ["linkgc", "gclink", "linkgroup", "رابط", "الرابط"],
  description: { es: "Obtiene el link del grupo", ar: "يحصل على رابط المجموعة" },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      const code = await sock.groupInviteCode(from);
      const link = `https://chat.whatsapp.com/${code}`;

      await reply({
        text: tr(`🔗 *Link del grupo:*\n${link}`, `🔗 *رابط المجموعة:*\n${link}`)
      });

    } catch (e) {
      await reply({
        text: tr("❌ No pude obtener el link del grupo.", "❌ لم أستطع الحصول على رابط المجموعة.")
      });
    }
  }
};