#!/usr/bin/env python3
"""
يبني قائمة القنوات من iptv-org ويختبر كل رابط حيّاً.

    python3 Famiglia/Corleone/بث/تحديث-القنوات.py                  # كل القنوات (~11 ألف)
    python3 Famiglia/Corleone/بث/تحديث-القنوات.py --arabic         # العربية وحدها فقط
    python3 Famiglia/Corleone/بث/تحديث-القنوات.py --limit 3000     # سقف للقنوات الحيّة
    python3 Famiglia/Corleone/بث/تحديث-القنوات.py --dry-run        # معاينة بلا كتابة

كل رابط يُفحص بطلب HTTP حقيقي؛ ما لا يعمل يُسقَط، فلا تصل روابط ميتة للبوت.
الفحص متوازٍ (24 خيطاً) ومهلته 12 ثانية، فـ11 ألف رابط تحتاج دقائق لا ساعات.
"""
import argparse
import concurrent.futures as cf
import json
import re
import urllib.request
from pathlib import Path

INDEX = "https://iptv-org.github.io/iptv/index.m3u"
ARABIC = "https://iptv-org.github.io/iptv/languages/ara.m3u"
COUNTRIES_API = "https://iptv-org.github.io/api/countries.json"
HERE = Path(__file__).resolve().parent
OUT = HERE / "قنوات.js"

# أسماء الدول بالعربية (رمز ISO → الاسم). ما ليس هنا يبقى بالإنجليزية.
COUNTRIES_AR = {
    "sa": "السعودية", "eg": "مصر", "ae": "الإمارات", "iq": "العراق",
    "lb": "لبنان", "sy": "سوريا", "jo": "الأردن", "ps": "فلسطين",
    "kw": "الكويت", "qa": "قطر", "bh": "البحرين", "om": "عمان",
    "ye": "اليمن", "ma": "المغرب", "dz": "الجزائر", "tn": "تونس",
    "ly": "ليبيا", "sd": "السودان", "mr": "موريتانيا", "eh": "الصحراء الغربية",
    "dj": "جيبوتي", "so": "الصومال", "km": "جزر القمر", "tr": "تركيا",
    "ir": "إيران", "us": "أمريكا", "uk": "بريطانيا", "fr": "فرنسا",
    "de": "ألمانيا", "it": "إيطاليا", "es": "إسبانيا", "nl": "هولندا",
    "be": "بلجيكا", "se": "السويد", "no": "النرويج", "dk": "الدنمارك",
    "fi": "فنلندا", "pl": "بولندا", "pt": "البرتغال", "gr": "اليونان",
    "ru": "روسيا", "ua": "أوكرانيا", "ro": "رومانيا", "hu": "هنغاريا",
    "cz": "التشيك", "at": "النمسا", "ch": "سويسرا", "ie": "أيرلندا",
    "ca": "كندا", "mx": "المكسيك", "br": "البرازيل", "ar": "الأرجنتين",
    "cl": "تشيلي", "co": "كولومبيا", "pe": "بيرو", "ve": "فنزويلا",
    "in": "الهند", "pk": "باكستان", "bd": "بنغلاديش", "cn": "الصين",
    "jp": "اليابان", "kr": "كوريا الجنوبية", "th": "تايلاند", "vn": "فيتنام",
    "id": "إندونيسيا", "my": "ماليزيا", "ph": "الفلبين", "sg": "سنغافورة",
    "au": "أستراليا", "nz": "نيوزيلندا", "za": "جنوب أفريقيا", "ng": "نيجيريا",
    "ke": "كينيا", "et": "إثيوبيا", "gh": "غانا", "sn": "السنغال",
    "az": "أذربيجان", "kz": "كازاخستان", "uz": "أوزبكستان", "af": "أفغانستان",
    "ge": "جورجيا", "am": "أرمينيا", "cy": "قبرص", "mt": "مالطا",
    "il": "إسرائيل", "tw": "تايوان", "hk": "هونغ كونغ", "mm": "ميانمار",
    "lk": "سريلانكا", "np": "نيبال", "iq2": "", "pr": "بورتوريكو",
    "do": "الدومينيكان", "cu": "كوبا", "ec": "الإكوادور", "uy": "أوروغواي",
    "py": "باراغواي", "bo": "بوليفيا", "cr": "كوستاريكا", "pa": "بنما",
    "rs": "صربيا", "hr": "كرواتيا", "si": "سلوفينيا", "sk": "سلوفاكيا",
    "bg": "بلغاريا", "lt": "ليتوانيا", "lv": "لاتفيا", "ee": "إستونيا",
    "by": "روسيا البيضاء", "md": "مولدوفا", "al": "ألبانيا", "mk": "مقدونيا",
    "ba": "البوسنة", "me": "الجبل الأسود", "is": "آيسلندا", "lu": "لوكسمبورغ",
}

