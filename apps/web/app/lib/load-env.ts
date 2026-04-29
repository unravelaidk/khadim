import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;

  const rootEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
  dotenv.config({ path: rootEnvPath });
  dotenv.config({ override: true });

  loaded = true;
}
