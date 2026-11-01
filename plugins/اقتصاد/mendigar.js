import { checkCooldown, setCooldown, addBolsillo, formatTime } from "../../core/economy.js";

const FRASES_EXITO = [
  tr("Un señor te dio unas monedas por lástima.", "أعطاك رجل بعض العملات شفقةً."),
  tr("Una viejita te regaló su cambio.", "أهدتك امرأة عجوز باقي نقودها."),
  tr("Alguien te tiró plata desde su carro.", "أحدهم رمى لك مالاً من سيارته."),
  tr("Encontraste una moneda en el piso mientras mendigabas.", "وجدت عملة على الأرض أثناء التسوّل.")
];

const FRASES_FALLO = [
  tr("Nadie te dio nada, te ignoraron por completo.", "لم يعطك أحد شيئاً، تجاهلوك تماماً."),
  tr("Un guardia te corrió del lugar.", "طردك حارس من المكان."),
  tr("La gente pasó de largo sin mirarte.", "مرّ الناس دون أن ينظروا إليك."),
  tr("Te dijeron \"consíguete un trabajo\" y siguieron caminando.", "قالوا لك «ابحث عن عمل» وأكملوا طريقهم.")
];

export default {
  name: ["mendigar", "beg", "شحاذة", "تسول"],
  description: { es: "Pide limosna a ver si alguien te da algo", ar: "يتسوّل لعلّ أحداً يعطيك شيئاً" },
  category: "economy, الاقتصاد",

  async run({ sender, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const status = checkCooldown(sender, "mendigar");
    if (!status.ready) {
      return await reply({ text: tr(`⏳ Ya mendigaste hace poco. Volvé en *${formatTime(status.remaining)}*.`, `⏳ تسوّلت مؤخراً. عد بعد *${formatTime(status.remaining)}*.`) });
    }

    setCooldown(sender, "mendigar");

    const success = Math.random() < 0.55;

    if (success) {
      const amount = Math.floor(Math.random() * 80) + 10;
      addBolsillo(sender, amount);
      const frase = FRASES_EXITO[Math.floor(Math.random() * FRASES_EXITO.length)];
      await reply({ text: tr(`🙏 ${frase}\n*+${amount}* monedas.`, `🙏 ${frase}\n*+${amount}* عملة.`) });
    } else {
      const frase = FRASES_FALLO[Math.floor(Math.random() * FRASES_FALLO.length)];
      await reply({ text: tr(`🙏 ${frase}\nNo ganaste nada esta vez.`, `🙏 ${frase}\nلم تكسب شيئاً هذه المرة.`) });
    }
  }
};