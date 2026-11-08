"""Behavior tests for authenticated uploads; no real credentials or databases."""
import contextlib
import importlib.util
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location("sender", Path(__file__).resolve().parents[1] / "examples/send_reading.py")
sender = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sender)


@contextlib.contextmanager
def running(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "http://127.0.0.1:" + str(server.server_port)
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


class PiSenderTests(unittest.TestCase):
    def test_does_not_forward_device_token_on_redirect(self):
        received = []

        class Destination(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append(self.headers.get("Authorization"))
                self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        with running(Destination) as destination:
            class Redirect(BaseHTTPRequestHandler):
                def do_POST(self):
                    self.rfile.read(int(self.headers["Content-Length"]))
                    self.send_response(303)
                    self.send_header("Location", destination + "/capture")
                    self.end_headers()

                def log_message(self, *args):
                    pass

            with running(Redirect) as origin:
                with self.assertRaisesRegex(RuntimeError, "redirected"):
                    sender.send_reading(origin, "test-token", "test-room", 3, 0.2, "relative")
        self.assertEqual(received, [])

    def test_transient_retry_reuses_the_measurement(self):
        uploads = []

        class Upload(BaseHTTPRequestHandler):
            def do_POST(self):
                uploads.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(503 if len(uploads) == 1 else 200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"accepted":true}')

            def log_message(self, *args):
                pass

        with running(Upload) as origin:
            result = sender.send_reading(origin, "test-token", "test-room", 3, 0.2, "relative")
        self.assertTrue(result["accepted"])
        self.assertEqual(len(uploads), 2)
        self.assertEqual(uploads[0], uploads[1])


if __name__ == "__main__":
    unittest.main()
