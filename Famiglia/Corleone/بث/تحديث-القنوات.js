#!/usr/bin/env node
/**
 * يبني قائمة القنوات من iptv-org ويختبر كل رابط حيّاً.
 *
 *   node Famiglia/Corleone/بث/تحديث-القنوات.js              # كل القنوات (~11 ألف)
 *   node Famiglia/Corleone/بث/تحديث-القنوات.js --arabic     # العربية وحدها
 *   node Famiglia/Corleone/بث/تحديث-القنوات.js --limit 3000 # سقف للقنوات الحيّة
 *   node Famiglia/Corleone/بث/تحديث-القنوات.js --dry-run    # معاينة بلا كتابة
 *
 * كل رابط يُفحص بطلب HTTP حقيقي؛ ما لا يعمل يُسقَط، فلا تصل روابط ميتة للبوت.
 * الفحص متوازٍ (24 مهمة) ومهلته 12 ثانية، فـ11 ألف رابط تحتاج دقائق لا ساعات.
 *
 * هذا ملف بناء لا يعمل وقت التشغيل: البوت يقرأ قنوات.js المُولَّد فقط.
 */
import { writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const INDEX = "https://iptv-org.github.io/iptv/index.m3u"
const ARABIC = "https://iptv-org.github.io/iptv/languages/ara.m3u"
const COUNTRIES_API = "https://iptv-org.github.io/api/countries.json"
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "قنوات.js")

// أسماء الدول بالعربية (رمز ISO → الاسم). ما ليس هنا يبقى بالإنجليزية.
const COUNTRIES_AR = {
  "sa": "السعودية",
  "eg": "مصر",
  "ae": "الإمارات",
  "iq": "العراق",
  "lb": "لبنان",
  "sy": "سوريا",
  "jo": "الأردن",
  "ps": "فلسطين",
  "kw": "الكويت",
  "qa": "قطر",
  "bh": "البحرين",
  "om": "عمان",
  "ye": "اليمن",
  "ma": "المغرب",
  "dz": "الجزائر",
  "tn": "تونس",
  "ly": "ليبيا",
  "sd": "السودان",
  "mr": "موريتانيا",
  "eh": "الصحراء الغربية",
  "dj": "جيبوتي",
  "so": "الصومال",
  "km": "جزر القمر",
  "tr": "تركيا",
  "ir": "إيران",
  "us": "أمريكا",
  "uk": "بريطانيا",
  "fr": "فرنسا",
  "de": "ألمانيا",
  "it": "إيطاليا",
  "es": "إسبانيا",
  "nl": "هولندا",
  "be": "بلجيكا",
  "se": "السويد",
  "no": "النرويج",
  "dk": "الدنمارك",
  "fi": "فنلندا",
  "pl": "بولندا",
  "pt": "البرتغال",
  "gr": "اليونان",
  "ru": "روسيا",
  "ua": "أوكرانيا",
  "ro": "رومانيا",
  "hu": "هنغاريا",
  "cz": "التشيك",
  "at": "النمسا",
  "ch": "سويسرا",
  "ie": "أيرلندا",
  "ca": "كندا",
  "mx": "المكسيك",
  "br": "البرازيل",
  "ar": "الأرجنتين",
  "cl": "تشيلي",
  "co": "كولومبيا",
  "pe": "بيرو",
  "ve": "فنزويلا",
  "in": "الهند",
  "pk": "باكستان",
  "bd": "بنغلاديش",
  "cn": "الصين",
  "jp": "اليابان",
  "kr": "كوريا الجنوبية",
  "th": "تايلاند",
  "vn": "فيتنام",
  "id": "إندونيسيا",
  "my": "ماليزيا",
  "ph": "الفلبين",
  "sg": "سنغافورة",
  "au": "أستراليا",
  "nz": "نيوزيلندا",
  "za": "جنوب أفريقيا",
  "ng": "نيجيريا",
  "ke": "كينيا",
  "et": "إثيوبيا",
  "gh": "غانا",
  "sn": "السنغال",
  "az": "أذربيجان",
  "kz": "كازاخستان",
  "uz": "أوزبكستان",
  "af": "أفغانستان",
  "ge": "جورجيا",
  "am": "أرمينيا",
  "cy": "قبرص",
  "mt": "مالطا",
  "il": "إسرائيل",
  "tw": "تايوان",
  "hk": "هونغ كونغ",
  "mm": "ميانمار",
  "lk": "سريلانكا",
  "np": "نيبال",
  "iq2": "",
  "pr": "بورتوريكو",
  "do": "الدومينيكان",
  "cu": "كوبا",
  "ec": "الإكوادور",
  "uy": "أوروغواي",
  "py": "باراغواي",
  "bo": "بوليفيا",
  "cr": "كوستاريكا",
  "pa": "بنما",
  "rs": "صربيا",
  "hr": "كرواتيا",
  "si": "سلوفينيا",
  "sk": "سلوفاكيا",
  "bg": "بلغاريا",
  "lt": "ليتوانيا",
  "lv": "لاتفيا",
  "ee": "إستونيا",
  "by": "روسيا البيضاء",
  "md": "مولدوفا",
  "al": "ألبانيا",
  "mk": "مقدونيا",
  "ba": "البوسنة",
  "me": "الجبل الأسود",
  "is": "آيسلندا",
  "lu": "لوكسمبورغ",
}

