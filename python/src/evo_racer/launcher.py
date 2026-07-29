"""Launch the packaged EvoRacer browser UI and loopback-only Python core."""

from __future__ import annotations

import argparse
import signal
import sys
import webbrowser
from collections.abc import Sequence
from pathlib import Path
from threading import Thread
from types import FrameType

from evo_racer.service import DEFAULT_PORT, LOOPBACK_HOST, EvoRacerServer, create_server


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

    server = create_server(port=port, data_root=data_root, static_root=resolved_static_root)
    _install_signal_handlers(server)
    app_url = f"http://{LOOPBACK_HOST}:{server.server_port}/"
    if open_browser:
        webbrowser.open_new_tab(app_url)

    try:
        server.serve_forever()
    finally:
        server.server_close()


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


def main(argv: Sequence[str] | None = None) -> None:
    """Run the packaged application entrypoint."""
    args = parse_args(argv)
    try:
        run_launcher(
            port=args.port,
            data_root=args.data_root,
            static_root=args.static_root,
            open_browser=not args.no_browser,
        )
    except Exception as error:
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
