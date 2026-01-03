import { useState, useRef, useEffect } from "react";
import { 
  LuFileText, 
  LuGlobe, 
  LuSmartphone, 
  LuSparkles,
  LuCalendar,
  LuSearch,
  LuTable,
  LuChartBar,
  LuVideo,
  LuMic,
  LuMessageSquare,
  LuBook,
  LuArrowLeft,
  LuX,
  LuPlus,
  LuEllipsis,
  LuGamepad
} from "react-icons/lu";

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
    { id: "games", label: "Create games", icon: <LuGamepad /> },
    { id: "slides", label: "Create slides", icon: <LuFileText /> },
    { id: "website", label: "Build website", icon: <LuGlobe /> },
    { id: "apps", label: "Develop apps", icon: <LuSmartphone /> },
    { id: "design", label: "Design", icon: <LuSparkles /> },
    { id: "more", label: "More", icon: "" },
  ];

  const categoryExamples: Record<string, Array<{ label: string, prompt: string, icon: React.ReactNode }>> = {
    "games": [
      { label: "Flappy Bird", prompt: "Create a Flappy Bird clone using React and HTML5 Canvas", icon: "🐦" },
      { label: "Snake", prompt: "Build a classic Snake game with keyboard controls", icon: "🐍" },
      { label: "Pong", prompt: "Develop a Pong game with a simple AI opponent", icon: "🏓" },
      { label: "Space Invaders", prompt: "Create a Space Invaders style shooter game", icon: "👾" },
    ]
  };

  const moreOptions = [
    { id: "schedule", label: "Schedule task", icon: <LuCalendar /> },
    { id: "research", label: "Wide Research", icon: <LuSearch /> },
    { id: "spreadsheet", label: "Spreadsheet", icon: <LuTable /> },
    { id: "visualization", label: "Visualization", icon: <LuChartBar /> },
    { id: "video", label: "Video", icon: <LuVideo /> },
    { id: "audio", label: "Audio", icon: <LuMic /> },
    { id: "chat", label: "Chat mode", icon: <LuMessageSquare /> },
    { id: "playbook", label: "Playbook", icon: <LuBook />, external: true },
  ];

  // Render examples view if a category is selected and has examples
  if (selectedCategory && categoryExamples[selectedCategory]) {
    return (
      <div className="relative flex flex-wrap items-center justify-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500" ref={menuRef}>
        <button
          onClick={() => setSelectedCategory(null)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 hover:text-gb-text text-gb-text-secondary transition-all"
        >
          <LuArrowLeft className="text-base" />
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
                  {showMoreMenu ? <LuX /> : <LuPlus />}
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
                          <span className="text-gb-text-muted group-hover:text-gb-text transition-colors text-base">{option.icon}</span>
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
