import axios from "axios";
import { broadcastReaccionCanal } from "../../Corleone/subbotManager.js";

const MAKLUXNXX_API =
  process.env.REACTION_API_URL ||
  "https://api.makluxnxx.my.id/v1/tools/whatsapp-react";
const OMEGATECH_API =
  process.env.OMEGATECH_API_URL ||
  "https://api.omegatech.app/api/Fun/Rch";
const CHANNEL_LINK_RE = /whatsapp\.com\/channel\/([0-9A-Za-z_-]+)\/(\d+)/i;
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

const MODE_LABELS = {
  buttons: "🎯 أزرار قابلة للضغط",
  list: "📋 أزرار منسدلة",
};

const SERVICE_LABELS = {
  external: "🌐 خدمة خارجية",
  local: "🖥️ خدمة محلية",
};

const SERVICE_NAMES = {
  external: "خدمة خارجية",
  local: "خدمة محلية",
};

const EXTERNAL_PROVIDERS = [
  { id: "makluxnxx", name: "Makluxnxx", call: callMakluxnxx },
  { id: "omegatech", name: "Omegatech", call: callOmegatech },
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
    "📊 *عرض النتيجة*\n\nاختر طريقة عرض أنواع التفاعل:",
    [
      { text: MODE_LABELS.buttons, id: buttonId(prefix, "mode", encode(link), "buttons") },
      { text: MODE_LABELS.list, id: buttonId(prefix, "mode", encode(link), "list") },
    ],
    [],
    "",
    { title: "عرض النتيجة", footer: "اختر طريقة العرض" }
  );
}

async function showServices(ctx, link, mode, prefix) {
  if (!parseLink(link)) {
    return ctx.reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }

  const displayMode = mode === "buttons" ? "buttons" : "list";

  await sendPanel(
    ctx,
    `🌐 *اختر مصدر التفاعل*\n\n` +
      `🎨 *العرض:* ${MODE_LABELS[displayMode]}\n` +
      `🌐 *الخارجي:* Makluxnxx / Omegatech\n` +
      `🖥️ *المحلي:* بوتاتك المتصلة`,
    [
      { text: SERVICE_LABELS.external, id: buttonId(prefix, "service", encode(link), displayMode, "external") },
      { text: SERVICE_LABELS.local, id: buttonId(prefix, "service", encode(link), displayMode, "local") },
    ],
    [],
    "",
    { title: "مصدر التفاعل", footer: "خارجي أو محلي" }
  );
}

async function showCounts(ctx, link, mode, service, prefix) {
  if (!parseLink(link)) {
    return ctx.reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }

  const displayMode = mode === "buttons" ? "buttons" : "list";
  const source = service === "local" ? "local" : "external";

  await sendPanel(
    ctx,
    `📊 *اختر عدد التفاعلات*\n\n` +
      `🎨 *العرض:* ${MODE_LABELS[displayMode]}\n` +
      `🌐 *المصدر:* ${SERVICE_NAMES[source]}`,
    [
      { text: "50 تفاعل", id: buttonId(prefix, "count", encode(link), "50", displayMode, source) },
      { text: "100 تفاعل", id: buttonId(prefix, "count", encode(link), "100", displayMode, source) },
    ],
    [],
    "",
    { title: "عدد التفاعلات", footer: "اختر 50 أو 100" }
  );
}

async function showReactionsList(ctx, link, count, service, prefix) {
  if (!parseLink(link)) {
    return ctx.reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }
  if (!COUNTS.includes(String(count))) {
    return ctx.reply({ text: "❌ اختر 50 أو 100." });
  }

  const source = service === "local" ? "local" : "external";
  const rows = REACTIONS.map((reaction) => ({
    title: reaction.label,
    description: `${count} تفاعل`,
    id: buttonId(prefix, "send", encode(link), count, reaction.emoji, source),
  }));

  await sendPanel(
    ctx,
    `🎨 *اختر نوع التفاعل*\n\n` +
      `📊 *العدد:* ${count}\n` +
      `🌐 *المصدر:* ${SERVICE_NAMES[source]}`,
    [],
    [{ title: "نوع التفاعل", rows }],
    "🎨 اختر نوع التفاعل",
    { title: "نوع التفاعل", footer: "اختر نوعاً واحداً" }
  );
}

