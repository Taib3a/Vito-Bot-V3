import { execFile } from "node:child_process"

// يفحص توفّر ffmpeg/ffprobe على PATH مع تخزين النتيجة مؤقتاً.
const cache = new Map()

function probe(bin, timeout = 4000) {
  if (cache.has(bin)) return cache.get(bin)
  const p = new Promise((resolve) => {
    execFile(bin, ["-version"], { timeout }, (err) => resolve(!err))
  })
  cache.set(bin, p)
  return p
}

export function hasFfmpeg() {
  return probe("ffmpeg")
}

export function hasFfprobe() {
  return probe("ffprobe")
}

// يعيد قائمة بالنواقص؛ فارغة تعني أن كل المتطلبات متوفرة.
export async function missingRequirements({ media = false } = {}) {
  const missing = []
  if (!media) return missing
  if (!(await hasFfmpeg())) missing.push("ffmpeg")
  if (!(await hasFfprobe())) missing.push("ffprobe")
  return missing
}

export function mediaRequirementMessage(missing) {
  return (
    `❌ *متطلب ناقص على السيرفر:* ${missing.join(" · ")}\n\n` +
    `> المكالمات ذات الوسائط تحتاج *ffmpeg* و*ffprobe*.\n` +
    `> *Debian/Ubuntu:* \`apt-get install -y ffmpeg\`\n` +
    `> *Alpine:* \`apk add ffmpeg\`\n` +
    `> المكالمات الصامتة (*.مكالمة <رقم>*) تعمل بدونها.`
  )
}