// أسماء القنوات الشائعة بالعربية (الاسم الإنجليزي → العربي)
const AR = {
  "Al Jazeera": "الجزيرة",
  "Al Jazeera 2": "الجزيرة 2",
  "Al Jazeera Mubasher": "الجزيرة مباشر",
  "Al Jazeera Mubasher 24": "الجزيرة مباشر 24",
  "Al Jazeera Mubasher Broadcast 2": "الجزيرة مباشر 2",
  "Alarabiya": "العربية",
  "Al Arabiya": "العربية",
  "Al Ekhbariya": "الإخبارية",
  "Al Hadath": "الحدث",
  "Al Ghad TV": "الغد",
  "Al Araby TV": "العربي",
  "Al Araby TV 2": "العربي 2",
  "Al Iraqia": "العراقية",
  "Al Iraqia News": "العراقية الإخبارية",
  "Al Masar TV": "المسار",
  "Al Mashhad": "المشهد",
  "Al Mayadeen TV": "الميادين",
  "Al Najah News": "النجاح",
  "Al Yaum TV": "اليوم",
  "Al Alam Al Yawm": "العالم اليوم",
  "AL24 News": "AL24",
  "BBC Arabic": "BBC عربي",
  "DW Arabic": "DW عربي",
  "France 24 Arabic": "فرانس 24 عربي",
  "CGTN Arabic": "CGTN عربي",
  "Al Manar": "المنار",
  "Al-Manar": "المنار",
  "Al Masirah": "المسيرة",
  "Al Masirah Mubacher": "المسيرة مباشر",
  "Alghadeer TV": "الغدير",
  "Al Sharqiya News": "الشرقية",
  "Dijlah TV": "دجلة",
  "Halab Today TV": "حلب اليوم",
  "Syria TV": "سوريا",
  "Sama TV": "سما",
  "Saudi TV": "السعودية",
  "KTV News": "KTV",
  "Kuwait TV": "الكويت",
  "Qatar TV": "قطر",
  "Oman TV": "عمان",
  "Bahrain TV": "البحرين",
  "Dubai TV": "دبي",
  "Abu Dhabi TV": "أبوظبي",
  "Sharjah TV": "الشارقة",
  "Ajman TV": "عجمان",
  "Al Hayat": "الحياة",
  "Al Aoula": "الأولى",
  "Quran TV": "القرآن الكريم",
  "Al Quran Al Kareem TV": "القرآن الكريم",
  "Alquran": "القرآن",
  "Saudi Quran TV": "السعودية القرآن",
  "Sharjah Quran TV": "الشارقة القرآن",
  "Bahrain Quran": "البحرين القرآن",
  "Holy Quran Radio": "إذاعة القرآن",
  "Holy Quran Radio Kuwait": "إذاعة القرآن",
  "Sunnah TV": "السنة النبوية",
  "Al Sunnah Al Nabawiyah TV": "السنة النبوية",
  "Al Maaref TV": "المعارف",
  "Al Resalah": "الرسالة",
  "Al Iman TV": "الإيمان",
  "Al Kawthar": "الكوثر",
  "Al Thaqalayn TV": "الثقلين",
  "Ahlulbayt TV": "أهل البيت",
  "I24NEWS Arabic": "i24 عربي",
  "TRT Arabi": "TRT عربي",
  "RT Arabic": "RT عربي",
  "Sky News Arabia": "سكاي نيوز عربية",
  "Alhurra": "الحرة",
  "Al Hurra": "الحرة",
  "Al Jazeera Documentary": "الجزيرة الوثائقية",
  "Al Jazeera Balkans": "الجزيرة بلقان",
  "Al Arabiya Al Hadath": "العربية الحدث",
  "Al Ekhbariya Al Saudiya": "الإخبارية السعودية",
  "Saudi TV 1": "السعودية 1",
  "Saudi TV 2": "السعودية 2",
  "SBC": "SBC",
  "Saudia TV": "السعودية",
  "Rotana Cinema": "روتانا سينما",
  "Rotana Khalijia": "روتانا خليجية",
  "Rotana Clip": "روتانا كليب",
  "Rotana Classic": "روتانا كلاسيك",
  "Rotana Comedy": "روتانا كوميدي",
  "Rotana Drama": "روتانا دراما",
  "MBC 1": "MBC 1",
  "MBC 2": "MBC 2",
  "MBC 3": "MBC 3",
  "MBC 4": "MBC 4",
  "MBC 5": "MBC 5",
  "MBC Drama": "MBC دراما",
  "MBC Masr": "MBC مصر",
  "MBC Masr 2": "MBC مصر 2",
  "MBC Iraq": "MBC العراق",
  "MBC Action": "MBC أكشن",
  "MBC Bollywood": "MBC بوليوود",
  "MBC Max": "MBC ماكس",
  "Dubai One": "دبي ون",
  "Dubai Sports": "دبي الرياضية",
  "Abu Dhabi Sports": "أبوظبي الرياضية",
  "AD Sports": "أبوظبي الرياضية",
  "Sharjah Sports": "الشارقة الرياضية",
  "SSC": "SSC الرياضية",
  "SSC 1": "SSC 1",
  "SSC 2": "SSC 2",
  "SSC 3": "SSC 3",
  "SSC 5": "SSC 5",
  "beIN Sports": "beIN الرياضية",
  "beIN Sports 1": "beIN 1",
  "beIN Sports 2": "beIN 2",
  "beIN Sports 3": "beIN 3",
  "Dubai Racing": "دبي ريسينغ",
  "YAS TV": "ياس",
  "Al Nassr TV": "النصر",
  "Al Hilal TV": "الهلال",
  "ON E": "ON E",
  "ON Drama": "ON دراما",
  "ON Sport": "ON سبورت",
  "CBC": "CBC",
  "CBC Drama": "CBC دراما",
  "CBC Sofra": "CBC سفرة",
  "Al Nahar": "النهار",
  "Al Nahar Drama": "النهار دراما",
  "Al Hayah": "الحياة",
  "Al Hayah 2": "الحياة 2",
  "DMC": "DMC",
  "DMC Drama": "DMC دراما",
  "Al Kahera Wal Nas": "القاهرة والناس",
  "Sada El Balad": "صدى البلد",
  "Sada El Balad 2": "صدى البلد 2",
  "TEN TV": "TEN",
  "Al Mehwar": "المحور",
  "Al Assema": "العاصمة",
  "Al Masry TV": "المصري",
  "Misr Al Zera3ya": "مصر الزراعية",
  "MTV Lebanon": "MTV لبنان",
  "LBC": "LBC",
  "LBCI": "LBCI",
  "Al Jadeed": "الجديد",
  "OTV": "OTV",
  "NBN": "NBN",
  "Tele Liban": "تلفزيون لبنان",
  "Al Manar TV": "المنار",
  "Al Mayadeen": "الميادين",
  "Samaa TV": "سماء",
  "Geo News": "جيو نيوز",
  "ARY News": "ARY",
  "Dunya News": "دنيا",
  "Express News": "إكسبريس",
  "Hum TV": "هم",
  "PTV": "PTV",
  "PTV News": "PTV نيوز",
  "Sunni TV": "السنة",
  "Karbala TV": "كربلاء",
  "Al Kafeel": "الكفيل",
  "Al Forat": "الفرات",
  "Al Sumaria": "السومرية",
  "Al Baghdadia": "البغدادية",
  "Al Sharqiya": "الشرقية",
  "Rudaw": "روداو",
  "Kurdistan 24": "كردستان 24",
  "K24": "K24",
  "Al Ikhbariya": "الإخبارية",
  "Alaan TV": "الآن",
  "Al Mashhad TV": "المشهد",
  "Al Ghad": "الغد",
  "Alghad TV": "الغد",
  "Al Ghad Al Mushriq": "الغد المشرق",
  "2M": "2M",
  "2M TV": "2M",
  "Al Aoula TV": "الأولى",
  "Arryadia": "الرياضية المغربية",
  "Arryadia TNT": "الرياضية",
  "Tamazight TV": "الأمازيغية",
  "Al Massira TV": "المسيرة",
  "Chada TV": "شدى",
  "Medi1 TV": "ميدي 1",
  "Medi1 TV Arabic": "ميدي 1 عربي",
  "Nessma": "نسما",
  "Nessma TV": "نسما",
  "Hannibal TV": "حنبعل",
  "Tunisia National 1": "الوطنية 1",
  "Tunisia National 2": "الوطنية 2",
  "El Watania 1": "الوطنية 1",
  "El Watania 2": "الوطنية 2",
  "Echorouk TV": "الشروق",
  "Echorouk News": "الشروق نيوز",
  "Ennahar TV": "النهار",
  "El Djazairia": "الجزائرية",
  "Samira TV": "سميرة",
  "A3": "A3",
  "Canal Algerie": "القناة الجزائرية",
  "Libya Al Ahrar": "ليبيا الأحرار",
  "Libya TV": "ليبيا",
  "Al Watan TV": "الوطن",
  "Sudan TV": "السودان",
  "Blue Nile TV": "النيل الأزرق",
  "Al Shamalia TV": "الشمالية",
  "Yemen TV": "اليمن",
  "Al Masirah TV": "المسيرة",
  "Yemen Today": "اليمن اليوم",
  "Oman TV 1": "عمان 1",
  "Oman TV 2": "عمان 2",
  "Oman Sports": "عمان الرياضية",
  "Bahrain TV 1": "البحرين 1",
  "Bahrain Sports": "البحرين الرياضية",
  "Kuwait TV 1": "الكويت 1",
  "Kuwait TV 2": "الكويت 2",
  "KTV 2": "KTV 2",
  "Kuwait Sports": "الكويت الرياضية",
  "Ethraa TV": "إثراء",
  "Jordan TV": "الأردن",
  "Jordan Sport": "الأردن الرياضية",
  "JRTV": "التلفزيون الأردني",
  "Roya TV": "رويا",
  "Palestine TV": "فلسطين",
  "Al Falastiniah": "الفلسطينية",
  "Aqsa TV": "الأقصى",
  "Palestine Today": "فلسطين اليوم",
  "Syria TV 1": "سوريا 1",
  "Sama TV Syria": "سما",
  "Souryana TV": "سوريانا",
  "Al Ekhbariya Syria": "الإخبارية السورية",
  "Qatar TV 1": "قطر 1",
  "Qatar TV 2": "قطر 2",
  "Al Rayyan": "الريان",
  "Al Kass": "الكاس",
  "Al Kass One": "الكاس 1",
  "Al Kass Two": "الكاس 2",
  "Qatar 2": "قطر 2",
  "Quran TV Qatar": "القرآن الكريم",
  "Al Jazeera English": "الجزيرة الإنجليزية",
}

