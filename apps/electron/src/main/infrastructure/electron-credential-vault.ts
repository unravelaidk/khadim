import { safeStorage } from "electron";
import { canPersistCredentialsSecurely } from "../domain/credential-policy";
import type { CredentialVault } from "../domain/configuration";

export class ElectronCredentialVault implements CredentialVault {
  available(): boolean {
    return canPersistCredentialsSecurely(
      process.platform,
      safeStorage.isEncryptionAvailable(),
      process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : undefined,
    );
  }

  encrypt(value: string): string {
    if (!this.available()) throw new Error("Secure OS credential storage is unavailable on this system.");
    return safeStorage.encryptString(value).toString("base64");
  }

  decrypt(value: string): string | undefined {
    if (!this.available()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    } catch {
      return undefined;
    }
  }
}
