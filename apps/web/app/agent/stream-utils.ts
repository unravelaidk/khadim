import { registerJobAbortController, unregisterJobAbortController } from "../lib/job-cancel";
import { runAgentJob, type JobRunnerOptions } from "./job-runner";

export function startJob(jobId: string, runnerOptions: JobRunnerOptions): void {
  const jobAbortController = new AbortController();
  registerJobAbortController(jobId, jobAbortController);

  const optionsWithSignal = { ...runnerOptions, abortSignal: jobAbortController.signal };

  runAgentJob(optionsWithSignal)
    .catch((error) => {
      console.error("[Stream] Background agent error:", error);
    })
    .finally(() => {
      unregisterJobAbortController(jobId);
    });
}
