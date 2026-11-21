import fs from "node:fs"
import path from "node:path"
import JavaScriptObfuscator from "javascript-obfuscator"

const root = path.resolve(import.meta.dirname, "..")

const ALL = [
  "Famiglia/Corleone/بث/قنوات.js",
  "Famiglia/Corleone/بث/بث.js",
  "Famiglia/Corleone/بث/مباشر.js",
  "Famiglia/Corleone/بث/تحديث-القنوات.js",
  "Famiglia/plugins/مكالمات/قنوات.js",
  "Famiglia/plugins/مكالمات/مكالمة2.js",
  "Famiglia/plugins/مكالمات/مكالمه.js",
  "Famiglia/plugins/مكالمات/مكالمة-اغلاق.js"
]

const codeOptions = {
  target: "node",
  compact: true,
  renameGlobals: false,
  renameProperties: false,
  transformObjectKeys: false,
  identifierNamesGenerator: "hexadecimal",
  identifiersPrefix: "vq_",
  seed: 20261121,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  splitStrings: false,
  unicodeEscapeSequence: false,
  selfDefending: true,
  debugProtection: false,
  disableConsoleOutput: false,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  simplify: true,
  numbersToExpressions: true
}

// ملف البيانات ضخم وبلا دوال تقريباً؛ يكفيه تحويل النصوص إلى مصفوفة مشفّرة.
const dataOptions = {
  ...codeOptions,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  numbersToExpressions: false
}

const requested = process.argv.slice(2)
const files = requested.length ? requested : ALL

for (const rel of files) {
  const abs = path.resolve(root, rel)
  if (!abs.startsWith(root + path.sep)) throw new Error(`مسار خارج المشروع: ${rel}`)
  const source = fs.readFileSync(abs, "utf8")
  const options = rel.endsWith("بث/قنوات.js") ? dataOptions : codeOptions
  const output = JavaScriptObfuscator.obfuscate(source, options).getObfuscatedCode()
  fs.writeFileSync(abs, output, "utf8")
  console.log(`${rel}: ${source.length} -> ${output.length}`)
}

