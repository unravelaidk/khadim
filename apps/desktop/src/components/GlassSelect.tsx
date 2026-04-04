import { useCallback, useEffect, useRef, useState } from "react";

export interface GlassSelectOption {
  value: string;
  label: string;
  /** Optional secondary text shown smaller below the label */
  detail?: string;
}

interface GlassSelectProps {
  options: GlassSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Search is enabled when the list exceeds this count (default: 6) */
  searchThreshold?: number;
}

export function GlassSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className = "",
  searchThreshold = 6,
}: GlassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) ?? null;
  const showSearch = options.length > searchThreshold;

  const filtered = search.trim()
    ? options.filter((o) => {
        const q = search.toLowerCase();
        return o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) || (o.detail?.toLowerCase().includes(q) ?? false);
      })
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [filtered.length, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
        return;
      }
      if (!isOpen) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setIsOpen(true);
          requestAnimationFrame(() => searchRef.current?.focus());
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
      } else if (e.key === "Enter" && highlightIndex >= 0 && highlightIndex < filtered.length) {
        e.preventDefault();
        onChange(filtered[highlightIndex].value);
        setIsOpen(false);
        setSearch("");
      }
    },
    [isOpen, filtered, highlightIndex, onChange],
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-glass-option]");
    items[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              setSearch("");
              setHighlightIndex(-1);
              requestAnimationFrame(() => searchRef.current?.focus());
            }
            return next;
          });
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl glass-input px-3 py-2.5 text-sm outline-none transition-all duration-200 ${
          isOpen ? "border-[var(--color-accent)] shadow-[0_0_0_3px_var(--input-focus-ring)]" : ""
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className={`min-w-0 truncate ${selectedOption ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 z-[120] mt-1.5 overflow-hidden rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--surface-elevated)] shadow-[var(--shadow-glass-lg)] animate-in zoom-in fade-in duration-150"
          role="listbox"
        >
          {/* Search input */}
          {showSearch && (
            <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-3 py-2">
              <svg className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="shrink-0 rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Options list */}
          <div ref={listRef} className="max-h-52 overflow-y-auto overscroll-contain p-1.5 scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-[12px] text-[var(--text-muted)]">
                No matches
              </div>
            ) : (
              filtered.map((option, idx) => {
                const isSelected = option.value === value;
                const isHighlighted = idx === highlightIndex;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-glass-option
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-all duration-100 ${
                      isSelected
                        ? "bg-[var(--color-accent)]/[0.08] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--color-accent)]/20"
                        : isHighlighted
                          ? "bg-[var(--glass-bg)] text-[var(--text-primary)]"
                          : "text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12px] font-medium leading-tight">{option.label}</span>
                      {option.detail && (
                        <span className="truncate text-[10px] leading-tight text-[var(--text-muted)]">{option.detail}</span>
                      )}
                    </span>
                    {isSelected && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)]">
                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
