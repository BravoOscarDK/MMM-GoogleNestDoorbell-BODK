# Security

Keep OAuth client files, refresh tokens and service-account keys outside MagicMirror/modules and out of Git. MagicMirror serves module files over HTTP. The module refuses private file paths inside the modules directory. Run MagicMirror as the same OS user who authorized the account.

Use Google's Pub/Sub Subscriber role for the consuming service account. Keep MagicMirror on a trusted network with its IP whitelist enabled; authorized display clients can request video. Use HTTPS for remote browser clients.

Do not put credentials in issues, screenshots or logs. For a suspected vulnerability, use GitHub private vulnerability reporting if enabled. Otherwise open an issue requesting a private contact without including exploit details or secrets.
