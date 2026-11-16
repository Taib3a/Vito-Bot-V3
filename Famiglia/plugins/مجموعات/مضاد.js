import { db } from "../../database/db.js";
import { antifeatures } from "../../core/مضاد/index.js";

// معرّفات الأزرار تُطابَق حرفياً في messageHandler، فتُسجَّل كاملة لا ببادئة.
const TOGGLE_NAMES = antifeatures.flatMap((a) => [`تفعيل_${a.flag}`, `تعطيل_${a.flag}`]);
const SELECT_NAMES = antifeatures.map((a) => `اختر_${a.flag}`);
const MODE_NAMES = ["تفعيل-ازرار", "تفعيل-قائمه", "تعطيل-ازرار", "تعطيل-قائمه"];
const PAGE_NAMES = Array.from({ length: 50 }, (_, i) => `تفعيل-المزيد_${i + 1}`);

const FOOTER = "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹";

const T = {
  head: "🛡️ *لوحة المضادات*",
  btnTitle: "لوحة المضادات",
  mainPrompt: "اختر طريقة عرض الأقسام:",
  btnInteractive: "🎯 أزرار قابلة للضغط",
  btnDropdown: "📋 أزرار منسدلة",
  chooseCategory: "اختر القسم للتحكم به:",
  status: "الحالة",
  statusOn: "يعمل ✅",
  statusOff: "متوقف 🚫",
  btnOn: "✅ تفعيل",
  btnOff: "🚫 إيقاف",
  btnBack: "⬅️ رجوع",
  more: "➕ المزيد",
  deny: "❌ هذا الأمر لمشرفي المجموعة ومالك البوت فقط.",
  notFound: "❌ لا يوجد مضاد بهذا الاسم.",
  onOne: (n) => `✅ تم تفعيل *${n}*.`,
  offOne: (n) => `🚫 تم تعطيل *${n}*.`,
};

function find(target = "") {
  const q = String(target).toLowerCase();
  return antifeatures.find((a) => a.name.toLowerCase() === q || a.flag.toLowerCase() === q);
}

/** يبني رسالة تفاعلية: أزرار أو قائمة منسدلة، وإلا رسالة نصية. */
async function sendStoreMessage(sock, from, msg, sender, { title, text, buttons = [], sections = [], footer, image = null }) {
  const imagenRaw = image || global.botImages[Math.floor(Math.random() * global.botImages.length)];
  const imagenFinal = typeof imagenRaw === "string" ? { url: imagenRaw } : imagenRaw;
  const canalJid = global.my?.canal1;

  const contextInfo = {
    mentionedJid: [sender],
    forwardedNewsletterMessageInfo: { newsletterJid: canalJid, serverMessageId: -1 },
  };

  if (buttons.length === 0 && sections.length === 0) {
    const payload = { mentions: [sender], contextInfo };
    if (image) {
      payload.image = imagenFinal;
      payload.caption = text;
    } else {
      payload.text = text;
    }
    return await sock.sendMessage(from, payload, { quoted: msg });
  }

  return await sock.sendButtonMessage(from, text, buttons, {
    title: title || "",
    footer: footer || "",
    quoted: msg,
    image: imagenFinal,
    mentions: [sender],
    sections,
    contextInfo,
  });
}

/** الخطوة 1: اختيار طريقة العرض (أزرار أو قائمة منسدلة). */
function buildMainMenu() {
  return {
    text: `${T.head}\n\n${T.mainPrompt}`,
    buttons: [
      { text: T.btnInteractive, id: ".تفعيل-ازرار" },
      { text: T.btnDropdown, id: ".تفعيل-قائمه" },
    ],
  };
}

/** الخطوة 2أ: الأقسام كأزرار قابلة للضغط (بصفحات لئلا تتجاوز حدّ واتساب). */
function buildCategoriesButtons(page = 0) {
  const totalPages = Math.ceil(antifeatures.length / 2);
  const p = Math.min(Math.max(page, 0), Math.max(totalPages - 1, 0));
  const perPage = totalPages > 1 ? 2 : 3;
  const slice = antifeatures.slice(p * perPage, p * perPage + perPage);

  const buttons = slice.map((a) => ({ text: a.name, id: `.اختر_${a.flag}` }));
  if (p < totalPages - 1) buttons.push({ text: T.more, id: `.تفعيل-المزيد_${p + 1}` });
  else if (p > 0) buttons.push({ text: T.btnBack, id: ".تفعيل" });

  return { text: `${T.head}\n\n${T.chooseCategory}`, buttons };
}

