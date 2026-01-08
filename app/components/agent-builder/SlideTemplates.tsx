import { LuArrowLeft, LuCheck } from "react-icons/lu";
import { SLIDE_TEMPLATES, SLIDE_THEMES } from "./slideTemplates";
import type { SlideTemplate, SlideTheme } from "../../types/slides";

interface SlideTemplatesProps {
  onSelect: (template: SlideTemplate, theme: SlideTheme) => void;
  onBack: () => void;
}

export function SlideTemplates({ onSelect, onBack }: SlideTemplatesProps) {
  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 text-gb-text-secondary hover:text-gb-text transition-all"
        >
          <LuArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <div>
          <h3 className="text-lg font-semibold text-gb-text">Choose a Template</h3>
          <p className="text-sm text-gb-text-muted">Select a style for your slides</p>
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {SLIDE_TEMPLATES.map((template) => {
          const theme = SLIDE_THEMES.get(template.theme)!;
          
          return (
            <button
              key={template.id}
              onClick={() => onSelect(template, theme)}
              className="group relative flex flex-col rounded-xl border border-gb-border bg-gb-bg-card hover:border-gb-primary/40 hover:shadow-gb-md transition-all duration-300 overflow-hidden text-left"
            >
              {/* Theme Preview */}
              <div 
                className="h-24 w-full relative"
                style={{ background: theme.backgrounds.title }}
              >
                {/* Mini slide mockup */}
                <div className="absolute inset-3 flex flex-col items-center justify-center">
                  <div 
                    className="w-12 h-1 rounded-full mb-2"
                    style={{ background: theme.accentColor }}
                  />
                  <div 
                    className="w-20 h-2 rounded mb-1"
                    style={{ background: theme.textColors.primary, opacity: 0.8 }}
                  />
                  <div 
                    className="w-16 h-1.5 rounded"
                    style={{ background: theme.textColors.secondary, opacity: 0.5 }}
                  />
                </div>
                
                {/* Decorative pattern */}
                {theme.decorativeElements?.pattern && (
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{ background: theme.decorativeElements.pattern }}
                  />
                )}
              </div>

              {/* Template Info */}
              <div className="p-3 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-sm text-gb-text group-hover:text-gb-accent transition-colors">
                    {template.name}
                  </h4>
                  <span 
                    className="w-3 h-3 rounded-full border-2"
                    style={{ 
                      borderColor: theme.accentColor,
                      background: `${theme.accentColor}40`
                    }}
                  />
                </div>
                <p className="text-xs text-gb-text-muted line-clamp-2">
                  {template.description}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <span 
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ 
                      background: `${theme.accentColor}15`,
                      color: theme.accentColor
                    }}
                  >
                    {theme.name} theme
                  </span>
                  <span className="text-[10px] text-gb-text-muted">
                    • {template.slides.length} slides
                  </span>
                </div>
              </div>

              {/* Hover indicator */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: theme.accentColor }}
                >
                  <LuCheck className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
