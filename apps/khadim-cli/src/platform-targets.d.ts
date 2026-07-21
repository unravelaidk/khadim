export interface PlatformTarget {
  readonly tag: string;
  readonly alias: string;
  readonly target: string;
  readonly artifact: string;
  readonly artifact_file: string;
  readonly os: string;
  readonly cpu: string;
  readonly binary: string;
  readonly runner: string;
  readonly libc?: "glibc";
  readonly glibc_min?: string;
  readonly strip: boolean;
  readonly cache: boolean;
}

export const PLATFORM_TARGETS: Readonly<Record<string, PlatformTarget>>;

export function platformTarget(platform?: string, arch?: string): PlatformTarget;

export interface RuntimeCompatibilityOptions {
  readonly platform?: string;
  readonly glibcVersionRuntime?: string | null;
}

export function assertRuntimeCompatibility(
  target: PlatformTarget,
  options?: RuntimeCompatibilityOptions,
): PlatformTarget;
