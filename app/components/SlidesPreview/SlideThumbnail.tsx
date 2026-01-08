import { getSlideBackground } from '../agent-builder/slideTemplates';
import type { SlideData, SlideTheme } from '../../types/slides';

interface SlideThumbnailProps {
  slide: SlideData;
  index: number;
  isActive: boolean;
  theme: SlideTheme;
  onClick: () => void;
}

export function SlideThumbnail({ 
  slide, 
  index, 
  isActive, 
  theme, 
  onClick 
}: SlideThumbnailProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative w-full rounded-xl overflow-hidden aspect-[16/9] 
        border-2 transition-all duration-200 ease-out
        hover:scale-[1.02] hover:shadow-lg
        ${isActive 
          ? 'ring-2 ring-offset-2 ring-offset-gb-bg-subtle shadow-md' 
          : 'border-gb-border hover:border-gb-border-medium'
        }
      `}
      style={{
        borderColor: isActive ? theme.accentColor : undefined,
        boxShadow: isActive 
          ? `0 4px 12px ${theme.accentColor}25` 
          : undefined,
      }}
    >
      {/* Slide Preview Background */}
      <div 
        className="absolute inset-0 flex flex-col items-center justify-center p-2"
        style={{ background: getSlideBackground(slide.type, theme) }}
      >
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)',
            backgroundSize: '8px 8px',
          }}
        />
        
        {/* Slide Title Preview */}
        <span className="relative z-10 text-white text-[8px] font-semibold text-center line-clamp-2 px-1.5 drop-shadow-sm">
          {slide.title || `Slide ${index + 1}`}
        </span>
      </div>

      {/* Slide Number Badge */}
      <div 
        className="absolute bottom-1 left-1 text-[9px] text-white/90 px-1.5 py-0.5 rounded font-bold backdrop-blur-sm"
        style={{ 
          background: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)'
        }}
      >
        {index + 1}
      </div>

      {/* Active Indicator */}
      {isActive && (
        <div 
          className="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse"
          style={{ background: theme.accentColor }}
        />
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
    </button>
  );
}
