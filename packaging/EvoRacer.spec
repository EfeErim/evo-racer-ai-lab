from pathlib import Path


ROOT = Path(SPECPATH).resolve().parent

analysis = Analysis(
    [str(ROOT / "python" / "src" / "evo_racer" / "launcher.py")],
    pathex=[str(ROOT / "python" / "src")],
    binaries=[],
    datas=[
        (str(ROOT / "dist"), "web"),
        (
            str(ROOT / "python" / "src" / "evo_racer" / "config" / "neat-feed-forward.ini"),
            "evo_racer/config",
        ),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

python_archive = PYZ(analysis.pure)

executable = EXE(
    python_archive,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="EvoRacer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)

bundle = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="EvoRacer",
)
