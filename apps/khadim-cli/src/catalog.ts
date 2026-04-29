/**
 * @unravelai/khadim — catalog API.
 *
 * Calls the native khadim binary with --providers json / --models <provider>
 * to discover available providers and models.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolveBinaryPath } from "./resolve-binary";

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

  let stdout = "";
  let stderr = "";

  child.stdout!.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  return new Promise<any>((resolve, reject) => {
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`khadim exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Failed to parse khadim output: ${stdout.slice(0, 200)}`));
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
