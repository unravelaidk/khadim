import { loadEnv } from "../load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

loadEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Load the repo .env before starting @khadim/web.");
}

const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

export { chats, messages, uploadedDocuments, artifacts, projects, projectVersions, modelConfigs, workspaces, workspaceFiles } from "./schema";
export type { 
  Workspace, NewWorkspace,
  WorkspaceFile, NewWorkspaceFile,
  Chat, NewChat, 
  Message, NewMessage, 
  UploadedDocument, NewUploadedDocument,
  Artifact, NewArtifact,
  Project, NewProject,
  ProjectVersion, NewProjectVersion,
  ModelConfig, NewModelConfig
} from "./schema";
