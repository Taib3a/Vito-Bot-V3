// قنوات عربية — روابط HLS مُتحقَّق منها فعلياً (HTTP 200 + محتوى EXT M3U)
// المصدر: قائمة iptv-org العامة للّغة العربية
// بعض الروابط قد تتوقّف أو تُحجب جغرافياً؛ تُستثنى تلقائياً عند الفحص.

export const CHANNELS = {
  // ── إخبارية ─────────────────────────────────────────────────
  "الجزيرة": "https://live-hls-apps-aja-fa.getaj.net/AJA/01.m3u8",
  "الجزيرة 2": "https://live-hls-web-aja2-gcp.thehlive.com/AJA2/index.m3u8",
  "الجزيرة مباشر": "https://live-hls-apps-ajm-fa.getaj.net/AJM/index.m3u8",
  "الجزيرة مباشر 24": "https://live-hls-apps-ajm24-fa.getaj.net/AJM24/index.m3u8",
  "الجزيرة مباشر 2": "https://live-hls-apps-ajm2-fa.getaj.net/AJM2/index.m3u8",
  "العربية للأعمال": "https://live.alarabiya.net/alarabiapublish/aswaaq.smil/playlist.m3u8",
  "العربية برامج": "https://live.alarabiya.net/alarabiapublish/aaprograms.smil/playlist.m3u8",
  "الإخبارية السعودية": "https://shd-gcp-live.edgenextcdn.net/live/bitmovin-al-ekhbaria/297b3ef1cd0633ad9cfba7473a686a06/index.m3u8",
  "الحدث": "https://shd-gcp-live.edgenextcdn.net/live/bitmovin-hadath/2ff87ec4c2f3ede35295a20637d9f8fd/index.m3u8",
  "العراقية": "https://imn-live.esite-lab.com/hls/iraqia-general.m3u8",
  "العراقية الإخبارية": "https://imn-live.esite-lab.com/hls/iraqia-news.m3u8",
  "العراقية الرياضية": "https://imn-live.esite-lab.com/hls/iraqia-sports-1.m3u8",
  "العربي": "https://live.kwikmotion.com/alaraby1live/alaraby_abr/playlist.m3u8",
  "العربي 2": "https://live.kwikmotion.com/alaraby2live/alaraby2.smil/playlist.m3u8",
  "الغد": "https://eazyvwqssi.erbvr.com/alghadtv/alghadtv.m3u8",
  "الجديد": "http://185.9.2.18/chid_391/mono.m3u8",
  "المصرية": "http://185.9.2.18/chid_247/index.m3u8",
  "المغربية": "http://185.9.2.18/chid_205/index.m3u8",
  "المسار": "https://starmenajo.com/hls/almasar/index.m3u8",
  "المعارف": "https://bucharest.zeuscdn724.com/lb0/CH-AL-MA/index.m3u8",
  "العالم اليوم": "https://mn-nl.mncdn.com/mekameleen/smil:mekameleentv.smil/chunklist_b928000.m3u8",
  "AL24": "https://cdn.live.easybroadcast.io/abr_corp/66_al24_u4yga6h/corp/66_al24_u4yga6h_240p/chunks.m3u8",
  "النجاح": "https://streaming.najah.edu:8443/hls/AlNajah.m3u8",
  "القمر": "https://streamer3.premio.link/alqamar/playlist.m3u8",

  // ── سعودية وخليجية ──────────────────────────────────────────
  "السعودية": "https://shd-gcp-live.edgenextcdn.net/live/bitmovin-saudi-tv/2ad66056b51fd8c1b624854623112e43/index.m3u8",
  "السعودية الآن": "https://shd-gcp-live.edgenextcdn.net/live/bitmovin-ksa-now/71ed3aa814c643306c0a8bc4fcc7d17f/index.m3u8",
  "عجمان": "https://cdn1.logichost.in/ajmantv/live/playlist.m3u8",
  "الحياة": "https://cdn3.wowza.com/5/OE5HREpIcEkySlNT/alhayat-live/ngrp:livestream_all/playlist.m3u8",

  // ── قرآنية ─────────────────────────────────────────────────
  "القرآن الكريم": "http://m.live.net.sa:1935/live/quran/gmswf.m3u8",
  "إذاعة القرآن": "https://stream.radiojar.com/8s5u5tpdtwzuv",

  // ── مغربية ─────────────────────────────────────────────────
  "2M": "http://185.9.2.18/chid_218/index.m3u8",

  // ── أفلام وأغاني ────────────────────────────────────────────
  "أفلام": "https://shd-amg-fast.edgenextcdn.net/tx001/playlist.m3u8",
  "أغاني أغاني": "https://cdn.streamlane.tv/hls/aghanitv/index.m3u8"
}

// مرادفات إنجليزية شائعة تُقبل كاسم قناة
export const ALIASES = {
  aljazeera: "الجزيرة",
  jazeera: "الجزيرة",
  aja: "الجزيرة",
  arabiya: "العربية للأعمال",
  alarabiya: "العربية للأعمال",
  ekhbariya: "الإخبارية السعودية",
  hadath: "الحدث",
  iraqia: "العراقية",
  saudiya: "السعودية",
  quran: "القرآن الكريم",
  arabic: "الجزيرة",
  araby: "العربي",
  ghad: "الغد",
  jadeed: "الجديد",
  masriya: "المصرية",
  maghribia: "المغربية"
}

export function channelNames() {
  return Object.keys(CHANNELS)
}

// يبحث بالاسم العربي، أو مرادف إنجليزي، أو جزء من الاسم
export function findChannel(query) {
  const q = String(query || "").trim()
  if (!q) return null
  if (CHANNELS[q]) return { name: q, url: CHANNELS[q] }

  // يجرّد "قناة" وبادئات شائعة
  const cleaned = q.replace(/^(قناة|بث|تشغيل)\s*/u, "").trim()
  if (cleaned && CHANNELS[cleaned]) return { name: cleaned, url: CHANNELS[cleaned] }

  const lower = q.toLowerCase()
  const lowerClean = cleaned.toLowerCase()

  const aliasKey = Object.keys(ALIASES).find((k) => lower === k || lowerClean === k || lower.includes(k))
  if (aliasKey && CHANNELS[ALIASES[aliasKey]]) {
    const name = ALIASES[aliasKey]
    return { name, url: CHANNELS[name] }
  }

  const exact = Object.keys(CHANNELS).find((k) => k.includes(cleaned) || cleaned.includes(k))
  if (exact) return { name: exact, url: CHANNELS[exact] }

  const fuzzy = Object.keys(CHANNELS).find((k) => k.toLowerCase().includes(lowerClean))
  if (fuzzy) return { name: fuzzy, url: CHANNELS[fuzzy] }

  return null
}
