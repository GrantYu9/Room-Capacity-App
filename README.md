# SensoryAtlas — a little space to focus

A responsive study-space dashboard for UBC: current occupancy, sound readings, room search, building filters, locally saved favourites, and recent activity. Built with React and Vite, with a Node API and a Tiger Data / TimescaleDB database.

**Room metadata is collected separately from the app runtime.** `data/rooms.json` contains 68 informal learning spaces from UBC’s directory, checked on November 7, 2026 (Vancouver time). This is a directory snapshot, not a claim that these spaces have sensors or current readings. A clearly labeled demo mode contains fictional rooms; unavailable live data never falls back to sample data automatically.

## Development

Use Node.js 22 (the Vercel and CI target). Python 3 is used by the Pi upload helper and its tests.

```sh
npm ci
cp .env.example .env.local
# Set DATABASE_URL privately in .env.local.
npm run db:init
npm run dev:api
```

In another terminal:

```sh
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies `/api` to the development API on port `3100`. `npm start` also runs the standalone API on port `3000` by default. Without an API connection, the frontend shows a connection error and keeps the public directory browsable and offers explicit demo mode (`?demo=1`).

The existing Tiger service has already been initialized for this project. `db:init` is safe to rerun. `db:check` verifies connectivity and table presence.

## Frontend behavior

- Polls room data every 10 seconds, with a 12-second request timeout and a manual retry action.
- Search by room name, building, room number, address, or a familiar alias (for example, Sauder finds ANGU). Search ignores accents and punctuation, matches words in any order, and tolerates small spelling errors. `data/building-aliases.json` holds editable building aliases for the unified directory. Room numbers stay exact. All listed spaces share one search and filter set. Recent readings appear first by default. Filter for available seats, quiet spaces, or saved spaces; sort by name or known available seats.
- Favourites are saved in the visitor's browser. Live and demo favourites are stored separately. Existing live favourites are preserved.
- Missing capacity is **unknown**, never zero. Available seats are calculated only from fresh readings and known capacity. Counts over capacity are preserved.
- Delayed readings are excluded from current availability and people totals. The API's `stale_after_seconds` controls freshness.
- Noise retains its original unit. Relative readings are 0–1; calibrated dBA readings are 0–160. UI noise bands are approximate and are not a calibration or standards claim.
- Room detail dialogs display up to the most recent 100 readings; charts do not claim a complete 24-hour history.
- Sample rooms and readings are fictional, visibly labeled, and never written to the database.

## Deploy to Vercel

The same repository hosts the website and API. `vercel.json` configures Vite's `dist/` output and the Node functions in `api/`.

1. Import this GitHub repository into Vercel.
2. Add `DATABASE_URL` as a **server-side** environment variable. Use the Tiger service URL; do not prefix it with `VITE_`.
3. Set `CORS_ORIGINS` to the exact frontend origin (for example `https://your-project.vercel.app`), comma-separated if more than one origin is needed. Add your custom domain after connecting it.
4. Deploy, check `/api/health`, and set the Pi's `API_URL` to that deployment's final origin.

Preview deployments need their own environment variables and may have Vercel deployment protection enabled. A physical Pi must be able to access the chosen API URL without an interactive Vercel login.

The database, device tokens, and room metadata collection remain separate from the frontend build. The browser receives only public room metadata and aggregate readings. `.gitignore` and `.vercelignore` exclude local credentials and generated files.

For this shared Tiger service, `sslmode=require` follows `psql` semantics: TLS encryption without certificate identity verification. The Node configuration enables libpq compatibility only for that explicit setting. Explicit `sslmode=verify-full` remains unchanged and requires a trusted server certificate/CA.

Custom domains registered with GoDaddy can be attached in Vercel's project domain settings. Use the DNS records supplied by Vercel for that project; the domain registration can stay at GoDaddy.

## Pi uploads

Register a device from a trusted backend environment:

