import { addPremium } from "../../Corleone/premium.js";

const MAX_DAYS = 3650;

function digits(value = "") {
  return String(value).replace(/\D/g, "");
}

function jidNumber(jid = "") {
  return digits(String(jid).split("@")[0].split(":")[0]);
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeZone: process.env.REACTION_DAY_TZ || "Africa/Cairo",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function usage(prefix) {
  return (
    `⭐ *حجز البريميوم*\n\n` +
    `• ${prefix}بريميوم 30 @مستخدم — لمدة 30 يوم\n` +
    `• ${prefix}بريميوم @مستخدم — بدون حد (دائم)\n` +
    `• ${prefix}بريميوم 30 (بالرد على رسالته)\n` +
    `• ${prefix}بريميوم (بالرد) — بدون حد\n` +
    `• ${prefix}بريميوم 30 201234567890\n\n` +
    `المدة من 1 إلى ${MAX_DAYS}، أو اكتب الأمر بدون مدة للبريميوم الدائم.`
  );
}

export default {
  name: ["بريميوم", "بريمو", "بريميو", "premium", "حجز-بريميوم"],
  description: "حجز بريميوم بعدد أيام أو بدون حد بالمنشن أو الرد أو الرقم",
  category: "المالك",
  ownerOnly: true,

  async run({ msg, args, reply, react, usedPrefix, senderNum, groupMeta, resolveLid }) {
    const prefix = usedPrefix || ".";
    const numericArgs = args.filter((arg) => /^\+?\d{1,15}$/.test(arg));

    const daysArg = numericArgs.find(
      (arg) => /^\d{1,4}$/.test(arg) && Number(arg) >= 1 && Number(arg) <= MAX_DAYS
    );
    const targetNumberArg = numericArgs.find(
      (arg) => arg !== daysArg && digits(arg).length >= 8
    );
    const shortNumeric = numericArgs.find((arg) => {
      const length = digits(arg).length;
      return length >= 1 && length <= 5 && arg !== targetNumberArg;
    });

    if (!daysArg && shortNumeric) {
      await react("⚠️");
      return reply({ text: usage(prefix) });
    }

    const permanent = !daysArg;
    const days = daysArg ? Number(daysArg) : null;
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.documentMessage?.contextInfo ||
      msg.message?.audioMessage?.contextInfo;

    let targetJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant || "";

    if (!targetJid && targetNumberArg) {
      targetJid = `${digits(targetNumberArg)}@s.whatsapp.net`;
    }

    if (!targetJid) {
      await react("⚠️");
      return reply({ text: usage(prefix) });
    }

    if (targetJid.endsWith("@lid") || !targetJid.includes("@")) {
      const found = groupMeta?.participants?.find(
        (participant) => participant.id === targetJid || participant.lid === targetJid
      );
      if (found?.id) targetJid = found.id;
      else if (targetJid.endsWith("@lid")) targetJid = await resolveLid(targetJid);
    }

    const targetNumber = jidNumber(targetJid);
    if (!targetNumber || targetNumber.length < 8) {
      await react("❌");
      return reply({ text: "❌ تعذّر تحديد رقم المستخدم." });
    }

    const participant = groupMeta?.participants?.find(
      (item) =>
        item.id === targetJid ||
        item.lid === targetJid ||
        jidNumber(item.id) === targetNumber ||
        jidNumber(item.lid) === targetNumber
    );

    const username = participant?.username || "";
    const displayName = participant?.notify || participant?.name || "";

    try {
      const result = addPremium({
        number: targetNumber,
        username,
        displayName,
        days,
        permanent,
        addedBy: senderNum || "",
      });

      await react("⭐");

      const lines = [
        `✅ *تم حجز البريميوم*`,
        "",
        `👤 *المستخدم:* @${result.number}`,
      ];

      if (result.username) lines.push(`🏷️ *اسم المستخدم:* @${result.username}`);
      else if (result.displayName) lines.push(`🏷️ *الاسم:* ${result.displayName}`);

      if (result.permanent) {
        lines.push(
          `📅 *المدة:* بدون حد (دائم)`,
          result.extended ? "♻️ *تم تحويله إلى بريميوم دائم*" : "⭐ *الحالة:* بريميوم دائم"
        );
      } else {
        lines.push(
          `📅 *المدة:* ${days} يوم`,
          `⏳ *ينتهي:* ${formatDate(result.until)}`,
          result.extended ? "♻️ *تم تمديد المدة*" : "⭐ *الحالة:* بريميوم"
        );
      }

      return reply({ text: lines.join("\n"), mentions: [targetJid] });
    } catch (error) {
      console.error("[بريميوم] add:", error?.message || error);
      await react("❌");
      return reply({ text: `❌ *تعذّر حجز البريميوم*\n\n📝 ${error?.message || "حاول مجدداً."}` });
    }
  },
};
