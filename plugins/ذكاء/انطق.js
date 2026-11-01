/**
 * انطق (say) — تحويل النص إلى صوت عبر TikTok TTS
 *
 * المزوّد: https://tiktok-tts.weilnet.workers.dev
 *   • مجاني وبلا مفتاح API.
 *   • 43 صوتاً: شخصيات (C-3PO، Chewbacca، Stitch، Ghostface، Stormtrooper…)
 *     ولغات (إنجليزي، إسباني، فرنسي، ألماني، ياباني، كوري، إندونيسي).
 *   • لا يدعم النص العربي — عند إرسال نص عربي نحوّله تلقائياً إلى Google TTS.
 *
 * البنية مطابقة للسكربت المرجعي: قائمة رئيسية (أزرار / منسدلة) ← شخصيات
 * صفحة بصفحة ← توليد الصوت. النص يُحفظ لكل مرسل 30 دقيقة حتى تعمل الأزرار
 * بعد أن تمرّر القائمة.
 *
 * ملاحظة: السكربت مستقل تماماً. يحتاج من البوت فقط:
 *   sock.sendMessage  و  sock.sendButtonMessage  و  global.botImages / global.my
 *   (global.botImages و global.my معرّفتان في config.js)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/* ── الإعدادات ──────────────────────────────────────────────────────────── */

