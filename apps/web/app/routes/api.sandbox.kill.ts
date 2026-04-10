import type { ActionFunctionArgs } from "react-router";
import { withSandboxProviderFallback } from "../agent/sandbox";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = await request.formData();
  const sandboxId = formData.get("sandboxId")?.toString();

  if (!sandboxId) {
    return new Response(JSON.stringify({ error: "sandboxId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const sandbox = await withSandboxProviderFallback((provider) => provider.connect({ id: sandboxId }));
    if (!sandbox.kill) {
      throw new Error("The selected sandbox backend does not support termination");
    }
    await sandbox.kill();

    return new Response(JSON.stringify({ success: true, message: "Sandbox terminated" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: true,
      message: "Sandbox already terminated or not found"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
