import { splitChannelInputs, fetchChannel } from "../../اضافات/قنوات-واتساب.js";

export default {
  name: ["معلومات-قناة", "فحص-قناة", "قناة-معلومات"],
  description: "يعرض معلومات قناة واتساب كاملة من رابطها",
  category: "أدوات",
  ownerOnly: false,

  async run({ sock, args, text, reply, react }) {
    const inputs = splitChannelInputs(text || args.join(" "));

    if (!inputs.length) {
      return await reply({
        text: "📢 *معلومات القناة*\n\nالاستخدام:\n`.معلومات-قناة https://whatsapp.com/channel/XXXX`\n\nيمكنك إرسال أكثر من رابط مفصولاً بمسافة.",
      });
    }

    if (typeof sock.newsletterMetadata !== "function") {
      return await reply({ text: "❌ جلب معلومات القنوات غير متاح في هذا الاتصال." });
    }

    await react("⏳");

    const lines = [];
    let ok = 0;
    let fail = 0;

    for (const input of inputs) {
      try {
        const channel = await fetchChannel(sock, input);
        lines.push(
          `📢 *معلومات القناة*\n\n` +
            `🆔 *المعرّف:* ${channel.id}\n` +
            `📛 *الاسم:* ${channel.name}\n` +
            `👥 *المشتركون:* ${channel.subscribers}\n` +
            `${channel.verification}\n` +
            `📝 *الوصف:* ${channel.description}`
        );
        ok++;
      } catch (error) {
        console.error("[Channel Info]", input, error?.message || error);
        lines.push(`❌ *${input}:* تعذّر جلب المعلومات`);
        fail++;
      }
    }

    await react(ok ? (fail ? "⚠️" : "✅") : "❌");
    return await reply({ text: lines.join("\n\n") });
  },
};
