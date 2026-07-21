import type { Artifact, Conversation, Project, SkillEntry } from "../../shared/types";
import type { StoredSettings } from "./settings";

export type ProjectAvailability =
  | { project: Project; available: true }
  | { project: Project; available: false; reason: "missing" | "not-directory" };

export interface ProjectRepository {
  listProjects(): Promise<Project[]>;
  addProject(rootPath: string, name?: string): Promise<Project>;
  migrateLegacyWorkspace(rootPath: string): Promise<Project>;
  openProject(projectId: string): Promise<Project>;
  getProject(projectId: string): Promise<Project>;
  renameProject(projectId: string, name: string): Promise<Project>;
  relocateProject(projectId: string, rootPath: string, name?: string): Promise<Project>;
  removeProject(projectId: string): Promise<Project>;
  checkProjectAvailability(projectId: string): Promise<ProjectAvailability>;
  flush(): Promise<void>;
}

export interface ConversationRepository {
  listConversations(projectId: string): Promise<Conversation[]>;
  saveConversation(conversation: Conversation): Promise<void>;
  removeConversation(projectId: string, conversationId: string): Promise<void>;
}

export interface ArtifactRepository {
  listArtifacts(projectId: string): Promise<Artifact[]>;
  saveArtifacts(projectId: string, artifacts: Artifact[]): Promise<void>;
}

export type ProjectDataRepository = ProjectRepository & ConversationRepository & ArtifactRepository;

export interface SettingsRepository {
  snapshot(): Promise<StoredSettings>;
  mutate(operation: (current: StoredSettings) => StoredSettings | Promise<StoredSettings>): Promise<StoredSettings>;
  flush(): Promise<void>;
}

export interface DocumentRepository<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
  flush(): Promise<void>;
}

export interface SkillRepository {
  discover(): Promise<SkillEntry[]>;
  setEnabled(skillId: string, enabled: boolean): Promise<void>;
  flush(): Promise<void>;
}
