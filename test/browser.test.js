"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
function browser() {
  let definition, peer;
  const sent = [], notifications = [], order = [];
  class FakePeer {
    constructor() { peer = this; this.iceGatheringState = "complete"; }
    addTransceiver(kind, options) {
      order.push([kind, options.direction]); return { setCodecPreferences(codecs) { order.push(codecs[0].mimeType); } };
    }
    createDataChannel() { order.push("application"); }
    async createOffer() { return { type: "offer", sdp: "v=0\r\n" }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription(answer) { this.answer = answer; }
    close() { this.closed = true; }
  }
  const element = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, pause() {}, play: async () => {} });
  const sandbox = {
    Module: { register(name, value) { assert.equal(name, "MMM-GoogleNestDoorbell-BODK"); definition = value; } },
    window: { addEventListener() {} }, document: { createElement: element },
    RTCPeerConnection: FakePeer,
    RTCRtpReceiver: { getCapabilities: () => ({ codecs: [{ mimeType: "audio/opus" }, { mimeType: "audio/PCMU" }] }) },
    MediaStream: class { constructor() { this.tracks = []; } addTrack(track) { this.tracks.push(track); } getTracks() { return this.tracks; } },
    Log: { error() {}, warn() {} }, crypto, setTimeout, clearTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../MMM-GoogleNestDoorbell-BODK.js"), "utf8"), sandbox);
  definition.config = { ...definition.defaults }; definition.identifier = "module_1";
  definition.sendSocketNotification = (name, payload) => sent.push({ name, payload });
  definition.sendNotification = (name) => notifications.push(name);
  definition.start(); definition.ready = true;
  return { module: definition, sent, notifications, order, get peer() { return peer; } };
}
test("browser builds Google's required media order and correlates answers", async () => {
  const b = browser();
  await b.module.openStream();
  try {
    assert.equal(JSON.stringify(b.order), JSON.stringify([["audio", "recvonly"], "audio/opus", ["video", "recvonly"], "application"]));
    const offer = b.sent.find((message) => message.name === "GNEST_OFFER");
    assert.ok(offer.payload.offerSdp.endsWith("\r\n"));
    b.module.socketNotificationReceived("GNEST_ANSWER", { requestId: "another-display", answerSdp: "wrong" });
    assert.equal(b.peer.answer, undefined);
    b.module.socketNotificationReceived("GNEST_ANSWER", { requestId: offer.payload.requestId, answerSdp: "correct" });
    assert.equal(b.peer.answer.sdp, "correct");
    await b.module.openStream();
    assert.equal(b.sent.filter((message) => message.name === "GNEST_OFFER").length, 1);
  } finally { b.module.stopStream(); }
  assert.equal(b.peer.closed, true); assert.equal(b.module.video.srcObject, null);
});
test("suspension stops media and blocks new streams until resume", async () => {
  const b = browser(); await b.module.openStream();
  let stopped = false;
  b.module.media.addTrack({ stop() { stopped = true; } });
  b.module.suspend(); await b.module.openStream();
  assert.equal(stopped, true); assert.equal(b.module.peer, null);
  assert.equal(b.sent.filter((message) => message.name === "GNEST_OFFER").length, 1);
  b.module.resume(); assert.equal(b.sent.at(-1).name, "GNEST_INIT");
});
test("physical chimes notify other modules even with automatic video disabled", () => {
  const b = browser(); b.module.config.showOnDoorbellPress = false;
  b.module.socketNotificationReceived("GNEST_CHIME", {});
  assert.deepEqual(b.notifications, ["MMM-GoogleNestDoorbell-BODK_DOORBELL"]);
  assert.equal(b.sent.length, 0);
});
