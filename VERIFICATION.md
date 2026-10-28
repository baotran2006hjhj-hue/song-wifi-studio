# Verification record

Validated on the user's Windows machine with Realtek 8852BE and an active FPT University connection.

- Python: 11 tests passed (channel mapping, RSN parsing, malformed beacon handling, localhost API, Host/Origin checks and POST token checks).
- JavaScript: syntax check and 12 checks passed (path-loss behavior, wall attenuation, IDW, CSV formula protection, project import validation and round-trip of a real browser-exported project).
- Live data: Native Wi-Fi API returned real SSIDs, multiple FPT University BSSIDs, RSSI, channels, 2.4/5 GHz bands, WPA2-Enterprise and current link rate.
- Browser: verified FPT filtering, channel suggestions, adding and dragging AP, drawing walls and undo, recording and undoing a real RSSI sample, project JSON download, TCP diagnostics.
- Layout: checked desktop 1440px and narrow 390px; narrow DOM content width equals viewport width (no page-level horizontal overflow).
- Browser console: no JavaScript errors observed.
- Temporary APs, wall and survey point created for testing were undone. The exported test project is retained as tests/browser-project.json.
- Not exhaustively verified: physical multi-location survey accuracy, full HE/EHT beacon decoding, hardware 6 GHz, image-upload/import dialog flow and browser PDF save dialog. Limitations are documented in README.md and in the app.
