import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import config from "../../config.js";
import { sendButtons, sendList } from "../../core/buttons.js";
import { log } from "../../core/logger.js";

const execFileAsync = promisify(execFile);
const TTS = config.tts;

/** A character the user can make speak. `token` is the FakeYou model. */
const VOICES = {
  woody: { emoji: "🪵", ar: "نقار الخشب", search: ["woody woodpecker"], token: "weight_n6xthkxaazpd87q6y2vjt8vrz", fish: "5592eec226c6429e8a86a7afd47fb94e" },
  spiderman: { emoji: "🕷️", ar: "سبايدرمان", search: ["spider-man"], token: "weight_r5hbbs90mbefs599313rfqqqk", fish: "c4d42d515a7f4c4da46f002cc6c464b7" },
  pinky: { emoji: "🐭", ar: "بينكي", search: ["pinky"], token: "weight_yvwvprkck7kvb3nfv45fznw2a", fish: "74cfa5fcc99542708cbc1acacc938031" },
  brain: { emoji: "🧠", ar: "برين", search: ["brainiac", "brain"], token: "weight_f7sps4eqqevd00k5237gjts2p", fish: "1bef6e0fffe745c7bfb72e6cbe1e42a2" },
  batman: { emoji: "🦇", ar: "باتمان", search: ["batman"], token: "weight_x2e6rzdkvx2htfxeqnwea5vpm", fish: "c324b5bcf31f454088e371370c452741" },
  superman: { emoji: "🦸", ar: "سوبرمان", search: ["superman"], token: "weight_2mdtv4q4saq17rbxm52bbv4gd", fish: "b7b73a0b8f91479faaa1260cbb1e88e1" },
  joker: { emoji: "🃏", ar: "الجوكر", search: ["joker"], token: "weight_yzn1qav1qkvwspyg0ahcmnm75", fish: "14aafc1ebce64950bff42a23343b13f8" },
  mickey: { emoji: "🐭", ar: "ميكي ماوس", search: ["mickey mouse"], token: "weight_7bsgsyfjskbmzj59naw58r1bm", fish: "5eeab11cdbde477387b40b6f730d0fbb" },
  donald: { emoji: "🦆", ar: "دونالد داك", search: ["donald duck"], token: "weight_0z2ppbwncyys079pgdzxx3eyk", fish: "a486ca175f0d4fc1b3c99b1082e2928b" },
  homer: { emoji: "🍩", ar: "هومر سيمبسون", search: ["homer simpson"], token: "weight_43ft1wj8xv6cna5vatawt3175", fish: "9e928f1a5d7d40829ea3c50efbf87612" },
  bart: { emoji: "🛹", ar: "بارت سيمبسون", search: ["bart simpson"], token: "weight_jmcdwfk7nzmem4a2f5h7bq0y0", fish: "55bef2337e5a4d6888eeac7f4bd01146" },
  scooby: { emoji: "🐶", ar: "سكوبي دو", search: ["scooby doo"], token: "weight_gmxwzzk5et2p3abt0bfxp2qbm", fish: "31e36fa665eb464cb66cbe416c91f817" },
  pikachu: { emoji: "⚡", ar: "بيكاتشو", search: ["pikachu"], token: "weight_f5kt2erssc85sn5j35r81rt8w", fish: "4449cc9e62894c1a83169fedc1c91729" },
  yoda: { emoji: "👽", ar: "يودا", search: ["yoda"], token: "weight_8ye42btvd3ybnc6srbghr2ap2", fish: "8b749799aa984f389bd75da652147e20" },
  vader: { emoji: "🌑", ar: "دارث فيدر", search: ["darth vader"], token: "weight_bwjftsw1s89qwywhfb1dv58w1", fish: "0e0f94fba2574fcebe4384834ac9eeaa" },
  spongebob: { emoji: "🧽", ar: "سبونج بوب", search: ["spongebob"], token: "weight_6y87xbjmqjxbf49ad880590kw", fish: "0051da373e0a4ac282399909d1d31b69" },
  patrick: { emoji: "⭐", ar: "باتريك", search: ["patrick star"], token: "weight_154man2fzg19nrtc15drner7t", fish: "d1520b60870b4e9aa01eab5bfefb1c45" },
  bugs: { emoji: "🐰", ar: "بوجز باني", search: ["bugs bunny"], token: "weight_hkzaavpmqzh2b3ppyy3p11r6a", fish: "2423cb44f6eb47f5bedda328005a3dcc" },
  daffy: { emoji: "🦆", ar: "دافي داك", search: ["daffy duck"], token: "weight_4w6639bep6jxgsj2d9z3tr2zx", fish: "3932774ca4a04d4c9e909f2f1d01ea1c" },
  tweety: { emoji: "🐤", ar: "تويتي", search: ["tweety"], token: "weight_twjpa14wsk2eakbjs0ksrr2mc", fish: "02c1cd6af69f420a9213e2c0bff15a57" },
  marvin: { emoji: "👾", ar: "مارفن المريخي", search: ["marvin the martian"], token: "weight_w7f87y6eprqnbbrbhqms5gkx9", fish: "64d10f9e2d7d4144bc72196ff75dbb8f" },
  goofy: { emoji: "🐕", ar: "غوفي", search: ["goofy"], token: "weight_906msf12mp7kpp3ftarzjc12c", fish: "9e6d8d20973d45ecbdca169391f64782" },
  winnie: { emoji: "🍯", ar: "ويني ذا بوه", search: ["winnie the pooh"], token: "weight_9ms7cs66mtxh8zsywghtnd4zx", fish: "f848b370486d40a0b0989396f4fa42ca" },
  tigger: { emoji: "🐯", ar: "تيغر", search: ["tigger"], token: "weight_4w6dfpesbkseknjr76z3wx0hx", fish: "49825438830142fbbe3a5b3fa76f5225" },
  buzz: { emoji: "🚀", ar: "باز لايتير", search: ["buzz lightyear"], token: "weight_vh6x45f8r3ed99f6svjxnfagd", fish: "e4e3e4d933534eccb3e0091bf34bc4fe" },
  elsa: { emoji: "❄️", ar: "إلسا", search: ["elsa (frozen"], token: "weight_7gc2da3gscft9mpmjkqfzswj9", fish: "635e41800f09426fad133caf7345da1d" },
  shrek: { emoji: "🧅", ar: "شريك", search: ["shrek (old"], token: "weight_0m11ggv4byg14mrmdqnkpma9w", fish: "f6a4e7781ffc4ae09e81ae39c35c8c1c" },
  mario: { emoji: "🍄", ar: "ماريو", search: ["mario (charles"], token: "weight_rnbmdcgym2tmqs7b3826c1zkf", fish: "a564085babeb4d14802ea31b7b6c2869" },
  sonic: { emoji: "💨", ar: "سونيك", search: ["sonic the hedgehog (jason"], token: "weight_rsb4n5rfr5ty0r8mg7nz06rej", fish: "e1ccd2d156104873a651bd3916951e8a" },
  popeye: { emoji: "💪", ar: "بوباي", search: ["popeye"], token: "weight_pdhq8nwgbhzc6eq3hnp878x4s", fish: "047f8e7a594a40fc9806a6a82428012f" },
  fred: { emoji: "🦴", ar: "فريد فلينتستون", search: ["fred flintstone"], token: "weight_q7r36k9g7qtyg7hzf4c4xwf6f", fish: "ff5af5f9674a4192af1d5e425d0788aa" },
  johnny: { emoji: "🕶️", ar: "جوني برافو", search: ["johnny bravo"], token: "weight_xjh3ns85eqcd13fjp6ecbnan7", fish: "319a2fab6b5a435b9867bd5aba079a67" },
  dexter: { emoji: "🔬", ar: "دكستر", search: ["dexter (candi"], token: "weight_10kt48q8wfx56q5mkkrds2t3e", fish: "5755e8ace6bb4b6bab880001eb5c1172" },
  peter: { emoji: "🍺", ar: "بيتر غريفين", search: ["peter griffin"], token: "weight_883h5cw4q48cpsmjvjypxs0dc", fish: "d75c270eaee14c8aa1e9e980cc37cf1b" },
  stewie: { emoji: "👶", ar: "ستيوي", search: ["stewie griffin"], token: "weight_z08y522wjtc4y2q3ydzhdz3ay", fish: "e91c4f5974f149478a35affe820d02ac" },
  cartman: { emoji: "🧢", ar: "إريك كارتمان", search: ["eric cartman"], token: "weight_xxtg78hea5d5zrg1hbyqe81th", fish: "d6ea6d64c9fb42bea4dd69b0780ffd7f" },
  squidward: { emoji: "🐙", ar: "سكويدوارد", search: ["squidward"], token: "weight_y9arhnd7wjamezhqd27ksvmaz", fish: "549dc86f83e44b0fa15f6c0842486178" },
  rick: { emoji: "🧪", ar: "ريك سانشيز", search: ["rick sanchez"], token: "weight_qfz806d82b0qmxfn3vzgmtyme", fish: "d2e75a3e3fd6419893057c02a375a113" },
  morty: { emoji: "😰", ar: "مورتي", search: ["morty smith"], token: "weight_e6872yr5gk5zpsar0dhd0ka9b", fish: "3d445d095ba04681bcba7177faedf55a" },
  naruto: { emoji: "🍥", ar: "ناروتو", search: ["naruto uzumaki"], token: "weight_f95vtyq4nq0y0p2nxqgergpcq", fish: "d34183dcf4a041f5a82aa3dd19644329" },
  goku: { emoji: "🥋", ar: "غوكو", search: ["son goku"], token: "weight_jm7reg55vqn4b5v2cdn9d8w4v", fish: "6c8645b95abb44e0b9095ae3b241e4cc" },
  sailor: { emoji: "🌙", ar: "سيلور مون", search: ["sailor moon"], token: "weight_svc8af76318atcs8yr0hdmkpy", fish: "7d8d22e72cdf41009212571f6ed48dfc" },
};

