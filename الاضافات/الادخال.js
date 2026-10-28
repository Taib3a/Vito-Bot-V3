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
  for (;;) {
    const raw = await prompter.ask("\nادخل الرقم (1 او 2): ");
    if (raw === null) return null;
    const answer = raw.trim();
    if (answer === "1") return "pairing";
    if (answer === "2") return "qr";
    console.log("❌ اختيار غير صالح — اكتب 1 لرمز الاقتران أو 2 للباركود.");
  }
}

export async function promptPhoneNumber(prompter) {
  for (;;) {
    const raw = await prompter.ask("ادخل رقم الهاتف (مع رمز الدولة، بدون +): ");
    if (raw === null) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 8) return digits;
    console.log("❌ رقم غير صالح — أدخل الرقم مع رمز الدولة (مثال: 967777123456).");
  }
}
