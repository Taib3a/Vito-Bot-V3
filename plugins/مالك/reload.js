export default {
  name: ["reload", "اعادة-تحميل"],
  description: { es: "Reinicia la sesión de este bot (reconexión rápida, ~1-2 segundos)", ar: "يعيد تشغيل جلسة هذا البوت (إعادة اتصال سريعة، ~1-2 ثانية)" },
  category: "owner, المالك",
  ownerOnly: true,

  async run({ sock, reply, react, botLabel, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    await react("🔄");
    await reply({ text: tr(`🔄 Recargando sesión de *${botLabel}*, vuelvo en un momento...`, `🔄 جارٍ إعادة تحميل جلسة *${botLabel}*، أعود بعد لحظة...`) });

    try {
      const { clearSocketFiles } = await import("../../core/connection.js");
      if (sock.sessionDir) {
        await clearSocketFiles(sock.sessionDir);
      }
    } catch (e) {
      console.error("[reload] Error limpiando sesión:", e.message);
    }

    setTimeout(() => {
      try {
        sock.end(new Error("Reload manual solicitado"));
      } catch (e) {
        console.error("[reload] Error cerrando socket:", e.message);
      }
    }, 500);
  },
};