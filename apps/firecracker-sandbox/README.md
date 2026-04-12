# Firecracker Sandbox

Rust control-plane app for VM-backed Khadim web sandboxes.

## Purpose

This app is the new service that the web app can talk to when `SANDBOX_PROVIDER=firecracker`.

Current scope:

- Axum HTTP API under `/v1/sandboxes`
- in-memory sandbox registry
- real Firecracker process launch and boot over the Unix socket API
- per-sandbox runtime directories and cloned writable rootfs disks
- guest-agent-backed file IO and command/process execution inside the VM

It now launches a real Firecracker microVM if the host has:

- a `firecracker` binary
- a kernel image
- a base rootfs image

The runtime now boots a small guest agent inside the cloned rootfs and talks to it over the guest TAP IP.

## Run

```bash
bun run sandbox:dev
```

Then, in a second shell:

```bash
SANDBOX_PROVIDER=firecracker bun dev
```

Or directly:

```bash
bun --filter @khadim/firecracker-sandbox dev
```

```bash
cargo run
```

## Key Environment Variables

```bash
PORT=4100
FIRECRACKER_BIN=firecracker
FIRECRACKER_RUNTIME_DIR=/tmp/khadim-firecracker
FIRECRACKER_STARTUP_TIMEOUT_MS=5000
FIRECRACKER_GUEST_AGENT_PORT=4020
FIRECRACKER_GUEST_AGENT_WAIT_TIMEOUT_MS=15000
FIRECRACKER_DEFAULT_VCPU=2
FIRECRACKER_DEFAULT_MEMORY_MIB=2048
FIRECRACKER_KERNEL_IMAGE=/var/lib/firecracker/vmlinux
FIRECRACKER_ROOTFS_IMAGE=/var/lib/firecracker/rootfs.ext4
FIRECRACKER_BOOT_ARGS="console=ttyS0 reboot=k panic=1 pci=off"
FIRECRACKER_TAP_DEVICE=tap0
FIRECRACKER_HOST_IP=172.16.0.1
FIRECRACKER_GUEST_IP=172.16.0.2
FIRECRACKER_GUEST_MAC=06:00:AC:10:00:02
```

## TAP Setup

Guest exec uses the in-VM guest agent over a host TAP device. Create it once on the host:

```bash
sudo ip tuntap add dev tap0 mode tap
sudo ip addr add 172.16.0.1/30 dev tap0
sudo ip link set dev tap0 up
```

The CI guest rootfs uses `fcnet-setup` and the default MAC `06:00:AC:10:00:02`, which maps to guest IP `172.16.0.2`.

## Next Steps

1. Replace the manual TAP prerequisite with managed network orchestration.
2. Replace the in-memory registry with persisted sandbox state.
3. Add jailer support and host port proxying.
4. Add auth, quotas, TTL cleanup, and audit logging.