# تصنيفات iptv-org → العنوان العربي والأيقونة. أول تصنيف يطابق هو الذي
# تُنسب إليه القناة، فالترتيب مهم: «أخبار» قبل «منوعة» حتى لا تبتلعها.
AR = {
    "Al Jazeera": "الجزيرة", "Al Jazeera 2": "الجزيرة 2",
    "Al Jazeera Mubasher": "الجزيرة مباشر", "Al Jazeera Mubasher 24": "الجزيرة مباشر 24",
    "Al Jazeera Mubasher Broadcast 2": "الجزيرة مباشر 2",
    "Alarabiya": "العربية", "Al Arabiya": "العربية", "Al Ekhbariya": "الإخبارية السعودية",
    "Al Hadath": "الحدث", "Al Ghad TV": "الغد", "Al Araby TV": "العربي", "Al Araby TV 2": "العربي 2",
    "Al Iraqia": "العراقية", "Al Iraqia News": "العراقية الإخبارية",
    "Al Masar TV": "المسار", "Al Mashhad": "المشهد", "Al Mayadeen TV": "الميادين",
    "Al Najah News": "النجاح", "Al Yaum TV": "اليوم", "Al Alam Al Yawm": "العالم اليوم",
    "AL24 News": "AL24", "BBC Arabic": "BBC عربي", "DW Arabic": "DW عربي",
    "France 24 Arabic": "فرانس 24 عربي", "CGTN Arabic": "CGTN عربي",
    "Al Manar": "المنار", "Al-Manar": "المنار", "Al Masirah": "المسيرة",
    "Al Masirah Mubacher": "المسيرة مباشر", "Alghadeer TV": "الغدير",
    "Al Sharqiya News": "الشرقية", "Dijlah TV": "دجلة", "Halab Today TV": "حلب اليوم",
    "Syria TV": "سوريا", "Sama TV": "سما", "Saudi TV": "السعودية",
    "KTV News": "KTV", "Kuwait TV": "الكويت", "Qatar TV": "قطر", "Oman TV": "عمان",
    "Bahrain TV": "البحرين", "Dubai TV": "دبي", "Abu Dhabi TV": "أبوظبي",
    "Sharjah TV": "الشارقة", "Ajman TV": "عجمان", "Al Hayat": "الحياة",
    "Al Aoula": "الأولى",
    "Quran TV": "القرآن الكريم", "Al Quran Al Kareem TV": "القرآن الكريم",
    "Alquran": "القرآن", "Saudi Quran TV": "السعودية القرآن",
    "Sharjah Quran TV": "الشارقة القرآن", "Bahrain Quran": "البحرين القرآن",
    "Holy Quran Radio": "إذاعة القرآن", "Holy Quran Radio Kuwait": "إذاعة القرآن",
    "Sunnah TV": "السنة النبوية", "Al Sunnah Al Nabawiyah TV": "السنة النبوية",
    "Al Maaref TV": "المعارف", "Al Resalah": "الرسالة", "Al Iman TV": "الإيمان",
    "Al Kawthar": "الكوثر", "Al Thaqalayn TV": "الثقلين", "Ahlulbayt TV": "أهل البيت",
    "I24NEWS Arabic": "i24 عربي", "TRT Arabi": "TRT عربي", "RT Arabic": "RT عربي",
    "Sky News Arabia": "سكاي نيوز عربية", "Alhurra": "الحرة", "Al Hurra": "الحرة",

    # قنوات عربية إضافية شائعة
    "Al Jazeera Documentary": "الجزيرة الوثائقية",
    "Al Jazeera Balkans": "الجزيرة بلقان",
    "Al Arabiya Al Hadath": "العربية الحدث",
    "Al Ekhbariya Al Saudiya": "الإخبارية السعودية",
    "Saudi TV 1": "السعودية 1", "Saudi TV 2": "السعودية 2",
    "SBC": "SBC", "Saudia TV": "السعودية",
    "Rotana Cinema": "روتانا سينما", "Rotana Khalijia": "روتانا خليجية",
    "Rotana Clip": "روتانا كليب", "Rotana Classic": "روتانا كلاسيك",
    "Rotana Comedy": "روتانا كوميدي", "Rotana Drama": "روتانا دراما",
    "MBC 1": "MBC 1", "MBC 2": "MBC 2", "MBC 3": "MBC 3", "MBC 4": "MBC 4",
    "MBC 5": "MBC 5", "MBC Drama": "MBC دراما", "MBC Masr": "MBC مصر",
    "MBC Masr 2": "MBC مصر 2", "MBC Iraq": "MBC العراق", "MBC Action": "MBC أكشن",
    "MBC Bollywood": "MBC بوليوود", "MBC Max": "MBC ماكس",
    "Dubai One": "دبي ون", "Dubai Sports": "دبي الرياضية",
    "Abu Dhabi Sports": "أبوظبي الرياضية", "AD Sports": "أبوظبي الرياضية",
    "Sharjah Sports": "الشارقة الرياضية", "SSC": "SSC الرياضية",
    "SSC 1": "SSC 1", "SSC 2": "SSC 2", "SSC 3": "SSC 3", "SSC 5": "SSC 5",
    "beIN Sports": "beIN الرياضية", "beIN Sports 1": "beIN 1",
    "beIN Sports 2": "beIN 2", "beIN Sports 3": "beIN 3",
    "Dubai Racing": "دبي ريسينغ", "YAS TV": "ياس",
    "Al Nassr TV": "النصر", "Al Hilal TV": "الهلال",
    "ON E": "ON E", "ON Drama": "ON دراما", "ON Sport": "ON سبورت",
    "CBC": "CBC", "CBC Drama": "CBC دراما", "CBC Sofra": "CBC سفرة",
    "Al Nahar": "النهار", "Al Nahar Drama": "النهار دراما",
    "Al Hayah": "الحياة", "Al Hayah 2": "الحياة 2", "DMC": "DMC",
    "DMC Drama": "DMC دراما", "Al Kahera Wal Nas": "القاهرة والناس",
    "Sada El Balad": "صدى البلد", "Sada El Balad 2": "صدى البلد 2",
    "TEN TV": "TEN", "Al Mehwar": "المحور", "Al Assema": "العاصمة",
    "Al Masry TV": "المصري", "Misr Al Zera3ya": "مصر الزراعية",
    "MTV Lebanon": "MTV لبنان", "LBC": "LBC", "LBCI": "LBCI",
    "Al Jadeed": "الجديد", "OTV": "OTV", "NBN": "NBN", "Tele Liban": "تلفزيون لبنان",
    "Al Manar TV": "المنار", "Al Mayadeen": "الميادين",
    "Samaa TV": "سماء", "Geo News": "جيو نيوز", "ARY News": "ARY",
    "Dunya News": "دنيا", "Express News": "إكسبريس", "Hum TV": "هم",
    "PTV": "PTV", "PTV News": "PTV نيوز", "Sunni TV": "السنة",
    "Karbala TV": "كربلاء", "Al Kafeel": "الكفيل", "Al Forat": "الفرات",
    "Al Sumaria": "السومرية", "Al Baghdadia": "البغدادية", "Al Sharqiya": "الشرقية",
    "Rudaw": "روداو", "Kurdistan 24": "كردستان 24", "K24": "K24",
    "Al Ekhbariya": "الإخبارية", "Al Ikhbariya": "الإخبارية",
    "Alaan TV": "الآن", "Al Mashhad TV": "المشهد",
    "Sky News Arabia": "سكاي نيوز عربية", "Al Ghad": "الغد",
    "Alghad TV": "الغد", "Al Ghad Al Mushriq": "الغد المشرق",
    "2M": "2M", "2M TV": "2M", "Al Aoula TV": "الأولى",
    "Arryadia": "الرياضية المغربية", "Arryadia TNT": "الرياضية",
    "Tamazight TV": "الأمازيغية", "Al Massira TV": "المسيرة",
    "Chada TV": "شدى", "Medi1 TV": "ميدي 1", "Medi1 TV Arabic": "ميدي 1 عربي",
    "Nessma": "نسما", "Nessma TV": "نسما", "Hannibal TV": "حنبعل",
    "Tunisia National 1": "الوطنية 1", "Tunisia National 2": "الوطنية 2",
    "El Watania 1": "الوطنية 1", "El Watania 2": "الوطنية 2",
    "Echorouk TV": "الشروق", "Echorouk News": "الشروق نيوز",
    "Ennahar TV": "النهار", "El Djazairia": "الجزائرية",
    "Samira TV": "سميرة", "A3": "A3", "Canal Algerie": "القناة الجزائرية",
    "Libya Al Ahrar": "ليبيا الأحرار", "Libya TV": "ليبيا",
    "Al Watan TV": "الوطن", "Sudan TV": "السودان",
    "Blue Nile TV": "النيل الأزرق", "Al Shamalia TV": "الشمالية",
    "Yemen TV": "اليمن", "Al Masirah TV": "المسيرة", "Yemen Today": "اليمن اليوم",
    "Oman TV 1": "عمان 1", "Oman TV 2": "عمان 2", "Oman Sports": "عمان الرياضية",
    "Bahrain TV 1": "البحرين 1", "Bahrain Sports": "البحرين الرياضية",
    "Kuwait TV 1": "الكويت 1", "Kuwait TV 2": "الكويت 2", "KTV 2": "KTV 2",
    "Kuwait Sports": "الكويت الرياضية", "Ethraa TV": "إثراء",
    "Jordan TV": "الأردن", "Jordan Sport": "الأردن الرياضية",
    "JRTV": "التلفزيون الأردني", "Roya TV": "رويا",
    "Palestine TV": "فلسطين", "Al Falastiniah": "الفلسطينية",
    "Aqsa TV": "الأقصى", "Palestine Today": "فلسطين اليوم",
    "Syria TV 1": "سوريا 1", "Sama TV Syria": "سما", "Souryana TV": "سوريانا",
    "Al Ekhbariya Syria": "الإخبارية السورية",
    "Qatar TV 1": "قطر 1", "Qatar TV 2": "قطر 2", "Al Rayyan": "الريان",
    "Al Kass": "الكاس", "Al Kass One": "الكاس 1", "Al Kass Two": "الكاس 2",
    "Qatar 2": "قطر 2", "Quran TV Qatar": "القرآن الكريم",
    "Al Jazeera English": "الجزيرة الإنجليزية",
    "Al Jazeera Mubasher 24": "الجزيرة مباشر 24",
}

