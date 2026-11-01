const DURATIONS = {
  off: 0,
  "24h": 86400,
  "7d": 604800,
  "90d": 7776000
};

export default {
  name: ["efimero", "temporal", "مؤقت"],
  description: { es: "Configura la duración de mensajes temporales del grupo", ar: "يضبط مدة الرسائل المؤقتة في المجموعة" },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, args, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const opcion = args[0]?.toLowerCase();

    if (!DURATIONS.hasOwnProperty(opcion)) {
      return await reply({
        text: tr("『⏳』*Uso:* .efimero off/24h/7d/90d\n\n*Ejemplo:* .efimero 7d", "『⏳』*الاستخدام:* .efimero off/24h/7d/90d\n\n*مثال:* .efimero 7d")
      });
    }

    try {
      await sock.groupToggleEphemeral(from, DURATIONS[opcion]);
      await reply({
        text: opcion === "off"
          ? "『⏳』Mensajes temporales desactivados."
          : `『⏳』Mensajes temporales activados: ${opcion}.`
      });
    } catch (e) {
      await reply({ text: tr(`❌ No se pudo cambiar:\n${e.message}`, `❌ تعذّر التغيير:\n${e.message}`) });
    }
  }
};