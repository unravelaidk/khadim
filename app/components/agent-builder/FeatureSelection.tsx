import { useState, useRef, useEffect } from "react";

interface FeatureSelectionProps {
  onSelect: (feature: { label: string; icon: React.ReactNode; prompt?: string }) => void;
}

export function FeatureSelection({ onSelect }: FeatureSelectionProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const features = [
    { id: "games", label: "Create games", icon: "🕹️" },
    { id: "slides", label: "Create slides", icon: "📑" },
    { id: "website", label: "Build website", icon: "🌐" },
    { id: "apps", label: "Develop apps", icon: "📱" },
    { id: "design", label: "Design", icon: "✨" },
    { id: "more", label: "More", icon: "" },
  ];

  const categoryExamples: Record<string, Array<{ label: string, prompt: string, icon: string }>> = {
    "games": [
      { label: "Flappy Bird", prompt: "Create a Flappy Bird clone using React and HTML5 Canvas", icon: "🐦" },
      { label: "Snake", prompt: "Build a classic Snake game with keyboard controls", icon: "🐍" },
      { label: "Pong", prompt: "Develop a Pong game with a simple AI opponent", icon: "🏓" },
      { label: "Space Invaders", prompt: "Create a Space Invaders style shooter game", icon: "👾" },
    ]
  };

  const moreOptions = [
    { id: "schedule", label: "Schedule task", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> },
    { id: "research", label: "Wide Research", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><path d="M11 8v3l3 3"></path></svg> },
    { id: "spreadsheet", label: "Spreadsheet", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg> },
    { id: "visualization", label: "Visualization", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> },
    { id: "video", label: "Video", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> },
    { id: "audio", label: "Audio", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12" y2="18.01"></line></svg> },
    { id: "chat", label: "Chat mode", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> },
    { id: "playbook", label: "Playbook", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>, external: true },
  ];

  // Render examples view if a category is selected and has examples
  if (selectedCategory && categoryExamples[selectedCategory]) {
    return (
      <div className="relative flex flex-wrap items-center justify-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500" ref={menuRef}>
        <button
          onClick={() => setSelectedCategory(null)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 hover:text-gb-text text-gb-text-secondary transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          <span className="text-sm font-medium">Back</span>
        </button>
        
        {categoryExamples[selectedCategory].map((example) => (
          <button
            key={example.label}
            onClick={() => {
              const categoryFeature = features.find(f => f.id === selectedCategory);
              if (categoryFeature) {
                onSelect({ 
                  label: categoryFeature.label, 
                  icon: categoryFeature.icon, 
                  prompt: example.prompt 
                });
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 hover:scale-[1.02] transition-all duration-200 group"
          >
            <span className="text-lg opacity-80 group-hover:opacity-100 transition-opacity">
              {example.icon}
            </span>
            <span className="text-sm font-medium text-gb-text-secondary group-hover:text-gb-text">
              {example.label}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex flex-wrap items-center justify-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100" ref={menuRef}>
      {features.map((feature) => {
        if (feature.id === "more") {
          return (
            <div key={feature.id} className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 hover:scale-[1.02] transition-all duration-200 group ${showMoreMenu ? 'bg-gb-bg-card border-gb-primary/30 ring-2 ring-gb-primary/10' : ''}`}
              >
                <span className="text-sm font-medium text-gb-text-secondary group-hover:text-gb-text">
                  {feature.label}
                </span>
                <span className="text-lg opacity-80 group-hover:opacity-100 transition-all duration-200">
                  {showMoreMenu ? "×" : "+"}
                </span>
              </button>

              {/* More Menu Dropdown - Anchored to button */}
              {showMoreMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-56 bg-gb-bg-card border border-gb-border rounded-xl shadow-gb-md p-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex flex-col gap-0.5">
                    {moreOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => {
                          onSelect({ label: option.label, icon: option.icon });
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm text-gb-text-secondary hover:text-gb-text hover:bg-gb-bg-subtle/50 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-gb-text-muted group-hover:text-gb-text transition-colors">{option.icon}</span>
                          <span>{option.label}</span>
                        </div>
                        {option.external && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50 group-hover:opacity-100 text-gb-text-muted group-hover:text-gb-text"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            key={feature.id}
            onClick={() => {
              if (categoryExamples[feature.id]) {
                setSelectedCategory(feature.id);
              } else {
                onSelect({ label: feature.label, icon: feature.icon });
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 hover:scale-[1.02] transition-all duration-200 group"
          >
            {feature.icon && (
              <span className="text-lg opacity-80 group-hover:opacity-100 transition-opacity">
                {feature.icon}
              </span>
            )}
            <span className="text-sm font-medium text-gb-text-secondary group-hover:text-gb-text">
              {feature.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
