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

// يستخرج أعضاء المجموعة كأرقام (يستثني البوت نفسه)، مع حلّ معرّفات @lid.
export async function groupMemberNumbers(ctx) {
  const { groupMeta, sock, resolveLid } = ctx
  const participants = groupMeta?.participants ?? []
  const selfNums = new Set(
    [sock?.user?.id, sock?.user?.lid]
      .filter(Boolean)
      .map((j) => String(j).split(/[:@]/)[0])
  )

  const numbers = []
  const seen = new Set()
  for (const p of participants) {
    // phoneNumber (PN) هو الأنسب للمكالمات؛ فإن غاب وكان المعرّف @lid نحلّه.
    let jid = p.phoneNumber || p.id || ""
    if (jid.endsWith("@lid") && resolveLid) {
      try { jid = (await resolveLid(jid)) || jid } catch {}
    }
    if (!jid) continue
    const num = String(jid).split(/[:@]/)[0].replace(/\D/g, "")
    if (!num || num.length < 6) continue
    if (selfNums.has(num) || seen.has(num)) continue
    seen.add(num)
    numbers.push(num)
  }
  return numbers
}

