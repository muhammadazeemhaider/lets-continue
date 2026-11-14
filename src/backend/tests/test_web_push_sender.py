"""Exercises the *real* Web Push sender (encryption + VAPID) against a local fake push service. No internet."""
import base64
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import notifications as N  # noqa: E402

b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731


@pytest.fixture
def push_service():
    seen, status = {}, {"code": 201}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            seen["authorization"] = self.headers.get("Authorization", "")
            seen["encoding"] = self.headers.get("Content-Encoding")
            seen["bytes"] = len(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            self.send_response(status["code"])
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    browser_key = ec.generate_private_key(ec.SECP256R1())
    p256dh = b64(browser_key.public_key().public_bytes(serialization.Encoding.X962,
                                                       serialization.PublicFormat.UncompressedPoint))
    sub = {"endpoint": f"http://127.0.0.1:{server.server_port}/push/x", "keys": {"p256dh": p256dh, "auth": b64(os.urandom(16))}}
    yield sub, seen, status
    server.shutdown()


def test_real_sender_encrypts_signs_and_maps_statuses(tmp_path, push_service):
    sub, seen, status = push_service
    send = N.make_web_push_sender(tmp_path / "vapid.json")
    assert send(sub, {"title": "t", "body": "b", "url": "/#/book/1"}) == "sent"
    assert seen["authorization"].lower().startswith("vapid ") and seen["encoding"] == "aes128gcm" and seen["bytes"] > 0
    status["code"] = 410
    assert send(sub, {"title": "t"}) == "gone"  # expired subscriptions get cleaned up
    status["code"] = 500
    assert send(sub, {"title": "t"}) == "failed"


def test_vapid_keys_are_created_once(tmp_path):
    path = tmp_path / "v.json"
    assert N.vapid_keys(path) == N.vapid_keys(path) and path.exists()