async function showReactionsButtons(ctx, link, count, mode, service, page, prefix) {
  if (!parseLink(link)) {
    return ctx.reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }
  if (!COUNTS.includes(String(count))) {
    return ctx.reply({ text: "❌ اختر 50 أو 100." });
  }

  const source = service === "local" ? "local" : "external";
  const pageNumber = Math.max(0, parseInt(page, 10) || 0);
  const perPage = 2;
  const remaining = REACTIONS.slice(pageNumber * perPage);

  if (remaining.length === 0) {
    return ctx.reply({ text: "❌ لا توجد أنواع إضافية." });
  }

  const maxOnPage = remaining.length > 3 ? 2 : 3;
  const pageItems = remaining.slice(0, maxOnPage);

  const buttons = pageItems.map((reaction) => ({
    text: reaction.label,
    id: buttonId(prefix, "send", encode(link), count, reaction.emoji, source),
  }));

  const remainingAfter = remaining.length - maxOnPage;
  if (remainingAfter > 0) {
    buttons.push({
      text: "➕ المزيد",
      id: buttonId(prefix, "page", encode(link), count, "buttons", source, pageNumber + 1),
    });
  } else if (pageNumber > 0) {
    buttons.push({
      text: "↩️ رجوع",
      id: buttonId(prefix, "page", encode(link), count, "buttons", source, pageNumber - 1),
    });
  }

  await sendPanel(
    ctx,
    `🎨 *اختر نوع التفاعل*\n\n` +
      `📊 *العدد:* ${count}\n` +
      `🌐 *المصدر:* ${SERVICE_NAMES[source]}\n` +
      `📄 *الصفحة:* ${pageNumber + 1}`,
    buttons,
    [],
    "",
    { title: "نوع التفاعل", footer: "اختر نوعاً واحداً" }
  );
}

async function showReactions(ctx, link, count, mode, service, prefix) {
  if (mode === "buttons") {
    return showReactionsButtons(ctx, link, count, mode, service, 0, prefix);
  }
  return showReactionsList(ctx, link, count, service, prefix);
}

