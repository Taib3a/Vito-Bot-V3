/**
 * ترجمة مشتركة: كشف اللغة + أسماء الأقسام بالعربية.
 *
 * العُرف في هذا المشروع: كل `category` يُكتب بصيغة ثنائية اللغة
 *   "es, عربي"   →   "dl, التحميل"
 * وكل `name` يحتوي على الأسماء العربية والإسبانية/الإنجليزية معاً،
 * ثم يختار كل أمر الأسماء والنصوص المطابقة للغة التي كُتب بها الأمر.
 */

/** هل النص يحتوي على حروف عربية؟ */
export function isArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

/** لغة الأمر من اسمه: "بوت" → "ar" ، "gpt" → "es". */
export function detectLang(cmdName) {
  return isArabic(cmdName) ? "ar" : "es";
}

/** أسماء الأقسام بالعربية. المفتاح هو الجزء اللاتيني في `category`. */
export const CATEGORIAS_AR = {
  info: "المعلومات",
  grupos: "المجموعات",
  economy: "الاقتصاد",
  dl: "التحميل",
  stickers: "الملصقات",
  utils: "الأدوات",
  utilidades: "الأدوات",
  herramientas: "الأدوات",
  ia: "الذكاء الاصطناعي",
  sockets: "البوتات الفرعية",
  owner: "المالك",
  anime: "الأنمي",
  misc: "متنوع",
};

/** ترتيب ثابت للأقسام في القائمة، حتى تُقرأ بنفس الشكل دائماً. */
export const ORDEN_AR = [
  "info",
  "grupos",
  "economy",
  "dl",
  "stickers",
  "utils",
  "utilidades",
  "herramientas",
  "ia",
  "sockets",
  "anime",
  "misc",
  "owner",
];

/**
 * يقسّم `category` إلى جزأيه: اللاتيني والعربي.
 * يقبل "dl" أو "dl, التحميل" أو "ia, ذكاء".
 */
export function parseCategory(raw) {
  const parts = String(raw || "misc")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const latin = parts.find((p) => !isArabic(p)) || "misc";
  const arabic = parts.find((p) => isArabic(p)) || null;

  return { latin, arabic };
}

/** اسم القسم معروضاً باللغة المطلوبة. */
export function categoryLabel(raw, lang = "ar") {
  const { latin, arabic } = parseCategory(raw);
  if (lang === "ar") return arabic || CATEGORIAS_AR[latin.toLowerCase()] || latin;
  return latin;
}

/** مفتاح ترتيب القسم (الجزء اللاتيني دائماً). */
export function categoryKey(raw) {
  return parseCategory(raw).latin;
}

/** يُرتّب الأقسام حسب ORDEN_AR، ثم أبجدياً لما ليس فيها. */
export function sortCategories(keys) {
  return [...keys].sort((a, b) => {
    const ia = ORDEN_AR.indexOf(a.toLowerCase());
    const ib = ORDEN_AR.indexOf(b.toLowerCase());
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * يختار اسم الأمر المناسب للغة.
 * @param {string[]|string} names
 * @param {"ar"|"es"} lang
 */
export function pickName(names, lang) {
  const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
  const arabic = list.filter((n) => isArabic(n));
  const latin = list.filter((n) => !isArabic(n));

  if (lang === "ar") return arabic[0] || latin[0] || "";
  return latin[0] || arabic[0] || "";
}

/** يستخرج النص الخام من الرسالة (أي نوع). */
export function rawTextOf(msg) {
  const m = msg?.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ""
  );
}