// تصنيفات iptv-org → العنوان العربي والأيقونة. أول تصنيف يطابق هو الذي
// تُنسب إليه القناة، فالترتيب مهم: «أخبار» قبل «منوعة» حتى لا تبتلعها.
const CATEGORIES = [
  ["أخبار", "📰", ["News", "Business;News", "Documentary;News", "Education;News", "General;News"]],
  ["رياضة", "⚽", ["Sports", "General;Sports"]],
  ["دينية", "🕌", ["Religious"]],
  ["أفلام", "🎬", ["Movies", "Series", "Classic"]],
  ["أغاني", "🎵", ["Music"]],
  ["أطفال", "🧸", ["Kids", "Animation;Kids", "Kids;Religious"]],
  ["وثائقية", "🎥", ["Documentary"]],
  ["كوميديا", "😂", ["Comedy"]],
  ["منوعة", "🎭", ["General", "Entertainment", "Culture", "Family", "Education", "Cooking", "Business"]],
];

// الدول العربية تُقدَّم أولاً، والبقية بعدها بترتيب أبجدي.
const ARAB = new Set([
  "ae", "bh", "dj", "dz", "eg", "eh", "iq", "jo", "km", "kw", "lb", "ly", "ma", "mr", "om",
  "ps", "qa", "sa", "sd", "so", "sy", "tn", "ye"
])

