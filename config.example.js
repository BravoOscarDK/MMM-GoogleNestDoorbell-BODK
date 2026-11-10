// Add this object to the modules array in ~/MagicMirror/config/config.js.
// Keep client secrets and tokens outside MagicMirror/modules.
module.exports = {
  module: "MMM-GoogleNestDoorbell-BODK",
  position: "top_left",
  config: {
    sdmProjectId: "YOUR_DEVICE_ACCESS_PROJECT_ID",
    deviceId: "enterprises/YOUR_DEVICE_ACCESS_PROJECT_ID/devices/YOUR_DEVICE_ID",
    pubsubProjectId: "YOUR_GOOGLE_CLOUD_PROJECT_ID",
    pubsubSubscription: "YOUR_PULL_SUBSCRIPTION_ID",
    // Optional absolute paths outside MagicMirror/modules:
    // oauthCredentialsPath: "/home/pi/.config/MMM-GoogleNestDoorbell-BODK/oauth-client.json",
    // tokenPath: "/home/pi/.config/MMM-GoogleNestDoorbell-BODK/tokens.json",
    // serviceAccountPath: "/home/pi/.config/MMM-GoogleNestDoorbell-BODK/pubsub-service-account.json",
    x: 50, y: 100, width: 640, height: 480,
    displayDuration: 30000,
    showOnDoorbellPress: true, showLabel: true, language: "en",
    borderRadius: 8, opacity: 1, muted: true, controls: false
  }
};
