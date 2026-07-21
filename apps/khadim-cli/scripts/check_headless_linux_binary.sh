#!/usr/bin/env bash
set -euo pipefail

binary="${1:-}"
if [[ -z "$binary" || ! -x "$binary" ]]; then
  echo "usage: $0 /path/to/khadim-cli" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "headless binary smoke check only supports Linux" >&2
  exit 2
fi

version_output="$($binary --version)"
if [[ ! "$version_output" =~ ^khadim-cli[[:space:]][0-9] ]]; then
  echo "unexpected --version output: $version_output" >&2
  exit 1
fi

dynamic_section="$(readelf -d "$binary")"
for library in \
  libX11 \
  libXext \
  libXi \
  libXtst \
  libxcb \
  libEGL \
  libGL \
  libgbm \
  libwayland \
  libpipewire; do
  if grep -Fq "Shared library: [$library" <<<"$dynamic_section"; then
    echo "headless CLI unexpectedly links desktop runtime library $library" >&2
    exit 1
  fi
done

if [[ "${KHADIM_SKIP_MINIMAL_CONTAINER_SMOKE:-0}" != "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required for the minimal Linux runtime smoke check" >&2
    exit 2
  fi
  binary="$(realpath "$binary")"
  image="${KHADIM_MINIMAL_LINUX_IMAGE:-ubuntu:22.04}"
  docker run --rm \
    --network none \
    --volume "$(dirname "$binary"):/khadim-binary:ro" \
    "$image" \
    "/khadim-binary/$(basename "$binary")" \
    --version
fi

echo "headless Linux CLI smoke check passed: $version_output"
