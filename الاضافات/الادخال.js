import readline from "readline";

/**
 * Line-buffered prompt helper.
 *
 * A single interface is reused for every question and incoming lines are
 * queued, so an answer is never dropped or mis-attributed when stdin delivers
 * more than one line at once (piped input, or a hosting-panel console). This
 * is what makes the pairing flow wait for the phone number instead of
 * resolving immediately with an empty/stale line.
 */
export function createPrompter(input = process.stdin, output = process.stdout) {
  const rl = readline.createInterface({ input, output });
  const buffered = [];
  let pending = null;

  rl.on("line", (line) => {
    const resolve = pending;
    if (resolve) {
      pending = null;
      resolve(line);
    } else {
      buffered.push(line);
    }
  });

  // EOF: unblock a pending question with null instead of hanging forever.
  rl.on("close", () => {
    const resolve = pending;
    if (resolve) {
      pending = null;
      resolve(null);
    }
  });

  return {
    ask(question) {
      output.write(question);
      if (buffered.length > 0) return Promise.resolve(buffered.shift());
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
    close() {
      rl.close();
    },
  };
}

export async function promptConnectionMethod(prompter) {
  console.log("");
  console.log(" ╔══════════════════════════════════╗");
  console.log(" ║  [1] رمز الاقتران (Pairing Code) ║");
  console.log(" ║  [2] رمز QR                      ║");
  console.log(" ╚══════════════════════════════════╝");

  for (;;) {
    const raw = await prompter.ask("اختر طريقة الاتصال (1 او 2): ");
    if (raw === null) return null;
    const answer = raw.trim();
    if (answer === "1") return "pairing";
    if (answer === "2") return "qr";
    console.log("❌ اختيار غير صالح — اكتب 1 لرمز الاقتران أو 2 للباركود.");
  }
}

export async function promptPhoneNumber(prompter) {
  console.log("");
  console.log("أدخل رقم الهاتف مع رمز الدولة.");
  console.log("يقبل كل الصيغ — بمسافات أو بدونها، بزائد (+) أو بدونه:");
  console.log("  967735541558");
  console.log("  +967 738 512 629");
  console.log("  967 738 512 629");
  console.log("  +20 11 01704095");

  for (;;) {
    const raw = await prompter.ask("\nرقم الهاتف: ");
    if (raw === null) return null;
    const digits = normalizePhoneNumber(raw);
    if (digits) return digits;
    console.log("❌ رقم غير صالح — أدخل الرقم مع رمز الدولة (مثال: 967735541558).");
  }
}

/**
 * Reduce any way a user might type a phone number to bare digits, which is what
 * WhatsApp expects. Spaces, dashes, parentheses and a leading + are all dropped,
 * so `+967 738 512 629` and `967738512629` produce the same result. Returns null
 * when what is left cannot be a phone number (too short or too long for E.164).
 */
export function normalizePhoneNumber(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
