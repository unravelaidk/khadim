#!/usr/bin/env python3
"""Stage npm packages for the Khadim CLI.

This follows the Codex-style packaging model:
- @unravelai/khadim is a tiny JavaScript launcher package.
- Platform-specific native payloads are published as aliasable optional deps.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CLI_ROOT = SCRIPT_DIR.parent
REPO_ROOT = CLI_ROOT.parent.parent
NPM_NAME = "@unravelai/khadim"
BINARY_NAME = "khadim-cli"

PLATFORM_PACKAGES: dict[str, dict[str, str]] = {
    "linux-x64": {
        "alias": "@unravelai/khadim-linux-x64",
        "target": "x86_64-unknown-linux-gnu",
        "artifact": "khadim-cli-linux-x86_64",
        "os": "linux",
        "cpu": "x64",
    },
    "linux-arm64": {
        "alias": "@unravelai/khadim-linux-arm64",
        "target": "aarch64-unknown-linux-gnu",
        "artifact": "khadim-cli-linux-aarch64",
        "os": "linux",
        "cpu": "arm64",
    },
    "darwin-x64": {
        "alias": "@unravelai/khadim-darwin-x64",
        "target": "x86_64-apple-darwin",
        "artifact": "khadim-cli-macos-x86_64",
        "os": "darwin",
        "cpu": "x64",
    },
    "darwin-arm64": {
        "alias": "@unravelai/khadim-darwin-arm64",
        "target": "aarch64-apple-darwin",
        "artifact": "khadim-cli-macos-aarch64",
        "os": "darwin",
        "cpu": "arm64",
    },
}

PACKAGE_CHOICES = ("main", "all", *PLATFORM_PACKAGES.keys())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="npm package version, e.g. 0.1.0")
    parser.add_argument(
        "--package",
        choices=PACKAGE_CHOICES,
        default="all",
        help="Package to stage (default: all).",
    )
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        help="Directory containing native release artifacts for platform packages.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=CLI_ROOT / "dist" / "npm",
        help="Directory where npm tarballs are written (default: apps/khadim-cli/dist/npm)."
    )
    parser.add_argument(
        "--staging-dir",
        type=Path,
        help="Optional empty staging directory. Only valid when staging one package.",
    )
    parser.add_argument(
        "--keep-staging-dirs",
        action="store_true",
        help="Do not delete temporary staging directories.",
    )
    return parser.parse_args()


def platform_version(version: str, platform_tag: str) -> str:
    return f"{version}-{platform_tag}"


def package_list(package: str) -> list[str]:
    if package == "all":
        return ["main", *PLATFORM_PACKAGES.keys()]
    return [package]


def load_base_package_json() -> dict:
    with open(CLI_ROOT / "package.json", "r", encoding="utf-8") as file:
        return json.load(file)


def copy_common_files(staging_dir: Path) -> None:
    readme = CLI_ROOT / "README.md"
    if readme.exists():
        shutil.copy2(readme, staging_dir / "README.md")
    license_file = REPO_ROOT / "LICENSE"
    if license_file.exists():
        shutil.copy2(license_file, staging_dir / "LICENSE")


def stage_main(staging_dir: Path, version: str) -> None:
    bin_dir = staging_dir / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CLI_ROOT / "bin" / "khadim.js", bin_dir / "khadim.js")
    copy_common_files(staging_dir)

    package_json = load_base_package_json()
    package_json.pop("private", None)
    package_json.pop("scripts", None)
    package_json["name"] = NPM_NAME
    package_json["version"] = version
    package_json["type"] = "module"
    package_json["bin"] = {
        "khadim": "bin/khadim.js",
        "khadim-cli": "bin/khadim.js",
    }
    package_json["files"] = ["bin", "src"]
    package_json["optionalDependencies"] = {
        config["alias"]: f"npm:{NPM_NAME}@{platform_version(version, tag)}"
        for tag, config in PLATFORM_PACKAGES.items()
    }

    write_package_json(staging_dir, package_json)


def find_artifact(artifact_dir: Path, artifact_name: str) -> Path:
    candidates = [
        artifact_dir / artifact_name,
        artifact_dir / artifact_name / artifact_name,
        artifact_dir / f"{artifact_name}.exe",
        artifact_dir / artifact_name / f"{artifact_name}.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    matches = [path for path in artifact_dir.rglob("*") if path.is_file() and path.name in {artifact_name, f"{artifact_name}.exe"}]
    if matches:
        return matches[0]

    raise RuntimeError(f"Unable to find artifact '{artifact_name}' under {artifact_dir}")


def stage_platform(staging_dir: Path, version: str, platform_tag: str, artifact_dir: Path | None) -> None:
    if artifact_dir is None:
        raise RuntimeError(f"--artifact-dir is required for platform package '{platform_tag}'")

    config = PLATFORM_PACKAGES[platform_tag]
    artifact = find_artifact(artifact_dir.resolve(), config["artifact"])
    binary_name = f"{BINARY_NAME}.exe" if config["os"] == "win32" else BINARY_NAME
    binary_dir = staging_dir / "vendor" / config["target"] / BINARY_NAME
    binary_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(artifact, binary_dir / binary_name)
    (binary_dir / binary_name).chmod(0o755)
    copy_common_files(staging_dir)

    base_package_json = load_base_package_json()
    package_json = {
        "name": NPM_NAME,
        "version": platform_version(version, platform_tag),
        "description": base_package_json.get("description", "Khadim CLI coding agent"),
        "license": base_package_json.get("license", "AGPL-3.0-only"),
        "os": [config["os"]],
        "cpu": [config["cpu"]],
        "files": ["vendor"],
        "repository": base_package_json.get("repository"),
        "engines": base_package_json.get("engines", {"node": ">=18"}),
    }
    package_json = {key: value for key, value in package_json.items() if value is not None}
    write_package_json(staging_dir, package_json)


def write_package_json(staging_dir: Path, package_json: dict) -> None:
    with open(staging_dir / "package.json", "w", encoding="utf-8") as file:
        json.dump(package_json, file, indent=2)
        file.write("\n")


def run_npm_pack(staging_dir: Path, output_dir: Path, package: str, version: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="khadim-npm-pack-") as pack_dir_raw:
        pack_dir = Path(pack_dir_raw)
        stdout = subprocess.check_output(
            ["npm", "pack", "--json", "--pack-destination", str(pack_dir)],
            cwd=staging_dir,
            text=True,
        )
        pack_output = json.loads(stdout)
        if not pack_output:
            raise RuntimeError("npm pack did not produce a tarball")
        generated = pack_dir / pack_output[0]["filename"]
        if package == "main":
            output_name = f"khadim-cli-npm-{version}.tgz"
        else:
            output_name = f"khadim-cli-npm-{package}-{version}.tgz"
        output_path = output_dir / output_name
        shutil.move(str(generated), output_path)
        return output_path


def prepare_staging_dir(args: argparse.Namespace, packages: list[str], package: str) -> tuple[Path, bool]:
    if args.staging_dir is not None:
        if len(packages) != 1:
            raise RuntimeError("--staging-dir can only be used when staging one package")
        staging_dir = args.staging_dir.resolve()
        staging_dir.mkdir(parents=True, exist_ok=True)
        if any(staging_dir.iterdir()):
            raise RuntimeError(f"Staging directory is not empty: {staging_dir}")
        return staging_dir, False
    return Path(tempfile.mkdtemp(prefix=f"khadim-npm-stage-{package}-")), True


def main() -> int:
    args = parse_args()
    packages = package_list(args.package)
    staged = []

    for package in packages:
        staging_dir, is_temp = prepare_staging_dir(args, packages, package)
        try:
            if package == "main":
                stage_main(staging_dir, args.version)
            else:
                stage_platform(staging_dir, args.version, package, args.artifact_dir)

            output_path = run_npm_pack(staging_dir, args.output_dir, package, args.version)
            staged.append(output_path)
        finally:
            if is_temp and not args.keep_staging_dirs:
                shutil.rmtree(staging_dir, ignore_errors=True)

    for path in staged:
        print(f"Staged npm tarball: {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
