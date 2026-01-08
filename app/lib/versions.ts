import { db, artifacts, projects, projectVersions } from "./db";
import { eq } from "drizzle-orm";

export interface VersionSnapshot {
  id: string;
  chatId: string;
  messageId: string | null;
  label: string | null;
  artifacts: Array<{ filename: string; content: string }>;
  projectMeta: {
    projectType: string | null;
    projectName: string | null;
    devCommand: string | null;
    devPort: number | null;
    buildDir: string | null;
  } | null;
  createdAt: Date;
}

/**
 * Create a version snapshot of the current project state
 */
export async function createVersionSnapshot(
  chatId: string,
  label?: string,
  messageId?: string
): Promise<string | null> {
  try {
    // Get all current artifacts for this chat
    const allArtifacts = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.chatId, chatId));

    if (allArtifacts.length === 0) {
      console.log(`No artifacts to snapshot for chat ${chatId}`);
      return null;
    }

    // Get project metadata if exists
    const projectResult = await db
      .select()
      .from(projects)
      .where(eq(projects.chatId, chatId))
      .limit(1);
    
    const project = projectResult[0];

    // Create the snapshot
    const [snapshot] = await db.insert(projectVersions).values({
      chatId,
      messageId: messageId || null,
      label: label || `Snapshot at ${new Date().toLocaleString()}`,
      artifacts: allArtifacts.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
      projectMeta: project ? {
        projectType: project.projectType,
        projectName: project.projectName,
        devCommand: project.devCommand,
        devPort: project.devPort,
        buildDir: project.buildDir,
      } : null,
    }).returning();

    console.log(`Created version snapshot ${snapshot.id} for chat ${chatId} with ${allArtifacts.length} artifacts`);
    return snapshot.id;
  } catch (error) {
    console.error(`Failed to create version snapshot:`, error);
    return null;
  }
}

/**
 * List all versions for a chat
 */
export async function listVersions(chatId: string): Promise<VersionSnapshot[]> {
  const versions = await db
    .select()
    .from(projectVersions)
    .where(eq(projectVersions.chatId, chatId))
    .orderBy(projectVersions.createdAt);

  return versions.map(v => ({
    id: v.id,
    chatId: v.chatId,
    messageId: v.messageId,
    label: v.label,
    artifacts: (v.artifacts as Array<{ filename: string; content: string }>) || [],
    projectMeta: v.projectMeta as VersionSnapshot["projectMeta"],
    createdAt: v.createdAt,
  }));
}

/**
 * Get a specific version
 */
export async function getVersion(versionId: string): Promise<VersionSnapshot | null> {
  const [version] = await db
    .select()
    .from(projectVersions)
    .where(eq(projectVersions.id, versionId))
    .limit(1);

  if (!version) return null;

  return {
    id: version.id,
    chatId: version.chatId,
    messageId: version.messageId,
    label: version.label,
    artifacts: (version.artifacts as Array<{ filename: string; content: string }>) || [],
    projectMeta: version.projectMeta as VersionSnapshot["projectMeta"],
    createdAt: version.createdAt,
  };
}

/**
 * Restore a version - replaces all artifacts with the snapshot's artifacts
 */
export async function restoreVersion(versionId: string): Promise<{
  success: boolean;
  error?: string;
  restoredCount?: number;
}> {
  try {
    const version = await getVersion(versionId);
    if (!version) {
      return { success: false, error: "Version not found" };
    }

    const { chatId, artifacts: snapshotArtifacts, projectMeta } = version;

    // Delete all current artifacts for this chat
    await db.delete(artifacts).where(eq(artifacts.chatId, chatId));

    // Insert the snapshot's artifacts
    if (snapshotArtifacts.length > 0) {
      await db.insert(artifacts).values(
        snapshotArtifacts.map(a => ({
          chatId,
          filename: a.filename,
          content: a.content,
        }))
      );
    }

    // Restore project metadata if present
    if (projectMeta) {
      await db.insert(projects).values({
        chatId,
        projectType: projectMeta.projectType,
        projectName: projectMeta.projectName,
        devCommand: projectMeta.devCommand,
        devPort: projectMeta.devPort,
        buildDir: projectMeta.buildDir,
      }).onConflictDoUpdate({
        target: projects.chatId,
        set: {
          projectType: projectMeta.projectType,
          projectName: projectMeta.projectName,
          devCommand: projectMeta.devCommand,
          devPort: projectMeta.devPort,
          buildDir: projectMeta.buildDir,
          updatedAt: new Date(),
        }
      });
    }

    console.log(`Restored version ${versionId} for chat ${chatId} with ${snapshotArtifacts.length} artifacts`);
    return { success: true, restoredCount: snapshotArtifacts.length };
  } catch (error) {
    console.error(`Failed to restore version:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a specific version
 */
export async function deleteVersion(versionId: string): Promise<boolean> {
  try {
    await db.delete(projectVersions).where(eq(projectVersions.id, versionId));
    return true;
  } catch (error) {
    console.error(`Failed to delete version:`, error);
    return false;
  }
}
