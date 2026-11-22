const CHANNEL_LINK_RE =
  /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([0-9A-Za-z_-]+)/i;
const NEWSLETTER_JID_RE = /^(\d+)@newsletter$/i;

export default {
  name: ["قناه", "قناة", "ايدي-قناة"],
  description: "يجلب معرّف قناة واتساب من رابط القناة",
  category: "أدوات",
  ownerOnly: false,

  async run({ sock, args, text, reply, react }) {
    const input = String(text || args.join(" ") || "").trim();

    if (!input) {
      return await reply({
        text: "📢 *معرّف القناة*\n\nالاستخدام:\n`.قناه https://whatsapp.com/channel/XXXX`",
      });
    }

    const direct = input.match(NEWSLETTER_JID_RE)?.[1];
    if (direct) {
      return await reply({ text: `🆔 *المعرّف:* ${direct}@newsletter` });
    }

    const invite = input.match(CHANNEL_LINK_RE)?.[1];
    if (!invite) {
      return await reply({ text: "❌ أرسل رابط قناة واتساب صالحاً." });
    }

    if (typeof sock.newsletterMetadata !== "function") {
      return await reply({ text: "❌ جلب معلومات القنوات غير متاح في هذا الاتصال." });
    }

    await react("⏳");

    try {
      const info = await sock.newsletterMetadata("invite", invite);
      const id = info?.id;
      if (!id) throw new Error("لم يُرجع واتساب معرّف القناة");

      const meta = info.thread_metadata || info.threadMetadata || {};
      const name = meta.name?.text || meta.name || "غير معروف";
      const subscribers =
        meta.subscribers_count ?? meta.subscribersCount ?? "غير متاح";

      await react("✅");
      return await reply({
        text:
          `📢 *معلومات القناة*\n\n` +
          `🆔 *المعرّف:* ${id}\n` +
          `📛 *الاسم:* ${name}\n` +
          `👥 *المشتركون:* ${subscribers}`,
      });
    } catch (error) {
      console.error("[Channel ID]", error?.message || error);
      await react("❌");
      return await reply({ text: "❌ تعذّر جلب معرّف القناة. تحقق من الرابط." });
    }
  },
};
