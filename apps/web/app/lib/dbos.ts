/**
 * DBOS durable execution for Khadim cloud agent sessions.
 *
 * CRITICAL: DBOS modules must NOT be loaded through Vite's SSR pipeline.
 * They're imported dynamically via `dbos-rpc.ts` to avoid double-registration.
 */

import { DBOS } from "@dbos-inc/dbos-sdk";

let launched = false;

export async function initDbos(): Promise<void> {
  if (launched) return;

  const dbUrl = process.env.DBOS_SYSTEM_DATABASE_URL || process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn("[DBOS] No DBOS_SYSTEM_DATABASE_URL set — skipping DBOS init");
    return;
  }

  DBOS.setConfig({
    name: "khadim-web",
    systemDatabaseUrl: dbUrl,
  });

  // Import workflows BEFORE launch so DBOS discovers the registration
  await import("../agent/dbos-workflows");

  await DBOS.launch();
  launched = true;
  console.log("[DBOS] Durable execution engine started");
}

export { DBOS };
