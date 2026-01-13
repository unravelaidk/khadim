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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gb-bg-subtle border border-gb-border hover:bg-gb-bg-card hover:border-gb-primary/30 text-gb-text-secondary hover:text-gb-text transition-all"
        >
          <LuArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[52vh] overflow-y-auto pr-1 scrollbar-hide">
        {SLIDE_TEMPLATES.map((template) => {
          const theme = SLIDE_THEMES.get(template.theme)!;

          return (
            <button
              key={template.id}
              onClick={() => onSelect(template, theme)}
              className="group relative flex flex-col rounded-2xl border border-gb-border bg-gb-bg-subtle/60 hover:bg-gb-bg-card hover:border-gb-primary/40 hover:shadow-gb-md transition-all duration-300 overflow-hidden text-left"
            >
              <div
                className="h-28 w-full relative border-b border-gb-border/60"
                style={{ background: theme.backgrounds.title }}
              >
                <div className="absolute inset-3 flex flex-col items-center justify-center">
                  <div
                    className="w-12 h-1.5 rounded-full mb-2"
                    style={{ background: theme.accentColor }}
                  />
                  <div
                    className="w-20 h-2 rounded mb-1"
                    style={{ background: theme.textColors.primary, opacity: 0.85 }}
                  />
                  <div
                    className="w-16 h-1.5 rounded"
                    style={{ background: theme.textColors.secondary, opacity: 0.55 }}
                  />
                </div>

                {theme.decorativeElements?.pattern && (
                  <div
                    className="absolute inset-0 opacity-30"
                    style={{ background: theme.decorativeElements.pattern }}
                  />
                )}
              </div>

              <div className="p-4 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
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
                <p className="text-xs text-gb-text-muted leading-relaxed line-clamp-2">
                  {template.description}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-transparent"
                    style={{
                      background: `${theme.accentColor}12`,
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

              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm"
                  style={{ background: theme.accentColor }}
                >
                  <LuCheck className="w-4 h-4 text-white" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
