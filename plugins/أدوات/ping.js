export default {
  name: ["ping", "p", "بينغ", "سرعة"],
  description: "Mide la latencia del bot",
  category: "utils, الأدوات",
  ownerOnly: false,

  async run({ sock, from, msg, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const start = Date.now();

    const sent = await reply({ text: tr("🏓 `pong!`\n> ⏤͟͟͞͞⊱☕︎ *Ɩ⍺ƚᧉncı⍺:* midiendo...", "🏓 `pong!`\n> ⏤͟͟͞͞⊱☕︎ *زمن الاستجابة:* جارٍ القياس...") });

    const latencia = Date.now() - start;

    await sock.sendMessage(from, {
      text: `🏓 \`pong!\`\n> ⏤͟͟͞͞⊱☕︎ *Ɩ⍺ƚᧉncı⍺:* ${latencia}ms`,
      edit: sent.key
    });
  },
};