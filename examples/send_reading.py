#!/usr/bin/env python3
"""Send one sensor reading. Python standard library only; no database credentials."""
import argparse
import datetime
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class NoUploadRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # A redirect must never forward a device token to another endpoint.
        return None


def send_reading(api_url, token, room_id, people_count, noise_level, noise_unit,
                 measured_at=None):
    """Reuse measured_at when retrying a previously buffered measurement."""
    parsed = urllib.parse.urlsplit(api_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("API_URL must be an HTTP(S) URL without credentials")
    if measured_at is None:
        measured_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds")
    payload = json.dumps({
        "room_id": room_id, "people_count": people_count,
        "noise_level": noise_level, "noise_unit": noise_unit,
        "measured_at": measured_at,
    }).encode()
    request = urllib.request.Request(
        api_url.rstrip("/") + "/api/readings", data=payload, method="POST",
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
    )
    opener = urllib.request.build_opener(NoUploadRedirects())
    for attempt in range(3):
        try:
            with opener.open(request, timeout=10) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            if 300 <= status < 400:
                raise RuntimeError("Upload endpoint redirected; set API_URL to the final API origin") from None
            if status < 500 or attempt == 2:
                raise RuntimeError(f"Upload rejected (HTTP {status})") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 2:
                raise RuntimeError("Upload failed: API unreachable") from None
        time.sleep(2 ** attempt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", default=".env.pi")
    parser.add_argument("--people", type=int, required=True)
    parser.add_argument("--noise", type=float, required=True)
    parser.add_argument("--noise-unit", choices=["relative", "dBA"], required=True)
    args = parser.parse_args()
    config = {}
    if Path(args.env).exists():
        for line in Path(args.env).read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip()
    config.update({key: os.environ[key] for key in ("API_URL", "DEVICE_TOKEN", "ROOM_ID") if key in os.environ})
    try:
        result = send_reading(config["API_URL"], config["DEVICE_TOKEN"], config["ROOM_ID"],
                              args.people, args.noise, args.noise_unit)
        print(json.dumps(result))
    except (KeyError, ValueError, RuntimeError) as error:
        parser.exit(1, ("Missing Pi configuration variable." if isinstance(error, KeyError) else str(error)) + "\n")
