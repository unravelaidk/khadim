import { useCallback, useEffect, useState } from "react";
import type { SkillEntry } from "../../lib/bindings";
import { commands } from "../../lib/bindings";

// ── Skill card ───────────────────────────────────────────────────────

function SkillCard({
  skill,
  onToggle,
}: {
  skill: SkillEntry;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(skill.id, !skill.enabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="depth-card-sm transition-all hover:shadow-[var(--shadow-depth-card-hover)]">
      <div className="flex items-center gap-3 px-3.5 py-3">
        {/* Icon */}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            skill.enabled
              ? "bg-gradient-to-br from-[var(--color-accent)]/20 to-[var(--color-accent)]/5 border border-[var(--color-accent)]/20"
              : "bg-[var(--glass-bg-strong)]"
          }`}
        >
          <i className="ri-book-open-line text-base leading-none" />
        </span>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
              {skill.name}
            </p>
            {skill.version && (
              <span className="text-[9px] font-mono text-[var(--text-muted)]">v{skill.version}</span>
            )}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-2 leading-relaxed">
            {skill.description || "No description"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {skill.author && (
              <span className="text-[9px] text-[var(--text-muted)]">by {skill.author}</span>
            )}
            <span
              className="text-[8px] font-mono text-[var(--text-muted)] opacity-60 truncate max-w-[180px]"
              title={skill.dir}
            >
              {skill.source_dir}
            </span>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => void handleToggle()}
          disabled={toggling}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
            skill.enabled ? "bg-[var(--color-accent)]" : "bg-[var(--glass-bg-strong)]"
          }`}
          role="switch"
          aria-checked={skill.enabled}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
              skill.enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ── Directory manager ────────────────────────────────────────────────

function DirectoryManager({
  dirs,
  onAdd,
  onRemove,
}: {
  dirs: string[];
  onAdd: (dir: string) => Promise<void>;
  onRemove: (dir: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select skills directory" });
      if (selected) {
        await onAdd(selected as string);
      }
    } catch (err) {
      console.error("Failed to add skills directory", err);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Scan directories
        </p>
        <button
          onClick={() => void handleAdd()}
          disabled={adding}
          className="h-6 px-2.5 rounded-lg btn-glass text-[10px] font-medium flex items-center gap-1.5 disabled:opacity-40"
        >
          <i className="ri-add-line text-[12px] leading-none" />
          Add
        </button>
      </div>

      <div className="space-y-1">
        {dirs.map((dir) => (
          <div
            key={dir}
            className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-2.5 py-1.5 group"
          >
            <i className="ri-archive-line text-base leading-none text-[var(--text-muted)]" />
            <span className="flex-1 text-[10px] font-mono text-[var(--text-secondary)] truncate select-all" title={dir}>
              {dir}
            </span>
            {dirs.length > 1 && (
              <button
                onClick={() => void onRemove(dir)}
                className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-all"
                title="Remove directory"
              >
                <i className="ri-close-line text-[12px] leading-none" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────

export function SkillsTab() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [discovered, skillDirs] = await Promise.all([
        commands.skillDiscover(),
        commands.skillListDirs(),
      ]);
      setSkills(discovered);
      setDirs(skillDirs);
    } catch {
      // empty state is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(skillId: string, enabled: boolean) {
    try {
      await commands.skillToggle(skillId, enabled);
      // Update locally for instant feedback
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? { ...s, enabled } : s)),
      );
    } catch (err) {
      console.error("Failed to toggle skill", err);
      await load();
    }
  }

  async function handleAddDir(dir: string) {
    try {
      const updated = await commands.skillAddDir(dir);
      setDirs(updated);
      await load();
    } catch (err) {
      console.error("Failed to add skills directory", err);
    }
  }

  async function handleRemoveDir(dir: string) {
    try {
      const updated = await commands.skillRemoveDir(dir);
      setDirs(updated);
      await load();
    } catch (err) {
      console.error("Failed to remove skills directory", err);
    }
  }

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
            Specialized instruction sets that give the agent expertise in specific tasks.
            Each skill is a <code className="text-[10px] font-mono px-1 py-px rounded bg-[var(--glass-bg)] border border-[var(--glass-border)]">SKILL.md</code> file
            discovered from your configured directories.
          </p>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 h-7 w-7 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors disabled:opacity-50 ml-3"
            title="Refresh"
          >
            <i className="ri-loader-4-line text-base leading-none" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 mt-4">
          <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
            {enabledCount} active
          </span>
          <span className="h-px flex-1 bg-[var(--glass-border)]" />
          <span className="text-[10px] text-[var(--text-muted)]">
            {skills.length} discovered
          </span>
        </div>
      </div>

      {/* Directory management */}
      <DirectoryManager dirs={dirs} onAdd={handleAddDir} onRemove={handleRemoveDir} />

      {/* Skills list */}
      {loading && skills.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl shimmer" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="depth-well p-8 text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-2xl bg-[var(--glass-bg-strong)] flex items-center justify-center">
              <i className="ri-book-open-line text-[20px] leading-none text-[var(--text-muted)]" />
            </div>
          </div>
          <p className="text-[12px] font-medium text-[var(--text-primary)] mb-1">No skills found</p>
          <p className="text-[10px] text-[var(--text-muted)] mb-1">
            Add a directory containing skill folders, or create a skill:
          </p>
          <div className="mt-3 space-y-1.5 text-[10px] text-[var(--text-muted)]">
            <p>Each skill is a directory with a <code className="font-mono px-1 py-px rounded bg-[var(--glass-bg)] border border-[var(--glass-border)]">SKILL.md</code> file.</p>
            <p>
              Default path:{" "}
              <code className="font-mono px-1 py-px rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] select-all">
                ~/.agents/skills/
              </code>
            </p>
            <p>
              Also supports{" "}
              <code className="font-mono px-1 py-px rounded bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                .claude/skills/
              </code>{" "}
              — just add the directory above.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
