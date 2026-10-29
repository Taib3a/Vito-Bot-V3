/**
 * Arabic command names.
 *
 * The plugins keep their original (Spanish/English) names so upstream fixes
 * stay easy to apply; this map adds an Arabic name for each one. Keeping the
 * aliases in one file means a command can be renamed for Arabic speakers
 * without touching 100 plugin files.
 *
 * Key   = Arabic alias typed by the user (lowercased, no prefix)
 * Value = the plugin's canonical name, as declared in its `name` field
 */
export const ARABIC_ALIASES = {
  // ── معلومات / info ──
  "قائمة": "menu",
  "القائمة": "menu",
  "مساعدة": "menu",
  "المالك": "owner",
  "معلومات": "botinfo",
  "البوت": "botinfo",
  "ملفي": "perfil",
  "الملف": "perfil",
  "الوقت": "runtime",
  "مدة": "runtime",
  "النظام": "system",
  "جنسي": "setgenero",
  "جنس": "setgenero",
  "حذف-جنسي": "delgenero",
  "زواج": "marry",
  "طلاق": "divorciar",
  "سفينة": "ship",

  // ── المجموعات / grupos ──
  "ترقية": "promote",
  "رفع": "promote",
  "خفض": "demote",
  "تنزيل": "demote",
  "طرد": "kick",
  "اطرد": "kick",
  "اضف": "add",
  "اضافة": "add",
  "فتح": "abrir",
  "اقفال": "cerrar",
  "اغلاق": "cerrar",
  "رابط": "linkgc",
  "الرابط": "linkgc",
  "تجديد-الرابط": "revokelink",
  "تثبيت": "fijar",
  "ازالة-التثبيت": "desfijar",
  "حذف": "del",
  "الكل": "tagall",
  "منشن": "tagall",
  "تحذير": "warn",
  "انذار": "warn",
  "التحذيرات": "listwarn",
  "حذف-تحذير": "delwarn",
  "مضاد-روابط": "antilink",
  "مشرفين-فقط": "modoadmin",
  "البوت-الرئيسي": "setprimary",
  "حذف-الرئيسي": "delprimary",
  "انضمام": "join",
  "حدث": "evento",
  "مؤقت": "efimero",

  // ── الاقتصاد / economy ──
  "رصيدي": "saldo",
  "الرصيد": "saldo",
  "المتجر": "tienda",
  "متجر": "tienda",
  "شراء": "comprar",
  "اشتري": "comprar",
  "شخصية": "buychar",
  "شخصيات": "buychar",
  "حقيبة": "inventario",
  "المخزون": "inventario",
  "تجهيز": "equipar",
  "عمل": "work",
  "اعمل": "work",
  "يومي": "daily",
  "اسبوعي": "weekly",
  "شهري": "monthly",
  "سرقة": "rob",
  "اسرق": "rob",
  "شحاذة": "mendigar",
  "تسول": "mendigar",
  "جريمة": "crimen",
  "توبة": "rt",
  "الأغنياء": "baltop",
  "اغنياء": "baltop",
  "مستوى": "nivel",
  "رتبتي": "nivel",
  "تحويل": "donar",
  "تبرع": "donar",
  "ايداع": "depositar",

  // ── التحميل / dl ──
  "يوتيوب": "play",
  "اغنية": "play",
  "صوتية": "play2",
  "فيديو": "play2",
  "تيك-توك": "tiktok",
  "تيكتوك": "tiktok",
  "انستقرام": "instagram",
  "انستغرام": "instagram",
  "فيسبوك": "facebook",
  "بينتريست": "pinterest",
  "ميديافاير": "mediafire",
  "ميجا": "mega",
  "ريديت": "reddit",
  "ساوند": "scdl",
  "بحث-ساوند": "scsearch",

  // ── الملصقات / stickers ──
  "ملصق": "s",
  "ستيكر": "s",
  "برات": "brat",
  "بحث-ملصق": "stickersearch",
  "اسم-الملصق": "setmeta",
  "حذف-اسم-الملصق": "delmeta",
  "تحويل-صورة": "toimg",

  // ── الأدوات / utils ──
  "بينغ": "ping",
  "سرعة": "ping",
  "جودة": "hd",
  "ايبي": "ip",
  "اقرأني": "readviewonce",
  "بلاغ": "report",
  "تخفي": "spoiler",
  "تحقق": "checkban",
  "يوتيوب-بحث": "ytsearch",
  "تفاعل-قناة": "reactcanal",

  // ── المالك / owner ──
  "اذاعة": "bc",
  "بث": "bc",
  "اعادة": "restart",
  "تحديث": "update",
  "اعادة-تحميل": "reload",
  "تنظيف": "cleartmp",
  "وضع-خاص": "self",
  "فلوس": "chetar",
  "نغمة": "tono",

  // ── البوتات الفرعية / sockets ──
  "البوتات": "bots",
  "كود": "code",
  "حذف-بوت": "delbot",
  "اسم-البوت": "setname",
  "بانر-البوت": "setbanner",

  // ── الذكاء الاصطناعي ──
  "ذكاء": "chatgpt",
  "اسأل": "chatgpt",
};

/** Resolve an Arabic alias to the plugin's canonical name, or return it as-is. */
export function resolveAlias(name) {
  const key = String(name || "").toLowerCase();
  return ARABIC_ALIASES[key] || key;
}
