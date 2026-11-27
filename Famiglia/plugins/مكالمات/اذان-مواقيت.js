// مواقيت الصلاة + إرسال الأذان رسالةً صوتية في المجموعات المُسجَّلة.
// لا يستخدم VoIP إطلاقاً: رسالة صوتية عادية (PTT).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as adhan from "adhan";
import { getMainSock } from "../../Corleone/subbotManager.js";
import { log } from "../../Corleone/logger.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const STATE_FILE = path.join(ROOT, "Famiglia/database/adhan.json");
const AUDIO_FILE = path.join(ROOT, "assets/adhan/adhan.ogg");

const CITIES = {
  صنعاء: { lat: 15.3694, lon: 44.191, method: "MuslimWorldLeague" },
  عدن: { lat: 12.7855, lon: 45.0187, method: "MuslimWorldLeague" },
  تعز: { lat: 13.5795, lon: 44.0209, method: "MuslimWorldLeague" },
  الحديدة: { lat: 14.7978, lon: 42.9545, method: "MuslimWorldLeague" },
  المكلا: { lat: 14.5425, lon: 49.1242, method: "MuslimWorldLeague" },
  القاهرة: { lat: 30.0444, lon: 31.2357, method: "Egyptian" },
  الإسكندرية: { lat: 31.2001, lon: 29.9187, method: "Egyptian" },
  مكة: { lat: 21.4225, lon: 39.8262, method: "UmmAlQura" },
  المدينة: { lat: 24.4672, lon: 39.6111, method: "UmmAlQura" },
  الرياض: { lat: 24.7136, lon: 46.6753, method: "UmmAlQura" },
  جدة: { lat: 21.4858, lon: 39.1925, method: "UmmAlQura" },
  دبي: { lat: 25.2048, lon: 55.2708, method: "Dubai" },
};

const PRAYERS = { fajr: "الفجر", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء" };
const SEND_WINDOW_MS = 3 * 60 * 1000;

const DEFAULTS = { enabled: true, city: "صنعاء", groups: [], sent: {} };

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...DEFAULTS, ...raw, sent: raw.sent || {} };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function timesFor(city, date = new Date()) {
  const cfg = CITIES[city] || CITIES[DEFAULTS.city];
  const params = adhan.CalculationMethod[cfg.method]();
  const pt = new adhan.PrayerTimes(new adhan.Coordinates(cfg.lat, cfg.lon), date, params);
  return Object.fromEntries(Object.keys(PRAYERS).map((k) => [k, pt[k]]));
}

const fmt = (d) =>
  d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aden", hour12: true });

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

async function sendAdhan(jid, prayerLabel) {
  if (!String(jid).endsWith("@g.us")) {
    log.warn(`الأذان: تجاهل وجهة غير مجموعة (${jid})`);
    return;
  }
  const sock = getMainSock();
  if (!sock) return log.warn("الأذان: لا يوجد بوت رئيسي متصل.");
  await sock.sendMessage(jid, { text: `🕌 حان الآن وقت صلاة ${prayerLabel}` });
  if (!fs.existsSync(AUDIO_FILE)) {
    return log.warn("الأذان: ملف الصوت غير موجود — أُرسل التنبيه النصي فقط.");
  }
  await sock.sendMessage(jid, {
    audio: fs.readFileSync(AUDIO_FILE),
    mimetype: "audio/ogg; codecs=opus",
    ptt: true,
  });
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const state = readState();
    if (!state.enabled || !state.groups?.length) return;
    const now = new Date();
    const times = timesFor(state.city, now);
    const day = dayKey(now);
    state.sent = state.sent?.[day] ? state.sent : { [day]: {} };
    for (const [key, label] of Object.entries(PRAYERS)) {
      const at = times[key];
      const delta = now - at;
      if (delta < 0 || delta > SEND_WINDOW_MS) continue;
      if (state.sent[day][key]) continue;
      state.sent[day][key] = Date.now();
      writeState(state);
      for (const jid of state.groups) {
        sendAdhan(jid, label).catch((e) => log.error(`الأذان: فشل الإرسال إلى ${jid}: ${e.message}`));
      }
      log.info(`الأذان: ${label} → ${state.groups.length} مجموعة`);
    }
  } finally {
    ticking = false;
  }
}

setInterval(tick, 30_000).unref();

export default {
  name: ["مواقيت", "اذان-هنا", "اذان-تشغيل", "اذان-ايقاف", "اذان-الحالة", "اذان-مدينة", "اذان-تجربة"],
  description: "مواقيت الصلاة وإرسال الأذان رسالة صوتية في المجموعات",
  category: "مكالمات",

  async run({ cmdName, args, from, isGroup, isOwner, reply }) {
    const state = readState();

    if (cmdName === "مواقيت") {
      const times = timesFor(state.city);
      const lines = Object.entries(PRAYERS).map(([k, label]) => `• ${label}: ${fmt(times[k])}`);
      return reply({
        text: `🕌 مواقيت الصلاة — ${state.city}\n${lines.join("\n")}\n\n> الحالة: ${state.enabled ? "مُفعّل" : "متوقف"} | المجموعات: ${state.groups.length}`,
      });
    }

    if (!isOwner) return reply({ text: "❌ هذا الأمر للمالك فقط." });

    if (cmdName === "اذان-هنا") {
      if (!isGroup) return reply({ text: "📩 أرسل الأمر داخل المجموعة المطلوبة." });
      if (!state.groups.includes(from)) state.groups.push(from);
      writeState(state);
      return reply({ text: `✅ أُضيفت هذه المجموعة لاستقبال الأذان (${state.groups.length} مجموعة).` });
    }

    if (cmdName === "اذان-تشغيل" || cmdName === "اذان-ايقاف") {
      state.enabled = cmdName === "اذان-تشغيل";
      writeState(state);
      return reply({ text: state.enabled ? "✅ تم تشغيل الأذان التلقائي." : "⏸️ تم إيقاف الأذان التلقائي." });
    }

    if (cmdName === "اذان-مدينة") {
      const city = (args[0] || "").trim();
      if (!CITIES[city]) return reply({ text: `❌ مدينة غير معروفة.\n> المتاح: ${Object.keys(CITIES).join("، ")}` });
      state.city = city;
      writeState(state);
      return reply({ text: `✅ المدينة: ${city}` });
    }

    if (cmdName === "اذان-تجربة") {
      if (!isGroup) return reply({ text: "📩 داخل المجموعة فقط." });
      await sendAdhan(from, "تجريبية");
      return reply({ text: "🔊 أُرسل الأذان كرسالة صوتية." });
    }

    const times = timesFor(state.city);
    return reply({
      text: `🕌 الحالة\n> المدينة: ${state.city}\n> مُفعّل: ${state.enabled ? "نعم" : "لا"}\n> المجموعات: ${state.groups.length}\n> الفجر: ${fmt(times.fajr)} | الظهر: ${fmt(times.dhuhr)} | العصر: ${fmt(times.asr)} | المغرب: ${fmt(times.maghrib)} | العشاء: ${fmt(times.isha)}`,
    });
  },
};