const VOICE_IDS = Object.keys(VOICES);

const T = {
  ar: {
    title: "🎙️ تحويل النص إلى صوت",
    mainText: "اختر طريقة عرض الشخصيات:",
    btnInteractive: "🎯 أزرار قابلة للضغط",
    btnDropdown: "📋 قائمة منسدلة",
    chooseVoice: "اختر شخصية لتتكلّم:",
    more: "➕ المزيد",
    back: "⬅️ رجوع",
    notFound: "❌ الشخصية غير موجودة.",
    noText: "❌ أرسل النص أولاً بهذا الشكل:\n\n*.انطق نصك هنا*",
    tooLong: (max) => `⚠️ النص طويل جداً.\n\n📏 الحد الأقصى: ${max} حرف`,
    help: "🎙️ اكتب الأمر متبوعاً بالنص.\n\nمثال:\n*.انطق بوت فيتو أفضل بوت*",
    error: "❌ تعذّر توليد صوت الشخصية.",
    noMore: "❌ لا توجد شخصيات إضافية.",
    searchTitle: "🔎 نتائج البحث",
    searchNone: "❌ لا توجد نتائج.",
    working: "⏳ جاري التوليد…",
  },
};

// Text is remembered per chat+sender so the voice buttons can act after the
// menu message has moved on.
const textStore = new Map();
const TEXT_TTL_MS = 1000 * 60 * 30;

