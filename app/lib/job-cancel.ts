const jobAbortControllers = new Map<string, AbortController>();

export function registerJobAbortController(jobId: string, controller: AbortController) {
  jobAbortControllers.set(jobId, controller);
}

export function unregisterJobAbortController(jobId: string) {
  jobAbortControllers.delete(jobId);
}

export function abortJob(jobId: string): boolean {
  const controller = jobAbortControllers.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}
