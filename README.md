# MMM-GoogleNestDoorbell-BODK

MagicMirror² module for showing Google Nest Doorbell (battery) live video when somebody rings. Uses Google's Device Access / SDM API, a Pub/Sub pull subscription and browser WebRTC. No Home Assistant or FFmpeg required.

Targets **MagicMirror² 2.38.0** and Node.js **>=22.22.2 <23 or >=24**. The implementation and mocked tests are provided; real doorbell video, Google account authorization and Raspberry Pi playback still need hardware validation. This is a new integration, not a claim of tested hardware support. Other WebRTC-capable Nest doorbells may work; legacy RTSP-only models are unsupported.

## Installation

In your terminal, go to the MagicMirror modules folder and clone:

```sh
cd ~/MagicMirror/modules
git clone https://github.com/BravoOscarDK/MMM-GoogleNestDoorbell-BODK.git
cd ~/MagicMirror/modules/MMM-GoogleNestDoorbell-BODK
npm install
npm run check
```

The GitHub URL above is the intended repository location. It must be published before others can clone it. Keep the folder, JavaScript filename and configured module name exactly `MMM-GoogleNestDoorbell-BODK`.

## Google setup

1. Create a [Device Access project](https://developers.google.com/nest/device-access/project/create). Google requires registration and currently charges a one-time US$5 fee. Use a supported consumer Google account and a doorbell attached to that account.
2. Follow [Google Cloud setup](https://developers.google.com/nest/device-access/project/gcp): enable the Smart Device Management API, configure OAuth consent and create an OAuth **Web application** client. Link its client ID in the Device Access project. A consent screen left in Testing can produce short-lived refresh tokens; follow Google's production/verification guidance for ongoing use.
3. Add this exact authorized redirect URI to that OAuth client:

   `http://localhost:8765/MMM-GoogleNestDoorbell-BODK/oauth2callback`

4. Download the OAuth client JSON. Store it **outside the MagicMirror installation**, under the OS account that runs MagicMirror:

```sh
mkdir -p ~/.config/MMM-GoogleNestDoorbell-BODK
chmod 700 ~/.config/MMM-GoogleNestDoorbell-BODK
# Copy the downloaded client JSON to this filename:
# ~/.config/MMM-GoogleNestDoorbell-BODK/oauth-client.json
chmod 600 ~/.config/MMM-GoogleNestDoorbell-BODK/oauth-client.json
```

5. Enable events in Device Access. Follow [Subscribe to Events](https://developers.google.com/nest/device-access/subscribe-to-events) to create a Pub/Sub topic in **your own Google Cloud project**, grant Google's publishing service account the required publisher access and link that topic to Device Access. Create a **pull subscription** to that topic. Use a dedicated subscription for this MagicMirror helper; sharing one subscription between installations load-balances messages instead of broadcasting them.
6. Give a consuming service account `roles/pubsub.subscriber` on that subscription. Keep its downloaded key outside MagicMirror, for example `~/.config/MMM-GoogleNestDoorbell-BODK/pubsub-service-account.json`, with mode 600. Configure its absolute path as `serviceAccountPath`, or use Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`). Ensure PM2/systemd receives this environment if used.

Google's [events documentation](https://developers.google.com/nest/device-access/api/events) requires self-hosted Pub/Sub topics for new projects; Google-hosted topics stop delivering events after November 30, 2026.

The **Device Access Project ID** is the UUID from Device Access. It is different from the **Google Cloud Project ID** used by Pub/Sub. The **deviceId** is a complete SDM resource name printed by authorization below.

## Authorize your account

Run from the module directory, replacing the placeholder:

```sh
npm run authorize -- YOUR_DEVICE_ACCESS_PROJECT_ID
```

Open the printed Partner Connections Manager URL in a browser **on that computer**, select the Google account owning your doorbell and grant access to the home and doorbell. The callback listens only on IPv4 loopback port 8765, validates a random state and expires after five minutes. Use a browser that resolves `localhost` to `127.0.0.1` if the callback fails on an IPv6-only localhost connection.

For a headless Pi, start this tunnel **on your desktop** before opening the URL there, while running authorization on the Pi:

```sh
ssh -L 8765:127.0.0.1:8765 pi@YOUR_PI_ADDRESS
```

After consent the CLI saves `~/.config/MMM-GoogleNestDoorbell-BODK/tokens.json` and lists device resource names. It makes the required `devices.list` call to activate events. Tokens refresh automatically; a daily API call keeps authorization active while the module is running. If consent is revoked or tokens expire, run authorization again and restart MagicMirror.

Custom OAuth/token paths can be supplied as positional arguments:

```sh
npm run authorize -- YOUR_DEVICE_ACCESS_PROJECT_ID /absolute/private/oauth-client.json /absolute/private/tokens.json
```

Use the same paths in the configuration. The authorization process never prints tokens or authorization codes.

## Configuration

Add this object to the `modules` array in `~/MagicMirror/config/config.js`. Replace every placeholder. A complete copyable object with further settings is in [config.example.js](config.example.js); copy the exported object, not the `module.exports =` wrapper.

```javascript
{
  module: "MMM-GoogleNestDoorbell-BODK",
  position: "top_left",
  config: {
    language: "en",
    sdmProjectId: "YOUR_DEVICE_ACCESS_PROJECT_ID",
    deviceId: "enterprises/YOUR_DEVICE_ACCESS_PROJECT_ID/devices/YOUR_DEVICE_ID",
    pubsubProjectId: "YOUR_GOOGLE_CLOUD_PROJECT_ID",
    pubsubSubscription: "YOUR_PULL_SUBSCRIPTION_ID",
    serviceAccountPath: "/home/pi/.config/MMM-GoogleNestDoorbell-BODK/pubsub-service-account.json",
    x: 50, y: 100, width: 640, height: 480,
    displayDuration: 30000,
    muted: true
  }
}
```

The helper reads settings directly from MagicMirror's server configuration using `getServerModuleConfig()`. Client secrets and refresh tokens must never be included in `config.js` or sent through module notifications. Only one configured instance/device is supported per MagicMirror server. Up to three connected displays may each negotiate their own stream; Google session limits still apply. All authorized display clients can request a stream.

| Setting | Default | Description |
| --- | --- | --- |
| `sdmProjectId` | Required | Device Access project UUID. |
| `deviceId` | Required | Complete `enterprises/.../devices/...` resource name. |
| `pubsubProjectId` | Required | Google Cloud project ID. |
| `pubsubSubscription` | Required | Pull subscription ID or full subscription resource name. |
| `oauthCredentialsPath` | `~/.config/MMM-GoogleNestDoorbell-BODK/oauth-client.json` | Server-side OAuth client JSON; custom paths must be absolute. |
| `tokenPath` | `~/.config/MMM-GoogleNestDoorbell-BODK/tokens.json` | Writable token JSON created by authorization. |
| `serviceAccountPath` | Unset | Private service-account JSON; unset uses Google's ADC. |
| `x`, `y` | `50`, `100` | Fixed overlay position in pixels from viewport left/top. |
| `width`, `height` | `640`, `480` | Overlay dimensions in pixels. Video retains its aspect ratio. |
| `displayDuration` | `30000` | Milliseconds, clamped to 1000–240000; earlier Google expiry takes precedence. |
| `showOnDoorbellPress` | `true` | Open video on a valid chime. |
| `showLabel`, `label` | `true`, `null` (translated: "Someone is at the door") | Overlay label; rendered as text. |
| `borderRadius`, `opacity` | `8`, `1` | Corner radius in pixels; opacity clamped to 0–1. |
| `muted`, `controls` | `true`, `false` | Muted playback works with browser autoplay. Unmuted audio may require interaction; enable controls if needed. |

Restart MagicMirror after configuring. `position` loads the module in a normal region; `x` and `y` position the fixed overlay. No microphone permission is requested and two-way talk is not implemented.

## Notifications and behavior

From another MagicMirror module:

```javascript
this.sendNotification("MMM-GoogleNestDoorbell-BODK_TEST_DOORBELL");
this.sendNotification("MMM-GoogleNestDoorbell-BODK_STOP");
```

The test notification opens **real live video** after initialization; it does not simulate a Pub/Sub delivery. The module emits `MMM-GoogleNestDoorbell-BODK_DOORBELL` for accepted physical chimes, which another module can use to wake the monitor.

Chimes from other devices, older than 60 seconds, duplicated or belonging to updated/ended event threads are ignored. The deduplication cache is in memory and resets on restart. Repeated presses during an active stream do not restart or extend it. Suspension, browser unload, failed connections and timers close local media; the helper also calls Google's `StopWebRtcStream`. Its independent timer stops orphaned sessions when a browser disappears. Google expiry remains the fallback if a stop request fails. Battery stream extension is intentionally not used.

## Update

```sh
cd ~/MagicMirror/modules/MMM-GoogleNestDoorbell-BODK
git pull --ff-only
npm install
npm run check
```

Restart MagicMirror. Private files outside the repository are retained. Copies installed by copying files should be backed up and replaced with a clone before using Git update commands.

## Verification and troubleshooting

```sh
npm test
npm run check
```

Automated tests mock Google and MagicMirror; no real camera or credentials are used. GitHub Actions checks Node.js 22.22.2 and 24 on Linux and Windows. The installation checker verifies required files, dependencies and Node.js; missing optional private files are reported separately.

Before first live use:

1. Complete authorization and copy the listed resource name into `deviceId`.
2. Start MagicMirror, check for initialization errors and send the test notification. Confirm picture, placement, optional audio and automatic disappearance.
3. Press the physical button. Confirm Pub/Sub delivery and a single stream. Press again while active and confirm it still stops within the configured duration.
4. Suspend/resume the module, interrupt networking and reload the display while connecting; verify recovery and that Google streams stop or expire.

For initialization errors, check private file paths and permissions, project IDs, linked OAuth client, completed consent and WebRTC support of the selected device. Correct the configuration and restart, or resume the module to retry initialization. A Pub/Sub error usually indicates wrong subscription/project, missing Subscriber role, credentials or connectivity. No chimes with working manual video usually indicates topic publisher permissions, Device Access event setup or using the wrong pull subscription.

For a black picture, check browser WebRTC support, firewall/NAT access to Google media endpoints and the Google account's camera permissions. Use the local Electron display or HTTPS for remote browsers. Native camera access is not needed. A sleeping/offline doorbell or depleted battery cannot provide video. Unmuted autoplay can be blocked independently of video signaling.

## Security and project information

Never store private JSON files in this directory: MagicMirror can serve module files over HTTP. `.gitignore` provides an additional guard against accidental commits. Keep MagicMirror's access controls enabled. See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md) and the [MIT license](LICENSE).

References: [MagicMirror² 2.38.0](https://github.com/MagicMirrorOrg/MagicMirror/releases/tag/v2.38.0), [Google authorization](https://developers.google.com/nest/device-access/authorize), [WebRTC stream commands and SDP requirements](https://developers.google.com/nest/device-access/traits/device/camera-live-stream), [DoorbellChime events](https://developers.google.com/nest/device-access/traits/device/doorbell-chime).

## Language

English is the default, independently of the MagicMirror global language. Set `language: "da"` in this module's `config` for Danish, or `language: "en"` for English. Unsupported languages fall back to English. Custom labels and device names retain their configured values. Technical logs and diagnostic errors are in English.
