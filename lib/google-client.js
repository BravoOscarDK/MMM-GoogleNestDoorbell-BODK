"use strict";
const fs = require("node:fs");
const { google } = require("googleapis");
const { privatePath, readCredentials, writeTokens } = require("./settings");
function createClient(config) {
  const credentials = readCredentials(privatePath(config.oauthCredentialsPath, "oauth-client.json"));
  const tokenFile = privatePath(config.tokenPath, "tokens.json");
  const auth = new google.auth.OAuth2(credentials.client_id, credentials.client_secret);
  const tokens = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
  if (!tokens.refresh_token) throw new Error("Run npm run authorize first");
  auth.setCredentials(tokens);
  auth.on("tokens", (updated) => {
    Object.assign(tokens, updated);
    try { writeTokens(tokenFile, tokens); }
    catch { console.error("MMM-GoogleNestDoorbell-BODK: could not persist refreshed tokens"); }
  });
  return google.smartdevicemanagement({ version: "v1", auth });
}
module.exports = { createClient };
