import fs from "node:fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const p = new URL("../Famiglia/Corleone/themeUploadServer.js", import.meta.url);
let src = fs.readFileSync(p, "utf8");

const openTag = "<script>\nvar TOKEN=";
const s0 = src.indexOf(openTag);
const s1 = src.indexOf("</script>", s0) + "</script>".length;
const block = src.slice(s0, s1);

const tokenLineEnd = block.indexOf("\n", block.indexOf("var TOKEN="));
let client = block.slice(tokenLineEnd + 1, block.lastIndexOf("</script>"));

client =
  "document.addEventListener('contextmenu',function(e){e.preventDefault()});" +
  "document.addEventListener('selectstart',function(e){e.preventDefault()});" +
  client;

const obf = JavaScriptObfuscator.obfuscate(client, {
  target: "browser",
  compact: true,
  renameGlobals: false,
  renameProperties: false,
  identifierNamesGenerator: "hexadecimal",
  identifiersPrefix: "vx_",
  seed: 20261127,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.8,
  splitStrings: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  numbersToExpressions: true,
  simplify: true,
}).getObfuscatedCode();

const b64 = Buffer.from(obf, "utf8").toString("base64");
const newBlock = '<script>var TOKEN=${JSON.stringify(token)};</script>\n<script src="/t/${token}/app.js"></script>';

src = src.slice(0, s0) + newBlock + src.slice(s1);
src = src.replace(
  "const PAGE = (token) =>",
  'const CLIENT_B64 =\n  "' + b64 + '";\n\nconst PAGE = (token) =>'
);

fs.writeFileSync(p, src);
console.log("كود العميل:", client.length, "→ مشفّر:", obf.length, "→ base64:", b64.length);
