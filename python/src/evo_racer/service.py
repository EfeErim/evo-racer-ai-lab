"""Loopback-only foundation service for the EvoRacer Python core."""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Final

LOOPBACK_HOST: Final = "127.0.0.1"
DEFAULT_PORT: Final = 8765


class HealthHandler(BaseHTTPRequestHandler):
    """Serve the versioned local health contract."""

    server_version = "EvoRacerLocal/0.1"

    def do_GET(self) -> None:
        """Return service health without contacting any external resource."""
        if self.path != "/health":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        body = json.dumps(
            {
                "contractVersion": 1,
                "host": LOOPBACK_HOST,
                "service": "evo-racer-core",
                "status": "ready",
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        self.send_response(HTTPStatus.OK)
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
    """Parse the intentionally small Phase 0 service CLI."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    return parser.parse_args()


def main() -> None:
    """Run the command-line service entrypoint."""
    args = parse_args()
    run(port=args.port)


if __name__ == "__main__":
    main()