/** الخطوة 2ب: الأقسام كقائمة منسدلة. */
function buildCategoriesDropdown() {
  return {
    text: `${T.head}\n\n${T.chooseCategory}`,
    sections: [
      {
        title: T.btnTitle,
        rows: antifeatures.map((a) => ({ title: a.name, description: a.flag, id: `.اختر_${a.flag}` })),
      },
    ],
  };
}

/** الخطوة 3: لوحة تحكم مضاد واحد: حالته وزرّ التبديل. */
function buildControlPanel(flag, from) {
  const q = String(flag).toLowerCase();
  const mod = antifeatures.find((a) => a.flag.toLowerCase() === q);
  if (!mod) return null;

  const isOn = mod.global ? !!db.getSettings()?.[mod.flag] : !!db.getGroup(from)?.[mod.flag];
  const scope = mod.global ? " 🌍 عام" : "";
  return {
    text: `${T.head}\n\n📌 *${mod.name}*${scope}\n${T.status}: ${isOn ? T.statusOn : T.statusOff}`,
    buttons: [
      { text: isOn ? T.btnOff : T.btnOn, id: isOn ? `.تعطيل_${flag}` : `.تفعيل_${flag}` },
      { text: T.btnBack, id: ".تفعيل" },
    ],
  };
}

export default {
  name: ["تفعيل", "تعطيل", ...TOGGLE_NAMES, ...SELECT_NAMES, ...MODE_NAMES, ...PAGE_NAMES],
  description: "تفعيل وتعطيل المضادات بأزرار قابلة للضغط",
  category: "المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, sender, args, cmdName, isAdmin, isOwner, reply, react }) {
    if (!isAdmin && !isOwner) return await reply({ text: T.deny });

    const name = String(cmdName || "").toLowerCase();
    const panel = (data) =>
      sendStoreMessage(sock, from, msg, sender, { ...data, title: T.btnTitle, footer: FOOTER });

    // الخطوة 1: طريقة العرض.
    if ((name === "تفعيل" || name === "تعطيل") && !args[0]) {
      await react("📋");
      return await panel(buildMainMenu());
    }

    // الخطوة 2أ: الأقسام كأزرار.
    if (name === "تفعيل-ازرار" || name === "تعطيل-ازرار") {
      await react("🎯");
      return await panel(buildCategoriesButtons(0));
    }

    // الخطوة 2ب: الأقسام كقائمة منسدلة.
    if (name === "تفعيل-قائمه" || name === "تعطيل-قائمه") {
      await react("📋");
      return await panel(buildCategoriesDropdown());
    }

    // تنقّل بين صفحات الأقسام.
    if (name.startsWith("تفعيل-المزيد_")) {
      await react("➕");
      return await panel(buildCategoriesButtons(Number(name.split("_").pop()) || 0));
    }

    // الخطوة 3: لوحة تحكم مضاد.
    if (name.startsWith("اختر_")) {
      const ctrl = buildControlPanel(name.replace("اختر_", ""), from);
      if (!ctrl) return await reply({ text: T.notFound });
      await react("⚙️");
      return await panel(ctrl);
    }

    // تبديل الحالة: من زر (تفعيل_<flag>) أو نص (.تفعيل <flag>).
    const on = !name.startsWith("تعطيل");
    let target = name.replace(/^(تفعيل|تعطيل)_?/, "");
    if (!target && args[0]) target = String(args[0]).toLowerCase();

    const mod = find(target);
    if (!mod) {
      const names = antifeatures.map((a) => `${a.flag} (${a.name})`).join("، ");
      return await reply({ text: `${T.notFound}\n> المتاح: ${names}` });
    }

    if (mod.global) db.setSettings({ [mod.flag]: on });
    else db.setGroup(from, { [mod.flag]: on });
    await react(on ? "✅" : "🚫");

    const ctrl = buildControlPanel(mod.flag, from);
    const confirm = on ? T.onOne(mod.name) : T.offOne(mod.name);
    return await panel({ ...ctrl, text: `${confirm}\n\n${ctrl.text}` });
  },
};
