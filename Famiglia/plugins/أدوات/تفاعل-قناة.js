import axios from "axios";
import { broadcastReaccionCanal } from "../../Corleone/subbotManager.js";

const REACTION_API =
  process.env.REACTION_API_URL ||
  "https://api.makluxnxx.my.id/v1/tools/whatsapp-react";
const CHANNEL_LINK_RE = /whatsapp\.com\/channel\/([0-9A-Za-z]+)\/(\d+)/i;
const COUNTS = ["50", "100"];
const REACTIONS = [
  { emoji: "❤️", label: "❤️ حب" },
  { emoji: "🔥", label: "🔥 نار" },
  { emoji: "👍", label: "👍 إعجاب" },
  { emoji: "😂", label: "😂 ضحك" },
  { emoji: "😮", label: "😮 انبهار" },
  { emoji: "😢", label: "😢 حزن" },
  { emoji: "🎉", label: "🎉 احتفال" },
  { emoji: "💯", label: "💯 مئة" },
];

function decode(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function encode(value) {
  return encodeURIComponent(value || "");
}

function buttonId(prefix, ...parts) {
  return `${prefix}تفاعل-قناة ${parts.join(" ")}`;
}

function parseLink(link) {
  return String(link || "").match(CHANNEL_LINK_RE);
}

async function sendPanel(ctx, text, buttons = [], sections = [], selectLabel = "", opts = {}) {
  const { sock, from, msg, sender, reply } = ctx;

  if (typeof sock.sendButtonMessage === "function") {
    try {
      await sock.sendButtonMessage(from, text, buttons, {
        title: opts.title ?? "تفاعل القناة",
        footer: opts.footer ?? "اختر عدد التفاعلات ثم نوعها",
        quoted: msg,
        mentions: sender ? [sender] : [],
        sections,
        selectLabel,
      });
      return true;
    } catch (error) {
      console.error("[تفاعل-قناة] button send failed:", error?.message || error);
    }
  }

  const lines = [text];
  if (buttons.length) lines.push("", ...buttons.map((button) => `• ${button.text}`));
  for (const section of sections) {
    lines.push("", `*${section.title}*`);
    for (const row of section.rows) lines.push(`• ${row.title}`);
  }
  await reply({ text: lines.join("\n") });
  return false;
}

async function showStart(ctx, link, prefix) {
  await ctx.reply({ text: `📢 *تفاعل القناة*\n\n🔗 ${link}` });
  await sendPanel(
    ctx,
    "\u200B",
    [{ text: "📊 عرض النتيجة", id: buttonId(prefix, "result", encode(link)) }],
    [],
    "",
    { title: "", footer: "" }
  );
}

async function showCounts(ctx, link, prefix) {
  if (!parseLink(link)) {
    return ctx.reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }

  await sendPanel(
    ctx,
    `📊 *اختر عدد التفاعلات*\n\n🔗 ${link}`,
    [
      { text: "50 تفاعل", id: buttonId(prefix, "count", encode(link), "50") },
      { text: "100 تفاعل", id: buttonId(prefix, "count", encode(link), "100") },
    ],
    [],
    "",
    { title: "عدد التفاعلات", footer: "اختر 50 أو 100" }
  );
}

async function showReactions(ctx, link, count, prefix) {
  if (!parseLink(link)) {
    return ctx.reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }
  if (!COUNTS.includes(String(count))) {
    return ctx.reply({ text: "❌ اختر 50 أو 100." });
  }

  const rows = REACTIONS.map((reaction) => ({
    title: reaction.label,
    description: `${count} تفاعل`,
    id: buttonId(prefix, "send", encode(link), count, reaction.emoji),
  }));

  await sendPanel(
    ctx,
    `🎨 *اختر نوع التفاعل*\n\n🔗 ${link}\n📊 *العدد:* ${count}`,
    [],
    [{ title: "نوع التفاعل", rows }],
    "🎨 اختر نوع التفاعل",
    { title: "نوع التفاعل", footer: "اختر نوعاً واحداً" }
  );
}

async function callReactionApi(link, emoji, count) {
  const { data } = await axios.get(REACTION_API, {
    params: { link, emoji, count },
    timeout: 45000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!data || (data.status !== true && data.status !== "true")) {
    throw new Error(data?.message || "فشل طلب التفاعل");
  }

  return data.result || {};
}

async function localReaction(sock, link, emoji, limit) {
  const match = parseLink(link);
  if (!match) throw new Error("رابط غير صالح");

  const [, invite, serverId] = match;
  const meta = await sock.newsletterMetadata("invite", invite);
  const canalJid = meta?.id;
  if (!canalJid) throw new Error("تعذّر العثور على القناة");

  const result = await broadcastReaccionCanal({
    canalJid,
    serverId,
    emoji,
    ventanaMs: 5000,
    limit,
  });

  if (!result.ok) throw new Error("لم يتفاعل أي بوت");
  return result;
}

async function runSend(ctx, link, count, emoji) {
  const { sock, reply, react } = ctx;

  if (!parseLink(link)) {
    return reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }
  if (!COUNTS.includes(String(count))) {
    return reply({ text: "❌ اختر 50 أو 100." });
  }
  if (!emoji) {
    return reply({ text: "❌ اختر نوع التفاعل." });
  }

  await react("⏳");

  let apiError;
  try {
    const result = await callReactionApi(link, emoji, count);
    await react("✅");

    const state = result.status === "queued" ? "⏳ في قائمة الانتظار" : "✅ مكتمل";
    return reply({
      text:
        `✅ *تم إرسال التفاعلات*\n\n` +
        `🔗 *الرابط:* ${link}\n` +
        `😊 *التفاعل:* ${emoji}\n` +
        `📊 *العدد:* ${count}\n` +
        `📝 *الحالة:* ${state}` +
        (result.message ? `\n📄 ${result.message}` : ""),
    });
  } catch (error) {
    apiError = error;
    console.error("[تفاعل-قناة] API:", error?.message || error);
  }

  try {
    const local = await localReaction(sock, link, emoji, Number(count));
    const available = local.available ?? local.total;
    await react("⚠️");
    return reply({
      text:
        `⚠️ *الخدمة الخارجية غير متاحة*\n\n` +
        `✅ تم التفاعل محلياً: ${local.ok}/${count}\n` +
        (available < Number(count) ? `🤖 البوتات المتاحة: ${available}\n` : "") +
        `🔗 ${link}\n` +
        `😊 ${emoji}`,
    });
  } catch (localError) {
    console.error("[تفاعل-قناة] local:", localError?.message || localError);
    await react("❌");
    return reply({
      text:
        `❌ *تعذّر إرسال التفاعلات*\n\n` +
        `🔗 ${link}\n` +
        `📝 ${apiError?.message || localError?.message || "حاول مجدداً."}`,
    });
  }
}

export default {
  name: ["تفاعل-قناة"],
  description: "تفاعل مع رسالة قناة واتساب مع اختيار العدد ونوع التفاعل",
  category: "أدوات",
  ownerOnly: false,

  async run(ctx) {
    const { args, reply, usedPrefix } = ctx;
    const prefix = usedPrefix || ".";
    const [action, ...rest] = args;

    if (!action) {
      return reply({
        text:
          "⚠️ *استخدم:*\n" +
          "`.تفاعل-قناة https://whatsapp.com/channel/XXXX/123`\n\n" +
          "ثم اختر العدد ونوع التفاعل من الأزرار.",
      });
    }

    if (action === "result") {
      return showCounts(ctx, decode(rest[0]), prefix);
    }

    if (action === "count") {
      return showReactions(ctx, decode(rest[0]), rest[1], prefix);
    }

    if (action === "send") {
      return runSend(ctx, decode(rest[0]), rest[1], rest[2]);
    }

    const link = args.find((arg) => /whatsapp\.com\/channel\//i.test(arg)) || action;
    if (!parseLink(link)) {
      return reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
    }

    const oldEmoji = args
      .slice(1)
      .find((arg) => !/^\d+$/.test(arg) && !/whatsapp\.com\/channel\//i.test(arg));

    if (oldEmoji) {
      const oldCount = args.find((arg) => COUNTS.includes(arg)) || "50";
      return runSend(ctx, link, oldCount, oldEmoji);
    }

    return showStart(ctx, link, prefix);
  },
};
