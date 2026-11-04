# Contributing

Use Node.js >=22.22.2 <23 or >=24, run `npm ci`, `npm test` and `npm run check`. Tests use mocks and need no Google credentials. Describe behavior changes and include a test for stream lifecycle or event-processing changes. Keep the module name MMM-GoogleNestDoorbell-BODK consistent.

When reporting a problem, include MagicMirror, Node.js, OS and doorbell model/version, reproduction steps and sanitized errors. Never include OAuth URLs with codes, private files, SDP or service-account keys. Real camera testing is required for changes to WebRTC negotiation.
