interface SuggestionCardsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
}

export function SuggestionCards({ prompts, onSelect }: SuggestionCardsProps) {
  return (
    <div className="mt-6">
      <p className="text-xs mb-3 text-center text-[var(--text-muted)]">
        Try one of these
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            className="text-left px-4 py-3 rounded-xl text-sm transition-all hover:scale-[1.01] glass-card-static text-[var(--text-secondary)] border border-[var(--glass-border)]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
