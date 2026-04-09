# Desktop Sandbox Hardening Roadmap

## Context

Khadim desktop now has a local persistent sandbox mode for the native `khadim` backend:

- workspace execution target: `local` or `sandbox`
- persistent sandbox root per workspace
- first-use seeding from the selected working directory
- `.git/` excluded from the seed copy
- sandbox-rooted file tools
- restricted command execution in sandbox mode
- explicit file export back to the original workspace

This document compares that approach with the research system described by Cage and turns the gap into a practical hardening roadmap for Khadim.

## What Cage Is

Cage is a research toolchain for hardening WebAssembly guest memory safety.

It is based on:

- a custom LLVM fork
- a custom Wasmtime fork
- a custom wasm-tools fork
- Arm hardware features, especially:
  - MTE (Memory Tagging Extension)
  - PAC (Pointer Authentication)

Its main goal is to protect unsafe guest code such as C/C++ compiled to Wasm.

## What Cage Solves

Cage improves the safety of code _inside_ a Wasm guest.

Specifically, it targets:

- spatial memory bugs
- temporal memory bugs
- function pointer / leaked pointer reuse
- better sandboxing performance on supported Arm hardware

## What Khadim Needs

Khadim's desktop sandbox has a different threat model.

The main risks are:

- unrestricted host command execution
- filesystem escape from the intended workspace boundary
- overly broad inherited environment variables and credentials
- confusing or silent movement of files between sandbox and source workspace
- lack of auditability for sandbox actions
- persistence behavior that could leak or mix state unexpectedly

This means our most important controls are around host capabilities, process execution, filesystem boundaries, and visibility to the user.

## Key Difference

The most important distinction is:

- Cage hardens guest memory safety
- Khadim must harden host interaction safety

Those are related, but not interchangeable.

For Khadim, improving the wrong layer first would add complexity without materially reducing the most likely risks.

## Current Khadim Security Posture

Current sandbox mode already improves on direct mode by:

- separating working files into a persistent copied sandbox root
- excluding `.git/` from seed copy
- avoiding shell-based execution in sandbox mode
- requiring explicit export back to the original workspace
- restricting sandbox command execution to direct approved executables or local `./script` paths

Current limitations:

- sandboxed commands still run as host processes
- there is no OS-level isolation boundary yet
- network access is not yet explicitly restricted
- filesystem access outside the sandbox relies on command policy rather than kernel enforcement
- there is no structured audit trail yet
- there is no approval surface for risky sandbox exports or command classes

## Threat Model

### In scope

- accidental damage to the real workspace while the user expected isolation
- agents executing risky package manager or build commands against the host environment
- command chains attempting to escape sandbox intent
- leakage of host credentials via inherited env or implicit config files
- untracked file movement from sandbox back to workspace
- persistence confusion across reopen/restart

### Out of scope for the first stages

- hostile Wasm JIT/runtime memory exploitation
- hardware-backed isolation primitives
- cross-VM or hypervisor-grade isolation
- defending against a fully compromised local user account

## Hardening Roadmap

### Phase 1: Make policy explicit

Goal: remove ambiguity from what sandbox mode is allowed to do.

Actions:

- define a formal `SandboxPolicy` type in Rust
- separate policy dimensions:
  - executable allowlist
  - local-script allowance
  - outbound network policy
  - env allowlist
  - max execution time
  - max output size
  - export permission policy
- persist the effective policy with workspace sandbox metadata
- expose the active policy in the desktop UI

Why this matters:

- current behavior is partly encoded in implementation details
- policy should become inspectable, testable, and versioned

### Phase 2: Shrink host ambient authority

Goal: ensure sandboxed commands inherit as little host power as possible.

Actions:

- keep `env_clear()` as the baseline
- add an explicit env allowlist instead of restoring broad host state
- isolate tool caches more aggressively inside sandbox-owned directories
- set deterministic `HOME`, `TMPDIR`, XDG, language tool cache dirs
- avoid passing through credentials by default:
  - `GITHUB_TOKEN`
  - `OPENAI_API_KEY`
  - SSH agent variables
  - cloud credentials
- add optional per-workspace credential grants later, behind approval

Why this matters:

- most real-world sandbox failures are capability leaks, not parser bugs