const CONFIG = {
  // عنوان المزوّد — بلا مفتاح
  apiUrl: 'https://tiktok-tts.weilnet.workers.dev/api/generation',
  // بديل للنص العربي (TikTok TTS لا يدعمه)
  googleUrl: 'https://translate.google.com/translate_tts',
  maxChars: 5000,
  ffmpeg: 'ffmpeg',
  timeoutMs: 30000,
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* ── كتالوج الأصوات ─────────────────────────────────────────────────────── */

/**
 * كل صوت: { emoji, nombre{ar,es}, descripcion{ar,es}, voice }
 * `voice` هو المعرّف الذي يرسله المزوّد.
 */
const VOICES = {
  // ── شخصيات ──
  c3po:        { emoji: '🤖', nombre: { ar: 'سي ثري بي أو', es: 'C-3PO' },        descripcion: { ar: 'روبوت حرب النجوم.', es: 'Droide de Star Wars.' },   voice: 'en_us_c3po' },
  chewbacca:   { emoji: '🐻', nombre: { ar: 'تشوباكا', es: 'Chewbacca' },          descripcion: { ar: 'الووكي المشعر.', es: 'El wookie.' },              voice: 'en_us_chewbacca' },
  stormtrooper:{ emoji: '⚔️', nombre: { ar: 'جندي العاصفة', es: 'Stormtrooper' },  descripcion: { ar: 'جندي الإمبراطورية.', es: 'Soldado imperial.' },   voice: 'en_us_stormtrooper' },
  stitch:      { emoji: '👽', nombre: { ar: 'ستيتش', es: 'Stitch' },               descripcion: { ar: 'الكائن الأزرق اللطيف.', es: 'El alien azul.' },   voice: 'en_us_stitch' },
  rocket:      { emoji: '🦝', nombre: { ar: 'روكيت', es: 'Rocket' },               descripcion: { ar: 'الراكون الفضائي.', es: 'El mapache espacial.' },  voice: 'en_us_rocket' },
  ghostface:   { emoji: '👻', nombre: { ar: 'الوجه الشبح', es: 'Ghostface' },      descripcion: { ar: 'قناع الرعب.', es: 'La máscara de terror.' },      voice: 'en_us_ghostface' },
  deadpool:    { emoji: '🃏', nombre: { ar: 'ديدبول', es: 'Deadpool' },            descripcion: { ar: 'المرتزق الثرثار.', es: 'El mercenario bocazas.' }, voice: 'en_male_deadpool' },
  jarvis:      { emoji: '💠', nombre: { ar: 'جارفيس', es: 'Jarvis' },              descripcion: { ar: 'مساعد توني ستارك.', es: 'El asistente de Stark.' }, voice: 'en_male_jarvis' },
  pirate:      { emoji: '🏴‍☠️', nombre: { ar: 'القرصان', es: 'Pirata' },           descripcion: { ar: 'قرصان البحار.', es: 'El pirata.' },              voice: 'en_male_pirate' },
  santa:       { emoji: '🎅', nombre: { ar: 'بابا نويل', es: 'Santa' },            descripcion: { ar: 'رجل عيد الميلاد.', es: 'Papá Noel.' },            voice: 'en_male_santa' },

  // ── إنجليزي ──
  us_female:   { emoji: '🇺🇸', nombre: { ar: 'أمريكية', es: 'Femenina (US)' },     descripcion: { ar: 'صوت نسائي أمريكي.', es: 'Voz femenina de EE.UU.' }, voice: 'en_us_001' },
  us_female2:  { emoji: '🗽', nombre: { ar: 'أمريكية ٢', es: 'Femenina 2 (US)' },  descripcion: { ar: 'صوت نسائي أمريكي آخر.', es: 'Otra voz femenina.' }, voice: 'en_us_002' },
  us_male:     { emoji: '🎙️', nombre: { ar: 'أمريكي', es: 'Masculina (US)' },     descripcion: { ar: 'صوت رجالي أمريكي.', es: 'Voz masculina de EE.UU.' }, voice: 'en_us_006' },
  us_male2:    { emoji: '📻', nombre: { ar: 'أمريكي ٢', es: 'Masculina 2 (US)' },  descripcion: { ar: 'صوت رجالي أمريكي آخر.', es: 'Otra voz masculina.' }, voice: 'en_us_007' },
  us_male3:    { emoji: '🎧', nombre: { ar: 'أمريكي ٣', es: 'Masculina 3 (US)' },  descripcion: { ar: 'صوت رجالي أمريكي عميق.', es: 'Voz masculina grave.' }, voice: 'en_us_008' },
  us_male4:    { emoji: '🔊', nombre: { ar: 'أمريكي ٤', es: 'Masculina 4 (US)' },  descripcion: { ar: 'صوت رجالي أمريكي واضح.', es: 'Voz masculina clara.' }, voice: 'en_us_009' },
  us_male5:    { emoji: '📢', nombre: { ar: 'أمريكي ٥', es: 'Masculina 5 (US)' },  descripcion: { ar: 'صوت رجالي أمريكي هادئ.', es: 'Voz masculina suave.' }, voice: 'en_us_010' },
  uk_male:     { emoji: '🇬🇧', nombre: { ar: 'بريطاني', es: 'Masculina (UK)' },   descripcion: { ar: 'صوت رجالي بريطاني.', es: 'Voz masculina británica.' }, voice: 'en_uk_001' },
  uk_male2:    { emoji: '☕', nombre: { ar: 'بريطاني ٢', es: 'Masculina 2 (UK)' }, descripcion: { ar: 'صوت رجالي بريطاني آخر.', es: 'Otra voz británica.' }, voice: 'en_uk_003' },
  au_male:     { emoji: '🇦🇺', nombre: { ar: 'أسترالي', es: 'Masculina (AU)' },   descripcion: { ar: 'صوت رجالي أسترالي.', es: 'Voz masculina australiana.' }, voice: 'en_au_001' },
  au_male2:    { emoji: '🦘', nombre: { ar: 'أسترالي ٢', es: 'Masculina 2 (AU)' }, descripcion: { ar: 'صوت رجالي أسترالي آخر.', es: 'Otra voz australiana.' }, voice: 'en_au_002' },

  // ── أنماط ──
  narration:   { emoji: '📖', nombre: { ar: 'الراوي', es: 'Narrador' },            descripcion: { ar: 'صوت سردي.', es: 'Voz de narración.' },            voice: 'en_male_narration' },
  funny:       { emoji: '😄', nombre: { ar: 'مضحك', es: 'Divertido' },             descripcion: { ar: 'صوت مرِح.', es: 'Voz graciosa.' },                voice: 'en_male_funny' },
  emotional:   { emoji: '🥲', nombre: { ar: 'عاطفي', es: 'Emotivo' },              descripcion: { ar: 'صوت مؤثّر.', es: 'Voz emotiva.' },                voice: 'en_female_emotional' },
  cody:        { emoji: '🧑', nombre: { ar: 'كودي', es: 'Cody' },                  descripcion: { ar: 'صوت شبابي.', es: 'Voz juvenil.' },                voice: 'en_male_cody' },
  samc:        { emoji: '👩', nombre: { ar: 'سام', es: 'Samc' },                   descripcion: { ar: 'صوت نسائي هادئ.', es: 'Voz femenina calmada.' },   voice: 'en_female_samc' },
  jomboy:      { emoji: '🧔', nombre: { ar: 'جيمبوي', es: 'Jomboy' },              descripcion: { ar: 'صوت حواري.', es: 'Voz conversacional.' },          voice: 'en_male_jomboy' },
  adam:        { emoji: '🕴️', nombre: { ar: 'آدم', es: 'Adam' },                   descripcion: { ar: 'صوت إخباري.', es: 'Voz de noticias.' },            voice: 'en_male_adam' },

  // ── مؤثرات ──
  wonderful:   { emoji: '✨', nombre: { ar: 'عالم رائع', es: 'Mundo Maravilloso' }, descripcion: { ar: 'نبرة مبهجة.', es: 'Tono alegre.' },              voice: 'en_female_ht_f08_wonderful_world' },
  glorious:    { emoji: '🌟', nombre: { ar: 'مجد', es: 'Glorioso' },               descripcion: { ar: 'نبرة ملحمية.', es: 'Tono épico.' },               voice: 'en_female_ht_f08_glorious' },
  newyear:     { emoji: '🎆', nombre: { ar: 'رأس السنة', es: 'Año Nuevo' },        descripcion: { ar: 'نبرة احتفالية.', es: 'Tono festivo.' },            voice: 'en_female_ht_f08_newyear' },
  halloween:   { emoji: '🎃', nombre: { ar: 'هالوين', es: 'Halloween' },           descripcion: { ar: 'نبرة مرعبة.', es: 'Tono espeluznante.' },          voice: 'en_female_ht_f08_halloween' },

  // ── لغات ──
  spanish:     { emoji: '🇪🇸', nombre: { ar: 'إسباني', es: 'Español' },            descripcion: { ar: 'صوت إسباني.', es: 'Voz en español.' },             voice: 'es_002' },
  spanish_mx:  { emoji: '🇲🇽', nombre: { ar: 'إسباني مكسيكي', es: 'Español MX' },  descripcion: { ar: 'صوت مكسيكي.', es: 'Voz mexicana.' },               voice: 'es_mx_002' },
  french:      { emoji: '🇫🇷', nombre: { ar: 'فرنسي', es: 'Francés' },             descripcion: { ar: 'صوت فرنسي.', es: 'Voz en francés.' },              voice: 'fr_001' },
  french2:     { emoji: '🥖', nombre: { ar: 'فرنسي ٢', es: 'Francés 2' },          descripcion: { ar: 'صوت فرنسي آخر.', es: 'Otra voz francesa.' },       voice: 'fr_002' },
  german:      { emoji: '🇩🇪', nombre: { ar: 'ألماني', es: 'Alemán' },             descripcion: { ar: 'صوت ألماني.', es: 'Voz en alemán.' },              voice: 'de_001' },
  german2:     { emoji: '🍺', nombre: { ar: 'ألماني ٢', es: 'Alemán 2' },          descripcion: { ar: 'صوت ألماني آخر.', es: 'Otra voz alemana.' },       voice: 'de_002' },
  japanese:    { emoji: '🇯🇵', nombre: { ar: 'ياباني', es: 'Japonés' },            descripcion: { ar: 'صوت ياباني.', es: 'Voz en japonés.' },             voice: 'jp_001' },
  japanese3:   { emoji: '🌸', nombre: { ar: 'ياباني ٢', es: 'Japonés 3' },         descripcion: { ar: 'صوت ياباني آخر.', es: 'Otra voz japonesa.' },      voice: 'jp_003' },
  korean:      { emoji: '🇰🇷', nombre: { ar: 'كوري', es: 'Coreano' },              descripcion: { ar: 'صوت كوري.', es: 'Voz en coreano.' },               voice: 'kr_002' },
  korean3:     { emoji: '🎤', nombre: { ar: 'كوري ٢', es: 'Coreano 3' },           descripcion: { ar: 'صوت كوري آخر.', es: 'Otra voz coreana.' },         voice: 'kr_003' },
  indonesian:  { emoji: '🇮🇩', nombre: { ar: 'إندونيسي', es: 'Indonesio' },        descripcion: { ar: 'صوت إندونيسي.', es: 'Voz en indonesio.' },         voice: 'id_001' },
};

/* ── النصوص ─────────────────────────────────────────────────────────────── */

const T = {
  es: {
    mainTitle: '🎙️ Texto a Voz',
    mainText: 'Elegí la forma de mostrar los personajes:',
    btnInteractive: '🎯 Botones',
    btnDropdown: '📋 Desplegable',
    chooseVoice: 'Elegí un personaje para hablar:',
    more: '➕ Más',
    back: '⬅️ Atrás',
    notFound: '❌ Personaje no encontrado.',
    noText: '❌ Primero enviá el texto así:\n\n.انطق tu texto aquí',
    tooLong: (max) => `⚠️ El texto es muy largo.\n\n📏 Máximo: ${max} caracteres`,
    help: '🎙️ Escribe el comando seguido del texto.\n\nEjemplo:\n.انطق el bot fito es el mejor bot',
    error: '❌ No se pudo generar el audio. Probá de nuevo.',
    noMore: '❌ No hay más personajes.',
    arabicFallback: 'ℹ️ TikTok TTS no soporta árabe — se usó Google TTS.',
    footer: '',
  },
  ar: {
    mainTitle: '🎙️ تحويل النص إلى صوت',
    mainText: 'اختر طريقة عرض الشخصيات:',
    btnInteractive: '🎯 أزرار قابلة للضغط',
    btnDropdown: '📋 أزرار منسدلة',
    chooseVoice: 'اختر شخصية لتتكلّم:',
    more: '➕ المزيد',
    back: '⬅️ رجوع',
    notFound: '❌ الشخصية غير موجودة.',
    noText: '❌ أرسل النص أولاً بهذا الشكل:\n\n.انطق نصك هنا',
    tooLong: (max) => `⚠️ النص طويل جداً.\n\n📏 الحد الأقصى: ${max} حرف`,
    help: '🎙️ اكتب الأمر متبوعاً بالنص.\n\nمثال:\n.انطق بوت فيتو افضل بوت',
    error: '❌ تعذّر توليد صوت الشخصية.',
    noMore: '❌ لا توجد شخصيات إضافية.',
    arabicFallback: 'ℹ️ TikTok TTS لا يدعم العربية — استُخدم Google TTS.',
    footer: '',
  },
};

/* ── مساعدات عامة ───────────────────────────────────────────────────────── */

function getVoiceName(v, lang) {
  if (typeof v.nombre === 'string') return v.nombre;
  return v.nombre?.[lang] || v.nombre?.ar || v.nombre?.es || 'Unknown';
}

function getVoiceFullName(v, lang) {
  return `${v.emoji || ''} ${getVoiceName(v, lang)}`.trim();
}

function getVoiceDesc(v, lang) {
  if (typeof v.descripcion === 'string') return v.descripcion;
  return v.descripcion?.[lang] || v.descripcion?.ar || v.descripcion?.es || '';
}

function getRawText(msg) {
  const m = msg?.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

function extractAfterCommand(rawText, cmdName) {
  const cleaned = String(rawText || '').replace(/^[.\/!#]/, '');
  if (cmdName && cleaned.startsWith(cmdName)) {
    return cleaned.slice(cmdName.length).trim();
  }
  return cleaned.split(/\s+/).slice(1).join(' ').trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** النص عربي؟ (فيه حرف من نطاق العربية) */
const isArabicText = (s) => /[\u0600-\u06FF]/.test(String(s || ''));

/* ── تخزين النص لكل مرسل ────────────────────────────────────────────────── */

const textStore = new Map();
const TEXT_TTL_MS = 1000 * 60 * 30;

function saveText(jid, text) {
  textStore.set(jid, { text, at: Date.now() });
}

function getStoredText(jid) {
  const entry = textStore.get(jid);
  if (!entry) return '';
  if (Date.now() - entry.at > TEXT_TTL_MS) {
    textStore.delete(jid);
    return '';
  }
  return entry.text || '';
}

/* ── إرسال الرسائل ──────────────────────────────────────────────────────── */

function toImagePayload(img) {
  if (!img) return null;
  if (typeof img === 'string') return { url: img };
  return img;
}

function randomBotImage() {
  const list = global.botImages;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function newsletterContext(sender) {
  const canalJid = global.my?.canal1;
  const ctx = { mentionedJid: [sender] };
  if (canalJid) {
    ctx.forwardedNewsletterMessageInfo = {
      newsletterJid: canalJid,
      serverMessageId: -1,
    };
  }
  return ctx;
}

/**
 * إرسال رسالة: نص/صورة عادية إن لم تكن هناك أزرار، وإلا رسالة تفاعلية.
 * يتوقّع أن يكون sock.sendButtonMessage جاهزاً (core/buttons.js).
 */
async function sendStoreMessage(sock, from, msg, sender, {
  title, text, buttons = [], sections = [], footer, image = null,
}) {
  const imagenFinal = toImagePayload(image || randomBotImage());
  const contextInfo = newsletterContext(sender);

  if ((!buttons || buttons.length === 0) && (!sections || sections.length === 0)) {
    const payload = { mentions: [sender], contextInfo };
    if (image) {
      payload.image = imagenFinal;
      payload.caption = text;
    } else {
      payload.text = text;
    }
    return await sock.sendMessage(from, payload, { quoted: msg });
  }

  return await sock.sendButtonMessage(from, text, buttons, {
    title: title || '',
    footer: footer || '',
    quoted: msg,
    image: imagenFinal,
    mentions: [sender],
    sections,
    contextInfo,
  });
}

/* ── توليد الصوت: TikTok TTS ────────────────────────────────────────────── */

/** هل هذا الصوت يستطيع نطق النص المطلوب؟ (العربية غير مدعومة إطلاقاً) */
function voiceSupportsText(voice, text) {
  if (isArabicText(text)) return false;
  return true;
}

async function tiktokToFile(text, voice) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

  let data;
  try {
    const res = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://tiktok-tts.weilnet.workers.dev',
        Referer: 'https://tiktok-tts.weilnet.workers.dev/',
      },
      body: JSON.stringify({ text, voice: voice.voice }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TikTok TTS HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }

  if (!data?.success || !data?.data) {
    throw new Error(data?.error || 'TikTok TTS: no audio');
  }

  const buf = Buffer.from(data.data, 'base64');
  if (!buf.length) throw new Error('TikTok TTS: empty audio');

  const p = path.join(os.tmpdir(), `tiktok_${crypto.randomUUID()}.mp3`);
  await fs.promises.writeFile(p, buf);
  return p;
}

/* ── توليد الصوت: Google TTS (بديل للنص العربي) ─────────────────────────── */

async function googleToFile(text, lang = 'ar') {
  // Google يقسّم النص الطويل تلقائياً عبر طلبات متعددة (حد ~200 حرف للطلب)
  const chunks = [];
  const MAX = 190;
  let rest = text;
  while (rest.length > MAX) {
    let cut = rest.lastIndexOf(' ', MAX);
    if (cut <= 0) cut = MAX;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);

  const buffers = [];
  for (const chunk of chunks) {
    const url =
      `${CONFIG.googleUrl}?ie=UTF-8&client=tw-ob&tl=${lang}` +
      `&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }

  const buf = Buffer.concat(buffers);
  if (!buf.length) throw new Error('Google TTS: empty audio');

  const p = path.join(os.tmpdir(), `google_${crypto.randomUUID()}.mp3`);
  await fs.promises.writeFile(p, buf);
  return p;
}

/* ── تحويل إلى opus (رسالة صوتية) ───────────────────────────────────────── */

async function convertToOpus(inPath) {
  const outPath =
    inPath.replace(/\.[a-z0-9]+$/i, '') + `_${crypto.randomUUID().slice(0, 8)}.ogg`;
  await execFileAsync(CONFIG.ffmpeg, [
    '-y', '-i', inPath,
    '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on',
    '-application', 'voip', outPath,
  ]);
  return outPath;
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

/* ── التوليد الموحّد ────────────────────────────────────────────────────── */

/**
 * يولّد ملفاً صوتياً للنص بالصوت المطلوب.
 * @returns {{ path: string, provider: string, fallback: boolean }}
 */
async function textToSpeech(text, voice) {
  if (voiceSupportsText(voice, text)) {
    try {
      return { path: await tiktokToFile(text, voice), provider: 'tiktok', fallback: false };
    } catch (err) {
      console.warn('[say] TikTok TTS فشل:', err?.message || err);
    }
  }
  // نص عربي، أو فشل المزوّد — نرجع إلى Google
  return { path: await googleToFile(text, 'ar'), provider: 'google', fallback: true };
}

/* ── الواجهات ───────────────────────────────────────────────────────────── */

async function sendMainMenu(sock, from, msg, sender, lang) {
  const t = T[lang];
  await sendStoreMessage(sock, from, msg, sender, {
    title: t.mainTitle,
    text: `${t.mainTitle}\n\n${t.mainText}`,
    footer: t.footer,
    buttons: [
      { text: t.btnInteractive, id: '.انطق-ازرار' },
      { text: t.btnDropdown, id: '.انطق-قائمه' },
    ],
  });
}

async function sendVoicesButtons(sock, from, msg, sender, lang, page = 0) {
  const t = T[lang];
  const entries = Object.entries(VOICES);
  const itemsPerPage = 2;
  const startIndex = page * itemsPerPage;
  const remaining = entries.slice(startIndex);

  if (remaining.length === 0) {
    return await sendStoreMessage(sock, from, msg, sender, {
      text: t.noMore,
      footer: t.footer,
    });
  }

  const maxOnPage = remaining.length > 3 ? 2 : 3;
  const pageItems = remaining.slice(0, maxOnPage);

  const buttons = pageItems.map(([id, v]) => ({
    text: getVoiceFullName(v, lang),
    id: `.say_${id}`,
  }));

  const remainingAfter = remaining.length - maxOnPage;
  if (remainingAfter > 0) {
    buttons.push({ text: t.more, id: `.انطق-ازرار-المزيد_${page + 1}` });
  } else if (page > 0) {
    buttons.push({ text: t.back, id: `.انطق-ازرار_0` });
  }

  await sendStoreMessage(sock, from, msg, sender, {
    title: t.mainTitle,
    text: t.chooseVoice,
    footer: t.footer,
    buttons,
  });
}

async function sendVoicesList(sock, from, msg, sender, lang) {
  const t = T[lang];
  const entries = Object.entries(VOICES);

  const rows = entries.map(([id, v]) => ({
    title: getVoiceFullName(v, lang),
    description: getVoiceDesc(v, lang),
    id: `.say_${id}`,
  }));

  const sections = [];
  for (let i = 0; i < rows.length; i += 10) {
    sections.push({
      title: `${t.mainTitle} (${i + 1}-${Math.min(i + 10, rows.length)})`,
      rows: rows.slice(i, i + 10),
    });
  }

  await sendStoreMessage(sock, from, msg, sender, {
    title: t.mainTitle,
    text: `${t.mainTitle}\n\n${t.chooseVoice}`,
    footer: t.footer,
    buttons: [],
    sections,
  });
}

async function generateAndSend(sock, from, msg, sender, lang, voiceId, text) {
  const t = T[lang];
  const v = VOICES[voiceId];

  if (!v) {
    return await sendStoreMessage(sock, from, msg, sender, {
      text: t.notFound,
      footer: t.footer,
    });
  }

  let srcPath = null;
  let oggPath = null;

  try {
    const { path: audioPath, fallback } = await textToSpeech(text, v);
    srcPath = audioPath;

    try {
      oggPath = await convertToOpus(srcPath);
    } catch {
      oggPath = null; // ffmpeg غير متاح — نرسل mp3
    }

    const sendPath = oggPath || srcPath;
    const isOgg = !!oggPath;

    await sock.sendMessage(from, {
      audio: fs.readFileSync(sendPath),
      mimetype: isOgg ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
      ptt: isOgg,
      contextInfo: newsletterContext(sender),
    }, { quoted: msg });

    if (fallback) {
      await sendStoreMessage(sock, from, msg, sender, {
        text: t.arabicFallback,
        footer: t.footer,
      });
    }
  } catch (err) {
    console.error('[say] خطأ التوليد:', err?.message || err);
    await sendStoreMessage(sock, from, msg, sender, {
      text: t.error,
      footer: t.footer,
    });
  } finally {
    safeUnlink(srcPath);
    safeUnlink(oggPath);
  }
}

/* ── الأمر ──────────────────────────────────────────────────────────────── */

export default {
  name: [
    'انطق', 'say',
    'انطق-ازرار', 'انطق-قائمه',
    'say-buttons', 'say-list',
    // أزرار الصفحات تحمل لاحقة رقمية (انطق-ازرار-المزيد_3)، وزر الرجوع
    // يحمل _0 — ولا يوجد في هذا البوت مطابقة بالبادئة، فنسجّلها صراحةً.
    ...Array.from({ length: 40 }, (_, i) => `انطق-ازرار_${i}`),
    ...Array.from({ length: 40 }, (_, i) => `انطق-ازرار-المزيد_${i}`),
    // كل أوامر say_<voiceId> حتى لا يقول "الأمر غير موجود"
    ...Object.keys(VOICES).map((id) => `say_${id}`),
  ],
  description: 'تحويل النص إلى صوت بشخصيات عبر TikTok TTS',
  category: 'ia, ذكاء',
  ownerOnly: false,

  async run(ctx) {
    const { sock, from, msg, sender, senderNum, cmdName, react } = ctx;
    const usedName = String(cmdName || '').trim();
    const isArabic = /[\u0600-\u06FF]/.test(usedName);
    const lang = isArabic ? 'ar' : 'es';
    const t = T[lang];
    const senderJid = sender || msg.sender || `${senderNum}@s.whatsapp.net`;

    const rawText = getRawText(msg);
    const provided = (
      ctx.text ||
      (Array.isArray(ctx.args) ? ctx.args.join(' ') : '') ||
      ''
    ).trim();
    const argText = provided || extractAfterCommand(rawText, usedName);

    // ── اختيار شخصية عبر زر ──
    if (usedName.startsWith('say_')) {
      const voiceId = usedName.replace(/^say_/, '');
      const text = getStoredText(senderJid) || argText;
      if (!text) {
        await react('❓');
        return await sendStoreMessage(sock, from, msg, senderJid, {
          text: t.noText, footer: t.footer,
        });
      }
      await react('🎙️');
      return await generateAndSend(sock, from, msg, senderJid, lang, voiceId, text);
    }

    // ── المزيد (صفحة تالية) ──
    if (usedName.startsWith('انطق-ازرار-المزيد_')) {
      const page = parseInt(usedName.replace('انطق-ازرار-المزيد_', '') || '1', 10);
      const text = getStoredText(senderJid) || argText;
      if (!text) {
        await react('❓');
        return await sendStoreMessage(sock, from, msg, senderJid, {
          text: t.noText, footer: t.footer,
        });
      }
      saveText(senderJid, text);
      await react('➕');
      return await sendVoicesButtons(sock, from, msg, senderJid, lang, page);
    }

    // ── عرض بالأزرار ──
    if (usedName === 'انطق-ازرار' || usedName === 'say-buttons') {
      const text = getStoredText(senderJid) || argText;
      if (!text) {
        await react('❓');
        return await sendStoreMessage(sock, from, msg, senderJid, {
          text: t.noText, footer: t.footer,
        });
      }
      saveText(senderJid, text);
      await react('🎯');
      return await sendVoicesButtons(sock, from, msg, senderJid, lang, 0);
    }

    // ── عرض منسدل ──
    if (usedName === 'انطق-قائمه' || usedName === 'say-list') {
      const text = getStoredText(senderJid) || argText;
      if (!text) {
        await react('❓');
        return await sendStoreMessage(sock, from, msg, senderJid, {
          text: t.noText, footer: t.footer,
        });
      }
      saveText(senderJid, text);
      await react('📋');
      return await sendVoicesList(sock, from, msg, senderJid, lang);
    }

    // ── الأمر الرئيسي ──
    if (['انطق', 'say'].includes(usedName)) {
      if (!argText) {
        await react('❓');
        return await sendStoreMessage(sock, from, msg, senderJid, {
          text: t.help,
          footer: t.footer,
          image: randomBotImage(),
        });
      }
      if (argText.length > CONFIG.maxChars) {
        await react('⚠️');
        return await sendStoreMessage(sock, from, msg, senderJid, {
          text: t.tooLong(CONFIG.maxChars), footer: t.footer,
        });
      }
      saveText(senderJid, argText);
      await react('🎙️');
      return await sendMainMenu(sock, from, msg, senderJid, lang);
    }

    return await sendStoreMessage(sock, from, msg, senderJid, {
      text: `❌ أمر غير معروف: ${usedName}`,
      footer: t.footer,
    });
  },
};

/* ── صادرات للمرجع/الاختبار ─────────────────────────────────────────────── */
export { VOICES, CONFIG, textToSpeech, tiktokToFile, googleToFile };
