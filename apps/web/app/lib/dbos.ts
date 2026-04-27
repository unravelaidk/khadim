/**
 * DBOS initialization for Khadim cloud agent execution.
 *
 * DBOS provides durable workflows — agent sessions survive crashes,
 * resume from the last completed turn, and are observable via the
 * DBOS Conductor dashboard (optional).
 *
 * DBOS discovers workflows at launch. The workflow module
 * is imported here to register them before DBOS.launch().
 */

import { DBOS } from "@dbos-inc/dbos-sdk";
import "../agent/dbos-workflows";

let launched = false;

export async function initDbos(): Promise<void> {
  if (launched) return;
  await DBOS.launch();
  launched = true;
  console.log("[DBOS] Durable execution engine started");
}

export { DBOS };
