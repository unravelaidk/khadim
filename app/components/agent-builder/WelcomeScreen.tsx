import React from "react";
import KhadimLogo from "../../assets/Khadim-logo.svg";
import { FeatureSelection } from "./FeatureSelection";

interface WelcomeScreenProps {
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void;
  activeBadges: Array<{ label: string; icon: React.ReactNode; prompt?: string }>;
  removeBadge: (label: string) => void;
  onSuggestionClick: (feature: { label: string; icon: React.ReactNode; prompt?: string }) => void;
}

export function WelcomeScreen({
  input,
  setInput,
  handleSend,
  activeBadges,
  removeBadge,
  onSuggestionClick,
}: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-700">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gb-bg-card border border-gb-border shadow-sm text-xs font-mono font-medium text-gb-text-secondary uppercase tracking-wider">
        <span className="text-gb-text-muted">TURN 1</span>
        <span className="w-px h-3 bg-gb-border"></span>
        <span className="text-gb-accent hover:underline cursor-pointer animate-pulse">
          ROLL DICE
        </span>
      </div>

      {/* Header - Logo & Subtitle */}
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 animate-in fade-in zoom-in duration-1000 text-center md:text-left mb-2 md:mb-0">
        <div className="w-24 h-24 md:w-32 md:h-32 text-gb-text animate-float">
          <KhadimLogo />
        </div>
        <p className="text-xl md:text-2xl font-mono text-gb-text-secondary tracking-wide max-w-[200px] md:max-w-none">
          Get started building
        </p>
      </div>

      {/* Large Input Card */}
      <div className="w-full bg-gb-bg-card border border-gb-border rounded-3xl shadow-gb-md hover:shadow-gb-lg transition-all duration-300 overflow-hidden relative group flex flex-col">
        {/* Active Badges */}
        {activeBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-6 pt-6 pb-2 animate-in fade-in slide-in-from-bottom-2">
            {activeBadges.map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20 text-sm font-medium"
              >
                <span className="text-base">{badge.icon}</span>
                <span>{badge.label}</span>
                <button
                  onClick={() => removeBadge(badge.label)}
                  className="ml-1 p-0.5 rounded-sm hover:bg-blue-500/20 text-blue-600/60 hover:text-blue-600 transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            activeBadges.length > 0
              ? "Describe what you want..."
              : "Awaiting instructions..."
          }
          className={`w-full bg-transparent px-6 md:px-8 text-base md:text-lg resize-none focus:outline-none placeholder:text-gb-text-muted/50 font-mono transition-all ${
            activeBadges.length > 0
              ? "h-24 md:h-32 pt-4"
              : "h-32 md:h-40 pt-6 md:pt-8"
          }`}
        />

        {/* Input Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-gb-bg-subtle/50 border-t border-gb-border/50">
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-gb-bg-card text-gb-text-muted hover:text-gb-text transition-colors">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button className="p-2 rounded-lg hover:bg-gb-bg-card text-gb-text-muted hover:text-gb-text transition-colors">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 rounded-lg bg-gb-accent text-white hover:bg-gb-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-sm"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Feature Selection Chips */}
      <FeatureSelection onSelect={onSuggestionClick} />
    </div>
  );
}
