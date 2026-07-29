"""Loopback-only foundation service for the EvoRacer Python core."""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Final
from urllib.parse import unquote, urlsplit

from evo_racer.onboarding import validate_setup
from evo_racer.track_generation import assist_track_closure_payload, generate_track_payload
from evo_racer.track_library import delete_track, library_payload, save_track_payload
from evo_racer.tracks import compiled_presets_payload, validate_track_payload

LOOPBACK_HOST: Final = "127.0.0.1"
DEFAULT_PORT: Final = 8765
MAX_REQUEST_BYTES: Final = 16_384
ALLOWED_DEVELOPMENT_ORIGINS: Final = frozenset(
    {
        "http://127.0.0.1:4173",
        "http://127.0.0.1:5173",
    }
)
POST_PATHS: Final = frozenset(
    {
        "/v1/setup/validate",
        "/v1/tracks/compile",
        "/v1/tracks/generate",
        "/v1/tracks/assist-closure",
        "/v1/tracks/library",
    }
)


class EvoRacerServer(ThreadingHTTPServer):
    """Loopback server carrying the resolved local data root."""

    data_root: Path | None


class HealthHandler(BaseHTTPRequestHandler):
    """Serve versioned loopback-only application contracts."""

    server_version = "EvoRacerLocal/0.1"

    def do_GET(self) -> None:
        """Return local service data without contacting any external resource."""
        path = urlsplit(self.path).path
        if path == "/health":
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
        if path == "/v1/tracks/presets":
            if not self._origin_allowed():
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            self._send_json(HTTPStatus.OK, compiled_presets_payload())
            return
        if path == "/v1/tracks/library":
            if not self._origin_allowed():
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            self._send_json(HTTPStatus.OK, library_payload(self._data_root()))
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_OPTIONS(self) -> None:
        """Permit versioned JSON commands only from known loopback UI origins."""
        path = urlsplit(self.path).path
        library_record = path.startswith("/v1/tracks/library/")
        if (path not in POST_PATHS and not library_record) or not self._origin_allowed():
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        """Handle local-only setup and track commands."""
        path = urlsplit(self.path).path
        if path not in POST_PATHS:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._origin_allowed():
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        payload = self._read_json()
        if payload is None:
            return

        if path == "/v1/setup/validate":
            response = validate_setup(payload)
        elif path == "/v1/tracks/compile":
            response = self._compile_request(payload)
        elif path == "/v1/tracks/generate":
            response = generate_track_payload(payload)
        elif path == "/v1/tracks/assist-closure":
            response = assist_track_closure_payload(payload)
        else:
            response = save_track_payload(payload, self._data_root())
        self._send_json(HTTPStatus.OK, response)

    def do_DELETE(self) -> None:
        """Delete exactly one local-library track by its decoded identifier."""
        path = urlsplit(self.path).path
        prefix = "/v1/tracks/library/"
        if not path.startswith(prefix):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._origin_allowed():
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        track_id = unquote(path.removeprefix(prefix))
        if not track_id:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "TRACK_ID_REQUIRED"})
            return
        self._send_json(HTTPStatus.OK, delete_track(track_id, self._data_root()))

    def _read_json(self) -> object | None:
        content_length = self.headers.get("Content-Length")
        if content_length is None:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "CONTENT_LENGTH_REQUIRED"},
            )
            return None

        try:
            request_bytes = int(content_length)
        except ValueError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_CONTENT_LENGTH"})
            return None

        if request_bytes < 0 or request_bytes > MAX_REQUEST_BYTES:
            self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "PAYLOAD_TOO_LARGE"})
            return None

        try:
            payload: object = json.loads(self.rfile.read(request_bytes))
            return payload
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "INVALID_JSON"})
            return None

    def _compile_request(self, payload: object) -> dict[str, object]:
        if not isinstance(payload, dict) or payload.get("contractVersion") != 1:
            return {
                "contractVersion": 1,
                "valid": False,
                "errors": [
                    {
                        "code": "UNSUPPORTED_COMPILE_VERSION",
                        "field": "contractVersion",
                        "message": "Compile contractVersion must be 1.",
                    }
                ],
            }
        return validate_track_payload(payload.get("track"))

    def _data_root(self) -> Path | None:
        server = self.server
        assert isinstance(server, EvoRacerServer)
        return server.data_root

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


def create_server(port: int = DEFAULT_PORT, data_root: Path | None = None) -> EvoRacerServer:
    """Create a service that cannot bind beyond the IPv4 loopback interface."""
    server = EvoRacerServer((LOOPBACK_HOST, port), HealthHandler)
    server.data_root = data_root
    return server


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
