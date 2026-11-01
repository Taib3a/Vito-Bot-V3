export default {
  name: ["r", "shell", "exec", "طرفية"],
  description: { es: "Ejecuta comandos de shell", ar: "ينفّذ أوامر shell" },
  category: "owner, المالك",
  ownerOnly: true,

  async run({ sock, from, args, react, msg }) {
    if (!args.length) return await react("❌");

    await react("⚙️");

    const { exec } = await import("child_process");
    const comando = args.join(" ");

    exec(comando, { timeout: 15000 }, async (error, stdout, stderr) => {
      const resultado = stdout || stderr || error?.message || "Sin output";

      let text = `\`\`\`\n$ ${comando}\n\n${resultado.trim()}\n\`\`\``;

      await sock.sendMessage(from, { text }, { quoted: msg });
    });
  }
};