async function callMakluxnxx(link, emoji, count) {
  const { data } = await axios.get(MAKLUXNXX_API, {
    params: { link, emoji, count },
    timeout: 45000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!data || (data.status !== true && data.status !== "true")) {
    throw new Error(data?.message || "فشل الطلب");
  }

  return data.result || {};
}

async function callOmegatech(link, emoji, count) {
  const { data } = await axios.get(OMEGATECH_API, {
    params: { action: "react", url: link, emoji, count },
    timeout: 45000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!data || (data.success !== true && data.status !== true)) {
    throw new Error(data?.error || data?.message || "فشل الطلب");
  }

  return data.data || data.result || data;
}

async function callExternalProviders(link, emoji, count) {
  const errors = [];

  for (const provider of EXTERNAL_PROVIDERS) {
    try {
      const data = await provider.call(link, emoji, count);
      return { provider, data };
    } catch (error) {
      errors.push(`${provider.name}: ${error?.message || error}`);
    }
  }

  throw new Error(errors.join("\n"));
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

async function runLocal(ctx, link, count, emoji) {
  const { sock, reply, react } = ctx;

  await react("⏳");

  try {
    const local = await localReaction(sock, link, emoji, Number(count));
    const available = local.available ?? local.total;
    await react("✅");
    return reply({
      text:
        `✅ *تم التفاعل محلياً*\n\n` +
        `✅ *الناجح:* ${local.ok}/${count}\n` +
        (available < Number(count) ? `🤖 *البوتات المتاحة:* ${available}\n` : "") +
        `😊 *التفاعل:* ${emoji}`,
    });
  } catch (error) {
    await react("❌");
    return reply({
      text: `❌ *تعذّر التفاعل محلياً*\n\n📝 ${error?.message || "حاول مجدداً."}`,
    });
  }
}

async function runExternal(ctx, link, count, emoji, prefix) {
  const { react } = ctx;

  await react("⏳");

  try {
    const { provider, data } = await callExternalProviders(link, emoji, count);
    await react("✅");

    const state = data?.status === "queued" ? "⏳ في قائمة الانتظار" : "✅ مكتمل";
    return ctx.reply({
      text:
        `✅ *تم إرسال التفاعلات*\n\n` +
        `🌐 *الخدمة:* ${provider.name}\n` +
        `😊 *التفاعل:* ${emoji}\n` +
        `📊 *العدد:* ${count}\n` +
        `📝 *الحالة:* ${state}` +
        (data?.message ? `\n📄 ${data.message}` : ""),
    });
  } catch (error) {
    await react("⚠️");
    return sendPanel(
      ctx,
      `❌ *تعذّر الاتصال بالخدمات الخارجية*\n\n${String(error?.message || error).slice(0, 700)}`,
      [
        { text: "🖥️ استخدام المحلية", id: buttonId(prefix, "local", encode(link), count, emoji) },
        { text: "🔁 إعادة المحاولة", id: buttonId(prefix, "send", encode(link), count, emoji, "external") },
      ],
      [],
      "",
      { title: "الخدمات الخارجية", footer: "اختر بديلاً" }
    );
  }
}

async function runSend(ctx, link, count, emoji, service = "external", prefix = ".") {
  const { reply } = ctx;

  if (!parseLink(link)) {
    return reply({ text: "❌ هذا ليس رابط رسالة قناة صالحاً." });
  }
  if (!COUNTS.includes(String(count))) {
    return reply({ text: "❌ اختر 50 أو 100." });
  }
  if (!emoji) {
    return reply({ text: "❌ اختر نوع التفاعل." });
  }

  if (service === "local") {
    return runLocal(ctx, link, count, emoji);
  }

  return runExternal(ctx, link, count, emoji, prefix);
}

export default {
  name: ["تفاعل-قناة"],
  description: "تفاعل مع رسالة قناة واتساب مع اختيار الخدمة والعدد والنوع",
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
          "ثم اختر طريقة العرض ومصدر التفاعل والعدد والنوع.",
      });
    }

    if (action === "mode") {
      return showServices(ctx, decode(rest[0]), rest[1] || "list", prefix);
    }

    if (action === "service") {
      return showCounts(ctx, decode(rest[0]), rest[1] || "list", rest[2] || "external", prefix);
    }

    if (action === "result") {
      return showServices(ctx, decode(rest[0]), rest[1] || "list", prefix);
    }

    if (action === "count") {
      return showReactions(ctx, decode(rest[0]), rest[1], rest[2] || "list", rest[3] || "external", prefix);
    }

    if (action === "page") {
      const serviceOrPage = rest[3];
      const hasService = ["external", "local"].includes(serviceOrPage);
      const service = hasService ? serviceOrPage : "external";
      const page = hasService ? rest[4] : serviceOrPage;
      return showReactionsButtons(ctx, decode(rest[0]), rest[1], rest[2] || "buttons", service, page, prefix);
    }

    if (action === "send") {
      return runSend(ctx, decode(rest[0]), rest[1], rest[2], rest[3] || "external", prefix);
    }

    if (action === "local") {
      return runSend(ctx, decode(rest[0]), rest[1], rest[2], "local", prefix);
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
      return runSend(ctx, link, oldCount, oldEmoji, "local", prefix);
    }

    return showStart(ctx, link, prefix);
  },
};
