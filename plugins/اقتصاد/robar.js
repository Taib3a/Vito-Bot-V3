import { db } from "../../database/db.js";
import { checkCooldown, setCooldown, formatTime } from "../../core/economy.js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";

export default {
  name: ["rob", "robar", "سرقة", "اسرق"],
  description: { es: "Intenta robarle plata a otro usuario", ar: "يحاول سرقة المال من مستخدم آخر" },
  category: "economy, الاقتصاد",
  groupOnly: true,

  async run({ sender, msg, reply, resolveLid, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    let targetRaw = mentioned || quotedParticipant;

    if (!targetRaw) {
      return await reply({ text: tr("『🔫』Mencioná a quién querés robar. Uso: .robar @usuario", "『🔫』اذكر من تريد سرقته. الاستخدام: .robar @مستخدم") });
    }

    if (targetRaw.endsWith("@lid")) {
      targetRaw = await resolveLid(targetRaw);
    }

    const target = jidNormalizedUser(targetRaw);

    if (target === sender) {
      return await reply({ text: tr("『🔫』No podés robarte a vos mismo, xd.", "『🔫』لا يمكنك سرقة نفسك، ههه.") });
    }

    const status = checkCooldown(sender, "rob");
    if (!status.ready) {
      return await reply({ text: tr(`⏳ Estás escondido de la policía. Volvé en *${formatTime(status.remaining)}*.`, `⏳ أنت مختبئ من الشرطة. عد بعد *${formatTime(status.remaining)}*.`) });
    }

    const targetEco = db.getEco(target);
    if ((targetEco.bolsillo || 0) < 100) {
      return await reply({ text: tr("『🔫』Esa persona no tiene suficiente plata en el bolsillo para robarle.", "『🔫』هذا الشخص لا يملك مالاً كافياً في جيبه لسرقته.") });
    }

    setCooldown(sender, "rob");

    const success = Math.random() < 0.4;
    const targetNum = target.split("@")[0];

    if (success) {
      const amount = Math.floor(targetEco.bolsillo * (Math.random() * 0.3 + 0.1));
      db.setEco(target, { bolsillo: targetEco.bolsillo - amount });
      const senderEco = db.getEco(sender);
      db.setEco(sender, { bolsillo: (senderEco.bolsillo || 0) + amount });

      await reply({
        text: tr(`💸 ¡Le robaste *${amount}* monedas a @${targetNum}!`, `💸 سرقت *${amount}* عملة من @${targetNum}!`),
        mentions: [target]
      });
    } else {
      const senderEco = db.getEco(sender);
      const fine = Math.floor(Math.random() * 150) + 50;
      db.setEco(sender, { bolsillo: Math.max(0, (senderEco.bolsillo || 0) - fine) });

      await reply({
        text: tr(`🚔 Te atraparon intentando robar a @${targetNum} y pagaste una multa de *${fine}* monedas.`, `🚔 أمسكوك أثناء محاولة سرقة @${targetNum} ودفعت غرامة *${fine}* عملة.`),
        mentions: [target]
      });
    }
  }
};