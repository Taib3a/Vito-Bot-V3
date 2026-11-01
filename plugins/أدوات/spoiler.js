export default {
  name: ["spoiler", "تخفي"],
  description: "Envía un mensaje largo que WhatsApp trunca con tr('Leer más', 'قراءة المزيد') en la misma línea",
  category: "utils, الأدوات",
  ownerOnly: false,

  async run({ reply, text, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    if (!text) {
      return await reply({ text: tr("❌ Escribe el texto que quieres ocultar.\n\n*Ejemplo:* .spoiler la respuesta es 42", "❌ اكتب النص الذي تريد إخفاءه.\n\n*مثال:* .spoiler الجواب هو 42") })
    }

    const partes = text.split("|").map(p => p.trim())
    const visible = partes[0]
    const oculto = partes[1] || partes[0]

    // Zero-width space: no ocupa espacio visual ni genera salto de línea,
    // así el tr("Leer más", "قراءة المزيد") queda pegado justo después del texto visible.
    const relleno = "\u200b".repeat(3000)

    const mensaje = `${visible}${relleno}${oculto}`

    await reply({ text: mensaje })
  }
}