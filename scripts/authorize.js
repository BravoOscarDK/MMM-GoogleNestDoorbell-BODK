"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const { google } = require("googleapis");
const { NAME, privatePath, readCredentials, writeTokens } = require("../lib/settings");

async function main() {
  const project = process.argv[2];
  if (!project || !/^[a-zA-Z0-9-]+$/.test(project)) throw new Error("Usage: npm run authorize -- DEVICE_ACCESS_PROJECT_ID [OAUTH_FILE] [TOKEN_FILE]");
  const credentials = readCredentials(privatePath(process.argv[3], "oauth-client.json"));
  const tokenFile = privatePath(process.argv[4], "tokens.json");
  const redirectUri = `http://localhost:8765/${NAME}/oauth2callback`;
  const auth = new google.auth.OAuth2(credentials.client_id, credentials.client_secret, redirectUri);
  const state = crypto.randomBytes(32).toString("hex");
  let processing = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    const url = new URL(req.url, "http://localhost:8765");
    if (url.pathname !== `/${NAME}/oauth2callback`) { res.writeHead(404); res.end("Not found"); return; }
    if (url.searchParams.get("state") !== state || processing) { res.writeHead(400); res.end("Invalid or already used OAuth state"); return; }
    processing = true;
    try {
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.has("error")) throw new Error("Authorization declined");
      const { tokens } = await auth.getToken(code);
      if (!tokens.refresh_token) throw new Error("Refresh token missing; repeat consent");
      auth.setCredentials(tokens);
      // Completes Device Access authorization and enables event delivery.
      const api = google.smartdevicemanagement({ version: "v1", auth });
      const { data } = await api.enterprises.devices.list({ parent: `enterprises/${project}` });
      writeTokens(tokenFile, tokens);
      console.log("Authorization saved. Available devices:");
      for (const device of data.devices || []) console.log(`${device.name} (${device.type})`);
      res.end("Authorization complete. Return to the terminal and configure your deviceId.");
    } catch {
      process.exitCode = 1;
      res.writeHead(400); res.end("Authorization failed. Check project, redirect URI and permissions, then retry.");
      console.error("Authorization failed. No tokens or Google error details are logged.");
    } finally { clearTimeout(timeout); server.close(); }
  });
  const timeout = setTimeout(() => { console.error("Authorization timed out"); process.exitCode = 1; server.close(); }, 300000);
  server.on("error", () => { clearTimeout(timeout); console.error("Cannot listen on localhost:8765"); process.exitCode = 1; });
  server.listen(8765, "127.0.0.1", () => {
    const url = new URL(`https://nestservices.google.com/partnerconnections/${project}/auth`);
    url.search = new URLSearchParams({ redirect_uri: redirectUri, access_type: "offline", prompt: "consent",
      client_id: credentials.client_id, response_type: "code", scope: "https://www.googleapis.com/auth/sdm.service", state }).toString();
    console.log("Open this URL on this computer (or use the SSH tunnel described in README.md):\n" + url.href);
  });
}
main().catch((error) => { console.error(error.message.startsWith("Usage:") ? error.message : "Check the private OAuth file and its location; authorization could not start."); process.exitCode = 1; });