```sh
npm run device:add -- --room room-1 --device pi-1 --name "Room 1"
```

This creates the room if needed, binds the device to it, and saves its token in a private, ignored `.env.pi` file. Only a SHA-256 token hash is stored in the database. Existing device IDs and output files are preserved. Choose a new device ID and `--output .env.pi-2` to register another Pi. If `pi-1` already exists, use its existing credentials rather than registering it again.

Copy `.env.pi` and `examples/send_reading.py` to the Pi. Set `API_URL` to the deployed origin or your development computer's LAN address. Never put `DATABASE_URL` on the Pi or in frontend code.

```sh
python3 examples/send_reading.py --people 4 --noise 0.35 --noise-unit relative
```

Call the helper's `send_reading(...)` from the CV/audio loop every 10 seconds. It sends only counts and noise levels, retries transient failures with the original measurement timestamp, and refuses redirects to prevent forwarding a device token to another endpoint. It does not persist an offline queue. Keep the Pi's clock synchronized; measurements over 60 seconds into the future are rejected.

## API reference

### `POST /api/readings`

Requires `Content-Type: application/json` and `Authorization: Bearer <DEVICE_TOKEN>`:

```json
{
  "room_id": "room-1",
  "people_count": 4,
  "noise_level": 0.35,
  "noise_unit": "relative",
  "measured_at": "2026-11-07T23:30:00.000Z"
}
```

The device can upload only to its assigned room. Use ISO timestamps with a timezone and up to millisecond precision. Identical retries for the same device/timestamp return 200; changed values for an existing timestamp return 409. Uploads cannot change room capacity or location. Disable a lost token by setting `study_room.devices.active` to `false` through your database administration connection.

### Public reads

- `GET /api/rooms`: room metadata, latest reading, `stale`, and `occupancy_fraction`, plus `stale_after_seconds` for the UI.
- `GET /api/rooms?room_id=room-1`: a single room (404 when missing).
- `GET /api/readings?room_id=room-1`: latest 1,000 measurements from the last 24 hours, in chronological order within the page.
- Add `since=<ISO timestamp>` or `limit=1..1000`. Responses include `has_more` and `next_cursor`; request older pages with `cursor=<next_cursor>`. Cursors preserve the window and handle simultaneous measurements from different devices.
- `GET /api/health`: database connectivity.

Unknown room fields are `null`. `occupancy_fraction` is also null when capacity is unknown or readings are stale. Latest readings use measurement time, so delayed uploads do not replace newer measurements.

## Room metadata

