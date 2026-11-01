export default { 
  name: ["restart", "rest", "اعادة"], 
  description: { es: "Reinicia el bot", ar: "يعيد تشغيل البوت" }, 
category : "owner",
  ownerOnly: true,
  async run({ conn, m, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    await reply(tr('📍 *Reiniciando el bot, espere un momento...*', '📍 *جارٍ إعادة تشغيل البوت، انتظر لحظة...*'))
    setTimeout(() => { process.exit(1) }, 1000)
  }
}
