"""A second dev server on a busy port must fail loudly, not silently share the port (Windows SO_REUSEADDR)."""
import os
import socket
import sys
from pathlib import Path

import pytest
from werkzeug.serving import make_server

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as app_module  # noqa: E402,F401  (importing applies the Windows bind fix)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.skipif(os.name != "nt", reason="the silent double-bind only happens on Windows")
def test_second_server_on_same_port_fails(tmp_path):
    flask_app = app_module.create_app({"DATABASE": str(tmp_path / "s.db"), "TESTING": True})
    port = free_port()
    first = make_server("127.0.0.1", port, flask_app)
    try:
        # werkzeug reports "Port N is in use by another program" and exits, instead of binding silently
        with pytest.raises(SystemExit):
            make_server("127.0.0.1", port, flask_app)
    finally:
        first.server_close()
