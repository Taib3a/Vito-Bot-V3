import { db } from "../database/db.js";

const CHAT_XP_MIN = 3;
const CHAT_XP_MAX = 8;
const CHAT_XP_COOLDOWN_MS = 60 * 1000;
const COMMAND_XP = 5;

// منحنى خطي: كل مستوى = 100 خبرة ثابتة. الأرقام تكبر تدريجياً
// وتصل المئات، والوصول إليها يحتاج تراكماً طويلاً.
const XP_PER_LEVEL = 100;

function xpForLevel(level) {
  return level * XP_PER_LEVEL;
}

export function levelFromXp(xp) {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function xpProgress(xp) {
  const level = levelFromXp(xp);
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  return { level, xp, currentFloor, nextFloor, missing: nextFloor - xp };
}

// رتب العائلة حسب المستوى: كلما ارتقى العضو ارتفع مقامه عند العرّاب.
const RANKS = [
  { min: 1000, name: "🎩 دون ڤيتو" },
  { min: 600, name: "👑 العرّاب" },
  { min: 300, name: "🐟 نائب العرّاب" },
  { min: 100, name: "💼 وكيل العائلة" },
  { min: 50, name: "🔫 رجل مصنوع" },
  { min: 10, name: "🤝 صديق العائلة" },
  { min: 0, name: "🚪 غريب" },
];

export function rankForLevel(level) {
  return (RANKS.find((r) => level >= r.min) || RANKS[RANKS.length - 1]).name;
}

function addXp(jid, amount) {
  const user = db.getUser(jid);
  const beforeXp = user.xp || 0;
  const beforeLevel = levelFromXp(beforeXp);
  const afterXp = beforeXp + amount;
  const afterLevel = levelFromXp(afterXp);

  db.setUser(jid, { xp: afterXp });

  // إعلان الترقية بأسلوب العائلة: يُعاد نصّه ليُرسل، أو null بلا ترقية.
  if (afterLevel <= beforeLevel) return null;
  return (
    `🎩 *عائلة كورليوني*\n\n` +
    `ارتقيتَ في العائلة، *@${String(jid).split("@")[0].split(":")[0]}*.\n` +
    `العرّاب يراقب، ولا يمنح مقامه إلا لمن يستحقّ.\n\n` +
    `📈 *المستوى:* ${beforeLevel} ← ${afterLevel}\n` +
    `🎖️ *الرتبة:* ${rankForLevel(afterLevel)}\n\n` +
    `> «الرجال الحقيقيون لا يشترون الاحترام. يبنونه.»`
  );
}

export function handleChatXp(sender) {
  const user = db.getUser(sender);
  const now = Date.now();
  if (user.lastXpAt && now - user.lastXpAt < CHAT_XP_COOLDOWN_MS) return null;

  const amount = Math.floor(Math.random() * (CHAT_XP_MAX - CHAT_XP_MIN + 1)) + CHAT_XP_MIN;
  db.setUser(sender, { lastXpAt: now });
  return addXp(sender, amount);
}

export function handleCommandXp(sender) {
  return addXp(sender, COMMAND_XP);
}