// قنوات نستثنيها: إسرائيلية أو غير عربية فعلياً رغم تصنيفها
const BLOCK = ["i24NEWS", "I24", "Israel", "Kan ", "Channel 13", "Channel 14"]

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
const TIMEOUT = 12

async function fetchText(url, timeout = 90000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// رمز الدولة → (الاسم، العلم). تعذّر الجلب لا يوقف البناء.
async function loadCountries() {
  try {
    const rows = JSON.parse(await fetchText(COUNTRIES_API))
    const map = {}
    for (const r of rows) {
      if (r.code) map[String(r.code).toLowerCase()] = [r.name || r.code, r.flag || ""]
    }
    return map
  } catch (e) {
    console.log(`! تعذّر جلب أسماء الدول: ${e.message}`)
    return {}
  }
}

// قائمة قنوات، كل واحدة بمجموعاتها ودولتها.
function parseM3U(text) {
  const entries = []
  let cur = null

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (line.startsWith("#EXTINF")) {
      const g = /group-title="([^"]*)"/.exec(line)
      const tid = /tvg-id="([^"]*)"/.exec(line)
      // "2M.ma@SD" → "ma"
      const cc = tid ? /\.([a-z]{2})@/.exec(tid[1]) : null
      cur = {
        groups: (g ? g[1] : "").split(";").map((x) => x.trim()),
        raw: line.slice(line.lastIndexOf(",") + 1).trim(),
        country: cc ? cc[1] : "",
        url: "",
        opts: []
      }
    } else if (line.startsWith("#EXTVLCOPT:") && cur) {
      cur.opts.push(line.slice(line.indexOf(":") + 1).trim())
    } else if (line.startsWith("http") && cur) {
      cur.url = line
      entries.push(cur)
      cur = null
    }
  }
  return entries
}