CATEGORIES = [
    ("أخبار", "📰", ["News", "Business;News", "Documentary;News", "Education;News", "General;News"]),
    ("رياضة", "⚽", ["Sports", "General;Sports"]),
    ("دينية", "🕌", ["Religious"]),
    ("أفلام", "🎬", ["Movies", "Series", "Classic"]),
    ("أغاني", "🎵", ["Music"]),
    ("أطفال", "🧸", ["Kids", "Animation;Kids", "Kids;Religious"]),
    ("وثائقية", "🎥", ["Documentary"]),
    ("كوميديا", "😂", ["Comedy"]),
    ("منوعة", "🎭", ["General", "Entertainment", "Culture", "Family", "Education", "Cooking", "Business"]),
]

# الدول العربية تُقدَّم أولاً، والبقية بعدها بترتيب أبجدي.
ARAB = {"sa", "eg", "ae", "iq", "lb", "sy", "jo", "ps", "kw", "qa", "bh",
        "om", "ye", "ma", "dz", "tn", "ly", "sd", "mr", "eh", "dj", "so", "km"}

# قنوات نستثنيها: إسرائيلية أو غير عربية فعلياً رغم تصنيفها
BLOCK = ("i24NEWS", "I24", "Israel", "Kan ", "Channel 13", "Channel 14")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
TIMEOUT = 12


