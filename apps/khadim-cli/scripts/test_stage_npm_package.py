from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stage_npm_package as packaging


TARGET_CASES = (
    (
        "linux-x64",
        "linux",
        "x64",
        "x86_64-unknown-linux-gnu",
        "khadim-cli",
        "khadim-cli-linux-x86_64",
        "ubuntu-22.04",
    ),
    (
        "linux-arm64",
        "linux",
        "arm64",
        "aarch64-unknown-linux-gnu",
        "khadim-cli",
        "khadim-cli-linux-aarch64",
        "ubuntu-22.04-arm",
    ),
    (
        "darwin-x64",
        "darwin",
        "x64",
        "x86_64-apple-darwin",
        "khadim-cli",
        "khadim-cli-macos-x86_64",
        "macos-15-intel",
    ),
    (
        "darwin-arm64",
        "darwin",
        "arm64",
        "aarch64-apple-darwin",
        "khadim-cli",
        "khadim-cli-macos-aarch64",
        "macos-15",
    ),
    (
        "win32-x64",
        "win32",
        "x64",
        "x86_64-pc-windows-msvc",
        "khadim-cli.exe",
        "khadim-cli-windows-x86_64.exe",
        "windows-latest",
    ),
    (
        "win32-arm64",
        "win32",
        "arm64",
        "aarch64-pc-windows-msvc",
        "khadim-cli.exe",
        "khadim-cli-windows-aarch64.exe",
        "windows-11-arm",
    ),
)


class PlatformTargetTests(unittest.TestCase):
    def test_every_supported_node_platform_maps_to_one_release_target(self) -> None:
        self.assertEqual(set(packaging.PLATFORM_PACKAGES), {case[0] for case in TARGET_CASES})

        for tag, os_name, cpu, target, binary, artifact_file, runner in TARGET_CASES:
            with self.subTest(tag=tag):
                config = packaging.PLATFORM_PACKAGES[tag]
                self.assertEqual(config["os"], os_name)
                self.assertEqual(config["cpu"], cpu)
                self.assertEqual(config["target"], target)
                self.assertEqual(config["binary"], binary)
                self.assertEqual(config["artifact_file"], artifact_file)
                self.assertEqual(config["runner"], runner)
                self.assertTrue(config["artifact"])
                if os_name == "linux":
                    self.assertEqual(config["libc"], "glibc")
                    self.assertEqual(config["glibc_min"], "2.35")

    def test_windows_artifacts_stage_with_exe_layout_and_npm_constraints(self) -> None:
        for tag in ("win32-x64", "win32-arm64"):
            with self.subTest(tag=tag), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                artifact_dir = root / "artifacts"
                staging_dir = root / "staging"
                artifact_dir.mkdir()
                staging_dir.mkdir()

                config = packaging.PLATFORM_PACKAGES[tag]
                downloaded_artifact = artifact_dir / config["artifact"]
                downloaded_artifact.mkdir()
                artifact = downloaded_artifact / config["artifact_file"]
                artifact.write_bytes(f"native:{tag}".encode())
                (downloaded_artifact / config["artifact"]).write_bytes(b"extensionless-decoy")

                packaging.stage_platform(staging_dir, "1.2.3", tag, artifact_dir)

                staged_binary = (
                    staging_dir
                    / "vendor"
                    / config["target"]
                    / packaging.BINARY_NAME
                    / "khadim-cli.exe"
                )
                self.assertEqual(staged_binary.read_bytes(), f"native:{tag}".encode())
                package_json = json.loads((staging_dir / "package.json").read_text())
                self.assertEqual(package_json["os"], ["win32"])
                self.assertEqual(package_json["cpu"], [config["cpu"]])

    def test_linux_packages_declare_their_gnu_libc_constraint(self) -> None:
        for tag in ("linux-x64", "linux-arm64"):
            with self.subTest(tag=tag), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                artifact_dir = root / "artifacts"
                staging_dir = root / "staging"
                artifact_dir.mkdir()
                staging_dir.mkdir()

                config = packaging.PLATFORM_PACKAGES[tag]
                downloaded_artifact = artifact_dir / config["artifact"]
                downloaded_artifact.mkdir()
                (downloaded_artifact / config["artifact_file"]).write_bytes(b"gnu-binary")

                packaging.stage_platform(staging_dir, "1.2.3", tag, artifact_dir)

                package_json = json.loads((staging_dir / "package.json").read_text())
                self.assertEqual(package_json["libc"], ["glibc"])
                self.assertEqual(config["glibc_min"], "2.35")

    def test_main_package_stages_manifest_and_every_optional_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            staging_dir = Path(temp_dir)

            packaging.stage_main(staging_dir, "1.2.3")

            self.assertTrue((staging_dir / "platform-targets.json").is_file())
            self.assertTrue((staging_dir / "dist" / "platform-targets.js").is_file())
            self.assertTrue((staging_dir / "dist" / "index.js").is_file())
            self.assertTrue((staging_dir / "dist" / "index.d.ts").is_file())
            self.assertFalse((staging_dir / "src").exists())
            package_json = json.loads((staging_dir / "package.json").read_text())
            self.assertEqual(
                set(package_json["optionalDependencies"]),
                {config["alias"] for config in packaging.PLATFORM_PACKAGES.values()},
            )
            self.assertEqual(package_json["main"], "./dist/index.js")
            self.assertEqual(package_json["types"], "./dist/index.d.ts")
            self.assertEqual(package_json["exports"]["."]["import"], "./dist/index.js")
            self.assertIn("dist", package_json["files"])
            self.assertNotIn("src/platform-targets.js", package_json["files"])
            self.assertNotIn("devDependencies", package_json)
            self.assertIn("platform-targets.json", package_json["files"])


if __name__ == "__main__":
    unittest.main()
