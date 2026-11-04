"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
test("all shipped JavaScript parses", () => {
  const root = path.resolve(__dirname, "..");
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", ".tools"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".js")) assert.doesNotThrow(() => new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }));
    }
  };
  walk(root);
});
test("installed Google libraries provide the APIs used by the module", () => {
  const { google } = require("googleapis");
  const api = google.smartdevicemanagement("v1");
  assert.equal(typeof api.enterprises.devices.list, "function");
  assert.equal(typeof api.enterprises.devices.get, "function");
  assert.equal(typeof api.enterprises.devices.executeCommand, "function");
  const { PubSub } = require("@google-cloud/pubsub");
  assert.equal(typeof PubSub.prototype.subscription, "function");
});
