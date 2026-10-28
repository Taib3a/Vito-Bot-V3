export function getTargetJid(msg, args) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant;
  const num = args?.[0]?.replace(/\D/g, "");
  if (num && num.length >= 8) return `${num}@s.whatsapp.net`;
  return null;
}

export function botJid(sock) {
  return sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
}

export function isAdmin(participant) {
  return participant?.admin === "admin" || participant?.admin === "superadmin";
}

export async function checkAdmins(sock, groupJid, senderJid) {
  const metadata = await sock.groupMetadata(groupJid);
  const sender = metadata.participants.find((p) => p.id === senderJid);
  const bot = metadata.participants.find((p) => p.id === botJid(sock));
  return {
    senderIsAdmin: isAdmin(sender),
    botIsAdmin: isAdmin(bot),
    metadata,
  };
}
