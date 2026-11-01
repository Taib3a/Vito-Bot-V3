import { db } from "../../database/db.js";
import { checkCooldown, setCooldown, formatTime } from "../../core/economy.js";

const CRIMENES_EXITO = [
  tr("Robaste una tienda y escapaste sin que nadie te viera.", "سرقت متجراً وهربت دون أن يراك أحد."),
  tr("Le hackeaste la cuenta a un banco y sacaste una parte.", "اخترقت حساب بنك وأخذت جزءاً منه."),
  tr("Vendiste productos falsificados sin que te descubrieran.", "بعت منتجات مقلّدة دون أن يُكشف أمرك."),
  tr("Estafaste a un turista despistado.", "خدعت سائحاً غافلاً.")
];

const CRIMENES_FALLO = [
  tr("Intentaste robar una tienda pero saltó la alarma y te atraparon.", "حاولت سرقة متجر لكن انطلق الإنذار وأمسكوا بك."),
  tr("La policía te agarró vendiendo productos falsos.", "أمسكت بك الشرطة تبيع منتجات مقلّدة."),
  tr("Tu estafa fue tan mala que la víctima llamó a la policía.", "كانت عملية نصبك سيئة لدرجة أن الضحية اتصلت بالشرطة."),
  tr("Te descubrieron las cámaras de seguridad.", "كشفتك كاميرات المراقبة.")
];

export default {
  name: ["crimen", "crime", "جريمة"],
  description: { es: "Cometé un crimen random, con riesgo de multa", ar: "يرتكب جريمة عشوائية مع خطر الغرامة" },
  category: "economy, الاقتصاد",

  async run({ sender, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const status = checkCooldown(sender, "crimen");
    if (!status.ready) {
      return await reply({ text: tr(`⏳ Estás escondido de la ley. Volvé en *${formatTime(status.remaining)}*.`, `⏳ أنت مختبئ من القانون. عد بعد *${formatTime(status.remaining)}*.`) });
    }

    setCooldown(sender, "crimen");

    const success = Math.random() < 0.5;
    const eco = db.getEco(sender);

    if (success) {
      const amount = Math.floor(Math.random() * 400) + 150;
      db.setEco(sender, { bolsillo: (eco.bolsillo || 0) + amount });
      const frase = CRIMENES_EXITO[Math.floor(Math.random() * CRIMENES_EXITO.length)];
      await reply({ text: `🔫 ${frase}\n*+${amount}* monedas.` });
    } else {
      const fine = Math.floor(Math.random() * 250) + 100;
      db.setEco(sender, { bolsillo: Math.max(0, (eco.bolsillo || 0) - fine) });
      const frase = CRIMENES_FALLO[Math.floor(Math.random() * CRIMENES_FALLO.length)];
      await reply({ text: tr(`🚔 ${frase}\nPagaste una multa de *${fine}* monedas.`, `🚔 ${frase}\nدفعت غرامة *${fine}* عملة.`) });
    }
  }
};