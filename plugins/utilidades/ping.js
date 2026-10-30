export default {
  name: ["ping", "p", "بينغ", "سرعة"],
  description: "Mide la latencia del bot",
  category: "utils, الأدوات",
  ownerOnly: false,

  async run({ sock, from, msg, reply }) {
    const start = Date.now();

    const sent = await reply({ text: "🏓 `pong!`\n> ⏤͟͟͞͞⊱☕︎ *Ɩ⍺ƚᧉncı⍺:* midiendo..." });

    const latencia = Date.now() - start;

    await sock.sendMessage(from, {
      text: `🏓 \`pong!\`\n> ⏤͟͟͞͞⊱☕︎ *Ɩ⍺ƚᧉncı⍺:* ${latencia}ms`,
      edit: sent.key
    });
  },
};