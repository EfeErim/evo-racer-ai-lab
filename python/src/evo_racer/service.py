"""Loopback-only foundation service for the EvoRacer Python core."""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Final

from evo_racer.onboarding import validate_setup
from evo_racer.tracks import compiled_presets_payload

LOOPBACK_HOST: Final = "127.0.0.1"
DEFAULT_PORT: Final = 8765
MAX_REQUEST_BYTES: Final = 16_384
ALLOWED_DEVELOPMENT_ORIGINS: Final = frozenset(
    {
        "http://127.0.0.1:4173",
        "http://127.0.0.1:5173",
    }
)


class HealthHandler(BaseHTTPRequestHandler):
    """Serve versioned loopback-only application contracts."""

    server_version = "EvoRacerLocal/0.1"

    def do_GET(self) -> None:
        """Return local service data without contacting any external resource."""
        if self.path == "/health":
            self._send_json(
                HTTPStatus.OK,
                {
                    "contractVersion": 1,
                    "host": LOOPBACK_HOST,
                    "service": "evo-racer-core",
                    "status": "ready",
                },
            )
            return
        if self.path == "/v1/tracks/presets":
            if not self._origin_allowed():
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            self._send_json(HTTPStatus.OK, compiled_presets_payload())
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_OPTIONS(self) -> None:
        """Permit JSON validation only from the known loopback UI origins."""
        if self.path != "/v1/setup/validate" or not self._origin_allowed():
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        """Validate an onboarding setup without creating or starting a run."""
        if self.path != "/v1/setup/validate":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._origin_allowed():
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        content_length = self.headers.get("Content-Length")
        if content_length is None:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "CONTENT_LENGTH_REQUIRED"},
            )
            return

        try:
            request_bytes = int(content_length)
        except ValueError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_CONTENT_LENGTH"})
            return

        if request_bytes < 0 or request_bytes > MAX_REQUEST_BYTES:
            self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "PAYLOAD_TOO_LARGE"})
            return

        try:
            payload: object = json.loads(self.rfile.read(request_bytes))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_JSON"})
            return

        self._send_json(HTTPStatus.OK, validate_setup(payload))

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        return origin is None or origin in ALLOWED_DEVELOPMENT_ORIGINS

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_DEVELOPMENT_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _send_json(self, status: HTTPStatus, payload: object) -> None:
        body = json.dumps(
            payload,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        """Keep the local service quiet until structured logging is introduced."""


def create_server(port: int = DEFAULT_PORT) -> ThreadingHTTPServer:
    """Create a service that cannot bind beyond the IPv4 loopback interface."""
    return ThreadingHTTPServer((LOOPBACK_HOST, port), HealthHandler)


def run(port: int = DEFAULT_PORT) -> None:
    """Run the local service until interrupted."""
    server = create_server(port)
    print(f"EvoRacer local service listening on http://{LOOPBACK_HOST}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def parse_args() -> argparse.Namespace:
    """Parse the intentionally small local service CLI."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    return parser.parse_args()


def main() -> None:
    """Run the command-line service entrypoint."""
    args = parse_args()
    run(port=args.port)


if __name__ == "__main__":
    main()
