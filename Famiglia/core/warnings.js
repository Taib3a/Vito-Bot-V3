// عدّاد تحذيرات لمضادات المجموعات: لكل (مجموعة + عضو) في الذاكرة.
// المضاد يمنح MAX_WARNINGS تحذيرات (يحذف الرسالة في كل مرة)، ثم يطرد في المخالفة التالية.
export const MAX_WARNINGS = 3;

const strikes = new Map();
const MAX_KEYS = 2000;

const keyOf = (groupJid, userJid) => `${groupJid}:${userJid}`;

/** يزيد عدّاد العضو ويعيد العدد الجديد. */
export function addWarning(groupJid, userJid) {
  const key = keyOf(groupJid, userJid);
  const count = (strikes.get(key) || 0) + 1;
  strikes.set(key, count);
  if (strikes.size > MAX_KEYS) strikes.delete(strikes.keys().next().value);
  return count;
}

/** يصفّر عدّاد العضو (يُستدعى بعد الطرد). */
export function clearWarnings(groupJid, userJid) {
  strikes.delete(keyOf(groupJid, userJid));
}