def fetch(url: str, timeout: int = 90) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def load_countries() -> dict:
    """رمز الدولة → (الاسم، العلم). تعذّر الجلب لا يوقف البناء."""
    try:
        rows = json.loads(fetch(COUNTRIES_API))
        return {
            str(r["code"]).lower(): (r.get("name") or r["code"], r.get("flag") or "")
            for r in rows
            if r.get("code")
        }
    except Exception as e:
        print(f"! تعذّر جلب أسماء الدول: {e}")
        return {}


def parse_m3u(text: str):
    """قائمة قنوات، كل واحدة بمجموعاتها ودولتها."""
    entries, cur = [], None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF"):
            g = re.search(r'group-title="([^"]*)"', line)
            tid = re.search(r'tvg-id="([^"]*)"', line)
            cur = {
                "groups": [x.strip() for x in (g.group(1) if g else "").split(";")],
                "raw": line.rsplit(",", 1)[-1].strip(),
                # "2M.ma@SD" → "ma"
                "country": (re.search(r"\.([a-z]{2})@", tid.group(1)).group(1)
                            if tid and re.search(r"\.([a-z]{2})@", tid.group(1)) else ""),
                "url": "",
            }
        elif line.startswith("#EXTVLCOPT:") and cur:
            cur.setdefault("opts", []).append(line.split(":", 1)[1].strip())
        elif line.startswith("http") and cur:
            cur["url"] = line
            entries.append(cur)
            cur = None
    return entries


