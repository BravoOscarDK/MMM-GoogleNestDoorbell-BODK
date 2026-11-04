"use strict";
class ChimeFilter {
  constructor(deviceId, maxAgeMs = 60000) { this.deviceId = deviceId; this.maxAgeMs = maxAgeMs; this.seen = new Map(); }
  accept(event, now = Date.now()) {
    for (const [id, time] of this.seen) if (now - time > this.maxAgeMs) this.seen.delete(id);
    const timestamp = Date.parse(event?.timestamp);
    const update = event?.resourceUpdate;
    if (update?.name !== this.deviceId || !update.events?.["sdm.devices.events.DoorbellChime.Chime"] ||
        !Number.isFinite(timestamp) || now - timestamp > this.maxAgeMs || timestamp - now > 30000 ||
        (event.eventThreadState && event.eventThreadState !== "STARTED")) return false;
    const id = event.eventThreadId || event.eventId;
    if (!id || this.seen.has(id)) return false;
    this.seen.set(id, now);
    if (this.seen.size > 1000) this.seen.delete(this.seen.keys().next().value);
    return true;
  }
}
module.exports = { ChimeFilter };
