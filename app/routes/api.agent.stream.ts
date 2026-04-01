import type { LoaderFunctionArgs } from "react-router";
import { createSessionStream } from "../agent/stream-utils";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();

  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  return createSessionStream(sessionId, request);
}
