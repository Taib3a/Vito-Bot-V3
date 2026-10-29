// ═══════════════════════════════════════════════
// ✅ أسماء البوت (تُستخدم عشوائياً في الرسائل)
// ═══════════════════════════════════════════════
global.botNames = [
  '𝘽𝙊𝙏 𝙑𝙄𝙏𝙊 𝙑𝟛',
  '𝗕𝗢𝗧 𝗩𝗜𝗧𝗢 𝗩𝟯',
  'Bᴏᴛ Vɪᴛᴏ V3',
  '𝐁𝐎𝐓 𝐕𝐈𝐓𝐎 𝐕𝟑',
  '𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹',
  'BOT VITO V3',
  '𝔹𝕆𝕋 𝕍𝕀𝕋𝕆 𝕍𝟛',
  '𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹',
  '𝐁𝐎𝐓 𝐕𝐈𝐓𝐎 𝐕𝟑',
  '𝘽𝙊𝙏 𝙑𝙄𝙏𝙊 𝙑𝟛',
  '𝘉𝘖𝘛 𝘝𝘐𝘛𝘖 𝘝3',
  '𝙑𝙄𝙏𝙊 𝘽𝙊𝙏 𝙑3',
  'VITO BOT V3',
  '𝐕𝐈𝐓𝐎 𝐁𝐎𝐓 𝐕𝟑',
  '𝕍𝕀𝕋𝕆 𝔹𝕆𝕋 𝕍𝟛',
  'Vɪᴛᴏ Bᴏᴛ V3',
  '𝗩𝗜𝗧𝗢 𝗕𝗢𝗧 𝗩𝟯',
  '𝘝𝘐𝘛𝘖 𝘉𝘖𝘛 𝘝3',
  '𝙑𝙄𝙏𝙊 𝘽𝙊𝙏 𝙑3',
];

// ═══════════════════════════════════════════════
// ✅ صور البوت (ترويسة الرسائل التفاعلية)
// ═══════════════════════════════════════════════
global.botImages = [
  'https://cdn.dix.lat/me/0b0b_20260909-c91x-51mf-7015.png',
  'https://cdn.dix.lat/me/04ae_20260909-c91x-b1r7-56f5.png',
  'https://cdn.dix.lat/me/kqfd_20260909-c91x-xkkt-ed5c.png',
];

// ═══════════════════════════════════════════════
// ✅ القنوات والمجموعات
// ═══════════════════════════════════════════════
global.my = {
  // معرف القناة (للـ newsletter)
  canal1: '120363429662971001@newsletter',
  canal2: '120363429662971001@newsletter',

  // ✅ رابط القناة
  canalUrl: 'https://whatsapp.com/channel/0029Vb8hDbBDuMRXBFk3u02L',

  // ✅ رابط جروب الدعم
  groupUrl: 'https://chat.whatsapp.com/HezlQ4yojeDG6k3fVDr5yz',
};

export default {
  botName: "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾",
  prefix: ".",

  botname: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹",
  wm: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹",
  author: "© Taib3a",
  dev: "© 𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚃𝚊𝚒𝚋3𝚊",
  packname: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 ⚔️",
  etiqueta: "⚔️ Taib3a ⚔️",
  textbot: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 — بوت واتساب عربي متكامل. ⚔️",

  // أرقام المالك (بدون + وبدون مسافات)
  ownerNumber: [
    "967738512629",
  ],
  coOwners: [],

  sessionDir: "./sessions/main",

  readMessages: true,
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 5000,

  logLevel: "info",
};
