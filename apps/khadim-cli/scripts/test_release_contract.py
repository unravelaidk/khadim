from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_contract


def target(*, os_name: str = "linux", cpu: str = "x64") -> dict:
    windows = os_name == "win32"
    tag = f"{os_name}-{cpu}"
    return {
        "alias": f"@unravelai/khadim-{tag}",
        "target": "x86_64-pc-windows-msvc" if windows else "x86_64-unknown-linux-gnu",
        "artifact": f"khadim-cli-{tag}",
        "artifact_file": f"khadim-cli-{tag}{'.exe' if windows else ''}",
        "os": os_name,
        "cpu": cpu,
        "binary": f"khadim-cli{'.exe' if windows else ''}",
        "runner": "windows-latest" if windows else "ubuntu-22.04",
        "strip": not windows,
        "cache": True,
        **({"libc": "glibc", "glibc_min": "2.35"} if not windows else {}),
    }


class ReleaseContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.cargo = self.root / "Cargo.toml"
        self.package = self.root / "package.json"
        self.platforms = self.root / "platform-targets.json"
        self.write_versions("1.2.3")
        self.platforms.write_text(json.dumps({"linux-x64": target()}), encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_versions(self, cargo: str, package: str | None = None) -> None:
        self.cargo.write_text(
            f'[package]\nname = "khadim-cli"\nversion = "{cargo}"\n',
            encoding="utf-8",
        )
        self.package.write_text(
            json.dumps({"name": "@unravelai/khadim", "version": package or cargo}),
            encoding="utf-8",
        )

    def test_matching_tag_and_manifests_produce_runner_native_matrix(self) -> None:
        version = release_contract.verify_versions(
            "cli-v1.2.3", self.cargo, self.package
        )
        targets = release_contract.load_platform_targets(self.platforms)
        matrix = release_contract.build_matrix(targets)

        self.assertEqual(version, "1.2.3")
        self.assertEqual(
            matrix,
            {
                "include": [
                    {
                        "tag": "linux-x64",
                        "runner": "ubuntu-22.04",
                        "runner_os": "Linux",
                        "runner_arch": "X64",
                        "target": "x86_64-unknown-linux-gnu",
                        "artifact_name": "khadim-cli-linux-x64",
                        "artifact_file": "khadim-cli-linux-x64",
                        "binary": "khadim-cli",
                        "strip": True,
                        "cache": True,
                    }
                ]
            },
        )

    def test_tag_cargo_and_npm_versions_must_be_exactly_equal(self) -> None:
        for cargo, package, expected_path in (
            ("1.2.4", "1.2.3", "Cargo.toml"),
            ("1.2.3", "1.2.4", "package.json"),
        ):
            with self.subTest(cargo=cargo, package=package):
                self.write_versions(cargo, package)
                with self.assertRaisesRegex(
                    release_contract.ReleaseContractError, expected_path
                ):
                    release_contract.verify_versions(
                        "cli-v1.2.3", self.cargo, self.package
                    )

    def test_tag_requires_cli_prefix_and_semver(self) -> None:
        for tag in ("v1.2.3", "cli-v1.2", "cli-v01.2.3", "cli-v"):
            with (
                self.subTest(tag=tag),
                self.assertRaises(release_contract.ReleaseContractError),
            ):
                release_contract.version_from_tag(tag)

    def test_platform_manifest_rejects_duplicate_node_tuple(self) -> None:
        duplicate = target()
        self.platforms.write_text(
            json.dumps({"linux-x64": target(), "second": duplicate}),
            encoding="utf-8",
        )
        with self.assertRaises(release_contract.ReleaseContractError):
            release_contract.load_platform_targets(self.platforms)

    def test_platform_manifest_rejects_windows_artifact_without_exe(self) -> None:
        windows = target(os_name="win32")
        windows["artifact_file"] = "khadim-cli-win32-x64"
        self.platforms.write_text(json.dumps({"win32-x64": windows}), encoding="utf-8")
        with self.assertRaisesRegex(
            release_contract.ReleaseContractError, "artifact extension"
        ):
            release_contract.load_platform_targets(self.platforms)

    def test_linux_targets_require_an_explicit_glibc_baseline(self) -> None:
        for field in ("libc", "glibc_min"):
            with self.subTest(field=field):
                invalid = target()
                invalid.pop(field)
                self.platforms.write_text(
                    json.dumps({"linux-x64": invalid}), encoding="utf-8"
                )
                with self.assertRaisesRegex(
                    release_contract.ReleaseContractError,
                    "libc='glibc'|glibc_min",
                ):
                    release_contract.load_platform_targets(self.platforms)

    def test_linux_baseline_cannot_drift_from_its_pinned_runner(self) -> None:
        for field, value in (
            ("runner", "ubuntu-latest"),
            ("glibc_min", "2.36"),
        ):
            with self.subTest(field=field):
                invalid = target()
                invalid[field] = value
                self.platforms.write_text(
                    json.dumps({"linux-x64": invalid}), encoding="utf-8"
                )
                with self.assertRaisesRegex(
                    release_contract.ReleaseContractError,
                    "glibc 2.35 baseline|baseline 2.35",
                ):
                    release_contract.load_platform_targets(self.platforms)


if __name__ == "__main__":
    unittest.main()
