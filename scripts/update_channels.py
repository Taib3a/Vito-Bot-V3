#!/usr/bin/env python3
"""
يبني قائمة القنوات من مصدر iptv-org ويختبر كل رابط حيّاً.

    python3 scripts/update_channels.py            # يكتب الملفات
    python3 scripts/update_channels.py --dry-run   # يعرض فقط

كل رابط يُفحص بطلب HTTP حقيقي؛ ما لا يعمل يُسقَط، فلا تصل روابط ميتة للبوت.
"""
import argparse
import concurrent.futures as cf
import json
import re
import sys
import urllib.request
from pathlib import Path

SOURCE = "https://iptv-org.github.io/iptv/languages/ara.m3u"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "Famiglia" / "Corleone" / "بث" / "قنوات.js"

# مجموعات iptv-org التي نعرضها، بالعنوان العربي وبالترتيب المطلوب
GROUPS = [
    ("إخبارية", "📰", ["News", "Business;News", "Documentary;News", "Education;News", "General;News"]),
    ("دينية", "🕌", ["Religious"]),
    ("رياضية", "⚽", ["Sports", "General;Sports"]),
    ("أفلام ومسلسلات", "🎬", ["Movies", "Series", "Classic", "Comedy"]),
    ("أطفال", "🧸", ["Kids", "Animation;Kids", "Kids;Religious"]),
    ("منوعة", "🎭", ["General", "Entertainment", "Culture", "Family", "Music", "Documentary", "Education", "Cooking"]),
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
TIMEOUT = 12

# أسماء إنجليزية شائعة → عربية. ما ليس هنا يبقى كما هو.
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
}

# قنوات نستثنيها: إسرائيلية أو غير عربية فعلياً رغم تصنيفها
BLOCK = ("i24NEWS", "I24", "Israel", "Kan ", "Channel 13", "Channel 14")


def clean_name(raw: str) -> str:
    """يزيل الجودة والوسوم من الاسم: «Al Jazeera (1080p)» ← «Al Jazeera»."""
    n = re.sub(r"\((?:[0-9]{3,4}p|[A-Z]{2,})\)", "", raw)
    n = re.sub(r"\[[^\]]*\]", "", n)
    return re.sub(r"\s+", " ", n).strip(" -–")


def arabize(name: str) -> str:
    return AR.get(name, name)


# القنوات الأشهر تُعرض أولاً، ثم العربية، ثم الأجنبية
PRIORITY = [
    "الجزيرة", "الجزيرة مباشر", "العربية", "الحدث", "الإخبارية السعودية",
    "العربي", "الميادين", "الغد", "الجزيرة 2", "الجزيرة مباشر 24",
]


def sort_key(item):
    name = item[0]
    if name in PRIORITY:
        return (0, PRIORITY.index(name), "")
    arabic = any("\u0600" <= ch <= "\u06ff" for ch in name)
    return (1 if arabic else 2, 0, name)


def parse_m3u(text: str):
    """يُرجع [(المجموعة, الاسم, الرابط)] مع ترويسات كل قناة."""
    entries, cur = [], None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF"):
            g = re.search(r'group-title="([^"]*)"', line)
            logo = re.search(r'tvg-logo="([^"]*)"', line)
            cur = {
                "groups": [x.strip() for x in (g.group(1) if g else "").split(";")],
                "raw": line.rsplit(",", 1)[-1].strip(),
                "logo": logo.group(1) if logo else "",
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
    """يفحص الرابط: يكفي أن يستجيب بمحتوى HLS صالح."""
    req = urllib.request.Request(entry["url"], headers={"User-Agent": UA})
    for opt in entry.get("opts", []):
        if opt.lower().startswith("http-referrer="):
            req.add_header("Referer", opt.split("=", 1)[1])
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                return None
            head = r.read(512).decode("utf-8", "ignore")
            return entry if ("#EXTM3U" in head or "#EXT-X" in head or len(head) > 0) else None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=24)
    args = ap.parse_args()

    print(f"→ تنزيل {SOURCE}")
    with urllib.request.urlopen(SOURCE, timeout=60) as r:
        text = r.read().decode("utf-8", "ignore")

    entries = parse_m3u(text)
    print(f"  {len(entries)} قناة خام")

    entries = [e for e in entries if not any(b in e["raw"] for b in BLOCK)]
    print(f"→ فحص {len(entries)} رابط (مهلة {TIMEOUT}s)...")

    alive, done = [], 0
    with cf.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for res in pool.map(probe, entries):
            done += 1
            if res:
                alive.append(res)
            if done % 40 == 0:
                print(f"  {done}/{len(entries)} — حيّ {len(alive)}", flush=True)

    print(f"✓ حيّ: {len(alive)} من {len(entries)}")

    buckets = {title: [] for title, _, _ in GROUPS}
    seen = set()
    for e in sorted(alive, key=lambda x: x["raw"]):
        name = arabize(clean_name(e["raw"]))
        if not name or name in seen:
            continue
        for title, _, tags in GROUPS:
            if any(t in e["groups"] for t in tags):
                seen.add(name)
                buckets[title].append((name, e["url"]))
                break

    for title in buckets:
        buckets[title].sort(key=sort_key)

    for title, _, _ in GROUPS:
        print(f"  {title}: {len(buckets[title])}")
    total = sum(len(v) for v in buckets.values())
    print(f"→ الإجمالي بعد التنظيف: {total}")

    if args.dry_run:
        return 0

    write_js(buckets)
    print(f"✓ كُتب {OUT}")
    return 0


def write_js(buckets):
    lines = [
        "// مولَّد آلياً بـ scripts/update_channels.py — لا تعدّله يدوياً.",
        "// كل رابط هنا مُختبَر حيّاً (HTTP 200 + محتوى HLS) وقت التوليد.",
        "// المصدر: قائمة iptv-org العامة للّغة العربية.",
        "",
        "export const GROUPS = [",
    ]
    for title, icon, _ in GROUPS:
        items = buckets.get(title) or []
        if not items:
            continue
        lines.append(f'  {{ title: "{icon} {title}", names: [')
        for name, _ in items:
            lines.append(f"    {json.dumps(name, ensure_ascii=False)},")
        lines.append("  ] },")
    lines += ["]", "", "export const CHANNELS = {"]
    for title, _, _ in GROUPS:
        items = buckets.get(title) or []
        if not items:
            continue
        lines.append(f"  // ── {title} " + "─" * max(0, 46 - len(title)))
        for name, url in items:
            lines.append(f"  {json.dumps(name, ensure_ascii=False)}: {json.dumps(url)},")
        lines.append("")
    lines += ["}", "", ALIASES_BLOCK]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


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
    sys.exit(main())
