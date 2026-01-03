import type { Message } from "./types";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl ${
          isUser 
            ? "rounded-br-md bg-gb-primary text-gb-text-inverse" 
            : "rounded-bl-md bg-gb-bg-subtle text-gb-text"
        }`}
      >
        <div className="text-sm leading-relaxed">
          {message.content.split("**").map((part, i) =>
            i % 2 === 1 ? (
              <strong key={i} className="font-semibold">
                {part}
              </strong>
            ) : (
              part
            )
          )}
        </div>
      </div>
    </div>
  );
}
