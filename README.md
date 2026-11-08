# room. — a little space to focus

A responsive study-space dashboard for UBC: current occupancy, sound readings, room search, building filters, locally saved favourites, and recent activity. Built with React and Vite, with a Node API and a Tiger Data / TimescaleDB database.

**No UBC websites have been scraped.** Location, total capacity, and source details remain nullable until collected later. A clearly labeled sample preview contains fictional rooms; unavailable live data never falls back to sample data automatically.

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

The frontend runs at `http://localhost:5173` and proxies `/api` to the development API on port `3100`. `npm start` also runs the standalone API on port `3000` by default. Without an API connection, the frontend shows a connection error and still offers the explicit sample preview.

The existing Tiger service has already been initialized for this project. `db:init` is safe to rerun. `db:check` verifies connectivity and table presence.

## Frontend behavior

- Polls room data every 10 seconds, with a 12-second request timeout and a manual retry action.
- Search by room name, building, room number, or address. Filter for available seats, quiet spaces, or saved spaces; sort by name or known available seats.
- Favourites are saved in the visitor's browser. Counts reflect only rooms in the current live/sample view.
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

The database, device tokens, and any eventual metadata collection remain separate from the frontend build. The browser receives only public room metadata and aggregate readings. `.gitignore` and `.vercelignore` exclude local credentials and generated files.

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

## Room metadata, later

`data/rooms.example.json` defines the future metadata contract. Import a local JSON array with:

```sh
npm run rooms:import -- path/to/rooms.json
```

The importer reads the local file and makes **no requests to UBC websites**. Each entry replaces the room's complete metadata; optional fields omitted from that entry become null. Device assignments and sensor history are preserved. The entire import rolls back if any record fails validation.

Fields: `room_id`, `name`, `building`, `room_number`, `address`, `latitude`, `longitude`, `total_capacity`, `source_url`, `source_checked_at`. Coordinates must be supplied together. Source URLs must use HTTPS on `ubc.ca` or a subdomain. Only provide `source_checked_at` after actually checking the source. No scraper is implemented or scheduled.

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