def probe(entry):
    """يفحص الرابط: يكفي أن يستجيب بمحتوى بث صالح."""
    req = urllib.request.Request(entry["url"], headers={"User-Agent": UA})
    for opt in entry.get("opts", []):
        low = opt.lower()
        if low.startswith("http-referrer="):
            req.add_header("Referer", opt.split("=", 1)[1])
        elif low.startswith("http-user-agent="):
            req.add_header("User-Agent", opt.split("=", 1)[1])
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                return None
            head = r.read(512).decode("utf-8", "ignore")
            return entry if ("#EXTM3U" in head or "#EXT-X" in head or len(head) > 0) else None
    except Exception:
        return None


def quality_of(raw: str):
    m = re.search(r"\((\d{3,4})p\)", raw)
    return f"{m.group(1)}p" if m else None


def clean_name(raw: str) -> str:
    """يزيل الجودة والوسوم: «Al Jazeera (1080p)» ← «Al Jazeera»."""
    n = re.sub(r"\((?:[0-9]{3,4}p|[A-Z]{2})\)", "", raw)
    n = re.sub(r"\[[^\]]*\]", "", n)
    return re.sub(r"\s+", " ", n).strip(" -–")


def category_of(entry):
    for title, _, tags in CATEGORIES:
        if any(t in entry["groups"] for t in tags):
            return title
    return None


def sort_key(item):
    name = item[0]
    arabic = any("\u0600" <= ch <= "\u06ff" for ch in name)
    return (0 if arabic else 1, name)


def country_key(key):
    """الدول العربية أولاً ثم الباقي أبجدياً."""
    return (0 if key[2] in ARAB else 1, key[0])


def build(entries, countries):
    """دولة ← تصنيف ← [قنوات]، مع إسقاط المكرر بالاسم."""
    tree, seen = {}, set()
    for e in sorted(entries, key=lambda x: x["raw"]):
        raw_name = clean_name(e["raw"])
        # الاسم المعروض عربي إن وُجد في القاموس، وإلا يبقى كما هو
        name = AR.get(raw_name, raw_name)
        if not name or name in seen:
            continue
        cat = category_of(e)
        if not cat:
            continue
        seen.add(name)
        cc = e["country"] or ""
        # الاسم العربي من خريطتنا، وإلا الإنجليزي من iptv-org، وإلا الرمز
        cname = COUNTRIES_AR.get(cc) or (countries.get(cc, (cc.upper(), ""))[0] if cc else "أخرى")
        flag = countries.get(cc, ("", ""))[1]
        tree.setdefault((cname, flag, cc), {}).setdefault(cat, []).append(
            (name, e["url"], quality_of(e["raw"]))
        )
    return tree


