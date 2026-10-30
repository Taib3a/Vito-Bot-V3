export default {
  name: ["linkgc", "gclink", "linkgroup", "رابط", "الرابط"],
  description: "Obtiene el link del grupo",
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, reply }) {
    try {
      const code = await sock.groupInviteCode(from);
      const link = `https://chat.whatsapp.com/${code}`;

      await reply({
        text: `🔗 *Link del grupo:*\n${link}`
      });

    } catch (e) {
      await reply({
        text: "❌ No pude obtener el link del grupo."
      });
    }
  }
};