function storeKey(from, sender) {
  return `${from}:${sender}`;
}

function saveText(from, sender, text) {
  textStore.set(storeKey(from, sender), { text, at: Date.now() });
}

function getStoredText(from, sender) {
  const key = storeKey(from, sender);
  const entry = textStore.get(key);
  if (!entry) return "";
  if (Date.now() - entry.at > TEXT_TTL_MS) {
    textStore.delete(key);
    return "";
  }
  return entry.text || "";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickImage() {
  const images = config.botImages || [];
  return images.length ? images[Math.floor(Math.random() * images.length)] : null;
}

function clean(text) {
  return String(text || "").replace(/^[./!#]/, "").trim();
}

/** Rebuild the typed text from the command when args are unavailable. */
function textAfterCommand(body, cmdName) {
  const cleaned = clean(body);
  if (cmdName && cleaned.startsWith(cmdName)) return cleaned.slice(cmdName.length).trim();
  return cleaned.split(/\s+/).slice(1).join(" ").trim();
}

function voiceLabel(id) {
  const v = VOICES[id];
  return v ? `${v.emoji} ${v.ar}` : id;
}

function isFfmpegAvailable() {
  return TTS.ffmpegPath !== false;
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

/* ── Providers ─────────────────────────────────────────────────────────── */

let _modelsMem = null;

function fakeyouHeaders(extra = {}) {
  const h = { "Content-Type": "application/json", Accept: "application/json", ...extra };
  if (TTS.fakeyou.cookie) h.Cookie = TTS.fakeyou.cookie;
  return h;
}

async function getFakeYouModels() {
  if (_modelsMem) return _modelsMem;
  const res = await fetch(`${TTS.fakeyou.baseUrl}/tts/list`);
  if (!res.ok) throw new Error(`FakeYou list ${res.status}`);
  const data = await res.json();
  _modelsMem = data.models || [];
  return _modelsMem;
}

async function resolveModelToken(voice) {
  const models = await getFakeYouModels();
  const queries = (voice.search || [voice.ar]).map((s) => String(s).toLowerCase());

  for (const q of queries) {
    const hit = models.find((m) => String(m.title || "").toLowerCase() === q);
    if (hit) return hit.model_token;
  }
  for (const q of queries) {
    const hit = models.find((m) => String(m.title || "").toLowerCase().includes(q));
    if (hit) return hit.model_token;
  }
  throw new Error(`لا يوجد نموذج FakeYou لـ ${voice.ar}`);
}

async function fakeyouInfer(modelToken, text) {
  const res = await fetch(`${TTS.fakeyou.baseUrl}/tts/inference`, {
    method: "POST",
    headers: fakeyouHeaders(),
    body: JSON.stringify({
      tts_model_token: modelToken,
      uuid_idempotency_token: crypto.randomUUID(),
      inference_text: text,
    }),
  });
  const data = await res.json();
  if (!data?.success) throw new Error("فشل استدلال FakeYou");
  if (data.inference_job_token === "synthetic_too_many_requests") {
    throw new Error("FakeYou مزدحم");
  }
  return data.inference_job_token;
}

async function fakeyouPoll(jobToken) {
  const { pollTries, pollDelayMs, storageUrl } = TTS.fakeyou;
  for (let i = 0; i < pollTries; i++) {
    const res = await fetch(`${TTS.fakeyou.baseUrl}/tts/job/${jobToken}`, { headers: fakeyouHeaders() });
    const data = await res.json();
    const status = data?.state?.status;
    if (status === "complete_success") {
      const p = data.state.maybe_public_bucket_wav_audio_path;
      if (!p) throw new Error("FakeYou: لا مسار صوت");
      return `${storageUrl}${p}`;
    }
    if (status && String(status).startsWith("complete_failure")) throw new Error("فشل توليد FakeYou");
    if (status === "dead") throw new Error("مهمة FakeYou ميتة");
    await sleep(pollDelayMs);
  }
  throw new Error("انتهت مهلة FakeYou");
}

async function downloadToFile(url, ext, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`فشل التنزيل: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const p = path.join(os.tmpdir(), `tts_${crypto.randomUUID()}.${ext}`);
  await fs.promises.writeFile(p, buf);
  return p;
}

async function fakeyouToFile(text, voice) {
  let token = voice.token;
  if (!token) token = await resolveModelToken(voice);

  let jobToken;
  try {
    jobToken = await fakeyouInfer(token, text);
  } catch (e) {
    if (!voice.token) throw e;
    const alt = await resolveModelToken({ ...voice, token: null });
    jobToken = await fakeyouInfer(alt, text);
  }

  return downloadToFile(await fakeyouPoll(jobToken), "wav");
}

async function resolveFishId(voice) {
  const q = String((voice.search && voice.search[0]) || voice.ar).toLowerCase();
  const res = await fetch(`${TTS.fish.searchUrl}?title=${encodeURIComponent(q)}&page_size=10`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`بحث Fish Audio ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new Error(`Fish Audio: لا نموذج لـ "${q}"`);
  const exact = items.find((it) => String(it.title || "").toLowerCase().trim() === q);
  return (exact || items[0])._id;
}

async function fishToFile(text, voice) {
  const key = TTS.fish.apiKey;
  if (!key) throw new Error("مفتاح Fish Audio غير مضبوط");
  const refId = voice.fish || (await resolveFishId(voice));
  const res = await fetch(`${TTS.fish.baseUrl}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      model: TTS.fish.model,
    },
    body: JSON.stringify({ text, reference_id: refId, format: "mp3" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fish Audio ${res.status}: ${body.slice(0, 140)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("Fish Audio: صوت فارغ");
  const p = path.join(os.tmpdir(), `fish_${crypto.randomUUID()}.mp3`);
  await fs.promises.writeFile(p, buf);
  return p;
}

async function uberduckToFile(text, voice) {
  const { apiKey, baseUrl } = TTS.uberduck;
  if (!apiKey) throw new Error("مفتاح Uberduck غير مضبوط");
  const res = await fetch(`${baseUrl}/v1/text-to-speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voice.token || "polly_joanna", model: "polly_neural" }),
  });
  const data = await res.json();
  if (!data?.audio_url) throw new Error("فشل Uberduck");
  return downloadToFile(data.audio_url, "mp3");
}

/** Try each enabled provider in turn and return the first audio file. */
async function textToSpeech(text, voice) {
  const errors = [];
  const want = TTS.provider;

  if ((want === "auto" || want === "fish") && TTS.fish.apiKey) {
    try {
      return await fishToFile(text, voice);
    } catch (err) {
      errors.push(`fish: ${err?.message || err}`);
    }
  }

  if (want === "auto" || want === "fakeyou") {
    try {
      return await fakeyouToFile(text, voice);
    } catch (err) {
      errors.push(`fakeyou: ${err?.message || err}`);
    }
  }

  if (want === "uberduck") {
    try {
      return await uberduckToFile(text, voice);
    } catch (err) {
      errors.push(`uberduck: ${err?.message || err}`);
    }
  }

  throw new Error(errors.join(" | ") || "فشل توليد الصوت");
}

/** Convert to opus for a voice note; returns null when ffmpeg is absent. */
async function toOpus(inPath) {
  if (!isFfmpegAvailable()) return null;
  const outPath = inPath.replace(/\.[a-z0-9]+$/i, "") + `_${crypto.randomUUID().slice(0, 8)}.ogg`;
  await execFileAsync(TTS.ffmpegPath, [
    "-y", "-i", inPath,
    "-c:a", "libopus", "-b:a", "64k", "-vbr", "on",
    "-application", "voip", outPath,
  ]);
  return outPath;
}

/* ── Sending ───────────────────────────────────────────────────────────── */

const CANAL = config.channels?.canal1
  ? { newsletterJid: config.channels.canal1, serverMessageId: -1 }
  : undefined;

function ctxInfo(mentions) {
  return {
    ...(CANAL ? { forwardedNewsletterMessageInfo: CANAL } : {}),
    ...(mentions?.length ? { mentionedJid: mentions } : {}),
  };
}

/** Buttons, with the header image dropped if it cannot be prepared. */
async function tryButtons(sock, from, msg, opts) {
  const image = opts.image ?? pickImage();
  try {
    return await sendButtons(sock, from, msg, { ...opts, image, contextInfo: ctxInfo(opts.mentions) });
  } catch (e) {
    if (!image) throw e;
    log.warn(`[انطق] تعذّر تجهيز الصورة: ${e.message} — إرسال بدونها`);
    return await sendButtons(sock, from, msg, { ...opts, image: null, contextInfo: ctxInfo(opts.mentions) });
  }
}

async function tryList(sock, from, msg, opts) {
  const image = opts.image ?? pickImage();
  try {
    return await sendList(sock, from, msg, { ...opts, image, contextInfo: ctxInfo(opts.mentions) });
  } catch (e) {
    if (!image) throw e;
    log.warn(`[انطق] تعذّر تجهيز الصورة: ${e.message} — إرسال بدونها`);
    return await sendList(sock, from, msg, { ...opts, image: null, contextInfo: ctxInfo(opts.mentions) });
  }
}

async function replyText(sock, from, msg, text, mentions) {
  return await sock.sendMessage(from, { text, contextInfo: ctxInfo(mentions) }, { quoted: msg });
}

/* ── Screens ───────────────────────────────────────────────────────────── */

async function sendMainMenu(sock, from, msg, sender) {
  const t = T.ar;
  return tryButtons(sock, from, msg, {
    title: t.title,
    text: `${t.title}\n\n${t.mainText}`,
    footer: config.wm,
    mentions: [sender],
    buttons: [
      { text: t.btnInteractive, id: ".انطق-ازرار" },
      { text: t.btnDropdown, id: ".انطق-قائمه" },
    ],
  });
}

async function sendVoiceButtons(sock, from, msg, sender, page = 0) {
  const t = T.ar;
  const perPage = 2;
  const start = page * perPage;
  const remaining = VOICE_IDS.slice(start);

  if (remaining.length === 0) {
    return replyText(sock, from, msg, t.noMore, [sender]);
  }

  // The last page holds whatever is left, so the user is never stuck.
  const maxOnPage = remaining.length > 3 ? perPage : 3;
  const pageItems = remaining.slice(0, maxOnPage);

  const buttons = pageItems.map((id) => ({ text: voiceLabel(id), id: `.say_${id}` }));

  const remainingAfter = remaining.length - maxOnPage;
  if (remainingAfter > 0) {
    buttons.push({ text: t.more, id: `.انطق-ازرار-المزيد_${page + 1}` });
  } else if (page > 0) {
    buttons.push({ text: t.back, id: ".انطق-ازرار_0" });
  }

  return tryButtons(sock, from, msg, {
    title: t.title,
    text: t.chooseVoice,
    footer: config.wm,
    mentions: [sender],
    buttons,
  });
}

async function sendVoiceList(sock, from, msg, sender) {
  const t = T.ar;
  const rows = VOICE_IDS.map((id) => ({
    title: voiceLabel(id),
    description: "اضغط لتوليد الصوت",
    id: `.say_${id}`,
  }));

  const sections = [];
  for (let i = 0; i < rows.length; i += 10) {
    sections.push({
      title: `الشخصيات (${i + 1}-${Math.min(i + 10, rows.length)})`,
      rows: rows.slice(i, i + 10),
    });
  }

  return tryList(sock, from, msg, {
    title: t.title,
    text: `${t.title}\n\n${t.chooseVoice}`,
    buttonText: t.btnDropdown,
    footer: config.wm,
    mentions: [sender],
    sections,
  });
}

async function generateAndSend(sock, from, msg, sender, voiceId, text) {
  const t = T.ar;
  const voice = VOICES[voiceId];
  if (!voice) return replyText(sock, from, msg, t.notFound, [sender]);

  let srcPath = null;
  let oggPath = null;

  try {
    srcPath = await textToSpeech(text, voice);

    // A voice note needs opus; without ffmpeg we still send the audio.
    try {
      oggPath = await toOpus(srcPath);
    } catch (e) {
      log.warn(`[انطق] فشل تحويل opus: ${e.message} — إرسال الصوت الخام`);
      oggPath = null;
    }

    const sendPath = oggPath || srcPath;
    const isOgg = !!oggPath;

    await sock.sendMessage(
      from,
      {
        audio: fs.readFileSync(sendPath),
        mimetype: isOgg ? "audio/ogg; codecs=opus" : "audio/mpeg",
        ptt: isOgg,
        contextInfo: ctxInfo([sender]),
      },
      { quoted: msg }
    );
  } catch (err) {
    log.error(`[انطق] خطأ التوليد: ${err?.message || err}`);
    await replyText(sock, from, msg, t.error, [sender]);
  } finally {
    safeUnlink(srcPath);
    safeUnlink(oggPath);
  }
}

async function searchModels(sock, from, msg, sender, query) {
  const t = T.ar;
  if (!query) {
    return replyText(sock, from, msg, `${t.searchTitle}\n\n*.انطق-بحث spider-man*`, [sender]);
  }

  try {
    const models = await getFakeYouModels();
    const q = query.toLowerCase();
    const hits = models.filter((m) => String(m.title || "").toLowerCase().includes(q)).slice(0, 10);

    if (!hits.length) return replyText(sock, from, msg, t.searchNone, [sender]);

    const lines = hits.map((m, i) => `${i + 1}. ${m.title}\n   \`${m.model_token}\``).join("\n");
    return replyText(sock, from, msg, `${t.searchTitle}\n\n${lines}`, [sender]);
  } catch (err) {
    log.error(`[انطق] خطأ البحث: ${err?.message || err}`);
    return replyText(sock, from, msg, t.error, [sender]);
  }
}

/* ── Command ───────────────────────────────────────────────────────────── */

export default {
  name: [
    "انطق", "say",
    "انطق-ازرار", "انطق-قائمه", "انطق-ازرار-المزيد", "انطق-بحث",
    "say-buttons", "say-list", "say-search",
  ],
  // Button clicks send back ids such as "say_woody" or
  // "انطق-ازرار-المزيد_1", which are matched by prefix.
  dynamicPrefixes: ["say_", "انطق-ازرار-المزيد_", "انطق-ازرار_"],
  description: "تحويل النص إلى صوت بشخصيات كرتونية",
  category: "ia",
  ownerOnly: false,

  async run(ctx) {
    const { sock, from, msg, sender, senderNum, cmdName, args, text, react } = ctx;
    const usedName = String(cmdName || "").trim();
    const t = T.ar;
    const chat = msg.key?.remoteJid || from;
    const who = sender || `${senderNum}@s.whatsapp.net`;

    const argText = (text || (Array.isArray(args) ? args.join(" ") : "")).trim();
    const stored = getStoredText(chat, who);
    const provided = stored || argText;

    const safeReact = async (emoji) => {
      try {
        await react?.(emoji);
      } catch {}
    };

    // .say_woody — a voice button was pressed.
    if (usedName.toLowerCase().startsWith("say_")) {
      const voiceId = usedName.replace(/^say_/i, "");
      if (!provided) {
        await safeReact("❓");
        return replyText(sock, from, msg, t.noText, [who]);
      }
      if (provided.length > TTS.maxChars) {
        await safeReact("⚠️");
        return replyText(sock, from, msg, t.tooLong(TTS.maxChars), [who]);
      }
      await safeReact("🎙️");
      return generateAndSend(sock, from, msg, who, voiceId, provided);
    }

    // .انطق-ازرار-المزيد_1 — next page of voice buttons.
    if (usedName.startsWith("انطق-ازرار-المزيد_")) {
      const page = parseInt(usedName.replace("انطق-ازرار-المزيد_", "") || "1", 10) || 1;
      if (!provided) {
        await safeReact("❓");
        return replyText(sock, from, msg, t.noText, [who]);
      }
      saveText(chat, who, provided);
      await safeReact("➕");
      return sendVoiceButtons(sock, from, msg, who, page);
    }

    // .انطق-ازرار / .انطق-ازرار_0 — show voice buttons (0 = first page).
    if (usedName === "انطق-ازرار" || usedName === "say-buttons" || /^انطق-ازرار_\d+$/.test(usedName)) {
      const page = parseInt(usedName.replace(/^انطق-ازرار_/, "") || "0", 10) || 0;
      if (!provided) {
        await safeReact("❓");
        return replyText(sock, from, msg, t.noText, [who]);
      }
      saveText(chat, who, provided);
      await safeReact("🎯");
      return sendVoiceButtons(sock, from, msg, who, page);
    }

    // .انطق-قائمه — show the dropdown.
    if (usedName === "انطق-قائمه" || usedName === "say-list") {
      if (!provided) {
        await safeReact("❓");
        return replyText(sock, from, msg, t.noText, [who]);
      }
      saveText(chat, who, provided);
      await safeReact("📋");
      return sendVoiceList(sock, from, msg, who);
    }

    // .انطق-بحث <نص>
    if (usedName === "انطق-بحث" || usedName === "say-search") {
      await safeReact("🔎");
      return searchModels(sock, from, msg, who, argText);
    }

    // .انطق <نص> — entry point.
    if (usedName === "انطق" || usedName === "say") {
      const body = argText || textAfterCommand(ctx.body, usedName);
      if (!body) {
        await safeReact("❓");
        return replyText(sock, from, msg, t.help, [who]);
      }
      if (body.length > TTS.maxChars) {
        await safeReact("⚠️");
        return replyText(sock, from, msg, t.tooLong(TTS.maxChars), [who]);
      }
      saveText(chat, who, body);
      await safeReact("🎙️");
      return sendMainMenu(sock, from, msg, who);
    }

    return replyText(sock, from, msg, `❌ أمر غير معروف: ${usedName}`, [who]);
  },
};