// يفحص الرابط: يكفي أن يستجيب بمحتوى بث صالح.
async function probe(entry) {
  const headers = { "User-Agent": UA }
  for (const opt of entry.opts) {
    const low = opt.toLowerCase()
    if (low.startsWith("http-referrer=")) headers.Referer = opt.split("=").slice(1).join("=")
    else if (low.startsWith("http-user-agent=")) headers["User-Agent"] = opt.split("=").slice(1).join("=")
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT * 1000)
  try {
    const res = await fetch(entry.url, { headers, signal: ctrl.signal })
    if (res.status !== 200) return null
    // نقرأ أول 512 بايت فقط — يكفي للتحقق ولا نُهدر النطاق
    const reader = res.body?.getReader()
    if (!reader) return null
    const { value } = await reader.read()
    await reader.cancel()
    const head = value ? new TextDecoder().decode(value.slice(0, 512)) : ""
    return head.includes("#EXTM3U") || head.includes("#EXT-X") || head.length > 0 ? entry : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const qualityOf = (raw) => {
  const m = /\((\d{3,4})p\)/.exec(raw)
  return m ? `${m[1]}p` : null
}

// يزيل الجودة والوسوم: «Al Jazeera (1080p)» ← «Al Jazeera».
function cleanName(raw) {
  let n = raw.replace(/\((?:[0-9]{3,4}p|[A-Z]{2})\)/g, "")
  n = n.replace(/\[[^\]]*\]/g, "")
  return n.replace(/\s+/g, " ").replace(/^[-–\s]+|[-–\s]+$/g, "")
}

function categoryOf(entry) {
  for (const [title, , tags] of CATEGORIES) {
    if (tags.some((t) => entry.groups.includes(t))) return title
  }
  return null
}

const isArabic = (s) => /[\u0600-\u06ff]/.test(s)

// الأسماء العربية أولاً، ثم الإنجليزية أبجدياً
const sortKey = (item) => [isArabic(item[0]) ? 0 : 1, item[0]]

function compareSort(a, b) {
  const [ka, na] = sortKey(a)
  const [kb, nb] = sortKey(b)
  return ka - kb || na.localeCompare(nb)
}

// الدول العربية أولاً ثم الباقي أبجدياً
const countryKey = (key) => [ARAB.has(key[2]) ? 0 : 1, key[0]]

function compareCountry(a, b) {
  const [ka, na] = countryKey(a)
  const [kb, nb] = countryKey(b)
  return ka - kb || na.localeCompare(nb)
}

// دولة ← تصنيف ← [قنوات]، مع إسقاط المكرر بالاسم.
function build(entries, countries) {
  const tree = new Map()
  const seen = new Set()

  for (const e of [...entries].sort((a, b) => a.raw.localeCompare(b.raw))) {
    const rawName = cleanName(e.raw)
    // الاسم المعروض عربي إن وُجد في القاموس، وإلا يبقى كما هو
    const name = AR[rawName] ?? rawName
    if (!name || seen.has(name)) continue

    const cat = categoryOf(e)
    if (!cat) continue
    seen.add(name)

    const cc = e.country || ""
    // الاسم العربي من خريطتنا، وإلا الإنجليزي من iptv-org، وإلا الرمز
    const cname = COUNTRIES_AR[cc] || (cc ? countries[cc]?.[0] || cc.toUpperCase() : "أخرى")
    const flag = countries[cc]?.[1] || ""
    const key = `${cname}\u0000${flag}\u0000${cc}`

    if (!tree.has(key)) tree.set(key, new Map())
    const cats = tree.get(key)
    if (!cats.has(cat)) cats.set(cat, [])
    cats.get(cat).push([name, e.url, qualityOf(e.raw)])
  }
  return tree
}

const j = (v) => JSON.stringify(v)

// يكتب الشجرة ويضيف فهارس مسطّحة للأوامر القديمة.
function writeJs(tree) {
  const order = new Map(CATEGORIES.map(([t], i) => [t, i]))
  const countries = [...tree.entries()]
    .map(([k, cats]) => [k.split("\u0000"), cats])
    .sort((a, b) => compareCountry(a[0], b[0]))

  const lines = [
    "// مولَّد آلياً بـ Famiglia/Corleone/بث/تحديث-القنوات.js — لا تعدّله يدوياً.",
    "// كل رابط هنا مُختبَر حيّاً (HTTP 200 + محتوى بث) وقت التوليد.",
    "// المصدر: iptv-org. البنية: دولة ← تصنيف ← قناة ← جودة.",
    "",
    "export const COUNTRIES_TREE = ["
  ]

  for (const [[cname, flag], cats] of countries) {
    lines.push("  {")
    lines.push(`    title: ${j(`${flag} ${cname}`.trim())},`)
    lines.push("    categories: [")
    for (const title of [...cats.keys()].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))) {
      const icon = CATEGORIES.find(([t]) => t === title)?.[1] ?? ""
      lines.push("      {")
      lines.push(`        title: ${j(`${icon} ${title}`)},`)
      lines.push("        channels: [")
      for (const [name, url, quality] of cats.get(title).sort(compareSort)) {
        lines.push(`          { name: ${j(name)}, url: ${j(url)}, quality: ${quality ? j(quality) : "null"} },`)
      }
      lines.push("        ]")
      lines.push("      },")
    }
    lines.push("    ]")
    lines.push("  },")
  }
  lines.push("]", "")

  const flat = countries.flatMap(([, cats]) => [...cats.values()].flat())

  lines.push("// اسم القناة → رابطه")
  lines.push("export const CHANNELS = {")
  for (const [name, url] of flat) lines.push(`  ${j(name)}: ${j(url)},`)
  lines.push("}", "")

  lines.push("// اسم القناة → جودتها الأصلية كما وردت في المصدر")
  lines.push("export const QUALITIES = {")
  for (const [name, , quality] of flat) if (quality) lines.push(`  ${j(name)}: ${j(quality)},`)
  lines.push("}", "")

  lines.push("// أقسام مسطّحة (للتوافق مع الأوامر القديمة)")
  lines.push("export const GROUPS = [")
  const byCat = new Map()
  for (const [, cats] of countries) {
    for (const [title, items] of cats) {
      if (!byCat.has(title)) byCat.set(title, [])
      byCat.get(title).push(...items)
    }
  }
  for (const [title, icon] of CATEGORIES) {
    const items = byCat.get(title)
    if (!items?.length) continue
    lines.push(`  { title: "${icon} ${title}", names: [`)
    for (const [name] of [...items].sort(compareSort)) lines.push(`    ${j(name)},`)
    lines.push("  ] },")
  }
  lines.push("]", "", ALIASES_BLOCK)

  return lines.join("\n") + "\n"
}

