// سجل البثوث الجارية — يُستخدم لزرّ «البث المباشر الآن» في أمر .قنوات
// الغرفة قد تُغلق ويُعاد إنشاؤها برابط جديد، فيُحدَّث السجل بدل حذفه.
const live = new Map()
let seq = 0

export function addLive(record) {
  const id = String(++seq)
  live.set(id, { id, startedAt: Date.now(), ...record })
  return id
}

export function updateLive(id, patch) {
  const record = live.get(id)
  if (!record) return null
  Object.assign(record, patch)
  return record
}

export function getLive(id) {
  return live.get(id) || null
}

// يُستخدم لإيجاد سجل البث من المكالمة عند الإغلاق اليدوي
export function getLiveByCall(call) {
  for (const record of live.values()) if (record.call === call) return record
  return null
}

export function removeLive(id) {
  if (id) live.delete(id)
}

export function listLive() {
  return [...live.values()].sort((a, b) => a.startedAt - b.startedAt)
}
