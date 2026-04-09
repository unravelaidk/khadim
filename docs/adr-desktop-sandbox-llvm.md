# ADR: Do Not Adopt LLVM/Cage as the Desktop Sandbox Foundation

## Status

Accepted

## Date

2026-04-09

## Context

Khadim desktop is adding a persistent local sandbox mode for the native `khadim` backend.

Current desktop sandbox goals are:

- optional per-workspace execution mode: `local` or `sandbox`
- persistent sandbox roots across session close/reopen
- seed sandbox contents from the selected working directory on first use
- keep sandbox file operations isolated from the original workspace
- allow explicit export of sandbox files back to the original workspace
- preserve a direct non-sandbox path for users who want full local agent behavior

During design, we reviewed Cage:

- paper: `Cage: Hardware-Accelerated Safe WebAssembly`
- meta repository: `TUM-DSE/cage-meta`

Cage is a research toolchain built around:

- a custom LLVM fork
- a custom Wasmtime fork
- custom wasm tooling
- Arm MTE and PAC hardware support

## Decision

Khadim will **not** adopt Cage or its LLVM fork as the foundation of the desktop sandbox.

Khadim will instead continue with a Khadim-specific sandbox architecture focused on:

- host capability restriction
- filesystem boundary control
- explicit command policy
- explicit sandbox-to-workspace export behavior
- auditability
- later OS-level isolation where practical

## Rationale

### 1. Cage solves a different layer of the problem

Cage primarily improves the memory safety of unsafe Wasm guest code.

Khadim's most important near-term sandbox risks are different:

- host command execution
- workspace escape
- inherited environment and credential leakage
- unclear file handoff between sandbox and workspace
- missing audit logs and user visibility

Improving guest memory safety first would not materially reduce the highest-risk behaviors in the current product.

### 2. The operational cost is too high

Adopting Cage implies a nontrivial maintenance commitment:

- custom compiler toolchain
- custom runtime stack
- specialized hardware assumptions
- more difficult cross-platform desktop distribution

That cost is not justified for the current sandbox scope.

### 3. Khadim needs cross-platform product controls first

The desktop sandbox needs to behave predictably on normal user machines.

That means prioritizing:

- portable policy enforcement
- stable persistence semantics
- explicit UX around direct vs sandboxed mode
- observable exports and command history

Those concerns are more central to the product than advanced Wasm guest hardening.

### 4. Cage is still useful as research input

We do want to borrow the right lesson from Cage:

- sandboxing should be defense in depth
- runtime isolation is not enough by itself
- security properties should be explicit and layered

But we will apply that lesson using a product-oriented architecture rather than adopting the full research stack.

## Consequences

### Positive

- lower implementation and maintenance cost
- better fit for current desktop sandbox requirements
- preserves cross-platform flexibility
- lets us harden the most important risks first

### Negative

- Khadim will not gain Cage's guest-memory-safety properties
- sandboxed commands still need additional hardening beyond current policy restrictions
- stronger isolation will need to come from layered product work rather than a single runtime/toolchain choice

## Follow-up Direction

The next hardening phases should focus on:

1. formal `SandboxPolicy`
2. audit logging for sandbox commands and exports
3. environment allowlisting and credential isolation
4. explicit network policy
5. export previews / confirmation for broad exports
6. OS-level isolation experiments per platform

## Revisit Conditions

This decision should be revisited only if Khadim later moves toward a meaningful Wasm guest execution model where:

- tools are increasingly run as Wasm guests rather than host processes
- unsafe-language Wasm modules become a real execution target
- stronger guest memory-safety guarantees become product-relevant
- the team is willing to carry a specialized toolchain/runtime burden

If those conditions become true, we can reevaluate:

- custom LLVM-based instrumentation
- custom Wasmtime builds
- Cage-style hardware-assisted guest hardening

## Related

- `docs/desktop-sandbox-hardening-roadmap.md`
