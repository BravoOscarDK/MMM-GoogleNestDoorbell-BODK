"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { privatePath, validateConfig, readCredentials, writeTokens } = require("../lib/settings");
test("refuses secrets anywhere inside the modules directory", () => {
  assert.throws(() => privatePath(path.join(__dirname, "../credentials.json")));
  assert.throws(() => privatePath(path.resolve(__dirname, "../../other-module/key.json")));
  assert.ok(path.isAbsolute(privatePath(null, "tokens.json")));
});
test("validates the device project and required configuration", () => {
  const config = { sdmProjectId: "project", deviceId: "enterprises/project/devices/bell", pubsubProjectId: "cloud", pubsubSubscription: "subscription" };
  assert.equal(validateConfig(config), config);
  assert.throws(() => validateConfig({ ...config, sdmProjectId: "other" }));
  assert.throws(() => validateConfig({ ...config, pubsubProjectId: "YOUR_GOOGLE_CLOUD_PROJECT_ID" }));
});
test("writes private token files atomically and reads Google's OAuth format", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gnest-test-"));
  try {
    const file = path.join(directory, "tokens.json");
    writeTokens(file, { refresh_token: "test" });
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), { refresh_token: "test" });
    assert.equal(fs.existsSync(file + ".tmp"), false);
    if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    fs.writeFileSync(file, JSON.stringify({ web: { client_id: "test-id", client_secret: "test-secret" } }));
    assert.equal(readCredentials(file).client_id, "test-id");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
