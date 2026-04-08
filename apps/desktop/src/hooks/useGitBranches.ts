import { useMemo } from "react";
import { useGitBranchesQuery } from "../lib/queries";

export function useGitBranches(repoPath: string | null, enabled = true) {
  const { data: branches = [], isLoading, isFetching } = useGitBranchesQuery(repoPath, enabled);

  const localBranches = useMemo(
    () => branches.filter((branch) => !branch.is_remote),
    [branches],
  );

  return { branches, localBranches, loading: isLoading || isFetching };
}
