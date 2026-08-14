# Scanner utilities

Helpers for wiring up an RFID card reader (e.g. an ESP32 with an RC522/PN532 module) to Flappies so members can log in by tapping their card.

## How RFID login actually works

In production, your scanner should connect **directly** to the API's WebSocket endpoint at `/ws/rfid` (see `api/server.js`), not to anything in this folder. The protocol is intentionally simple:

1. Connect to `ws://<api-host>:3001/ws/rfid`
2. Authenticate once per connection by sending either:
   - a `secret` query param: `ws://<api-host>:3001/ws/rfid?secret=<RFID_WS_SECRET>`, or
   - a JSON message: `{"type":"auth","secret":"<RFID_WS_SECRET>"}`
3. On every card tap, send: `{"type":"card-scan","uid":"<card uid>"}`
4. The server broadcasts one of:
   - `{"type":"card-login","code":"...","expires_in":60}` — a known card; the frontend exchanges `code` for a session
   - `{"type":"card-error","reason":"unknown_card"}` — the UID isn't linked to any user yet (set it in the admin panel)

`RFID_WS_SECRET` is set in the API's environment and must match what the scanner sends.

## `read_ws/`

A tiny standalone WebSocket **server** (not the real API) that just logs whatever an ESP32 sends it. It's useful for bench-testing a scanner's firmware/output format before pointing it at the real API — it does **not** implement the `card-scan` protocol above.

```bash
cd read_ws
npm install
npm start
```

Listens on `ws://0.0.0.0:8080` and prints any `{"uid": "..."}` payloads it receives to the console.
