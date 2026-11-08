# Room and device mapping

A room is a website space; a device is one sensor installation assigned to that
space. The database, not a client-supplied device ID, decides who uploaded a
reading. No database credentials go on a sensor.

| Value | Meaning | Where it lives |
|---|---|---|
| `room_id` | Stable identity of the exact listed space | `study_room.rooms`, device config, upload body |
| `device_id` | Stable identity of one installed camera/microphone pair | `study_room.devices`, private device config; API resolves it from the token |
| `DEVICE_TOKEN` | Secret granting uploads for that installation | Private sensor config; only its SHA-256 hash is stored server-side |
| Camera/microphone ID | Local hardware selection, which may change on reconnect | Sensor launch arguments; unrelated to database IDs |
| Noise profile | Versioned mapping for that microphone, fixed gain and placement | Local calibration JSON; archive with installation notes |

## Register an installation

1. Choose the existing `room_id` from `GET /api/rooms` or `data/rooms.json`.
   Use the exact ID, rather than the room name, building code or capacity.
   A grouped directory listing remains one space; do not assign a sensor to an
   entire building when it measures one room. Do not use a `demo-` device ID.
2. On the trusted backend computer, configure `DATABASE_URL` privately and run:

   ```sh
   cd Room-Capacity-App
   npm run db:confidence
   npm run device:add -- --room EXACT_ROOM_ID --device pi-library-01 \
     --api-url https://YOUR-FINAL-API-ORIGIN \
     --output .env.pi-library-01
   ```

   The existing registration script preserves existing room metadata; if the
   ID is new it creates a minimal room. Check the ID carefully to avoid making
   an unintended duplicate room. Device IDs and output filenames must be new.
   The credential file is mode 0600 and contains `API_URL`, `ROOM_ID`, `DEVICE_ID`
   and `DEVICE_TOKEN`. Environment variables override file values on the sensor.
3. Securely copy that credential file to the sensor as `.env.sensor`, and keep
   its permissions private (`chmod 600 .env.sensor`). Never commit, print or
   include it in a screenshot. Keep a secure recovery copy: plaintext tokens
   cannot be recovered from the database hash.
4. Deploy the API version accepting `average_confidence` before starting new
   sensor uploads. Apply the additive migration first; older readings stay null.
   HTTPS must work without an interactive login or redirect. The sensor permits
   HTTP only for loopback development on the same computer.
   Set the backend's `STALE_AFTER_SECONDS` above the sampling interval plus capture,
   inference and upload time (for example 120 for the default 60-second interval).
   The existing 60-second freshness setting can briefly mark a once-per-minute
   sensor stale before its next window finishes; freshness is intentionally
   measured from the recording-start time, not delayed delivery time.
5. In `Room-Capacity-Sensor`, list hardware and start the loop:

   ```sh
   .venv/bin/python interface/main.py --list-devices
   .venv/bin/python interface/main.py --upload --env .env.sensor \
     --camera /dev/v4l/by-id/YOUR-CAMERA --audio-device YOUR-MIC-ID \
     --noise-calibration src/noise.synthetic.json
   ```

   The synthetic profile is a provisional digital-level mapping. Replace it
   with a labelled room calibration for this installation; microphone gain and
   automatic gain control affect its categories. See the sensor's
   `docs/noise-calibration.md`.

## What happens to each reading

The default loop starts a 10-second capture every 60 seconds, analyzes all 20
images, then immediately queues and POSTs one reading to `/api/readings`.
`--interval` changes that schedule. Capture/inference failures never upload a
made-up zero. Raw WAV/images are removed after analysis unless
`--keep-captures` was explicitly selected; only aggregate metadata is uploaded.

The server hashes the bearer token, looks up an active device, and enforces
that the body `room_id` equals the device's assigned room. A different room is
403; an inactive/unknown token is 401. A client cannot choose `device_id` in the
body. The acknowledgement includes the server's resolved device and room IDs;
the sensor checks both before deleting its queued reading.

Each measurement uses an aware UTC timestamp at millisecond precision. The
database primary key is `(device_id, measured_at)`. Identical retries, including
confidence, are idempotent; a changed reading at the same key returns 409 and
does not overwrite history. Keep the sensor clock synchronized.

The local SQLite outbox (`data/outbox/readings.sqlite3`) survives restarts and
contains metadata only. Failed writes remain queued; transient failures have
three bounded attempts. Each completed window flushes up to five queued readings,
newest first. An outage backlog drains without hiding the current reading.
Permanent 401/403/409 errors are logged and retained for investigation; they
are not silently discarded. The loop continues on upload failures;
`--once` returns failure if it could not upload. Preserve the outbox during
upgrades. Monitor free disk space during long outages.

`GET /api/rooms` and `GET /api/readings?room_id=...` return the saved confidence
alongside the count and noise. The frontend polls every 10 seconds, so visibility
follows capture + inference + upload + the next poll. This is periodic reporting,
not a continuous audio/video stream. Measurements delayed beyond the freshness
window remain in history. Multiple devices assigned to the same room are **not
summed**: the dashboard uses the latest reading. Deploy one primary installation
per room until a multi-camera fusion policy is defined.

## Count and confidence semantics

`people_count` is the arithmetic mean over all frames, rounded to the nearest
integer with `.5` rounding up. Zero frames contribute; capacity never clamps the
measurement. The sensor's local JSON retains `mean_count` and per-image counts.

`average_confidence` is a number in [0,1] or null. It is the mean YOLO box score
over all detected person boxes in the window, weighted by detection count across
frames. No detections means null, not perfect confidence in an empty room.
Historical and older-client readings also have null. Zero is a valid score and
must not be mistaken for missing data.

The frontend can read `room.latest_reading.average_confidence` to inform a later
occupancy trust policy. It is **not a calibrated probability that the count is
correct**, and it says nothing about microphone accuracy. A high-scoring poster
can still be a false positive. This change exposes the score; it leaves the
existing community outlier filtering and fixed sensor/report weights unchanged.
Any future weighting policy should use field-labelled counts, freshness and
report agreement, and handle null explicitly.

## Moves, replacement and lost tokens

Treat a room move as a new installation. Stop the old process, retire its device
(`active = false` through a trusted database administration session), preserve
its history/outbox for audit, and register a new device ID and token for the new
room. Use a new or empty outbox for the new installation; the uploader scopes
queued rows to device and room, so old measurements are never relabelled.

For a replacement in the same room, retire the old device and issue a new ID and
token. For a lost token, disable its device immediately and provision a new one.
Do not update historical readings or reuse a retired device ID to bypass this
workflow. Existing device assignments are not changed by room metadata imports.

## Verification

```sh
npm run db:check
npm run test:integration
npm run test:sensor
```

`test:sensor` is a workspace-only cross-repository check; it needs the adjacent
sensor checkout, its `.venv`, generated image fixture and generated WAV fixtures
(`.venv/bin/python testing/generate_noise.py`). It runs actual inference and
uploads all three noise bands through HTTP into the configured database, checks
integer counts, confidence, latest/history and frontend categories, then rolls
back every temporary room, device and reading. It is excluded from public CI
and never captures live camera/audio.
