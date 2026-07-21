import secureLocalStorage from '@mqxym/secure-local-storage'

export interface EncryptedCredentialBlobStore {
  read(): Promise<EncryptedCredentialBlob | null>
  write(value: string, expectedRevision: number | null): Promise<number>
  clear(expectedRevision: number | null): Promise<number>
}

export interface EncryptedCredentialBlob { value: string | null; revision: number }

export class CredentialVaultConflictError extends Error {
  constructor() { super('The credential vault changed in another window. Lock and unlock it before retrying.') }
}

export type SecureView<T extends Record<string, unknown>> = Readonly<T> & { clear(): void }

export interface SecureLocalStorageLike {
  importData(serialized: string, password?: string): Promise<string>
  exportData(customExportPassword?: string): Promise<string>
  setMasterPassword(password: string): Promise<void>
  rotateMasterPassword(oldPassword: string, newPassword: string): Promise<void>
  unlock(password: string): Promise<void>
  lock(): void
  isLocked(): boolean
  isUsingMasterPassword(): boolean
  getData<T extends Record<string, unknown>>(): Promise<SecureView<T>>
  setData<T extends Record<string, unknown>>(value: T): Promise<void>
  clear(): Promise<void>
}

export interface SecureCredentialVaultOptions {
  blobStore: EncryptedCredentialBlobStore
  storageKey?: string
  createStorage?: (storageKey: string) => SecureLocalStorageLike
}

/** A serialized, password-protected credential vault that persists ciphertext only. */
export class SecureLocalStorageCredentialVault {
  private readonly storage: SecureLocalStorageLike
  private unlocked = false
  private operations: Promise<unknown> = Promise.resolve()
  private lockGeneration = 0
  private revision: number | null = null

  constructor(private readonly options: SecureCredentialVaultOptions) {
    const storageKey = options.storageKey ?? 'khadim:credentials:v1'
    this.storage = options.createStorage?.(storageKey) ?? secureLocalStorage({
      storageKey,
      idbConfig: { dbName: 'KHADIM_CREDENTIAL_KEYS', storeName: 'keys', keyId: 'credentials-v1' },
    })
  }

  unlock(masterPassword: string): Promise<void> {
    const generation = this.lockGeneration
    return this.enqueue(async () => {
      this.validatePassword(masterPassword)
      const portable = await this.options.blobStore.read()
      this.revision = portable?.revision ?? null
      if (portable?.value) {
        await this.storage.importData(portable.value, masterPassword)
        await this.storage.unlock(masterPassword)
      } else {
        // A different tab may have cleared the durable vault while this local
        // secure-storage instance still holds a locked master-password state.
        await this.storage.clear()
        await this.storage.setData({})
        if (!this.storage.isUsingMasterPassword()) await this.storage.setMasterPassword(masterPassword)
        await this.persist()
      }
      if (generation !== this.lockGeneration) {
        this.storage.lock()
        this.unlocked = false
        return
      }
      this.unlocked = true
    })
  }

  lock(): void {
    this.lockGeneration += 1
    this.storage.lock()
    this.unlocked = false
  }

  isLocked(): boolean {
    return !this.unlocked || this.storage.isLocked()
  }

  get(name: string): Promise<string | undefined> {
    return this.enqueue(async () => {
      this.requireUnlocked()
      const view = await this.storage.getData<Record<string, string>>()
      try { return typeof view[name] === 'string' ? view[name] : undefined } finally { view.clear() }
    })
  }

