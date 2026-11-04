"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ChimeFilter } = require("../lib/events");
const deviceId = "enterprises/project/devices/bell";
const now = Date.now();
const event = (extra = {}) => ({ eventId: "one", timestamp: new Date(now).toISOString(),
  resourceUpdate: { name: deviceId, events: { "sdm.devices.events.DoorbellChime.Chime": {} } }, ...extra });
test("accepts matching fresh chime once", () => {
  const filter = new ChimeFilter(deviceId);
  assert.equal(filter.accept(event(), now), true);
  assert.equal(filter.accept(event(), now), false);
});
test("rejects stale, future, wrong-device, unrelated and malformed events", () => {
  for (const change of [
    { timestamp: new Date(now - 61000).toISOString() }, { timestamp: new Date(now + 31000).toISOString() },
    { timestamp: "invalid" }, { resourceUpdate: { name: "other", events: {} } },
    { resourceUpdate: { name: deviceId, events: {} } }, { eventId: null }, { eventThreadState: "UPDATED" }
  ]) assert.equal(new ChimeFilter(deviceId).accept(event(change), now), false);
  assert.equal(new ChimeFilter(deviceId).accept(null, now), false);
});
test("deduplicates thread IDs even when the event ID changes", () => {
  const filter = new ChimeFilter(deviceId);
  assert.equal(filter.accept(event({ eventThreadId: "thread", eventThreadState: "STARTED" }), now), true);
  assert.equal(filter.accept(event({ eventThreadId: "thread", eventId: "two" }), now), false);
});
