// تحويل النص إلى صوت عبر ElevenLabs وإرساله رسالة صوتية داخل المجموعة.
// يحتاج: ELEVENLABS_API_KEY (واختيارياً ELEVENLABS_VOICE_ID و ELEVENLABS_MODEL).
import { log } from "../../Corleone/logger.js";

const MAX_CHARS = 500;
const API = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL = "eleven_multilingual_v2";

export default {
  name: ["قل", "انطق"],
  description: "يحوّل النص إلى رسالة صوتية (ElevenLabs)",
  category: "أدوات",
  groupOnly: true,

  async run({ from, args, reply }) {
    if (!String(from).endsWith("@g.us")) return reply({ text: "👥 داخل المجموعات فقط." });

    const text = args.join(" ").trim();
    if (!text) return reply({ text: "✍️ اكتب النص بعد الأمر: *.قل مرحباً*" });
    if (text.length > MAX_CHARS) return reply({ text: `❌ النص طويل (${text.length}/${MAX_CHARS}).` });

    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return reply({ text: "🔑 مفتاح ElevenLabs غير مضبوط (ELEVENLABS_API_KEY)." });

    const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

    try {
      const res = await fetch(`${API}/${voice}?output_format=opus_48000_32`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
        return reply({ text: `❌ فشل التوليد (${res.status}).` });
      }

      const audio = Buffer.from(await res.arrayBuffer());
      await reply({ audio, mimetype: "audio/ogg; codecs=opus", ptt: true });
    } catch (e) {
      log.error(`قل: ${e.message}`);
      await reply({ text: `❌ خطأ: ${e.message}` });
    }
  },
};
