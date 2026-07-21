#!/usr/bin/env python3
"""Validate a CLI release tag and produce its manifest-driven build matrix."""

from __future__ import annotations

import argparse
import json
import re
import tomllib
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
CLI_ROOT = SCRIPT_DIR.parent
DEFAULT_CARGO_MANIFEST = CLI_ROOT / "Cargo.toml"
DEFAULT_PACKAGE_JSON = CLI_ROOT / "package.json"
DEFAULT_PLATFORM_MANIFEST = CLI_ROOT / "platform-targets.json"

SEMVER_RE = re.compile(
    r"^(?:0|[1-9][0-9]*)\."
    r"(?:0|[1-9][0-9]*)\."
    r"(?:0|[1-9][0-9]*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)

REQUIRED_PLATFORM_FIELDS = {
    "alias",
    "target",
    "artifact",
    "artifact_file",
    "os",
    "cpu",
    "binary",
    "runner",
    "strip",
    "cache",
}

RUNNER_OS = {
    "linux": "Linux",
    "darwin": "macOS",
    "win32": "Windows",
}

RUNNER_ARCH = {
    "x64": "X64",
    "arm64": "ARM64",
}

GNU_GLIBC_BASELINE = "2.35"
GNU_RELEASE_RUNNERS = {
    "x64": "ubuntu-22.04",
    "arm64": "ubuntu-22.04-arm",
}


class ReleaseContractError(RuntimeError):
    """Raised when checked-in release metadata disagrees."""


def version_from_tag(tag: str) -> str:
    prefix = "cli-v"
    if not tag.startswith(prefix):
        raise ReleaseContractError(
            f"CLI release tag must start with '{prefix}', got '{tag}'"
        )
    version = tag[len(prefix) :]
    if not SEMVER_RE.fullmatch(version):
        raise ReleaseContractError(
            f"CLI release tag must contain a SemVer version, got '{tag}'"
        )
    return version


def _read_cargo_version(path: Path) -> str:
    with path.open("rb") as file:
        manifest = tomllib.load(file)
    version = manifest.get("package", {}).get("version")
    if not isinstance(version, str):
        raise ReleaseContractError(f"Missing package.version in {path}")
    return version


def _read_package_version(path: Path) -> str:
    package = json.loads(path.read_text(encoding="utf-8"))
    version = package.get("version") if isinstance(package, dict) else None
    if not isinstance(version, str):
        raise ReleaseContractError(f"Missing version in {path}")
    return version


def load_platform_targets(path: Path) -> dict[str, dict[str, Any]]:
    targets = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(targets, dict) or not targets:
        raise ReleaseContractError(
            f"Platform target manifest must be a non-empty object: {path}"
        )

    seen_platforms: set[tuple[str, str]] = set()
    seen_artifacts: set[str] = set()
    for tag, config in targets.items():
        if not isinstance(tag, str) or not tag:
            raise ReleaseContractError(f"Invalid empty platform tag in {path}")
        if not isinstance(config, dict):
            raise ReleaseContractError(f"Platform target '{tag}' must be an object")

        missing = REQUIRED_PLATFORM_FIELDS.difference(config)
        if missing:
            raise ReleaseContractError(
                f"Platform target '{tag}' is missing: {', '.join(sorted(missing))}"
            )

        for field in REQUIRED_PLATFORM_FIELDS.difference({"strip", "cache"}):
            if not isinstance(config[field], str) or not config[field]:
                raise ReleaseContractError(
                    f"Platform target '{tag}' field '{field}' must be a non-empty string"
                )
        for field in ("strip", "cache"):
            if not isinstance(config[field], bool):
                raise ReleaseContractError(
                    f"Platform target '{tag}' field '{field}' must be a boolean"
                )

        os_name = config["os"]
        cpu = config["cpu"]
        if os_name not in RUNNER_OS or cpu not in RUNNER_ARCH:
            raise ReleaseContractError(
                f"Platform target '{tag}' has unsupported Node tuple {os_name}:{cpu}"
            )
        if tag != f"{os_name}-{cpu}":
            raise ReleaseContractError(
                f"Platform tag '{tag}' must match its Node tuple '{os_name}-{cpu}'"
            )

        platform_tuple = (os_name, cpu)
        if platform_tuple in seen_platforms:
            raise ReleaseContractError(
                f"Duplicate Node platform tuple {os_name}:{cpu} in {path}"
            )
        seen_platforms.add(platform_tuple)

        artifact_file = config["artifact_file"]
        if artifact_file in seen_artifacts:
            raise ReleaseContractError(
                f"Duplicate artifact file '{artifact_file}' in {path}"
            )
        seen_artifacts.add(artifact_file)

        is_windows = os_name == "win32"
        if config["binary"].endswith(".exe") != is_windows:
            raise ReleaseContractError(
                f"Platform target '{tag}' has an invalid binary extension for {os_name}"
            )
        if artifact_file.endswith(".exe") != is_windows:
            raise ReleaseContractError(
                f"Platform target '{tag}' has an invalid artifact extension for {os_name}"
            )
        if os_name == "linux":
            if config.get("libc") != "glibc":
                raise ReleaseContractError(
                    f"Linux platform target '{tag}' must declare libc='glibc'"
                )
            glibc_min = config.get("glibc_min")
            if not isinstance(glibc_min, str) or not re.fullmatch(
                r"[0-9]+\.[0-9]+", glibc_min
            ):
                raise ReleaseContractError(
                    f"Linux platform target '{tag}' must declare a numeric glibc_min"
                )
            if glibc_min != GNU_GLIBC_BASELINE:
                raise ReleaseContractError(
                    f"Linux platform target '{tag}' must use the supported glibc "
                    f"baseline {GNU_GLIBC_BASELINE}, got {glibc_min}"
                )
            expected_runner = GNU_RELEASE_RUNNERS[cpu]
            if config["runner"] != expected_runner:
                raise ReleaseContractError(
                    f"Linux platform target '{tag}' must build on {expected_runner} "
                    f"for the glibc {GNU_GLIBC_BASELINE} baseline"
                )

    return targets


def verify_versions(tag: str, cargo_manifest: Path, package_json: Path) -> str:
    version = version_from_tag(tag)
    cargo_version = _read_cargo_version(cargo_manifest)
    package_version = _read_package_version(package_json)
    mismatches = []
    if cargo_version != version:
        mismatches.append(f"{cargo_manifest}: {cargo_version}")
    if package_version != version:
        mismatches.append(f"{package_json}: {package_version}")
    if mismatches:
        details = ", ".join(mismatches)
        raise ReleaseContractError(
            f"Release version {version} from tag {tag} does not match {details}"
        )
    return version


def build_matrix(targets: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    include = []
    for tag, config in targets.items():
        include.append(
            {
                "tag": tag,
                "runner": config["runner"],
                "runner_os": RUNNER_OS[config["os"]],
                "runner_arch": RUNNER_ARCH[config["cpu"]],
                "target": config["target"],
                "artifact_name": config["artifact"],
                "artifact_file": config["artifact_file"],
                "binary": config["binary"],
                "strip": config["strip"],
                "cache": config["cache"],
            }
        )
    return {"include": include}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tag", required=True, help="Release tag, for example cli-v0.2.10"
    )
    parser.add_argument("--cargo-manifest", type=Path, default=DEFAULT_CARGO_MANIFEST)
    parser.add_argument("--package-json", type=Path, default=DEFAULT_PACKAGE_JSON)
    parser.add_argument(
        "--platform-manifest", type=Path, default=DEFAULT_PLATFORM_MANIFEST
    )
    parser.add_argument(
        "--matrix",
        action="store_true",
        help="Print the compact GitHub Actions build matrix as JSON.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        version = verify_versions(args.tag, args.cargo_manifest, args.package_json)
        targets = load_platform_targets(args.platform_manifest)
    except (
        OSError,
        json.JSONDecodeError,
        tomllib.TOMLDecodeError,
        ReleaseContractError,
    ) as error:
        raise SystemExit(f"release contract failed: {error}") from error

    if args.matrix:
        print(json.dumps(build_matrix(targets), separators=(",", ":")))
    else:
        print(
            f"release contract verified: {args.tag} = {version} ({len(targets)} targets)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