### Phase 3: Add structured command classes

Goal: move from a flat executable allowlist to behavior-aware command policy.

Actions:

- classify commands:
  - read-only repo inspection
  - build/test
  - package install
  - code generation
  - networked fetch/install
- require different approval or policy levels per class
- mark especially risky commands separately:
  - package managers with install/mutate behavior
  - arbitrary interpreters with inline code execution
  - tools that can spawn nested shells

Why this matters:

- `npm` and `git status` should not be treated as equally risky

### Phase 4: Add audit logging

Goal: make sandbox activity inspectable after the fact.

Actions:

- persist a sandbox event log per workspace/session
- log:
  - command executed
  - args
  - cwd
  - execution target
  - exit status
  - exported files
  - seed source and seed time
  - policy decisions / denials
- show a lightweight audit view in desktop UI

Why this matters:

- this is the operational equivalent of Cage's emphasis on explicit security properties
- users need to understand what happened in sandbox mode

### Phase 5: Add network control

Goal: make network behavior an explicit part of sandbox mode.

Actions:

- define workspace-level network modes:
  - `deny`
  - `allow_common_dev_tools`
  - `allow_all`
- enforce policy in command admission first
- later, add OS-level network restriction where feasible per platform
- surface network mode in the workspace UI

Why this matters:

- package installation and remote fetches are the highest-risk practical sandbox actions

### Phase 6: Add file export controls

Goal: ensure sandbox-to-workspace handoff is explicit and observable.

Actions:

- require export paths to remain relative and normalized
- add optional confirmation for broad exports (directory or overwrite-heavy)
- log every export
- support dry-run export previews showing affected paths
- add an "export manifest" for multi-file handoff

Why this matters:

- export is the intentional boundary crossing point in Khadim's sandbox model
- it deserves first-class controls

### Phase 7: Introduce OS-level isolation where practical

Goal: reduce reliance on policy-only controls.

Actions:

- Linux:
  - investigate namespaces, seccomp, landlock, bubblewrap-style process isolation
- macOS:
  - investigate `sandbox-exec` alternatives, Seatbelt profiles, app-scoped process strategies
- Windows:
  - investigate Job Objects, low integrity/AppContainer-style constraints where practical
- keep a portable policy layer above OS-specific enforcement

Why this matters:

- this is the biggest real step toward stronger isolation for host processes
- it aligns with Khadim's needs more directly than adopting Cage wholesale

### Phase 8: Add guest-runtime execution for selected tools

Goal: move some sandboxed workloads from host processes into true guest runtimes.

Actions:

- identify tool classes that are good Wasm guests:
  - formatters
  - linters
  - analyzers
  - deterministic transformers
- use Wasmtime for those workloads with narrow hostcalls
- preserve the current persistent sandbox root as the external workspace model
- keep command execution and guest execution as separate lanes

Why this matters:

- this is the stage where ideas closer to Cage become more relevant
- once workloads are actual Wasm guests, memory-safety-oriented hardening matters more

### Phase 9: Evaluate Cage-style ideas only if the execution model changes

Goal: avoid overcommitting to research infrastructure too early.

Prerequisites before reconsidering Cage-like integration:

- Khadim is running meaningful untrusted Wasm guest workloads
- we need stronger guest memory safety for unsafe-language Wasm modules
- we are willing to maintain a forked runtime/toolchain or depend on a niche runtime stack
- we can constrain deployment to supported hardware/OS combinations

Only if those conditions become true should we evaluate:

- custom Wasmtime builds
- compiler instrumentation for guest modules
- hardware-assisted tagging and pointer authentication

## Recommended Next Steps

The highest-value near-term sequence is:

1. add `SandboxPolicy`
2. add command/audit logging
3. add network policy and env allowlisting
4. add export preview + confirmation for broad exports
5. add platform-specific OS isolation experiments

## Decision

Do not adopt Cage as the foundation for Khadim desktop sandboxing.

Reason:

- it solves a different layer of the problem
- it depends on specialized hardware and custom forks
- it does not address Khadim's main operational risks first

Do borrow Cage's broader lesson:

- sandboxing should be defense in depth
- runtime isolation alone is not the whole story
- security properties should be explicit, layered, and measurable
