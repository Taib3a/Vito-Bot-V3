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
  'https://cdn.dix.lat/me/1og9_20261118-r2x1-nerw-82b8.jpg',
  'https://cdn.dix.lat/me/qmt1_20261118-r2x1-ex89-6b1b.jpg',
  'https://cdn.dix.lat/me/s57m_20261118-r2x1-66p0-47bd.jpg',
  'https://cdn.dix.lat/me/t7jd_20261118-r2x1-m062-0817.jpg',
  'https://cdn.dix.lat/me/l98q_20261118-r2x1-ong0-ce93.jpg',
  'https://cdn.dix.lat/me/cvp4_20261118-r2x1-apaz-ca87.jpg',
  'https://cdn.dix.lat/me/fbp6_20261118-r2x1-rmrq-8e0a.jpg',
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

  // ✅ اسم القناة الظاهر في الترويسة
  canalName: '⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 │ 𝐂𝐇𝐀𝐍𝐍𝐄𝐋',

  // ✅ رابط جروب الدعم
  groupUrl: 'https://chat.whatsapp.com/HezlQ4yojeDG6k3fVDr5yz',
};

const config = {
  botName: "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾",
  prefix: ".",

  botname: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹",
  wm: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹",
  author: "© Taib",
  dev: "© 𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚃𝚊𝚒𝚋",
  packname: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 ⚔️",
  etiqueta: "⚔️ Taib ⚔️",
  textbot: "⚔️ 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 — بوت واتساب عربي متكامل. ⚔️",

  // أرقام المالك (بدون + وبدون مسافات)
  ownerNumber: [
    "967735541558",
  ],
  coOwners: [],

  // ⭐ البريميوم اليدوي: أرقام بدون + وبدون @، وأسماء مستخدمين بدون @
  // الحجوزات المضافة بالأمر تُحفظ في قاعدة البيانات مع تاريخ انتهاء.
  premium: {
    numbers: [],
    usernames: [],
  },

  sessionDir: "./sessions/main",

  // البوت يعمل داخل المجموعات فقط: رسائل الخاص تُتجاهل تماماً
  // (لا تُقرأ، لا تُعالَج، لا تُخزَّن، ولا يأتي عليها أي رد).
  groupsOnly: true,

  readMessages: true,
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 5000,

  logLevel: "info",
};

// حقوق موحّدة يقرأها البوت كقيمة احتياطية.
global.botname = config.botname;
global.packname = config.packname;
global.wm = config.wm;
global.author = config.author;
global.etiqueta = config.etiqueta;

export default config;
