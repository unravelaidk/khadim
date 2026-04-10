# Firecracker Web Sandbox Layer

This adds a Firecracker-ready sandbox provider seam for `apps/web` without changing the agent tool surface.

## What Changed

- `apps/web/app/agent/sandbox.ts` now resolves a sandbox backend from `SANDBOX_PROVIDER`.
- The existing remote TRPC service remains the default backend.
- A new Firecracker control-plane adapter lives in `apps/web/app/agent/firecracker.ts`.
- The web sandbox routes now use the selected provider instead of reaching directly into the remote client.

## Supported Backends

- `remote`: existing `@khadim/codeexecution-client` flow
- `firecracker`: VM-backed control plane for per-sandbox microVMs

## Environment Variables

```bash
SANDBOX_PROVIDER=firecracker
FIRECRACKER_SANDBOX_URL=http://localhost:4100
FIRECRACKER_SANDBOX_TOKEN=optional-auth-token
FIRECRACKER_DEFAULT_VCPU=2
FIRECRACKER_DEFAULT_MEMORY_MIB=2048
FIRECRACKER_KERNEL_IMAGE=/var/lib/firecracker/vmlinux
FIRECRACKER_ROOTFS_IMAGE=/var/lib/firecracker/rootfs.ext4
FIRECRACKER_SNAPSHOT_ID=optional-warm-snapshot
FIRECRACKER_NETWORK_POLICY=default-deny
```

## Local Dev

Start the Rust control plane:

```bash
bun run sandbox:dev
```

Start the web app against it:

```bash
SANDBOX_PROVIDER=firecracker bun dev
```

## Expected Firecracker Control Plane API

The new adapter expects a narrow HTTP API:

- `POST /v1/sandboxes`
- `GET /v1/sandboxes/:id`
- `DELETE /v1/sandboxes/:id`
- `GET /v1/sandboxes/:id/files?path=...`
- `PUT /v1/sandboxes/:id/files?path=...`
- `POST /v1/sandboxes/:id/commands`
- `POST /v1/sandboxes/:id/processes`
- `POST /v1/sandboxes/:id/network/expose`

## Request Shape For Create

```json
{
  "lifetime": "15m",
  "substrate": "firecracker",
  "vm": {
    "vcpuCount": 2,
    "memoryMib": 2048,
    "kernelImage": "/var/lib/firecracker/vmlinux",
    "rootfsImage": "/var/lib/firecracker/rootfs.ext4",
    "snapshotId": "optional-warm-snapshot",
    "networkPolicy": "default-deny"
  }
}
```

## Current Runtime Status

- `apps/firecracker-sandbox` now launches a real Firecracker process and boots a microVM.
- It clones the configured base rootfs into a per-sandbox writable disk under its runtime directory.
- The control plane still does not have guest file/exec/process support; those endpoints return `501` until a guest agent is added.

## Next Layer To Build

1. Add a guest agent transport for file IO and command execution inside the VM.
2. Add sandbox state persistence so chats can record backend type and VM metadata.
3. Add warm-pool and snapshot restore for lower startup latency.
4. Add network policy enforcement and usage accounting per tenant.
