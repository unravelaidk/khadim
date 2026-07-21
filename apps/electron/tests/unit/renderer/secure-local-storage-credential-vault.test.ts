import { describe, expect, it } from "vitest";
import { BrowserEncryptedCredentialBlobStore, SecureLocalStorageCredentialVault, type EncryptedCredentialBlobStore, type SecureLocalStorageLike, type SecureView } from "../../../src/renderer/src/runtime/secure-local-storage-credential-vault";

class MemoryBlobStore implements EncryptedCredentialBlobStore {
  value: string | null = null;
  revision: number | null = null;
  initialized = false;
  failWrites = false;
  failWriteAfterCommit = false;
  failClearAfterCommit = false;
  async read() { return !this.initialized || this.revision === null ? null : { value: this.value, revision: this.revision }; }
  async write(value: string, expectedRevision: number | null) {
    if (this.failWrites) throw new Error("disk full");
    if (expectedRevision !== this.revision) throw new Error("conflict");
    this.value = value;
    this.revision = (this.revision ?? 0) + 1;
    this.initialized = true;
    if (this.failWriteAfterCommit) throw new Error("connection reset");
    return this.revision;
  }
  async clear(expectedRevision: number | null) {
    if (expectedRevision !== this.revision) throw new Error("conflict");
    this.value = null;
    this.revision = (this.revision ?? 0) + 1;
    this.initialized = true;
    if (this.failClearAfterCommit) throw new Error("connection reset");
    return this.revision;
  }
}

class FakeSecureStorage implements SecureLocalStorageLike {
  data: Record<string, string> = {};
  master = false;
  locked = false;
  async importData(serialized: string) { this.data = JSON.parse(Buffer.from(serialized, "base64url").toString("utf8")); this.master = true; this.locked = true; return "masterPassword"; }
  async exportData() { return Buffer.from(JSON.stringify(this.data), "utf8").toString("base64url"); }
  async setMasterPassword() { this.master = true; }
  async rotateMasterPassword() {}
  async unlock() { this.locked = false; }
  lock() { this.locked = this.master; }
  isLocked() { return this.locked; }
  isUsingMasterPassword() { return this.master; }
  async getData<T extends Record<string, unknown>>() {
    return Object.assign({ ...this.data }, { clear() {} }) as SecureView<T>;
  }
  async setData<T extends Record<string, unknown>>(value: T) { this.data = structuredClone(value) as Record<string, string>; }
  async clear() { this.data = {}; this.master = false; this.locked = false; }
}

describe("secure-local-storage credential vault", () => {
  it("exports a stable encrypted bundle and restores it in a new browser origin", async () => {
    const blobs = new MemoryBlobStore();
    const first = new FakeSecureStorage();
    const vault = new SecureLocalStorageCredentialVault({ blobStore: blobs, createStorage: () => first });
    await vault.unlock("correct horse battery staple");
    await vault.set("model:one", "secret-key");
    vault.lock();

    const second = new FakeSecureStorage();
    const restored = new SecureLocalStorageCredentialVault({ blobStore: blobs, createStorage: () => second });
    await restored.unlock("correct horse battery staple");

    expect(await restored.get("model:one")).toBe("secret-key");
    expect(blobs.value).not.toContain("model:one");
  });

  it("rejects access while locked", async () => {
    const vault = new SecureLocalStorageCredentialVault({ blobStore: new MemoryBlobStore(), createStorage: () => new FakeSecureStorage() });
    await expect(vault.get("missing")).rejects.toThrow("locked");
    await expect(vault.unlock("short")).rejects.toThrow("12 characters");
  });

  it("serializes mutations and rolls browser state back when ciphertext persistence fails", async () => {
    const blobs = new MemoryBlobStore();
    const storage = new FakeSecureStorage();
    const vault = new SecureLocalStorageCredentialVault({ blobStore: blobs, createStorage: () => storage });
    await vault.unlock("correct horse battery staple");
    await Promise.all([vault.set("one", "first"), vault.set("two", "second")]);

    blobs.failWrites = true;
    await expect(vault.set("one", "uncommitted")).rejects.toThrow("disk full");

    expect(await vault.get("one")).toBe("first");
    expect(await vault.get("two")).toBe("second");
  });

  it("keeps a synchronous lock requested during unlock authoritative", async () => {
    const vault = new SecureLocalStorageCredentialVault({
      blobStore: new MemoryBlobStore(),
      createStorage: () => new FakeSecureStorage(),
    });
    const unlocking = vault.unlock("correct horse battery staple");
    vault.lock();
    await unlocking;

    expect(vault.isLocked()).toBe(true);
  });

  it("retains a tombstone revision so stale ciphertext cannot return after clear", async () => {
    const blobs = new MemoryBlobStore();
    const firstRevision = await blobs.write("ciphertext", null);
    const tombstoneRevision = await blobs.clear(firstRevision);

    expect(tombstoneRevision).toBeGreaterThan(firstRevision);
    await expect(blobs.write("stale-ciphertext", firstRevision)).rejects.toThrow("conflict");
    expect(await blobs.read()).toEqual({ value: null, revision: tombstoneRevision });
  });

  it("reconciles a clear whose committed response was lost", async () => {
    const blobs = new MemoryBlobStore();
    const vault = new SecureLocalStorageCredentialVault({ blobStore: blobs, createStorage: () => new FakeSecureStorage() });
    await vault.unlock("correct horse battery staple");
    await vault.set("model:one", "secret-key");
    blobs.failClearAfterCommit = true;

    await expect(vault.clear()).resolves.toBeUndefined();
    expect(vault.isLocked()).toBe(true);
    expect((await blobs.read())?.value).toBeNull();
  });

  it("reconciles a ciphertext write whose committed response was lost", async () => {
    const blobs = new MemoryBlobStore();
    const vault = new SecureLocalStorageCredentialVault({ blobStore: blobs, createStorage: () => new FakeSecureStorage() });
    await vault.unlock("correct horse battery staple");
    blobs.failWriteAfterCommit = true;

    await expect(vault.set("model:one", "secret-key")).resolves.toBeUndefined();
    expect(blobs.value).not.toBeNull();
  });

  it("reinitializes a locked local storage instance after a remote tombstone", async () => {
    const blobs = new MemoryBlobStore();
    const revision = await blobs.write("obsolete", null);
    await blobs.clear(revision);
    const storage = new FakeSecureStorage();
    storage.master = true;
    storage.locked = true;
    storage.data = { obsolete: "secret" };
    const vault = new SecureLocalStorageCredentialVault({ blobStore: blobs, createStorage: () => storage });

    await vault.unlock("correct horse battery staple");
    expect(await vault.get("obsolete")).toBeUndefined();
  });

  it("fails closed for malformed versioned browser envelopes", async () => {
    const values = new Map<string, string>([["vault", JSON.stringify({ value: "ciphertext", revision: -1 })]]);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    });

    await expect(new BrowserEncryptedCredentialBlobStore("vault").read()).rejects.toThrow("malformed versioned envelope");
  });

  it("refuses browser writes when Web Locks are unavailable", async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

    await expect(new BrowserEncryptedCredentialBlobStore("vault").write("ciphertext", null)).rejects.toThrow("Web Locks");
  });
});
