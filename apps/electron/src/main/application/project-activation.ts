import type { Project } from "../../shared/types";
import type { ProjectRepository, SettingsRepository } from "../domain/repositories";

type ProjectActivationStore = Pick<ProjectRepository, "addProject" | "checkProjectAvailability" | "openProject">;
type ProjectActivationSettings = Pick<SettingsRepository, "mutate">;

export type TrackCriticalOperation = <T>(operation: () => Promise<T>) => Promise<T>;

interface ProjectActivationDependencies {
  store: ProjectActivationStore;
  settings: ProjectActivationSettings;
  isQuitting: () => boolean;
  trackCriticalOperation: TrackCriticalOperation;
}

export async function activateAvailableProject(
  store: ProjectActivationStore,
  settings: ProjectActivationSettings,
  projectId: string,
): Promise<Project> {
  const availability = await store.checkProjectAvailability(projectId);
  if (!availability.available) {
    throw new Error(availability.reason === "missing"
      ? "This project's folder is missing. Locate it from Projects before opening it."
      : "This project's path is no longer a folder. Locate it from Projects before opening it.");
  }
  const project = await store.openProject(projectId);
  await settings.mutate((current) => ({ ...current, activeProjectId: project.id, workspace: project.rootPath }));
  return project;
}

export function createProjectActivationOperations({ store, settings, isQuitting, trackCriticalOperation }: ProjectActivationDependencies) {
  const activate = (projectId: string) => activateAvailableProject(store, settings, projectId);
  return {
    add(rootPath: string): Promise<Project> {
      return trackCriticalOperation(async () => {
        if (isQuitting()) throw new Error("Khadim is shutting down and cannot add a project.");
        return activate((await store.addProject(rootPath)).id);
      });
    },
    open(projectId: string): Promise<Project> {
      return trackCriticalOperation(async () => {
        if (isQuitting()) throw new Error("Khadim is shutting down and cannot open a project.");
        return activate(projectId);
      });
    },
  };
}
