"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { privatePath } = require("./lib/settings");
let ok = true;
for (const file of ["MMM-GoogleNestDoorbell-BODK.js", "MMM-GoogleNestDoorbell-BODK.css", "node_helper.js", "lib/google-client.js", "lib/settings.js", "lib/events.js", "scripts/authorize.js", "config.example.js", "package.json", "package-lock.json", "README.md", "LICENSE"]) {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`${exists ? "OK " : "ERR"} ${file}`); if (!exists) ok = false;
}
const [major, minor, patch] = process.versions.node.split(".").map(Number);
const supported = major >= 24 || (major === 22 && (minor > 22 || (minor === 22 && patch >= 2)));
console.log(`${supported ? "OK " : "ERR"} Node.js ${process.version}`); if (!supported) ok = false;
for (const dependency of ["googleapis", "@google-cloud/pubsub"]) {
  try { require.resolve(dependency); console.log(`OK  ${dependency}`); }
  catch { console.log(`ERR ${dependency}: run npm ci`); ok = false; }
}
// Optional local setup is reported separately; CI requires no personal credentials.
for (const file of ["oauth-client.json", "tokens.json"]) console.log(`${fs.existsSync(privatePath(null, file)) ? "OK " : "-- "} private ${file}`);
console.log("This checks installation only. Google authorization, Pub/Sub and real video require the manual checks in README.md.");
process.exitCode = ok ? 0 : 1;
