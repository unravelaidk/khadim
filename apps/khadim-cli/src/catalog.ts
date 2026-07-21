/**
 * @unravelai/khadim — catalog API.
 *
 * Calls the native khadim binary with --providers json / --models <provider>
 * to discover available providers and models.
 */

import { spawn } from "node:child_process";
import { resolveBinaryPath } from "./resolve-binary.js";

const MAX_STDERR_BYTES = 128 * 1024;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

export interface ProviderInfo {
  id: string;
  name: string;
}

export interface ModelInfo {
  id: string;
  name: string;
}

async function spawnAndReadJson(args: string[]): Promise<any> {
  const binaryPath = await resolveBinaryPath();
  const child = spawn(binaryPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stdout = Buffer.alloc(0);
  let stdoutTooLarge = false;
  let stderr = Buffer.alloc(0);
  let stderrTruncated = false;

  child.stdout!.on("data", (chunk: Buffer) => {
    if (stdoutTooLarge) return;
    if (stdout.length + chunk.length > MAX_STDOUT_BYTES) {
      stdoutTooLarge = true;
      child.kill();
      return;
    }
    stdout = Buffer.concat([stdout, chunk], stdout.length + chunk.length);
  });
  child.stderr!.on("data", (chunk: Buffer) => {
    if (chunk.length >= MAX_STDERR_BYTES) {
      stderr = Buffer.from(chunk.subarray(chunk.length - MAX_STDERR_BYTES));
      stderrTruncated = true;
      return;
    }
    const combined = Buffer.concat([stderr, chunk], stderr.length + chunk.length);
    if (combined.length > MAX_STDERR_BYTES) {
      stderr = Buffer.from(combined.subarray(combined.length - MAX_STDERR_BYTES));
      stderrTruncated = true;
    } else {
      stderr = combined;
    }
  });

  return new Promise<any>((resolve, reject) => {
    child.on("close", (code) => {
      if (stdoutTooLarge) {
        reject(new Error(`khadim catalog output exceeded ${MAX_STDOUT_BYTES} bytes`));
        return;
      }
      if (code !== 0) {
        const stderrText = stderr.toString("utf8").trim();
        const detail = stderrTruncated
          ? `[stderr truncated to final ${MAX_STDERR_BYTES} bytes]${stderrText ? `\n${stderrText}` : ""}`
          : stderrText;
        reject(new Error(`khadim exited with code ${code}${detail ? `: ${detail}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.toString("utf8").trim()));
      } catch {
        reject(new Error(`Failed to parse khadim output: ${stdout.toString("utf8", 0, 200)}`));
      }
    });
    child.on("error", reject);
  });
}

/** Return all available providers from the khadim binary. */
export async function getProviders(): Promise<ProviderInfo[]> {
  return spawnAndReadJson(["--providers", "json"]);
}

/** Return all models for a given provider. */
export async function getModels(provider: string): Promise<ModelInfo[]> {
  return spawnAndReadJson(["--models", provider]);
}
