export const CHANNEL_LINK_RE =
  /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([0-9A-Za-z_-]+)/i;
export const NEWSLETTER_JID_RE = /^(\d+)@newsletter$/i;

export function splitChannelInputs(text) {
  return String(text || "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalize(info, fallbackId = "") {
  const meta = info?.thread_metadata || info?.threadMetadata || {};
  return {
    id: info?.id || fallbackId,
    name: meta.name?.text || meta.name || "غير معروف",
    subscribers:
      meta.subscribers_count ?? meta.subscribersCount ?? "غير متاح",
    description: meta.description?.text || meta.description || "بدون وصف",
    verification:
      meta.verification === "VERIFIED" ? "✅ موثّق" : "❌ غير موثّق",
  };
}

export async function fetchChannel(sock, input) {
  if (typeof sock.newsletterMetadata !== "function") {
    throw new Error("newsletterMetadata غير متاح");
  }

  const direct = String(input).match(NEWSLETTER_JID_RE)?.[1];
  if (direct) {
    const id = `${direct}@newsletter`;
    try {
      return normalize(await sock.newsletterMetadata("jid", id), id);
    } catch {
      return normalize(null, id);
    }
  }

  const invite = String(input).match(CHANNEL_LINK_RE)?.[1];
  if (!invite) throw new Error("رابط قناة غير صالح");

  const info = await sock.newsletterMetadata("invite", invite);
  const channel = normalize(info);
  if (!channel.id) throw new Error("لم يُرجع واتساب معرّف القناة");
  return channel;
}
