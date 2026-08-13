# Feature maturity and release controls

Khadim tracks application releases, feature maturity, and rollout controls as
separate concerns. The application version tells you which build is installed.
A feature label tells users how dependable that feature is. A feature flag lets
developers control whether code is reachable.

<!-- prettier-ignore -->
> [!NOTE]
> Agents and Studio are experimental features under active development. Both
> remain visible and available to every user: Agents is Alpha, and Studio is
> Beta.

## Current feature states

The renderer stores public maturity metadata in
`../src/renderer/src/feature-maturity.tsx`. Navigation and feature surfaces read
from this registry so labels and explanations don't drift.

| Feature | State | Availability | Meaning |
| --- | --- | --- | --- |
| Agents | Alpha | Public | Core workflows work, but setup, permissions, and run behavior can change. |
| Studio | Beta | Public | Regular use is appropriate, but some workflows and compatibility details can change. |

Alpha doesn't mean hidden. It communicates higher change risk. Beta doesn't
mean a separate application release. It communicates that the workflow is more
complete and tested, while preserving room for documented changes.

## Versioning model

Use the package version in `../package.json` for the Electron application's
release identity. Khadim currently uses a `0.y.z` version because the whole
application remains in initial development. Under
[Semantic Versioning 2.0.0](https://semver.org/), `0.y.z` releases can change
quickly, while `1.0.0` defines the first stable public contract.

Use these rules for package releases:

- Increment the patch version for compatible fixes that add no public
  functionality.
- Increment the minor version for new compatible functionality and substantial
  feature improvements during `0.y.z` development.
- Move to `1.0.0` when the supported application behavior and persisted-data
  compatibility policy are explicit enough for users to depend on.
- Use package prerelease identifiers such as `0.2.0-beta.1` only when the whole
  build is a prerelease. Don't encode one feature's maturity in the package
  version.

Feature maturity follows a separate progression:

`internal` -> `alpha` -> `beta` -> `stable`

- **Internal** means unfinished code isn't available in normal builds.
- **Alpha** means the feature can deliver value, but behavior and data contracts
  can change and known gaps remain.
- **Beta** means the main workflow is complete, tested, recoverable, and safe
  for regular use. Details can still change with migration guidance.
- **Stable** means compatibility, recovery, accessibility, and support
  expectations are part of the product contract.

This distinction follows the model used by
[Kubernetes feature gates](https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates),
which records feature stage and default availability separately from the
Kubernetes release number.

## When to hide a feature

Hide code only when exposing it would create a broken path, data risk, security
risk, or misleading promise. A public feature that works with known limitations
needs a maturity label, not an artificial opt-in switch.

Use a temporary development flag when one of these conditions applies:

- The entry point leads to an incomplete or non-functional workflow.
- The implementation can corrupt or strand persisted project data.
- The feature expands credential, filesystem, process, or network access before
  its security boundary is verified.
- A risky replacement needs a kill switch or incremental rollout.
- Maintainers need an internal-only integration path before public testing.

Don't add a flag only because a feature is Alpha or Beta. Agents and Studio are
therefore public and unflagged. Their labels set expectations without creating
two product configurations to maintain.

## Feature flag requirements

When a hidden feature becomes necessary, define one typed flag in a central
registry rather than scattering environment checks through components. The
flag record must include an owner, default state, creation date, removal
condition, and removal issue. Gate the feature at its navigation and action
boundary, and keep persisted-data readers tolerant of data created while the
flag was enabled.

Follow this lifecycle:

1. Add the flag disabled by default and test both states.
2. Enable it for development or a named test cohort.
3. Promote the feature to public Alpha or Beta when the full entry-to-recovery
   path works.
4. Remove the flag after the verification period instead of leaving a permanent
   branch in the product.

[GitLab's feature flag guidance](https://docs.gitlab.com/development/feature_flags/)
similarly treats work-in-progress flags as short-lived controls for unfinished
code and requires transition or cleanup after rollout. Feature flags can enable
or disable behavior without redeployment, but they add state combinations that
must be tested and removed.

## Graduation checks

A feature changes maturity only after its owner records evidence against the
following checks.

### Alpha to Beta

The main workflow must complete end to end, preserve saved data, recover from
expected failures, and have automated coverage for its critical path. The UI
must meet keyboard, focus, contrast, responsive-layout, and reduced-motion
requirements. Known limitations must be specific and must not include an
unbounded security or data-loss risk.

### Beta to stable

The persisted-data and public integration contracts must have a migration
policy. Telemetry or reproducible test evidence must show that failures are
understood. Documentation must cover normal use, recovery, and limitations.
The team must remove temporary rollout flags and commit to backward-compatible
behavior or an announced migration path.

## Research record

The raw web search captures are stored in
`../research/feature-maturity-strategy.json` and
`../research/feature-maturity-official-sources.json`. The primary references
used for this decision are Semantic Versioning, Kubernetes feature gates, and
GitLab's feature flag development guidance. No academic sources are relevant
because this is a software release and product-governance decision.
