import { db } from "../../database/db.js";

const pendingProposals = new Map(); // proposerJid -> { targetJid, at }
const PROPOSAL_TTL_MS = 5 * 60 * 1000;

function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

function cleanExpired() {
  const now = Date.now();
  for (const [proposer, data] of pendingProposals) {
    if (now - data.at > PROPOSAL_TTL_MS) pendingProposals.delete(proposer);
  }
}

function labelPorGenero(jid) {
  const genero = (db.getGenero(jid) || "").toLowerCase();
  if (genero === "hombre") return "Esposo";
  if (genero === "mujer") return "Esposa";
  return "Espos@";
}

export default {
  name: ["marry", "casar", "زواج"],
  description: { es: "Propón o acepta matrimonio con alguien", ar: "يعرض الزواج على أحدهم أو يقبله" },
  category: "info, المعلومات",

  async run(ctx) {
    const lang = /[\u0600-\u06FF]/.test(ctx.cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const { sock, msg, from, sender, reply, resolveLid, groupMeta } = ctx;
    cleanExpired();

    const contextInfo = msg?.message?.extendedTextMessage?.contextInfo;

    let targetJid = null;
    if (contextInfo?.mentionedJid?.length > 0) {
      targetJid = contextInfo.mentionedJid[0];
    } else if (contextInfo?.participant) {
      targetJid = contextInfo.participant;
    }

    if (!targetJid) {
      return reply({
        text: tr("💍 Debes mencionar a alguien o responder su mensaje para aceptar o proponer matrimonio.\n> Ejemplo » *.marry @user* o responde su mensaje con *.marry*", "💍 يجب أن تذكر شخصاً أو تردّ على رسالته لقبول الزواج أو عرضه.\n> مثال » *.marry @user* أو ردّ على رسالته بـ *.marry*"),
      });
    }

    if (targetJid.endsWith("@lid") || isNaN(targetJid.split("@")[0])) {
      const found = groupMeta?.participants?.find((p) => p.id === targetJid || p.lid === targetJid);
      if (found?.id) targetJid = found.id;
    }

    if (targetJid.endsWith("@lid")) {
      targetJid = await resolveLid(targetJid);
    }

    const target = cleanJid(targetJid);

    if (target === sender) {
      return reply({ text: tr("💀 No puedes casarte contigo mismo.", "💀 لا يمكنك الزواج من نفسك.") });
    }

    const senderPartner = db.getMarriage(sender);
    if (senderPartner) {
      return reply({ text: tr(`❌ Ya estás casado(a) con @${senderPartner.split("@")[0]}.`, `❌ أنت متزوج بالفعل من @${senderPartner.split("@")[0]}.`), mentions: [senderPartner] });
    }

    const targetPartner = db.getMarriage(target);
    if (targetPartner) {
      return reply({ text: tr(`❌ Esa persona ya está casada con @${targetPartner.split("@")[0]}.`, `❌ هذا الشخص متزوج بالفعل من @${targetPartner.split("@")[0]}.`), mentions: [targetPartner] });
    }

    const reverseProposal = pendingProposals.get(target);
    if (reverseProposal && reverseProposal.targetJid === sender) {
      pendingProposals.delete(target);
      db.marry(sender, target);

      const labelTarget = labelPorGenero(target);
      const labelSender = labelPorGenero(sender);

      const texto = `𓂃 ࣪˖ ⋆.˚ ʚїɞ ⋆ ˚ ༘♡ ⋆｡˚\n¡𝑆𝑒 ℎ𝑎𝑛 𝑐𝑎𝑠𝑎𝑑𝑜! \n𓂃ෆ˚\n\n*ʚଓ ${labelTarget}:*\n *@${target.split("@")[0]} ˃͈◡˂͈*\n\n*ʚଓ ${labelSender}:*\n *@${sender.split("@")[0]} ˃͈◡˂͈*\n\n*𝑑𝑖𝑠𝑓𝑟𝑢𝑡𝑒𝑛 𝑠𝑢 𝑙𝑢𝑛𝑎 𝑑𝑒 𝑚𝑖𝑒𝑙 🍯𖤐⭒๋࣭ ⭑*`;

      return reply({ text: texto, mentions: [sender, target] });
    }

    pendingProposals.set(sender, { targetJid: target, at: Date.now() });

    return reply({
      text: tr(`💌 @${sender.split("@")[0]} le ha propuesto matrimonio a @${target.split("@")[0]}.\n> @${target.split("@")[0]}, usa *.marry @${sender.split("@")[0]}* (o responde este mensaje con *.marry*) para aceptar (expira en 5 min).`, `💌 @${sender.split("@")[0]} تقدّم بطلب زواج لـ @${target.split("@")[0]}.\n> @${target.split("@")[0]}، استخدم *.marry @${sender.split("@")[0]}* (أو ردّ على هذه الرسالة بـ *.marry*) للقبول (ينتهي خلال 5 دقائق).`),
      mentions: [sender, target],
    });
  },
};