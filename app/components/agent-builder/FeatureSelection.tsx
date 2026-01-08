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
  LuGamepad,
  LuTarget,
  LuSquare,
  LuCircle,
  LuTriangle,
  LuZap,
  LuRocket,
  LuGrid3X3,
  LuFlag,
  LuCrosshair,
  LuDiamond,
  LuCpu,
  LuChartPie,
  LuUsers,
  LuPackage,
  LuBrain
} from "react-icons/lu";
import { SlideTemplates } from "./SlideTemplates";
import type { SlideTemplate, SlideTheme } from "../../types/slides";

interface FeatureSelectionProps {
  onSelect: (feature: { label: string; icon: React.ReactNode; prompt?: string; isPremade?: boolean; templateInfo?: { template: SlideTemplate; theme: SlideTheme } }) => void;
}

export function FeatureSelection({ onSelect }: FeatureSelectionProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showTemplateSelection, setShowTemplateSelection] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{ template: SlideTemplate; theme: SlideTheme } | null>(null);
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
      { label: "Flappy Bird", prompt: "Create a Flappy Bird style game using React and Canvas with gravity, lift on tap/space, randomized pipes, score tracking, and a restart flow", icon: <LuTarget className="w-4 h-4" /> },
      { label: "Snake", prompt: "Build a classic Snake game with keyboard controls, increasing speed over time, pause/resume, and a score + high score display", icon: <LuSquare className="w-4 h-4" /> },
      { label: "Pong", prompt: "Develop a Pong game with one-player AI, adjustable difficulty, paddle spin on angled hits, and a best-of-5 match UI", icon: <LuCircle className="w-4 h-4" /> },
      { label: "Space Invaders", prompt: "Create a Space Invaders style shooter with enemy waves, shields, player lives, sound toggles, and a game over screen", icon: <LuZap className="w-4 h-4" /> },
      { label: "Brick Breaker", prompt: "Make a Brick Breaker game with multiple levels, power-ups, ball speed changes, and a simple level select", icon: <LuGrid3X3 className="w-4 h-4" /> },
      { label: "Asteroids", prompt: "Build an Asteroids game with ship rotation/thrust, inertia physics, asteroid splitting, and a score multiplier for streaks", icon: <LuRocket className="w-4 h-4" /> },
      { label: "Tetris", prompt: "Create a Tetris clone with 7-bag randomizer, ghost piece, hold queue, line-clear scoring, and level progression", icon: <LuTriangle className="w-4 h-4" /> },
      { label: "Platformer", prompt: "Design a 2D platformer with tile collisions, double-jump, moving platforms, coins to collect, and a finish flag", icon: <LuFlag className="w-4 h-4" /> },
      { label: "Top-Down Shooter", prompt: "Build a top-down shooter with WASD movement, aim cursor, enemy spawners, weapon upgrades, and a survival timer", icon: <LuCrosshair className="w-4 h-4" /> },
      { label: "Match-3 Puzzle", prompt: "Create a match-3 puzzle with swap validation, cascading matches, combo bonuses, and a moves-limited objective", icon: <LuDiamond className="w-4 h-4" /> },
    ],
    "slides": [
      { label: "AI & Work", prompt: "Create a presentation on the impact of AI on the future of work, covering automation, job displacement, new job creation, and the need for reskilling. Keep it engaging and informative with clear visuals and concise text.", icon: <LuCpu className="w-4 h-4" /> },
      { label: "Startup Pitch", prompt: "Build a 10-slide startup pitch deck with problem, solution, market size, product demo, business model, traction, go-to-market, competition, team, and funding ask. Use bold visuals and minimal text.", icon: <LuRocket className="w-4 h-4" /> },
      { label: "Quarterly Results", prompt: "Design a quarterly business review deck with KPIs, revenue breakdown, growth highlights, challenges, next-quarter priorities, and a clean data-visual style.", icon: <LuChartPie className="w-4 h-4" /> },
      { label: "Workshop Outline", prompt: "Create a workshop slide deck with agenda, learning goals, key concepts, interactive exercises, and a wrap-up with action items. Use friendly icons and callouts.", icon: <LuBrain className="w-4 h-4" /> },
      { label: "Product Launch", prompt: "Build a product launch presentation with the story, key features, target users, pricing tiers, timeline, and a clear call-to-action. Include comparison and testimonial slides.", icon: <LuPackage className="w-4 h-4" /> },
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

  // Render template selection for slides
  if (showTemplateSelection) {
    return (
      <SlideTemplates
        onSelect={(template, theme) => {
          setSelectedTemplate({ template, theme });
          setShowTemplateSelection(false);
          setSelectedCategory("slides");
        }}
        onBack={() => setShowTemplateSelection(false)}
      />
    );
  }

  // Render examples view if a category is selected and has examples
  if (selectedCategory && categoryExamples[selectedCategory]) {
    return (
      <div className="relative flex flex-wrap items-center justify-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500" ref={menuRef}>
        <button
          onClick={() => {
            if (selectedCategory === "slides") {
              // Go back to template selection for slides
              setSelectedCategory(null);
              setSelectedTemplate(null);
              setShowTemplateSelection(true);
            } else {
              setSelectedCategory(null);
            }
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 hover:text-gb-text text-gb-text-secondary transition-all"
        >
          <LuArrowLeft className="text-base" />
          <span className="text-sm font-medium">Back</span>
        </button>
        
        {/* Show selected template indicator for slides */}
        {selectedCategory === "slides" && selectedTemplate && (
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ 
              background: `${selectedTemplate.theme.accentColor}15`,
              color: selectedTemplate.theme.accentColor,
              border: `1px solid ${selectedTemplate.theme.accentColor}30`
            }}
          >
            <span 
              className="w-2 h-2 rounded-full"
              style={{ background: selectedTemplate.theme.accentColor }}
            />
            {selectedTemplate.template.name} template
          </div>
        )}
        
        {categoryExamples[selectedCategory].map((example) => (
          <button
            key={example.label}
            onClick={() => {
              const categoryFeature = features.find(f => f.id === selectedCategory);
              if (categoryFeature) {
                // Build the prompt with template info if available
                let finalPrompt = example.prompt;
                if (selectedCategory === "slides" && selectedTemplate) {
                  finalPrompt = `Using the "${selectedTemplate.template.name}" template with "${selectedTemplate.theme.name}" theme (${selectedTemplate.theme.description}): ${example.prompt}`;
                }
                
                onSelect({ 
                  label: `${categoryFeature.label}: ${example.label}`, 
                  icon: categoryFeature.icon, 
                  prompt: finalPrompt,
                  isPremade: true,
                  templateInfo: selectedTemplate || undefined
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
              // For slides, show template selection first
              if (feature.id === "slides") {
                setShowTemplateSelection(true);
              } else if (categoryExamples[feature.id]) {
                setSelectedCategory(feature.id);
              } else {
                // This is just a CATEGORY - should go to plan mode for questions
                onSelect({ label: feature.label, icon: feature.icon, isPremade: false });
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
