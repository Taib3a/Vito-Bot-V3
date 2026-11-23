const pendingPins = new Map();
const PENDING_TTL_MS = 5 * 60_000;

const DURATIONS = {
  "تثبيت_24": { time: 86400, label: "24 ساعة" },
  "تثبيت_7": { time: 604800, label: "7 أيام" },
  "تثبيت_30": { time: 2592000, label: "30 يومًا" },
};

function contextInfoOf(message) {
  for (const type of [
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "audioMessage",
    "stickerMessage",
  ]) {
    const info = message?.[type]?.contextInfo;
    if (info) return info;
  }
  return null;
}

async function pinKeyFrom({ sock, from, quoted, resolveLid }) {
  const isFromMe = !quoted.participant || quoted.participant === sock.user?.id;
  let participant = quoted.participant;

  if (!isFromMe && participant) {
    participant = await resolveLid(participant);
  }

  return {
    remoteJid: from,
    id: quoted.stanzaId,
    participant: isFromMe ? undefined : participant,
    fromMe: isFromMe,
  };
}

export default {
  name: ["تثبيت", ...Object.keys(DURATIONS)],
  description: "يثبّت رسالة بالردّ عليها مع اختيار المدة",
  category: "المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, sender, cmdName, reply, resolveLid }) {
    const pendingKey = `${from}:${sender || msg.key.participant || ""}`;
    const duration = DURATIONS[cmdName];

    if (duration) {
      const pending = pendingPins.get(pendingKey);

      if (!pending || pending.expires < Date.now()) {
        pendingPins.delete(pendingKey);
        return await reply({
          text: "『📌』انتهت صلاحية الاختيار. اعمل ردًّا على الرسالة وأرسل `.تثبيت` من جديد.",
        });
      }

      try {
        await sock.sendMessage(from, {
          pin: pending.pinKey,
          type: 1,
          time: duration.time,
        });
        pendingPins.delete(pendingKey);
        return await reply({ text: `『📌』تم تثبيت الرسالة لمدة ${duration.label}.` });
      } catch (e) {
        return await reply({ text: `❌ تعذّر التثبيت:\n${e.message}` });
      }
    }

    const quoted = contextInfoOf(msg.message);

    if (!quoted?.stanzaId) {
      return await reply({
        text: "『📌』ردّ على الرسالة التي تريد تثبيتها، ثم أرسل `.تثبيت`.",
      });
    }

    const pinKey = await pinKeyFrom({ sock, from, quoted, resolveLid });
    pendingPins.set(pendingKey, { pinKey, expires: Date.now() + PENDING_TTL_MS });

    const buttons = [
      { text: "⏱️ 24 ساعة", id: ".تثبيت_24" },
      { text: "📅 7 أيام", id: ".تثبيت_7" },
      { text: "♾️ دائم (30 يومًا)", id: ".تثبيت_30" },
    ];

    if (typeof sock.sendButtonMessage !== "function") {
      return await reply({
        text: "『📌』اختر مدة التثبيت:\n.تثبيت_24\n.تثبيت_7\n.تثبيت_30",
      });
    }

    const image =
      global.botImages?.[Math.floor(Math.random() * (global.botImages?.length || 1))] || undefined;

    return await sock.sendButtonMessage(
      from,
      "『📌』اختر مدة تثبيت الرسالة:",
      buttons,
      {
        footer: "الحد الأقصى في واتساب هو 30 يومًا",
        quoted: msg,
        image,
      }
    );
  },
};