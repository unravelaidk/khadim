import { describe, expect, it, vi } from "vitest";
import type { Project, ProjectAvailability } from "../../../src/shared/types";
import { createProjectActivationOperations, type TrackCriticalOperation } from "../../../src/main/project-activation";
import type { StoredSettings } from "../../../src/main/settings-persistence";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function project(id = "project-one"): Project {
  return {
    id,
    name: "Customer operations",
    rootPath: `/projects/${id}`,
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z",
    lastOpenedAt: "2026-07-14T10:00:00.000Z",
  };
}

function criticalTracker() {
  const pending = new Set<Promise<unknown>>();
  const track: TrackCriticalOperation = <T>(operation: () => Promise<T>) => {
    let tracked!: Promise<T>;
    tracked = operation().finally(() => pending.delete(tracked));
    pending.add(tracked);
    return tracked;
  };
  return { pending, track };
}

function deferredSettings(commit: Promise<void>) {
  let current: StoredSettings = {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    models: [{
      id: "model-one",
      name: "Model",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      isActive: true,
      isDefault: true,
    }],
    activeProjectId: "project-old",
    workspace: "/projects/project-old",
    harness: "assistant",
    theme: "dark",
  };
  const settings = {
    mutate: vi.fn(async (operation: (value: StoredSettings) => StoredSettings | Promise<StoredSettings>) => {
      const next = await operation(current);
      await commit;
      current = next;
      return current;
    }),
  };
  return { settings, snapshot: () => current };
}

describe("project activation operations", () => {
  it("keeps add critical through deferred folder validation and the full activation commit", async () => {
    const created = project();
    const validated = deferred<Project>();
    const settingsCommitted = deferred<void>();
    const settings = deferredSettings(settingsCommitted.promise);
    const { pending, track } = criticalTracker();
    const store = {
      addProject: vi.fn(() => validated.promise),
      checkProjectAvailability: vi.fn(async (): Promise<ProjectAvailability> => ({ project: created, available: true })),
      openProject: vi.fn(async () => created),
    };
    const operations = createProjectActivationOperations({
      store,
      settings: settings.settings,
      isQuitting: () => false,
      trackCriticalOperation: track,
    });

    const adding = operations.add(created.rootPath);
    expect(pending.size).toBe(1);
    expect(store.checkProjectAvailability).not.toHaveBeenCalled();

    validated.resolve(created);
    await vi.waitFor(() => expect(settings.settings.mutate).toHaveBeenCalled());
    expect(pending.size).toBe(1);
    expect(settings.snapshot().activeProjectId).toBe("project-old");

    settingsCommitted.resolve();
    await expect(adding).resolves.toEqual(created);
    expect(settings.snapshot()).toEqual(expect.objectContaining({
      activeProjectId: created.id,
      workspace: created.rootPath,
    }));
    expect(pending.size).toBe(0);
  });

  it("keeps open critical through availability and settings persistence", async () => {
    const opened = project();
    const availability = deferred<ProjectAvailability>();
    const settingsCommitted = deferred<void>();
    const settings = deferredSettings(settingsCommitted.promise);
    const { pending, track } = criticalTracker();
    const store = {
      addProject: vi.fn(async () => opened),
      checkProjectAvailability: vi.fn(() => availability.promise),
      openProject: vi.fn(async () => opened),
    };
    const operations = createProjectActivationOperations({
      store,
      settings: settings.settings,
      isQuitting: () => false,
      trackCriticalOperation: track,
    });

    const opening = operations.open(opened.id);
    expect(pending.size).toBe(1);
    expect(store.openProject).not.toHaveBeenCalled();

    availability.resolve({ project: opened, available: true });
    await vi.waitFor(() => expect(store.openProject).toHaveBeenCalledWith(opened.id));
    expect(pending.size).toBe(1);

    settingsCommitted.resolve();
    await expect(opening).resolves.toEqual(opened);
    expect(pending.size).toBe(0);
  });

  it("rejects add and open requests once shutdown has started", async () => {
    const opened = project();
    const { pending, track } = criticalTracker();
    const store = {
      addProject: vi.fn(async () => opened),
      checkProjectAvailability: vi.fn(async (): Promise<ProjectAvailability> => ({ project: opened, available: true })),
      openProject: vi.fn(async () => opened),
    };
    const operations = createProjectActivationOperations({
      store,
      settings: deferredSettings(Promise.resolve()).settings,
      isQuitting: () => true,
      trackCriticalOperation: track,
    });

    await expect(operations.open(opened.id)).rejects.toThrow("cannot open a project");
    await expect(operations.add(opened.rootPath)).rejects.toThrow("cannot add a project");
    expect(store.checkProjectAvailability).not.toHaveBeenCalled();
    expect(store.addProject).not.toHaveBeenCalled();
    expect(pending.size).toBe(0);
  });
});
