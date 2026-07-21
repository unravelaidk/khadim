import type { Project } from "../../shared/types";
import type { ProjectDataRepository, SettingsRepository } from "../domain/repositories";
import { activateAvailableProject, type TrackCriticalOperation } from "./project-activation";

export interface ProjectRunState {
  hasActiveRun(projectId: string): boolean;
  terminalRunIds(projectId: string): string[];
  acknowledge(runId: string): void;
}

export interface ProjectServiceDependencies {
  projects: ProjectDataRepository;
  settings: SettingsRepository;
  runs: ProjectRunState;
  defaultProjectPath: () => string;
  isQuitting: () => boolean;
  trackCriticalOperation: TrackCriticalOperation;
}

export class ProjectService {
  private readonly mutating = new Set<string>();

  constructor(private readonly dependencies: ProjectServiceDependencies) {}

  isMutating(projectId: string): boolean {
    return this.mutating.has(projectId);
  }

  relocate(projectId: string, rootPath: string): Promise<Project> {
    return this.exclusive(projectId, "relocate", async () => {
      const project = await this.dependencies.projects.relocateProject(projectId, rootPath);
      let isActive = false;
      await this.dependencies.settings.mutate((settings) => {
        isActive = settings.activeProjectId === projectId;
        return isActive ? { ...settings, workspace: project.rootPath } : settings;
      });
      return isActive ? this.dependencies.projects.openProject(projectId) : project;
    });
  }

  remove(projectId: string): Promise<{ removedProjectId: string; activeProject: Project }> {
    return this.exclusive(projectId, "remove", async () => {
      const terminalRuns = this.dependencies.runs.terminalRunIds(projectId);
      await this.dependencies.projects.removeProject(projectId);
      terminalRuns.forEach((runId) => this.dependencies.runs.acknowledge(runId));
      const remaining = await this.dependencies.projects.listProjects();
      const availability = await Promise.all(remaining.map((project) => this.dependencies.projects.checkProjectAvailability(project.id)));
      const nextProject = availability.find((entry) => entry.available)?.project
        ?? await this.dependencies.projects.addProject(this.dependencies.defaultProjectPath());
      const activeProject = await activateAvailableProject(this.dependencies.projects, this.dependencies.settings, nextProject.id);
      return { removedProjectId: projectId, activeProject };
    });
  }

  private exclusive<T>(projectId: string, action: "relocate" | "remove", operation: () => Promise<T>): Promise<T> {
    return this.dependencies.trackCriticalOperation(async () => {
      if (this.dependencies.isQuitting()) throw new Error(`Khadim is shutting down and cannot ${action} a project.`);
      if (this.mutating.has(projectId)) throw new Error("This project is already being changed.");
      if (this.dependencies.runs.hasActiveRun(projectId)) {
        throw new Error(`Wait for this project's active run to finish before ${action === "remove" ? "removing" : "relocating"} it.`);
      }
      this.mutating.add(projectId);
      try {
        return await operation();
      } finally {
        this.mutating.delete(projectId);
      }
    });
  }
}
