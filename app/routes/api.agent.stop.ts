import { type ActionFunctionArgs } from "react-router";
import { cancelJob, getJob, getJobByChatId } from "../lib/job-manager";
import { abortJob } from "../lib/job-cancel";

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

  let job = null;
  if (jobId) {
    job = await getJob(jobId);
  } else if (chatId) {
    job = await getJobByChatId(chatId);
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
