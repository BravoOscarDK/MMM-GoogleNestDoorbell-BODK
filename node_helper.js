"use strict";
const NodeHelper = require("node_helper");
const { PubSub } = require("@google-cloud/pubsub");
const { createClient } = require("./lib/google-client");
const { NAME, privatePath, validateConfig } = require("./lib/settings");
const { ChimeFilter } = require("./lib/events");
module.exports = NodeHelper.create({
  start() {
    this.sessions = new Map(); this.pending = new Map();
    this.stopping = false; this.ready = false; this.initializing = null;
  },
  report(context, error) {
    // Google errors may contain credentials and SDP. Never log the error object.
    const code = Number(error?.response?.status || error?.code);
    console.error(`${NAME}: ${context}${Number.isFinite(code) ? ` (code ${code})` : ""}. Check private files, Google permissions and network.`);
    this.sendSocketNotification("GNEST_ERROR", { message: context });
  },
  async initialize() {
    if (this.ready || this.stopping) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      this.config = validateConfig(this.getServerModuleConfig());
      this.client = createClient(this.config);
      await this.client.enterprises.devices.list({ parent: `enterprises/${this.config.sdmProjectId}` });
      const { data } = await this.client.enterprises.devices.get({ name: this.config.deviceId });
      if (!data.traits?.["sdm.devices.traits.CameraLiveStream"]?.supportedProtocols?.includes("WEB_RTC")) throw new Error("Device does not support WebRTC");
      if (this.stopping) return;
      this.filter = new ChimeFilter(this.config.deviceId);
      const options = { projectId: this.config.pubsubProjectId };
      if (this.config.serviceAccountPath) options.keyFilename = privatePath(this.config.serviceAccountPath);
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) options.keyFilename = privatePath(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      this.pubsub = new PubSub(options);
      this.subscription = this.pubsub.subscription(this.config.pubsubSubscription, { flowControl: { maxMessages: 10 } });
      this.subscription.on("message", (message) => {
        try { if (this.filter.accept(JSON.parse(message.data.toString("utf8")))) this.sendSocketNotification("GNEST_CHIME", {}); }
        catch { /* Acknowledge malformed messages to prevent endless redelivery. */ }
        finally { message.ack(); }
      });
      this.subscription.on("error", (error) => this.report("Pub/Sub subscription failed", error));
      this.ready = true;
      this.keepAlive = setInterval(() => {
        this.client.enterprises.devices.list({ parent: `enterprises/${this.config.sdmProjectId}` })
          .catch((error) => this.report("Google authorization refresh failed", error));
      }, 86400000);
      this.keepAlive.unref();
    })();
    try { await this.initializing; } finally { this.initializing = null; }
  },
  async command(command, params) {
    const { data } = await this.client.enterprises.devices.executeCommand({
      name: this.config.deviceId,
      requestBody: { command: `sdm.devices.commands.CameraLiveStream.${command}`, params }
    });
    return data.results || {};
  },
  async endSession(requestId) {
    const session = this.sessions.get(requestId);
    if (!session) return;
    this.sessions.delete(requestId); clearTimeout(session.timer);
    try { await this.command("StopWebRtcStream", { mediaSessionId: session.mediaSessionId }); }
    catch (error) { this.report("Could not stop Google stream; it will expire automatically", error); }
  },
  async socketNotificationReceived(notification, payload) {
    try {
      if (notification === "GNEST_INIT") {
        await this.initialize();
        if (this.ready) this.sendSocketNotification("GNEST_READY", {});
        return;
      }
      if (!this.ready || this.stopping) return;
      const requestId = payload?.requestId;
      if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(requestId)) return;
      if (notification === "GNEST_STOP") {
        const pending = this.pending.get(requestId);
        if (pending) pending.cancelled = true;
        await this.endSession(requestId);
      }
      if (notification !== "GNEST_OFFER") return;
      if (this.sessions.has(requestId) || this.pending.has(requestId)) return;
      if (this.sessions.size + this.pending.size >= 3) throw new Error("Too many active clients");
      if (typeof payload.offerSdp !== "string" || payload.offerSdp.length > 100000 || !payload.offerSdp.startsWith("v=0")) return;
      const pending = { cancelled: false };
      this.pending.set(requestId, pending);
      try {
        const result = await this.command("GenerateWebRtcStream", { offerSdp: payload.offerSdp });
        if (!result.mediaSessionId) throw new Error("Missing session ID");
        const duration = Math.min(240000, Math.max(1000, Number(this.config.displayDuration) || 30000));
        const expiresIn = Date.parse(result.expiresAt) - Date.now();
        const lifetime = Number.isFinite(expiresIn) ? Math.max(1, Math.min(duration, expiresIn - 1000)) : duration;
        this.sessions.set(requestId, { mediaSessionId: result.mediaSessionId, timer: setTimeout(() => {
          this.sendSocketNotification("GNEST_ENDED", { requestId }); void this.endSession(requestId);
        }, lifetime) });
        if (pending.cancelled || this.stopping || typeof result.answerSdp !== "string") await this.endSession(requestId);
        else this.sendSocketNotification("GNEST_ANSWER", { requestId, answerSdp: result.answerSdp });
      } finally { this.pending.delete(requestId); }
    } catch (error) {
      this.report(notification === "GNEST_INIT" ? "Initialization failed" : "Stream request failed", error);
      if (payload?.requestId) this.sendSocketNotification("GNEST_ENDED", { requestId: payload.requestId });
    }
  },
  async stop() {
    this.stopping = true; clearInterval(this.keepAlive);
    for (const pending of this.pending.values()) pending.cancelled = true;
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.endSession(id)));
    if (this.subscription) await this.subscription.close();
    if (this.pubsub) await this.pubsub.close();
  }
});
