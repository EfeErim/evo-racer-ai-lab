"""Launch the packaged EvoRacer browser UI and loopback-only Python core."""

from __future__ import annotations

import argparse
import http.client
import json
import logging
import signal
import sys
import webbrowser
from collections.abc import Sequence
from logging.handlers import RotatingFileHandler
from pathlib import Path
from threading import Thread
from types import FrameType
from typing import Final

from evo_racer.service import DEFAULT_PORT, LOOPBACK_HOST, EvoRacerServer, create_server
from evo_racer.track_library import default_data_root

# Named explicitly: this module runs as __main__ in the packaged EXE.
LOGGER: Final = logging.getLogger("evo_racer.launcher")
LOG_FILE_BYTES: Final = 1_000_000


def bundled_static_root() -> Path:
    """Resolve Vite assets in source checkouts and PyInstaller onedir bundles."""
    module_path = Path(__file__).resolve()
    for bundled_root in (module_path.parent / "web", module_path.parents[1] / "web"):
        if bundled_root.is_dir():
            return bundled_root
    return module_path.parents[3] / "dist"


def run_launcher(
    *,
    port: int = DEFAULT_PORT,
    data_root: Path | None = None,
    static_root: Path | None = None,
    open_browser: bool = True,
) -> None:
    """Serve the complete local app until an exit request or process signal."""
    resolved_static_root = (static_root or bundled_static_root()).resolve()
    index_path = resolved_static_root / "index.html"
    if not index_path.is_file():
        raise FileNotFoundError(f"Production frontend is missing: {index_path}")

    try:
        server = create_server(port=port, data_root=data_root, static_root=resolved_static_root)
    except OSError as error:
        if not _evoracer_is_serving(port):
            raise RuntimeError(
                f"Port {port} is in use by another program. Close that program, "
                "then open EvoRacer again."
            ) from error
        # A windowless copy keeps running after its tab closes; reuse it instead of a second one.
        if open_browser:
            webbrowser.open_new_tab(f"http://{LOOPBACK_HOST}:{port}/")
        return

    _install_signal_handlers(server)
    app_url = f"http://{LOOPBACK_HOST}:{server.server_port}/"
    if open_browser:
        webbrowser.open_new_tab(app_url)

    try:
        server.serve_forever()
    finally:
        server.run_manager.close()
        server.server_close()


def _evoracer_is_serving(port: int) -> bool:
    """Ask the loopback port directly whether it answers as the EvoRacer core."""
    connection = http.client.HTTPConnection(LOOPBACK_HOST, port, timeout=2.0)
    try:
        connection.request("GET", "/health")
        response = connection.getresponse()
        payload = json.loads(response.read())
    except (OSError, http.client.HTTPException, ValueError):
        return False
    finally:
        connection.close()
    return (
        response.status == 200
        and isinstance(payload, dict)
        and payload.get("service") == "evo-racer-core"
    )


def _install_signal_handlers(server: EvoRacerServer) -> None:
    def request_shutdown(_signum: int, _frame: FrameType | None) -> None:
        Thread(target=server.shutdown, name="evo-racer-signal-shutdown", daemon=True).start()

    for signal_name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        shutdown_signal = getattr(signal, signal_name, None)
        if shutdown_signal is not None:
            signal.signal(shutdown_signal, request_shutdown)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse package and acceptance-test launcher options."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--data-root", type=Path)
    parser.add_argument("--static-root", type=Path)
    parser.add_argument("--no-browser", action="store_true")
    return parser.parse_args(argv)


def configure_logging(data_root: Path) -> logging.Handler | None:
    """Write warnings and failures to ``logs/evoracer.log`` under the data root.

    The windowed EXE has no console, so without this file a worker or request failure
    leaves no trace. Two 1 MB backups bound the disk use. Returns None when the log
    directory cannot be created; the app still runs without a log.
    """
    log_path = data_root / "logs" / "evoracer.log"
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(
            log_path, maxBytes=LOG_FILE_BYTES, backupCount=2, encoding="utf-8"
        )
    except OSError:
        return None
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    package_logger = logging.getLogger("evo_racer")
    package_logger.setLevel(logging.INFO)
    package_logger.addHandler(handler)
    return handler


def main(argv: Sequence[str] | None = None) -> None:
    """Run the packaged application entrypoint."""
    args = parse_args(argv)
    configure_logging(args.data_root or default_data_root())
    try:
        run_launcher(
            port=args.port,
            data_root=args.data_root,
            static_root=args.static_root,
            open_browser=not args.no_browser,
        )
    except Exception as error:
        LOGGER.exception("EvoRacer could not start")
        # Last resort: the windowed EXE has no console to report an unexpected failure.
        _show_startup_error(str(error))
        raise


def _show_startup_error(message: str) -> None:
    if sys.platform != "win32":
        return
    import ctypes

    ctypes.windll.user32.MessageBoxW(
        0,
        message,
        "EvoRacer could not start",
        0x10,
    )


if __name__ == "__main__":
    main()
