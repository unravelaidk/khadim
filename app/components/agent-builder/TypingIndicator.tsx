export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-gb-bg-subtle">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.3s] bg-gb-text-muted" />
          <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.15s] bg-gb-text-muted" />
          <div className="w-2 h-2 rounded-full animate-bounce bg-gb-text-muted" />
        </div>
      </div>
    </div>
  );
}