def write_js(tree):
    """يكتب الشجرة ويضيف فهارس مسطّحة للأوامر القديمة."""
    order = {t: i for i, (t, _, _) in enumerate(CATEGORIES)}
    countries = sorted(tree.items(), key=lambda kv: country_key(kv[0]))

    lines = [
        "// مولَّد آلياً بـ Famiglia/Corleone/بث/تحديث-القنوات.py — لا تعدّله يدوياً.",
        "// كل رابط هنا مُختبَر حيّاً (HTTP 200 + محتوى بث) وقت التوليد.",
        "// المصدر: iptv-org. البنية: دولة ← تصنيف ← قناة ← جودة.",
        "",
        "export const COUNTRIES_TREE = [",
    ]

    for (cname, flag, _cc), cats in countries:
        lines.append("  {")
        lines.append(f"    title: {json.dumps(f'{flag} {cname}'.strip(), ensure_ascii=False)},")
        lines.append("    categories: [")
        for title in sorted(cats, key=lambda t: order.get(t, 99)):
            icon = next((i for t, i, _ in CATEGORIES if t == title), "")
            items = sorted(cats[title], key=sort_key)
            lines.append("      {")
            lines.append(f"        title: {json.dumps(f'{icon} {title}', ensure_ascii=False)},")
            lines.append("        channels: [")
            for name, url, quality in items:
                q = json.dumps(quality) if quality else "null"
                lines.append(
                    f"          {{ name: {json.dumps(name, ensure_ascii=False)}, "
                    f"url: {json.dumps(url)}, quality: {q} }},"
                )
            lines.append("        ]")
            lines.append("      },")
        lines.append("    ]")
        lines.append("  },")
    lines += ["]", ""]

    flat = [
        (name, url, quality)
        for _, cats in countries
        for items in cats.values()
        for name, url, quality in items
    ]

    lines.append("// اسم القناة → رابطه")
    lines.append("export const CHANNELS = {")
    for name, url, _ in flat:
        lines.append(f"  {json.dumps(name, ensure_ascii=False)}: {json.dumps(url)},")
    lines += ["}", ""]

    lines.append("// اسم القناة → جودتها الأصلية كما وردت في المصدر")
    lines.append("export const QUALITIES = {")
    for name, _, quality in flat:
        if quality:
            lines.append(f"  {json.dumps(name, ensure_ascii=False)}: {json.dumps(quality)},")
    lines += ["}", ""]

    lines.append("// أقسام مسطّحة (للتوافق مع الأوامر القديمة)")
    lines.append("export const GROUPS = [")
    by_cat = {}
    for _, cats in countries:
        for title, items in cats.items():
            by_cat.setdefault(title, []).extend(items)
    for title, icon, _ in CATEGORIES:
        items = by_cat.get(title)
        if not items:
            continue
        lines.append(f'  {{ title: "{icon} {title}", names: [')
        for name, _, _ in sorted(items, key=sort_key):
            lines.append(f"    {json.dumps(name, ensure_ascii=False)},")
        lines.append("  ] },")
    lines += ["]", "", ALIASES_BLOCK]

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def apply_limit(tree, limit):
    """يقطع الذيل مع الحفاظ على ترتيب الدول والتصنيفات."""
    kept, room = {}, limit
    for key, cats in sorted(tree.items(), key=lambda kv: country_key(kv[0])):
        if room <= 0:
            break
        trimmed = {}
        for cat, items in cats.items():
            if room <= 0:
                break
            take = items[:room]
            if take:
                trimmed[cat] = take
                room -= len(take)
        if trimmed:
            kept[key] = trimmed
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arabic", action="store_true", help="القنوات العربية فقط")
    ap.add_argument("--limit", type=int, default=0, help="سقف القنوات الحيّة")
    ap.add_argument("--workers", type=int, default=24)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    source = ARABIC if args.arabic else INDEX
    print(f"→ تنزيل {source}")
    entries = parse_m3u(fetch(source))
    print(f"  {len(entries)} قناة خام")

    entries = [e for e in entries if not any(b in e["raw"] for b in BLOCK)]
    if args.arabic:
        entries = [e for e in entries if e["country"] in ARAB or not e["country"]]
    print(f"→ فحص {len(entries)} رابط (مهلة {TIMEOUT}s، {args.workers} خيطاً)...")

    alive, done = [], 0
    with cf.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for res in pool.map(probe, entries):
            done += 1
            if res:
                alive.append(res)
            if done % 500 == 0:
                print(f"  {done}/{len(entries)} — حيّ {len(alive)}", flush=True)

    print(f"✓ حيّ: {len(alive)} من {len(entries)}")

    tree = build(alive, load_countries())
    total = sum(len(v) for c in tree.values() for v in c.values())
    print(f"→ بعد التنظيف: {total} قناة في {len(tree)} دولة")

    if args.limit and total > args.limit:
        tree = apply_limit(tree, args.limit)
        total = sum(len(v) for c in tree.values() for v in c.values())
        print(f"→ بعد السقف: {total} قناة")

    if args.dry_run:
        for key, cats in sorted(tree.items(), key=lambda kv: country_key(kv[0]))[:12]:
            n = sum(len(v) for v in cats.values())
            print(f"  {key[1]} {key[0]}: {n} قناة / {len(cats)} تصنيف")
        return 0

    write_js(tree)
    print(f"✓ كُتب {OUT}")
    return 0


ALIASES_BLOCK = """// مرادفات إنجليزية شائعة تُقبل كاسم قناة
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
}"""


if __name__ == "__main__":
    raise SystemExit(main())
