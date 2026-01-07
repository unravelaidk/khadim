import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { listVersions, createVersionSnapshot, deleteVersion } from "../lib/versions";

// GET /api/versions/:chatId - List all versions for a chat
export async function loader({ params }: LoaderFunctionArgs) {
  const { chatId } = params;

  if (!chatId) {
    return Response.json({ error: "Chat ID required" }, { status: 400 });
  }

  try {
    const versions = await listVersions(chatId);
    return Response.json({
      success: true,
      versions: versions.map(v => ({
        id: v.id,
        label: v.label,
        artifactCount: v.artifacts.length,
        projectType: v.projectMeta?.projectType || null,
        createdAt: v.createdAt.toISOString(),
      }))
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Failed to list versions"
    }, { status: 500 });
  }
}

// POST /api/versions/:chatId - Create a new version snapshot
// DELETE /api/versions/:chatId?versionId=xxx - Delete a specific version
export async function action({ request, params }: ActionFunctionArgs) {
  const { chatId } = params;

  if (!chatId) {
    return Response.json({ error: "Chat ID required" }, { status: 400 });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const label = formData.get("label")?.toString();
    const messageId = formData.get("messageId")?.toString();

    try {
      const versionId = await createVersionSnapshot(chatId, label, messageId);
      
      if (!versionId) {
        return Response.json({
          success: false,
          error: "No artifacts to snapshot"
        }, { status: 400 });
      }

      return Response.json({
        success: true,
        versionId
      });
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : "Failed to create snapshot"
      }, { status: 500 });
    }
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const versionId = url.searchParams.get("versionId");

    if (!versionId) {
      return Response.json({ error: "Version ID required" }, { status: 400 });
    }

    try {
      const deleted = await deleteVersion(versionId);
      return Response.json({ success: deleted });
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : "Failed to delete version"
      }, { status: 500 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
