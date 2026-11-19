import config from "../../Corleone/settings.js"
import { db } from "../../database/db.js"
import {
  mediaSourceOf,
  downloadSource,
  classify,
  normalizeVideo,
  uploadStatus,
  ensureStatusTools
} from "../_محرّكات/الحالات/الرفع.js"

const OWNER_FLAG = /(?:^|\s)--owner(?=\s|$)/i
const OWNER_FLAG_GLOBAL = /(?:^|\s)--owner(?=\s|$)/gi

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0]

function ownerJids(...extra) {
  const owners = new Set(
    [...(config.ownerNumber || []), ...(config.coOwners || [])]
      .map((n) => String(n).replace(/\D/g, ""))
      .filter(Boolean)
      .map((n) => `${n}@s.whatsapp.net`)
  )
  for (const jid of extra) if (jid) owners.add(jid)
  return [...owners]
}

/** جهات الاستلام: المالك وحده، أو كل مستخدمي البوت، وإلا المالكون. */
function audienceFor(ownerOnly, selfJid, senderJid) {
  const always = [selfJid, senderJid].filter(Boolean)

  if (ownerOnly) return [...new Set([...ownerJids(...always)])]

  // getAllUsers يعيد الأرقام بلا لاحقة، فنعيد بناء المعرّف الكامل.
  // المعرّفات غير الرقمية (bf…) ليست أرقام واتساب فتُستبعد.
  const users = db
    .getAllUsers()
    .map((u) => numOf(u.jid))
    .filter((num) => /^\d{6,}$/.test(num))
    .map((num) => `${num}@s.whatsapp.net`)

  // بلا مستخدمين مسجّلين لا تصل الحالة لأحد، فنرجع للمالكين.
  return users.length ? [...new Set([...users, ...always])] : ownerJids(...always)
}

export default {
  name: ["حالة", "رفع-حالة", "ستوري"],
  description: "ينشر حالة (نص أو صورة أو فيديو) على رقم البوت",
  category: "المالك",
  ownerOnly: true,

  async run({ sock, from, sender, msg, reply, react, text, isOwner, isCoOwner }) {
    if (!isOwner && !isCoOwner) {
      return reply({ text: "❌ هذا الأمر للمالك فقط." })
    }

    const ownerOnly = OWNER_FLAG.test(text || "")
    const caption = (text || "").replace(OWNER_FLAG_GLOBAL, "").trim()

    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage
      ? {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
          },
          message: msg.message.extendedTextMessage.contextInfo.quotedMessage
        }
      : null

    const source = mediaSourceOf(msg, quoted)
    const kind = source ? classify(source) : null

    if (!source && !caption) {
      return reply({
        text:
          "📤 *طريقة الاستخدام:*\n" +
          "> *.حالة <نص>* — حالة نصية\n" +
          "> *.حالة* (بالردّ على صورة) — حالة صورة\n" +
          "> *.حالة* (بالردّ على فيديو) — حالة فيديو\n" +
          "> أضف `--owner` ليصل للمالك فقط بدل كل المستخدمين\n\n" +
          "*أمثلة:*\n" +
          "> `.حالة إعلان مهم` \n" +
          "> `.حالة --owner تحديث خاص`"
      })
    }

    // البوت نفسه + المرسل: تضمن وصول الحالة ولو كانت قاعدة المستخدمين فارغة.
    const selfJid = sock?.user?.id ? `${numOf(sock.user.id)}@s.whatsapp.net` : null
    const senderJid = sender ? `${numOf(sender)}@s.whatsapp.net` : null
    const audience = audienceFor(ownerOnly, selfJid, senderJid)
    if (!audience.length) {
      return reply({ text: "❌ لا يوجد مستقبلون. أضف مستخدمين للبوت أو استخدم `--owner`." })
    }

    await react("⏳")

    try {
      let content

      if (source && kind) {
        const buffer = await downloadSource(sock, source)
        if (!buffer?.length) {
          await react("❌")
          return reply({ text: "❌ تعذّر تنزيل الوسائط." })
        }

        if (kind === "video") {
          const missing = await ensureStatusTools()
          if (missing) {
            await react("❌")
            return reply({ text: missing })
          }
          const video = await normalizeVideo(buffer)
          content = { video, mimetype: "video/mp4", caption: caption || undefined }
        } else {
          content = {
            image: buffer,
            mimetype: source.node.mimetype || "image/jpeg",
            caption: caption || undefined
          }
        }
      } else if (source) {
        await react("❌")
        return reply({ text: "❌ الوسائط غير مدعومة. أرسل صورة أو فيديو." })
      } else {
        content = { text: caption, backgroundColor: "#34B7F1" }
      }

      await uploadStatus(sock, content, audience)

      await react("✅")
      return reply({
        text:
          `✅ *نُشرت الحالة*\n` +
          `> النوع: ${source ? (kind === "video" ? "فيديو" : "صورة") : "نص"}\n` +
          `> المستقبلون: ${audience.length}${ownerOnly ? " (المالك فقط)" : ""}`
      })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل رفع الحالة: ${e.message}` })
    }
  }
}
