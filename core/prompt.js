import readline from "readline";

/**
 * Line-buffered prompt.
 *
 * One interface is reused for every question and incoming lines are queued, so
 * an answer is never dropped or mis-attributed when stdin delivers more than
 * one line at once (piped input, a hosting-panel console, or a user pasting the
 * number on the same tick as the choice). This is what makes the pairing flow
 * actually wait for the phone number instead of resolving with a stale line.
 */
function createPrompter(input = process.stdin, output = process.stdout) {
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

  // EOF must unblock a pending question with null instead of hanging forever.
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

/** Keeps only digits, so any format is accepted: "+967 738 512 629", "967-738-512-629". */
export function cleanPhoneNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** E.164 allows 8–15 digits. */
export function isValidPhoneNumber(value) {
  const digits = cleanPhoneNumber(value);
  return digits.length >= 8 && digits.length <= 15;
}

export async function askConnectionMethod() {
  const prompter = createPrompter();
  try {
    return await askConnectionMethodOn(prompter);
  } finally {
    prompter.close();
  }
}

export async function askPhoneNumber() {
  const prompter = createPrompter();
  try {
    return await askPhoneNumberOn(prompter);
  } finally {
    prompter.close();
  }
}

/**
 * Ask for the method and the phone number on ONE prompter.
 *
 * Two separate prompters would lose an answer: if the user pastes the choice
 * and the number together (or a hosting panel delivers both lines at once),
 * the first readline interface buffers the second line and drops it on close,
 * so the phone question resolves empty. Sharing the prompter keeps that line.
 */
export async function askPairingDetails() {
  const prompter = createPrompter();
  try {
    const method = await askConnectionMethodOn(prompter);
    if (method !== "1") return { method, phone: null };

    const phone = await askPhoneNumberOn(prompter);
    return { method, phone };
  } finally {
    prompter.close();
  }
}

async function askConnectionMethodOn(prompter) {
  console.log("");
  console.log(" ╔══════════════════════════════════╗");
  console.log(" ║  [1] رمز الاقتران (Pairing Code) ║");
  console.log(" ║  [2] رمز QR                      ║");
  console.log(" ╚══════════════════════════════════╝");

  for (;;) {
    const raw = await prompter.ask(" اختر طريقة الاتصال (1 أو 2): ");
    if (raw === null) return null;
    const choice = String(raw).trim();
    if (choice === "1" || choice === "2") return choice;
    console.log(" ⚠️  إدخال غير صالح — اكتب 1 أو 2.");
  }
}

async function askPhoneNumberOn(prompter) {
  console.log("");
  console.log(" أدخل رقم هاتفك مع رمز الدولة.");
  console.log(" يقبل كل الصيغ — بمسافات أو بدونها، بزائد (+) أو بدونه:");
  console.log("   +967 738 512 629   |   967738512629   |   (967) 738-512-629");

  for (;;) {
    const raw = await prompter.ask(" رقم الهاتف: ");
    if (raw === null) return null;
    if (isValidPhoneNumber(raw)) return cleanPhoneNumber(raw);
    console.log(" ⚠️  رقم غير صالح — يجب أن يحتوي على 8 إلى 15 رقماً.");
  }
}