  set(name: string, value: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireUnlocked()
      if (!name.trim() || !value) throw new Error('Credential name and value are required.')
      const before = await this.snapshot()
      await this.storage.setData({ ...before, [name]: value })
      try { await this.persist() } catch (error) {
        await this.storage.setData(before)
        throw error
      }
    })
  }

  delete(name: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireUnlocked()
      const before = await this.snapshot()
      const after = { ...before }
      delete after[name]
      await this.storage.setData(after)
      try { await this.persist() } catch (error) {
        await this.storage.setData(before)
        throw error
      }
    })
  }

  rotateMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireUnlocked()
      this.validatePassword(newPassword)
      await this.storage.rotateMasterPassword(oldPassword, newPassword)
      try { await this.persist() } catch (error) {
        await this.storage.rotateMasterPassword(newPassword, oldPassword)
        throw error
      }
    })
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      // Clear durable ciphertext first so a local failure cannot leave recoverable remote secrets.
      const expectedRevision = this.revision
      try {
        this.revision = await this.options.blobStore.clear(expectedRevision)
      } catch (error) {
        // Treat a lost response as committed only when the durable value is a
        // newer tombstone. A stale writer can never revive a cleared revision.
        try {
          const durable = await this.options.blobStore.read()
          if (durable?.value === null && durable.revision > (expectedRevision ?? -1)) {
            this.revision = durable.revision
          } else {
            throw error
          }
        } catch {
          throw error
        }
      }
      await this.storage.clear()
      this.unlocked = false
    })
  }

  private async snapshot(): Promise<Record<string, string>> {
    const view = await this.storage.getData<Record<string, string>>()
    try { return JSON.parse(JSON.stringify(view)) as Record<string, string> } finally { view.clear() }
  }

  private async persist(): Promise<void> {
    const value = await this.storage.exportData()
    try {
      this.revision = await this.options.blobStore.write(value, this.revision)
    } catch (error) {
      // A response can be lost after the durable write commits. Reconcile the
      // intended ciphertext before rolling browser state back.
      try {
        const durable = await this.options.blobStore.read()
        if (durable?.value === value) {
          this.revision = durable.revision
          return
        }
      } catch { /* Preserve the original write failure. */ }
      throw error
    }
  }

  private requireUnlocked(): void {
    if (this.isLocked()) throw new Error('The credential vault is locked.')
  }

  private validatePassword(value: string): void {
    if (typeof value !== 'string' || value.trim().length < 12) {
      throw new Error('Use a master password with at least 12 characters.')
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation)
    this.operations = result.then(() => undefined, () => undefined)
    return result
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class HttpEncryptedCredentialBlobStore implements EncryptedCredentialBlobStore {
  constructor(private readonly baseUrl = '', private readonly fetcher: Fetcher = fetch) {}

  async read(): Promise<EncryptedCredentialBlob | null> {
    const response = await this.fetcher(`${this.baseUrl}/api/runtime/credential-vault`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Credential vault could not be loaded (${response.status}).`)
    const body = await response.json() as { value?: unknown; revision?: unknown }
    if ((typeof body.value !== 'string' && body.value !== null) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) {
      throw new Error('Credential vault returned invalid ciphertext.')
    }
    return { value: body.value, revision: Number(body.revision) }
  }

  async write(value: string, expectedRevision: number | null): Promise<number> {
    const response = await this.fetcher(`${this.baseUrl}/api/runtime/credential-vault`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, expectedRevision }),
    })
    if (response.status === 409) throw new CredentialVaultConflictError()
    if (!response.ok) throw new Error(`Credential vault could not be saved (${response.status}).`)
    const body = await response.json() as { revision?: unknown }
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('Credential vault returned an invalid revision.')
    return Number(body.revision)
  }

  async clear(expectedRevision: number | null): Promise<number> {
    const response = await this.fetcher(`${this.baseUrl}/api/runtime/credential-vault`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    })
    if (response.status === 409) throw new CredentialVaultConflictError()
    if (!response.ok && response.status !== 404) {
      throw new Error(`Credential vault could not be cleared (${response.status}).`)
    }
    if (response.status === 404) {
      if (expectedRevision !== null) throw new Error('Credential vault disappeared while it was being cleared.')
      return 0
    }
    const body = await response.json() as { revision?: unknown }
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('Credential vault returned an invalid revision.')
    return Number(body.revision)
  }
}

export class BrowserEncryptedCredentialBlobStore implements EncryptedCredentialBlobStore {
  constructor(private readonly storageKey = 'khadim:credential-ciphertext:v1') {}
  async read(): Promise<EncryptedCredentialBlob | null> {
    return this.readUnlocked()
  }
  async write(value: string, expectedRevision: number | null): Promise<number> {
    return this.withWriteLock(async () => {
      const current = this.readUnlocked()
      if ((current?.revision ?? null) !== expectedRevision) throw new CredentialVaultConflictError()
      const revision = (current?.revision ?? 0) + 1
      localStorage.setItem(this.storageKey, JSON.stringify({ value, revision }))
      return revision
    })
  }
  async clear(expectedRevision: number | null): Promise<number> {
    return this.withWriteLock(async () => {
      const current = this.readUnlocked()
      if ((current?.revision ?? null) !== expectedRevision) throw new CredentialVaultConflictError()
      const revision = (current?.revision ?? 0) + 1
      localStorage.setItem(this.storageKey, JSON.stringify({ value: null, revision }))
      return revision
    })
  }

  private readUnlocked(): EncryptedCredentialBlob | null {
    const stored = localStorage.getItem(this.storageKey)
    if (!stored) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(stored)
    } catch { return { value: stored, revision: 0 } }
    if (parsed && typeof parsed === 'object') {
      const envelope = parsed as Partial<EncryptedCredentialBlob>
      if ((typeof envelope.value === 'string' || envelope.value === null)
        && Number.isSafeInteger(envelope.revision) && Number(envelope.revision) >= 0) {
        return { value: envelope.value, revision: Number(envelope.revision) }
      }
      if ('value' in envelope || 'revision' in envelope) {
        throw new Error('Credential vault contains a malformed versioned envelope.')
      }
    }
    // Migrate an original unversioned encrypted export, including JSON exports.
    return { value: stored, revision: 0 }
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const locks = navigator.locks
    if (!locks) {
      throw new Error('This browser cannot safely coordinate credential-vault writes because Web Locks are unavailable.')
    }
    return await locks.request(`khadim:credential-vault:${this.storageKey}`, { mode: 'exclusive' }, operation)
  }
}
