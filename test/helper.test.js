"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function helper() {
  const sent = [], calls = [];
  const sandbox = {
    module: { exports: {} }, console: { error() {} }, setTimeout, clearTimeout, setInterval, clearInterval,
    require(name) {
      if (name === "node_helper") return { create: (value) => value };
      if (name === "@google-cloud/pubsub") return {};
      if (name === "./lib/google-client") return {};
      return require(path.join("..", name));
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../node_helper.js"), "utf8"), sandbox);
  const instance = sandbox.module.exports;
  instance.sendSocketNotification = (name, payload) => sent.push({ name, payload });
  instance.start(); instance.ready = true; instance.config = { displayDuration: 30000 };
  instance.command = async (command, params) => {
    calls.push({ command, params });
    return { mediaSessionId: "session", answerSdp: "answer", expiresAt: new Date(Date.now() + 300000).toISOString() };
  };
  return { instance, sent, calls };
}
test("negotiates, correlates answer and stops session exactly once", async () => {
  const { instance, sent, calls } = helper();
  await instance.socketNotificationReceived("GNEST_OFFER", { requestId: "display_1", offerSdp: "v=0\r\n" });
  assert.equal(sent[0].name, "GNEST_ANSWER"); assert.equal(sent[0].payload.requestId, "display_1");
  await instance.socketNotificationReceived("GNEST_STOP", { requestId: "display_1" });
  await instance.socketNotificationReceived("GNEST_STOP", { requestId: "display_1" });
  assert.deepEqual(calls.map((call) => call.command), ["GenerateWebRtcStream", "StopWebRtcStream"]);
  assert.equal(instance.sessions.size, 0);
});
test("cancelling an in-flight offer stops the late Google session without sending its answer", async () => {
  const { instance, sent } = helper();
  let resolve;
  const stopped = [];
  instance.command = (command, params) => {
    if (command === "GenerateWebRtcStream") return new Promise((done) => { resolve = done; });
    stopped.push(params.mediaSessionId); return Promise.resolve({});
  };
  const pending = instance.socketNotificationReceived("GNEST_OFFER", { requestId: "race", offerSdp: "v=0\r\n" });
  await instance.socketNotificationReceived("GNEST_STOP", { requestId: "race" });
  resolve({ mediaSessionId: "late-session", answerSdp: "answer" }); await pending;
  assert.deepEqual(stopped, ["late-session"]); assert.equal(sent.length, 0);
  assert.equal(instance.pending.size, 0); assert.equal(instance.sessions.size, 0);
});
test("server timer stops an orphaned session at Google expiry", async () => {
  const { instance, sent } = helper();
  const stopped = [];
  instance.command = async (command, params) => {
    if (command === "GenerateWebRtcStream") return { mediaSessionId: "short", answerSdp: "answer", expiresAt: new Date(Date.now() + 1010).toISOString() };
    stopped.push(params.mediaSessionId); return {};
  };
  await instance.socketNotificationReceived("GNEST_OFFER", { requestId: "short", offerSdp: "v=0\r\n" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(stopped, ["short"]); assert.equal(instance.sessions.size, 0);
  assert.ok(sent.some((message) => message.name === "GNEST_ENDED"));
});
test("rejects malformed offers and limits concurrent sessions", async () => {
  const { instance, calls } = helper();
  await instance.socketNotificationReceived("GNEST_OFFER", { requestId: "bad", offerSdp: "invalid" });
  assert.equal(calls.length, 0);
  for (const requestId of ["a", "b", "c", "d"]) await instance.socketNotificationReceived("GNEST_OFFER", { requestId, offerSdp: "v=0\r\n" });
  assert.equal(instance.sessions.size, 3);
  await instance.stop(); assert.equal(instance.sessions.size, 0);
});
test("Google failures clear pending state and notify display", async () => {
  const { instance, sent } = helper();
  instance.command = async () => { throw new Error("private-token-must-not-be-logged"); };
  await instance.socketNotificationReceived("GNEST_OFFER", { requestId: "failed", offerSdp: "v=0\r\n" });
  assert.equal(instance.pending.size, 0); assert.equal(instance.sessions.size, 0);
  assert.ok(sent.some((message) => message.name === "GNEST_ENDED"));
  assert.ok(!JSON.stringify(sent).includes("private-token"));
});
