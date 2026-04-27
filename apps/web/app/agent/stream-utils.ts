import { registerJobAbortController, unregisterJobAbortController } from "../lib/job-cancel";
import { runAgentJob, type RunAgentJobOptions } from "./run-agent-job";

export function startJob(jobId: string, runnerOptions: RunAgentJobOptions): void {
  const jobAbortController = new AbortController();
  registerJobAbortController(jobId, jobAbortController);

  const optionsWithSignal: RunAgentJobOptions = { ...runnerOptions, abortSignal: jobAbortController.signal };

  runAgentJob(optionsWithSignal)
    .catch((error) => {
      console.error("[Stream] Background agent error:", error);
    })
    .finally(() => {
      unregisterJobAbortController(jobId);
    });
}
