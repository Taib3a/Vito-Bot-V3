import { splitChannelInputs, fetchChannel } from "../../اضافات/قنوات-واتساب.js";

export default {
  name: ["معلومات-قناة", "فحص-قناة", "قناة-معلومات"],
  description: "يعرض معلومات قناة واتساب كاملة من رابطها",
  category: "أدوات",
  ownerOnly: false,

  async run({ sock, from, msg, sender, args, text, reply, react }) {
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

    const channels = [];
    const errors = [];
    let ok = 0;
    let fail = 0;

    for (const input of inputs) {
      try {
        const channel = await fetchChannel(sock, input);
        channels.push(channel);
        ok++;
      } catch (error) {
        console.error("[Channel Info]", input, error?.message || error);
        errors.push(`❌ *${input}:* تعذّر جلب المعلومات`);
        fail++;
      }
    }

    await react(ok ? (fail ? "⚠️" : "✅") : "❌");

    if (!channels.length) {
      return await reply({ text: errors.join("\n") });
    }

    const body = [
      ...channels.map(
        (channel) =>
          `📢 *معلومات القناة*\n\n` +
          `📛 *الاسم:* ${channel.name}\n` +
          `👥 *المشتركون:* ${channel.subscribers}\n` +
          `${channel.verification}\n` +
          `📝 *الوصف:* ${channel.description}`
      ),
      ...errors,
    ].join("\n\n");

    const buttons = channels.map((channel) => ({
      text: `🆔 ${channel.id}`,
      copy: channel.id,
    }));

    if (typeof sock.sendButtonMessage === "function") {
      try {
        await sock.sendButtonMessage(from, body, buttons, {
          title: "🆔 معلومات القناة",
          footer: "اضغط على الزر لنسخ المعرّف",
          quoted: msg,
          mentions: sender ? [sender] : [],
        });
        return;
      } catch (error) {
        console.error("[Channel Info] button send failed:", error?.message || error);
      }
    }

    return await reply({
      text:
        `${body}\n\n` +
        channels.map((channel) => `🆔 *المعرّف:* ${channel.id}`).join("\n"),
    });
  },
};
