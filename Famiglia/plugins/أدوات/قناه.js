import { splitChannelInputs, fetchChannel } from "../../اضافات/قنوات-واتساب.js";

export default {
  name: ["قناه", "قناة", "ايدي-قناة"],
  description: "يجلب معرّف قناة واتساب من رابط أو أكثر",
  category: "أدوات",
  ownerOnly: false,

  async run({ sock, args, text, reply, react }) {
    const inputs = splitChannelInputs(text || args.join(" "));

    if (!inputs.length) {
      return await reply({
        text: "📢 *معرّف القناة*\n\nالاستخدام:\n`.قناه https://whatsapp.com/channel/XXXX`\n\nيمكنك إرسال أكثر من رابط مفصولاً بمسافة.",
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
          `📢 *${channel.name}*\n` +
            `🆔 *المعرّف:* ${channel.id}\n` +
            `👥 *المشتركون:* ${channel.subscribers}`
        );
        ok++;
      } catch (error) {
        console.error("[Channel ID]", input, error?.message || error);
        lines.push(`❌ *${input}:* تعذّر جلب المعرّف`);
        fail++;
      }
    }

    await react(ok ? (fail ? "⚠️" : "✅") : "❌");
    return await reply({ text: lines.join("\n\n") });
  },
};
