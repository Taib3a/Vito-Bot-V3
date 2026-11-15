import { db } from "../../database/db.js";
import { antifeatures } from "../../core/مضاد/index.js";

// الأزرار التفاعلية تُرسل معرّفها الكامل، والمطابقة في messageHandler حرفية؛
// لذا يُسجَّل كل معرّف باسم كامل لا ببادئة.
const PAGE_SIZE = 2;
const MAX_PAGES = 50;

const BUTTON_NAMES = [
  ...antifeatures.flatMap((a) => [`تفعيل_${a.flag}`, `تعطيل_${a.flag}`]),
  ...Array.from({ length: MAX_PAGES + 1 }, (_, i) => `تفعيل_المزيد_${i}`),
  ...Array.from({ length: MAX_PAGES + 1 }, (_, i) => `تعطيل_المزيد_${i}`),
];

const FOOTER = "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹";

const T = {
  head: "『🛡️』*لوحة المضادات*",
  btnTitle: "🛡️ لوحة المضادات",
  onPrompt: "👇 *اختر الخاصية لتفعيلها:*",
  offPrompt: "👇 *اختر الخاصية لتعطيلها:*",
  onEmpty: "✅ *كل المضادات مفعّلة بالفعل.*",
  offEmpty: "🚫 *كل المضادات معطّلة بالفعل.*",
  more: "➕ المزيد",
  back: "⬅️ رجوع",
  deny: "❌ هذا الأمر لمشرفي المجموعة ومالك البوت فقط.",
  notFound: "❌ لا يوجد مضاد بهذا الاسم.",
  onOne: (n) => `✅ تم تفعيل *${n}*.`,
  offOne: (n) => `🚫 تم تعطيل *${n}*.`,
  onAll: (n) => `✅ تم تفعيل *كل* المضادات (${n}).`,
  offAll: (n) => `🚫 تم تعطيل *كل* المضادات (${n}).`,
};

/** يبحث عن مضاد بالاسم العربي أو بعلمه (antilink، antispam…). */
function find(target = "") {
  const q = String(target).toLowerCase();
  return antifeatures.find((a) => a.name.toLowerCase() === q || a.flag.toLowerCase() === q);
}

function contextInfo(sender) {
  return {
    mentionedJid: [sender],
    forwardedNewsletterMessageInfo: {
      newsletterJid: global.my?.canal1,
      serverMessageId: -1,
    },
  };
}

function statusLines(groupData) {
  return antifeatures.map((a) => `${groupData[a.flag] ? "✅" : "🚫"} ${a.name}`).join("\n");
}

/** لوحة الأزرار: تعرض الحالات كلها، وتُبقي أزرار الخصائص القابلة للتنفيذ فقط. */
function buildPanel(kind, groupData, page = 0) {
  const on = kind === "on";
  const verb = on ? "تفعيل" : "تعطيل";
  const body = `${T.head}\n\n${statusLines(groupData)}\n\n${on ? T.onPrompt : T.offPrompt}`;

  const pending = antifeatures.filter((a) => (on ? !groupData[a.flag] : !!groupData[a.flag]));
  if (pending.length === 0) {
    return { text: `${T.head}\n\n${statusLines(groupData)}\n\n${on ? T.onEmpty : T.offEmpty}`, buttons: [] };
  }

  const totalPages = Math.ceil(pending.length / PAGE_SIZE);
  const p = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = pending.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

  const buttons = slice.map((a) => ({ text: `${verb} ${a.name}`, id: `.${verb}_${a.flag}` }));

  if (p < totalPages - 1) buttons.push({ text: T.more, id: `.${verb}_المزيد_${p + 1}` });
  else if (p > 0) buttons.push({ text: T.back, id: `.${verb}_المزيد_0` });

  return { text: body, buttons };
}

async function sendPanel(sock, from, msg, sender, { text, buttons }) {
  if (!buttons.length) {
    return await sock.sendMessage(
      from,
      { text, mentions: [sender], contextInfo: contextInfo(sender) },
      { quoted: msg }
    );
  }

  const image = global.botImages[Math.floor(Math.random() * global.botImages.length)];
  return await sock.sendButtonMessage(from, text, buttons, {
    title: T.btnTitle,
    footer: FOOTER,
    quoted: msg,
    image,
    mentions: [sender],
    contextInfo: contextInfo(sender),
  });
}

export default {
  name: ["تفعيل", "تعطيل", ...BUTTON_NAMES],
  description: "تفعيل وتعطيل المضادات بأزرار قابلة للضغط",
  category: "المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, sender, args, cmdName, isAdmin, isOwner, reply, react }) {
    // مالك البوت أو مشرف المجموعة فقط.
    if (!isAdmin && !isOwner) return await reply({ text: T.deny });

    const name = String(cmdName || "").toLowerCase();
    const on = !name.startsWith("تعطيل");
    const kind = on ? "on" : "off";

    // بعد تجريد اسم الأمر يبقى: "" أو "<flag>" أو "المزيد_<n>" أو "الكل".
    let target = name.replace(/^(تفعيل|تعطيل)_?/, "");
    if (!target && args[0]) target = String(args[0]).toLowerCase();

    // بلا هدف: اعرض لوحة الخصائص.
    if (!target) {
      await react("📋");
      return await sendPanel(sock, from, msg, sender, buildPanel(kind, db.getGroup(from), 0));
    }

    // تنقّل بين الصفحات.
    if (target.startsWith("المزيد")) {
      const page = Number(target.split("_").pop()) || 0;
      await react("📋");
      return await sendPanel(sock, from, msg, sender, buildPanel(kind, db.getGroup(from), page));
    }

    // الكل.
    if (target === "الكل") {
      const patch = {};
      for (const a of antifeatures) patch[a.flag] = on;
      db.setGroup(from, patch);
      await react(on ? "✅" : "🚫");
      return await reply({ text: on ? T.onAll(antifeatures.length) : T.offAll(antifeatures.length) });
    }

    const mod = find(target);
    if (!mod) {
      const names = antifeatures.map((a) => `${a.flag} (${a.name})`).join("، ");
      return await reply({ text: `${T.notFound}\n> المتاح: ${names}` });
    }

    db.setGroup(from, { [mod.flag]: on });
    await react(on ? "✅" : "🚫");

    // رسالة واحدة: تأكيد العملية + اللوحة المحدّثة.
    const panel = buildPanel(kind, db.getGroup(from), 0);
    const confirm = on ? T.onOne(mod.name) : T.offOne(mod.name);
    return await sendPanel(sock, from, msg, sender, { ...panel, text: `${confirm}\n\n${panel.text}` });
  },
};
