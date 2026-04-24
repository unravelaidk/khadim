#!/usr/bin/env python3
"""Create runnable Khadim CLI binaries under apps/khadim-cli/dist/bin."""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CLI_ROOT = SCRIPT_DIR.parent
DIST_BIN = CLI_ROOT / "dist" / "bin"
EXE_SUFFIX = ".exe" if sys.platform == "win32" else ""
SOURCE_BINARY = CLI_ROOT / "target" / "release" / f"khadim-cli{EXE_SUFFIX}"


def make_executable(path: Path) -> None:
    if sys.platform == "win32":
        return
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def copy_or_link_alias(source: Path, alias: Path) -> None:
    if alias.exists() or alias.is_symlink():
        alias.unlink()

    if sys.platform == "win32":
        shutil.copy2(source, alias)
        return

    try:
        alias.symlink_to(source.name)
    except OSError:
        shutil.copy2(source, alias)
        make_executable(alias)


def main() -> int:
    if not SOURCE_BINARY.exists():
        subprocess.run(
            ["cargo", "build", "--release", "--manifest-path", str(CLI_ROOT / "Cargo.toml")],
            cwd=CLI_ROOT,
            check=True,
        )

    if not SOURCE_BINARY.exists():
        raise RuntimeError(f"Release binary not found: {SOURCE_BINARY}")

    DIST_BIN.mkdir(parents=True, exist_ok=True)

    khadim_cli = DIST_BIN / f"khadim-cli{EXE_SUFFIX}"
    khadim = DIST_BIN / f"khadim{EXE_SUFFIX}"

    shutil.copy2(SOURCE_BINARY, khadim_cli)
    make_executable(khadim_cli)
    copy_or_link_alias(khadim_cli, khadim)

    print(f"Runnable binaries written to {DIST_BIN}")
    print(f"  {khadim}")
    print(f"  {khadim_cli}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
