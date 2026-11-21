// سجل البثوث الجارية — يُستخدم لزرّ «البث المباشر الآن» في أمر .قنوات
const live = new Map()
let seq = 0

export function addLive(record) {
  const id = String(++seq)
  live.set(id, { id, startedAt: Date.now(), ...record })
  return id
}

export function removeLive(id) {
  if (id) live.delete(id)
}

export function listLive() {
  return [...live.values()].sort((a, b) => a.startedAt - b.startedAt)
}
