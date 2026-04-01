import { type ActionFunctionArgs } from "react-router";
import { cancelJob, getJob } from "../lib/job-manager";
import { abortJob } from "../lib/job-cancel";

function isJobVisibleToSession(
  job: { chatId: string; sessionId: string },
  chatId?: string | null,
  sessionId?: string
) {
  if (chatId && job.chatId !== chatId) return false;
  if (sessionId && job.sessionId !== sessionId) return false;
  return true;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = await request.formData();
  const jobId = formData.get("jobId")?.toString() || null;
  const chatId = formData.get("chatId")?.toString() || null;
  const sessionId = formData.get("sessionId")?.toString() || undefined;

  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let job = await getJob(jobId);

  if (job && !isJobVisibleToSession(job, chatId, sessionId)) {
    job = null;
  }

  if (!job) {
    return new Response(JSON.stringify({ error: "No active job found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  abortJob(job.id);
  await cancelJob(job.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