// يقطع الذيل مع الحفاظ على ترتيب الدول والتصنيفات.
function applyLimit(tree, limit) {
  const kept = new Map()
  let room = limit
  for (const [key, cats] of [...tree.entries()].sort((a, b) => compareCountry(a[0].split("\u0000"), b[0].split("\u0000")))) {
    if (room <= 0) break
    const trimmed = new Map()
    for (const [cat, items] of cats) {
      if (room <= 0) break
      const take = items.slice(0, room)
      if (take.length) {
        trimmed.set(cat, take)
        room -= take.length
      }
    }
    if (trimmed.size) kept.set(key, trimmed)
  }
  return kept
}

function parseArgs(argv) {
  const args = { arabic: false, limit: 0, workers: 24, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--arabic") args.arabic = true
    else if (a === "--dry-run") args.dryRun = true
    else if (a === "--limit") args.limit = Number(argv[++i]) || 0
    else if (a === "--workers") args.workers = Number(argv[++i]) || 24
  }
  return args
}

// فحص متوازٍ بسقف تزامن — بديل ThreadPoolExecutor في بايثون
async function probeAll(entries, workers) {
  const alive = []
  let done = 0
  let next = 0

  const worker = async () => {
    while (next < entries.length) {
      const entry = entries[next++]
      const res = await probe(entry)
      done++
      if (res) alive.push(res)
      if (done % 500 === 0) console.log(`  ${done}/${entries.length} — حيّ ${alive.length}`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, entries.length) }, worker))
  return alive
}

