/* global Module, RTCPeerConnection, RTCRtpReceiver, MediaStream, Log */
Module.register("MMM-GoogleNestDoorbell-BODK", {
  requiresVersion: "2.38.0",
  text(key) {
    const texts = {
      "en": {
        "Someone is at the door": "Someone is at the door"
      },
      "da": {
        "Someone is at the door": "Nogen ringer på"
      }
    };
    const language = String(this.config.language || "en").toLowerCase().split(/[-_]/)[0];
    return (Object.hasOwn(texts, language) ? texts[language] : texts.en)[key] || texts.en[key] || key;
  },
  defaults: {
    language: "en",
    x: 50, y: 100, width: 640, height: 480, displayDuration: 30000,
    showOnDoorbellPress: true, showLabel: true, label: null,
    borderRadius: 8, opacity: 1, muted: true, controls: false
  },
  start() {
    this.ready = false; this.suspended = false; this.sequence = 0;
    window.addEventListener("beforeunload", () => this.stopStream());
  },
  getStyles() { return ["MMM-GoogleNestDoorbell-BODK.css"]; },
  getDom() {
    if (this.root) return this.root;
    const root = document.createElement("div");
    root.className = "MMM-GoogleNestDoorbell-BODK-overlay";
    const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    Object.assign(root.style, {
      left: `${number(this.config.x, 50)}px`, top: `${number(this.config.y, 100)}px`,
      width: `${Math.max(1, number(this.config.width, 640))}px`, height: `${Math.max(1, number(this.config.height, 480))}px`,
      borderRadius: `${Math.max(0, number(this.config.borderRadius, 8))}px`,
      opacity: Math.max(0, Math.min(1, number(this.config.opacity, 1)))
    });
    this.video = document.createElement("video");
    this.video.autoplay = true; this.video.playsInline = true;
    this.video.muted = this.config.muted; this.video.controls = this.config.controls;
    if (this.config.controls) root.style.pointerEvents = "auto";
    root.appendChild(this.video);
    if (this.config.showLabel) {
      const label = document.createElement("span");
      label.className = "MMM-GoogleNestDoorbell-BODK-label";
      label.textContent = this.config.label ?? this.text("Someone is at the door"); root.appendChild(label);
    }
    this.root = root;
    return root;
  },
  notificationReceived(notification) {
    if (notification === "DOM_OBJECTS_CREATED") this.sendSocketNotification("GNEST_INIT", {});
    if (notification === "MMM-GoogleNestDoorbell-BODK_TEST_DOORBELL") void this.openStream();
    if (notification === "MMM-GoogleNestDoorbell-BODK_STOP") this.stopStream();
  },
  socketNotificationReceived(notification, payload) {
    if (notification === "GNEST_READY") this.ready = true;
    if (notification === "GNEST_CHIME") {
      this.sendNotification("MMM-GoogleNestDoorbell-BODK_DOORBELL", {});
      if (this.config.showOnDoorbellPress) void this.openStream();
    }
    if (notification === "GNEST_ERROR") Log.error(`MMM-GoogleNestDoorbell-BODK: ${payload.message}`);
    if (!this.requestId || payload?.requestId !== this.requestId) return;
    if (notification === "GNEST_ENDED") this.stopStream();
    if (notification === "GNEST_ANSWER") {
      const peer = this.peer;
      peer.setRemoteDescription({ type: "answer", sdp: payload.answerSdp }).catch(() => {
        if (this.peer === peer) this.stopStream();
      });
    }
  },
  async openStream() {
    if (!this.ready || this.suspended || this.peer) return;
    this.getDom();
    const requestId = `${this.identifier.replace(/[^a-zA-Z0-9_-]/g, "_")}_${crypto.randomUUID()}_${++this.sequence}`;
    this.requestId = requestId;
    let peer;
    try {
      peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      this.peer = peer; this.media = new MediaStream(); this.video.srcObject = this.media;
      this.root.classList.add("active");
      this.timer = setTimeout(() => this.stopStream(), Math.min(240000, Math.max(1000, Number(this.config.displayDuration) || 30000)));
      const audio = peer.addTransceiver("audio", { direction: "recvonly" });
      const opus = RTCRtpReceiver.getCapabilities("audio").codecs.filter((codec) => codec.mimeType.toLowerCase() === "audio/opus");
      if (opus.length) audio.setCodecPreferences(opus);
      peer.addTransceiver("video", { direction: "recvonly" }); peer.createDataChannel("data");
      peer.ontrack = (event) => {
        if (this.peer !== peer) return;
        this.media.addTrack(event.track);
        this.video.play().catch(() => Log.warn("MMM-GoogleNestDoorbell-BODK: autoplay blocked; use muted: true or video controls."));
      };
      peer.onconnectionstatechange = () => {
        if (this.peer === peer && ["failed", "closed"].includes(peer.connectionState)) this.stopStream();
      };
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise((resolve, reject) => {
        if (peer.iceGatheringState === "complete") return resolve();
        const timeout = setTimeout(() => finish(new Error("ICE gathering timed out")), 12000);
        const changed = () => { if (peer.iceGatheringState === "complete") finish(); };
        const finish = (error) => {
          clearTimeout(timeout); peer.removeEventListener("icegatheringstatechange", changed);
          if (error) reject(error); else resolve();
        };
        peer.addEventListener("icegatheringstatechange", changed);
      });
      if (this.peer !== peer) return;
      this.sendSocketNotification("GNEST_OFFER", { requestId, offerSdp: peer.localDescription.sdp.trimEnd() + "\r\n" });
    } catch {
      if (this.requestId === requestId) {
        Log.error("MMM-GoogleNestDoorbell-BODK: could not establish WebRTC stream"); this.stopStream();
      }
    }
  },
  stopStream() {
    clearTimeout(this.timer);
    if (this.requestId) this.sendSocketNotification("GNEST_STOP", { requestId: this.requestId });
    this.requestId = null;
    const peer = this.peer; this.peer = null;
    if (peer) { peer.ontrack = null; peer.onconnectionstatechange = null; peer.close(); }
    if (this.media) this.media.getTracks().forEach((track) => track.stop());
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    if (this.root) this.root.classList.remove("active");
  },
  suspend() { this.suspended = true; this.stopStream(); },
  resume() { this.suspended = false; this.sendSocketNotification("GNEST_INIT", {}); }
});
