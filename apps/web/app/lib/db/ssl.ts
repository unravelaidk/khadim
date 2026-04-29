import type { ConnectionOptions } from "node:tls";

export type DatabaseSslConfig = false | ConnectionOptions | undefined;

export function getDatabaseSslConfig(connectionString: string | undefined): DatabaseSslConfig {
  const sslMode = getSslMode(connectionString);

  if (sslMode === "disable") {
    return false;
  }

  // pg treats sslmode=no-verify this way, but postgres.js does not.
  if (sslMode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

function getSslMode(connectionString: string | undefined): string | undefined {
  try {
    return connectionString ? new URL(connectionString).searchParams.get("sslmode") ?? undefined : undefined;
  } catch {
    return undefined;
  }
}