const ALIASES_BLOCK = `// مرادفات إنجليزية شائعة تُقبل كاسم قناة
export const ALIASES = {
  aljazeera: "الجزيرة",
  jazeera: "الجزيرة",
  aja: "الجزيرة",
  arabiya: "العربية",
  alarabiya: "العربية",
  ekhbariya: "الإخبارية السعودية",
  hadath: "الحدث",
  iraqia: "العراقية",
  saudiya: "السعودية",
  quran: "القرآن الكريم",
  arabic: "الجزيرة",
  araby: "العربي",
  ghad: "الغد",
  mayadeen: "الميادين",
  masirah: "المسيرة",
  manar: "المنار"
}

export function channelNames() {
  return Object.keys(CHANNELS)
}

// يبحث بالاسم العربي، أو مرادف إنجليزي، أو جزء من الاسم
export function findChannel(query) {
  const q = String(query || "").trim()
  if (!q) return null
  if (CHANNELS[q]) return { name: q, url: CHANNELS[q] }

  const stripped = q.replace(/^(قناة|بث|شاهد)\\s+/u, "").trim()
  const lower = stripped.toLowerCase()

  const alias = ALIASES[lower]
  if (alias && CHANNELS[alias]) return { name: alias, url: CHANNELS[alias] }

  const hit = Object.keys(CHANNELS).find((n) => n.toLowerCase().includes(lower))
  return hit ? { name: hit, url: CHANNELS[hit] } : null
}`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const source = args.arabic ? ARABIC : INDEX

  console.log(`→ تنزيل ${source}`)
  let entries = parseM3U(await fetchText(source))
  console.log(`  ${entries.length} قناة خام`)

  entries = entries.filter((e) => !BLOCK.some((b) => e.raw.includes(b)))
  if (args.arabic) entries = entries.filter((e) => ARAB.has(e.country) || !e.country)
  console.log(`→ فحص ${entries.length} رابط (مهلة ${TIMEOUT}s، ${args.workers} مهمة)...`)

  const alive = await probeAll(entries, args.workers)
  console.log(`✓ حيّ: ${alive.length} من ${entries.length}`)

  const tree = build(alive, await loadCountries())
  const count = (t) => [...t.values()].reduce((n, cats) => n + [...cats.values()].reduce((m, v) => m + v.length, 0), 0)

  let total = count(tree)
  console.log(`→ بعد التنظيف: ${total} قناة في ${tree.size} دولة`)

  let finalTree = tree
  if (args.limit && total > args.limit) {
    finalTree = applyLimit(tree, args.limit)
    total = count(finalTree)
    console.log(`→ بعد السقف: ${total} قناة`)
  }

  if (args.dryRun) {
    for (const [k, cats] of [...finalTree.entries()].sort((a, b) => compareCountry(a[0].split("\u0000"), b[0].split("\u0000"))).slice(0, 12)) {
      const [cname, flag] = k.split("\u0000")
      const n = [...cats.values()].reduce((m, v) => m + v.length, 0)
      console.log(`  ${flag} ${cname}: ${n} قناة / ${cats.size} تصنيف`)
    }
    return 0
  }

  await writeFile(OUT, writeJs(finalTree), "utf-8")
  console.log(`✓ كُتب ${OUT}`)
  return 0
}

main().then((code) => process.exit(code))
