export function getGroupName(msg) {
  if (!msg?.key?.remoteJid?.endsWith("@g.us")) return "Private";
  return msg.key.remoteJid.split("@")[0];
}

export function getUserName(msg) {
  return msg?.pushName || msg?.key?.participant?.split("@")[0] || "Unknown";
}

export function getMessageType(msg) {
  if (!msg?.message) return "unknown";
  const types = Object.keys(msg.message);
  if (types.includes("conversation")) return "text";
  if (types.includes("extendedTextMessage")) return "text";
  if (types.includes("imageMessage")) return "image";
  if (types.includes("videoMessage")) return "video";
  if (types.includes("audioMessage")) return "audio";
  if (types.includes("stickerMessage")) return "sticker";
  if (types.includes("documentMessage")) return "document";
  if (types.includes("contactMessage")) return "contact";
  return types[0] || "unknown";
}

export function getMessageContent(msg) {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    ""
  );
}
