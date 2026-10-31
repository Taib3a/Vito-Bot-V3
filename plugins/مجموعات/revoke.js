export default {
  name: ["revokelink", "revocarlink", "resetlink", "تجديد-الرابط"],
  description: "Revoca el link actual del grupo y genera uno nuevo",
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      const code = await sock.groupRevokeInvite(from);
      const link = `https://chat.whatsapp.com/${code}`;

      await reply({
        text: tr(`🔄 *Link del grupo revocado*\n\nEl link anterior ya no funciona.\n\n🔗 *Nuevo link:*\n${link}`, `🔄 *تم تجديد رابط المجموعة*\n\nالرابط السابق لم يعد يعمل.\n\n🔗 *الرابط الجديد:*\n${link}`)
      });

    } catch (e) {
      await reply({
        text: tr("❌ No pude revocar el link del grupo.", "❌ لم أستطع تجديد رابط المجموعة.")
      });
    }
  }
};