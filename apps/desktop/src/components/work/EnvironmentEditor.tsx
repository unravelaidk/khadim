import React, { useState, useCallback } from "react";
import type { Environment, Credential } from "../../lib/types";
import { getErrorMessage } from "../../lib/streaming";

/* ─── Environment Editor ───────────────────────────────────────────── */

export interface EnvironmentEditorData {
  name: string;
  description: string;
  runnerType: "local" | "docker" | "cloud";
  dockerImage: string;
  workingDir: string;
  variables: Record<string, string>;
  credentialIds: string[];
  isDefault: boolean;
}

interface EnvironmentEditorProps {
  environment: Environment | null;
  availableCredentials: Credential[];
  onSave: (data: EnvironmentEditorData) => Promise<void> | void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function EnvironmentEditor({
  environment,
  availableCredentials,
  onSave,
  onCancel,
  onDelete,
}: EnvironmentEditorProps) {
  const [name, setName] = useState(environment?.name ?? "");
  const [description, setDescription] = useState(environment?.description ?? "");
  const [runnerType, setRunnerType] = useState<"local" | "docker" | "cloud">(environment?.runnerType ?? "local");
  const [dockerImage, setDockerImage] = useState(environment?.dockerImage ?? "debian:bookworm-slim");
  const [workingDir, setWorkingDir] = useState(environment?.workingDir ?? "");
  const [vars, setVars] = useState<[string, string][]>(
    environment ? Object.entries(environment.variables) : []
  );
  const [selectedCreds, setSelectedCreds] = useState<Set<string>>(
    new Set(environment?.credentialIds ?? [])
  );
  const [isDefault, setIsDefault] = useState(environment?.isDefault ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const addVar = useCallback(() => {
    setVars((prev) => [...prev, ["", ""]]);
  }, []);

  const removeVar = useCallback((index: number) => {
    setVars((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateVar = useCallback((index: number, field: 0 | 1, value: string) => {
    setVars((prev) => prev.map((pair, i) => {
      if (i !== index) return pair;
      const next: [string, string] = [...pair];
      next[field] = value;
      return next;
    }));
  }, []);

  const toggleCred = useCallback((id: string) => {
    setSelectedCreds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    const variables: Record<string, string> = {};
    for (const [k, v] of vars) {
      const key = k.trim();
      if (key) variables[key] = v;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        runnerType,
        dockerImage: dockerImage.trim(),
        workingDir: workingDir.trim(),
        variables,
        credentialIds: Array.from(selectedCreds),
        isDefault,
      });
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-8 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
          >
          <i className="ri-arrow-left-s-line text-base leading-none" />
        </button>
        <h1 className="flex-1 font-display text-[18px] font-medium tracking-tight text-[var(--text-primary)]">
          {environment ? "Edit environment" : "New environment"}
        </h1>
        <div className="flex items-center gap-2">
          {onDelete && environment && (
            <button
              type="button"
              onClick={onDelete}
              className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger-text)]"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="btn-ink inline-flex h-8 items-center rounded-full px-5 text-[11px] font-medium disabled:opacity-40"
          >
            {isSaving ? "Saving…" : environment ? "Save" : "Create"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-xl px-8 py-6">
          {saveError && (
            <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-danger-muted)] bg-[var(--color-danger-muted)] px-3 py-2 text-[12px] text-[var(--color-danger-text)]">
              {saveError}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production"
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
            />
          </div>

          <div className="mt-4">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this environment for? (optional)"
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
            />
          </div>

          {/* Runner */}
          <div className="mt-8">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Runner</label>
            <div className="mt-2 flex gap-2">
              {(["local", "docker", "cloud"] as const).map((rt) => (
                <button
                  type="button"
                  key={rt}
                  onClick={() => setRunnerType(rt)}
                  className={`flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-center transition-colors ${
                    runnerType === rt
                      ? "bg-[var(--surface-elevated)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--glass-bg)]"
                  }`}
                >
                  <p className="text-[13px] font-medium capitalize">{rt}</p>
                </button>
              ))}
            </div>
          </div>

          {runnerType === "docker" && (
            <div className="mt-4">
              <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Docker image</label>
              <input
                value={dockerImage}
                onChange={(e) => setDockerImage(e.target.value)}
                placeholder="debian:bookworm-slim"
                className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[13px]"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Image used for Docker runs in this environment.
              </p>
            </div>
          )}

          {runnerType === "local" && (
            <div className="mt-4">
              <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Working directory</label>
              <input
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                placeholder="/absolute/path/where/agents/execute"
                className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[13px]"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Absolute path where agents execute. Session file explorer is rooted here.
              </p>
            </div>
          )}

          {/* Variables */}
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Variables</label>
              <button
                type="button"
                onClick={addVar}
                className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                + Add
              </button>
            </div>
            {vars.length === 0 ? (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                No variables. Add key-value pairs that agents can access at runtime.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {vars.map(([key, value], i) => (
                  <div key={`env-${key}-${i}`} className="flex items-center gap-2">
                    <input
                      value={key}
                      onChange={(e) => updateVar(i, 0, e.target.value)}
                      placeholder="KEY"
                      className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-8 w-36 shrink-0 rounded-[var(--radius-sm)] px-2 font-mono text-[11px]"
                    />
                    <input
                      value={value}
                      onChange={(e) => updateVar(i, 1, e.target.value)}
                      placeholder="value"
                      className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-8 flex-1 rounded-[var(--radius-sm)] px-2 text-[12px]"
                    />
                    <button
                      type="button"
                      onClick={() => removeVar(i)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger-text)]"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Credentials */}
          <div className="mt-8">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Credentials</label>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Which credentials are available to agents in this environment?
            </p>
            {availableCredentials.length === 0 ? (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                No credentials stored yet. Add some in the Credentials section.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {availableCredentials.map((cred) => {
                  const checked = selectedCreds.has(cred.id);
                  return (
                    <button
                      type="button"
                      key={cred.id}
                      onClick={() => toggleCred(cred.id)}
                      className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors ${
                        checked ? "bg-[var(--surface-elevated)]" : "hover:bg-[var(--glass-bg)]"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                        checked
                          ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-bg)]"
                          : "border-[var(--glass-border-strong)] text-transparent"
                      }`}>✓</span>
                      <span className="flex-1 text-[13px] text-[var(--text-primary)]">{cred.name}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{cred.type.replace("_", " ")}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Default toggle */}
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setIsDefault((d) => !d)}
              className="flex items-center gap-3"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                isDefault
                  ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-bg)]"
                  : "border-[var(--glass-border-strong)] text-transparent"
              }`}>✓</span>
              <span className="text-[13px] text-[var(--text-primary)]">Set as default environment</span>
            </button>
          </div>

          <div className="h-12" />
        </div>
      </div>
    </div>
  );
}
