import { splitChannelInputs, fetchChannel } from "../../اضافات/قنوات-واتساب.js";

export default {
  name: ["قناه", "قناة", "ايدي-قناة"],
  description: "يجلب معرّف قناة واتساب من رابط أو أكثر",
  category: "أدوات",
  ownerOnly: false,

  async run({ sock, from, msg, sender, args, text, reply, react }) {
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
        console.error("[Channel ID]", input, error?.message || error);
        errors.push(`❌ *${input}:* تعذّر جلب المعرّف`);
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
          `📢 *${channel.name}*\n👥 *المشتركون:* ${channel.subscribers}`
      ),
      ...errors,
    ].join("\n\n");

    await reply({ text: body });

    const buttons = channels.map((channel) => ({
      text: `🆔 ${channel.id}`,
      copy: channel.id,
    }));

    if (typeof sock.sendButtonMessage === "function") {
      try {
        await sock.sendButtonMessage(from, "\u200B", buttons, {
          title: "",
          footer: "",
          quoted: msg,
          mentions: sender ? [sender] : [],
        });
        return;
      } catch (error) {
        console.error("[Channel ID] button send failed:", error?.message || error);
      }
    }

    await reply({
      text: channels.map((channel) => `🆔 *المعرّف:* ${channel.id}`).join("\n"),
    });
  },
};
