import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DocumentRepository } from "../domain/repositories";

export class JsonDocumentRepository<T> implements DocumentRepository<T> {
  #queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly fallback: () => T,
    private readonly normalize: (value: unknown) => T,
  ) {}

  async read(): Promise<T> {
    await this.#queue;
    try {
      const value = this.normalize(JSON.parse(await readFile(this.path, "utf8")) as unknown);
      await chmod(this.path, 0o600).catch(() => undefined);
      return value;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return this.fallback();
      if (cause instanceof SyntaxError) return this.fallback();
      throw cause;
    }
  }

  write(value: T): Promise<void> {
    const operation = this.#queue.then(() => this.#write(value), () => this.#write(value));
    this.#queue = operation.catch(() => undefined);
    return operation;
  }

  async flush(): Promise<void> {
    await this.#queue;
  }

  async #write(value: T): Promise<void> {
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.path), 0o700).catch(() => undefined);
    try {
      await writeFile(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.path);
      await chmod(this.path, 0o600).catch(() => undefined);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
