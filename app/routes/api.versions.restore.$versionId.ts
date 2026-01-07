import type { ActionFunctionArgs } from "react-router";
import { restoreVersion, getVersion } from "../lib/versions";

// POST /api/versions/restore/:versionId - Restore a specific version
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { versionId } = params;

  if (!versionId) {
    return Response.json({ error: "Version ID required" }, { status: 400 });
  }

  try {
    // First get the version to include in response
    const version = await getVersion(versionId);
    if (!version) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    const result = await restoreVersion(versionId);

    if (!result.success) {
      return Response.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      restoredCount: result.restoredCount,
      chatId: version.chatId,
      label: version.label
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Failed to restore version"
    }, { status: 500 });
  }
}
