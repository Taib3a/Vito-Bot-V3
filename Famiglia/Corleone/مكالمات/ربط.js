// محرّك VoIP مقتبس من مشروع HIROBOT (github.com/HirooSy/HIROBOT) — رخصة غير تجارية.
// هذا الجسر يوائم واجهة المحرّك مع إضافات هذا البوت.
import Voip from "./index.js"

// سجل المكالمات الجارية لكل محادثة.
const activeCalls = new Map()

export function getVoip(sock) {
  if (!sock.voipInstance) {
    sock.voipInstance = new Voip(sock, { voipLogLevel: "warn" })
  }
  return sock.voipInstance
}

export function addCall(from, call) {
  if (!activeCalls.has(from)) activeCalls.set(from, new Set())
  activeCalls.get(from).add(call)
}

export function removeCall(from, call) {
  const calls = activeCalls.get(from)
  if (!calls) return
  calls.delete(call)
  if (calls.size === 0) activeCalls.delete(from)
}

export function currentCall(from) {
  const calls = activeCalls.get(from)
  if (!calls || calls.size === 0) return null
  return [...calls][calls.size - 1]
}

export function callsOf(from) {
  return [...(activeCalls.get(from) ?? [])]
}
