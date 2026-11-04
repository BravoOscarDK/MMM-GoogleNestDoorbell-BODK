"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const NAME = "MMM-GoogleNestDoorbell-BODK";
const privateDir = path.join(os.homedir(), ".config", NAME);
function privatePath(value, fallback) {
  const resolved = path.resolve(value || path.join(privateDir, fallback));
  const modules = path.resolve(__dirname, "../../..");
  const relative = path.relative(modules, resolved);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Private files must be outside MagicMirror/modules");
  }
  return resolved;
}
function readCredentials(filename) {
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  const oauth = data.web || data.installed || data;
  if (!oauth.client_id || !oauth.client_secret) throw new Error("OAuth file needs client_id and client_secret");
  return oauth;
}
function writeTokens(filename, tokens) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(tokens, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, filename);
}
function validateConfig(config) {
  for (const key of ["sdmProjectId", "deviceId", "pubsubProjectId", "pubsubSubscription"]) {
    if (typeof config[key] !== "string" || !config[key].trim() || config[key].includes("YOUR_")) throw new Error(`Configure ${key}`);
  }
  if (!config.deviceId.startsWith(`enterprises/${config.sdmProjectId}/devices/`) || !/^enterprises\/[^/]+\/devices\/[^/]+$/.test(config.deviceId)) throw new Error("Invalid device resource name");
  return config;
}
module.exports = { NAME, privateDir, privatePath, readCredentials, writeTokens, validateConfig };