The source is [UBC’s Find an Informal Learning Space directory](https://learningspaces.ubc.ca/find-a-space-informal/?classroom=&building=&filters=%257B%257D). `data/rooms.json` contains all **68 entries returned by the unfiltered Vancouver informal directory** at collection time. Each linked room detail page and all 38 linked building pages were checked. This does not cover every study space on campus, imply access at all hours, or provide occupancy readings.

`data/rooms.collection.json` records coverage, pagination, source checks, identity decisions, and flagged entries. Collection used the directory’s public WordPress AJAX request (`POST /wp-admin/admin-ajax.php`, action `find_a_space_rooms`, campus `vancouver`, formal `false`, sort `alpha_asc`, no filters). Its script supplies a page nonce. Following each returned `offset` produced seven pages of 10, 10, 10, 10, 10, 10, and 8 records; the last response had no next offset. Every entry was verified against its **Room Link**, and addresses came from the **Address** section of its linked building page. The build bundles the checked-in JSON; there is no collection request in the app, API, build, or importer, and no scheduled collection job.

Validate the checked-in dataset locally without a database or network request:

```sh
node --test test/room-metadata.test.js
```

The check uses the same `validateMetadata` rules as the importer, checks duplicate identities and collection coverage, and verifies that metadata without readings yields “Awaiting a reading.” To load the records into a **confirmed local development database**, configure `DATABASE_URL` privately, initialize that database if needed, then run:

```sh
npm run rooms:import -- data/rooms.json
```

After importing, run `npm run dev:api` and check `http://localhost:3100/api/rooms`; run `npm run dev` to view the dashboard. Rooms without readings show **Awaiting a reading**, with unknown current occupancy and available seats. The frontend also bundles this JSON for **Unmonitored study spaces** under Browse study spaces. That searchable directory remains available when the API is offline and labels capacity as published metadata; occupancy, sound, and available seats stay unknown. No database import is needed to browse it. It does not change the API’s room list. Photos published with 67 of the 68 listings are saved in `public/images/study-spaces/`, with source links in `data/room-images.json`. Cards link back to UBC and lazy-load local images rather than using expiring Airtable image URLs. The MacLeod listing has no published photo and shows a labelled placeholder. A directory space with an API reading moves into the monitored list, matched by room ID or source URL; a listing without readings stays in the directory. No database was configured during this collection, so an actual database import and `GET /api/rooms` verification were not performed.

The importer reads the local file and makes **no requests to UBC websites**. Each entry replaces the room’s complete metadata; optional fields omitted from that entry become null. Before a future refresh/import, reconcile existing metadata: preserve the room ID for a clear source/location match, retain known fields when UBC provides no replacement, and flag ambiguous matches rather than guessing. Device assignments and sensor history are preserved. The entire import rolls back if any record fails validation. This collection created a new `data/rooms.json`; the unidentified `room-1` prototype in `data/rooms.example.json` was left unchanged and was not mapped to a UBC space.

Fields: `room_id`, `name`, `building`, `room_number`, `address`, `latitude`, `longitude`, `total_capacity`, `source_url`, `source_checked_at`. IDs use `ubc-` plus the detail URL slug; the audit also retains UBC’s directory record ID for future rename reconciliation. The published Room Number field sometimes contains a floor or named area; those labels are retained as published. Grouped entries remain one space and are not split into invented rooms. Coordinates are null. Source URLs use the matching **Copy permalink** / directory **Room Link**; the pages’ HTML canonical tags incorrectly reference an unrelated legacy news page. Check times are UTC, falling on November 8, 2026 UTC / November 7 in Vancouver.

Review these capacity decisions before importing:

- **HENN – Foyer:** capacity field says 42, but the overview says 34 seats. `total_capacity` is null pending clarification.
- **EDC – Various Informal Learning Spaces:** published capacity is 140; the overview describes more than 140 seats. Keep 140 as the published estimate for the grouped space.
- **PCW – Rooms 2108, 2109, 2111:** keep the single directory entry and its published capacity of 12; do not assume 12 seats per room.
- **BUCH – A Block Alcove Lounge:** keep published capacity 16; the overview’s 8 lounge seats exclude additional benches.
- **ORCH – Study Lounge:** keep published capacity 40; the overview separately describes 12 seats outside the lounge.

Unknown values stay null. No sensor readings, devices, API changes, or schema changes are part of this metadata collection.

## Tests

```sh
npm test                    # API validation and frontend domain logic
npm run test:pi             # Python retry/redirect behavior
npm run build              # Production frontend bundle
npx playwright install chromium
npm run test:browser        # Desktop + mobile browser interactions
```

Browser tests mock API responses and do not need real database credentials. They exercise search, filters, saved state, sample/live separation, detail dialogs, stale/error states, timeouts and responsive layout. They use system Chromium if available; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override it, or install Playwright's bundled browser.

For an initialized test service, `npm run test:integration` exercises real HTTP uploads (including the Python helper) and SQL in a transaction that is always rolled back. It leaves no test room, device, or sensor reading behind. It is intentionally excluded from public CI because it needs private database credentials.

CI runs the non-secret tests and production build on pushes and pull requests. Fonts are self-hosted from Fontsource packages; their OFL licenses are included under `LICENSES/`.
