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
  const isBuilding = '__building' in slide && slide.__building;

  return (
    <button
      onClick={onClick}
      className={`
        group relative aspect-[16/9] w-full overflow-hidden 
        border-2 transition-all duration-200 ease-out
        ${isActive 
          ? 'shadow-gb-sm' 
          : 'border-black hover:bg-[#f5f5f5]'
        }
      `}
      style={{
        borderColor: isActive ? '#000000' : undefined,
        boxShadow: isActive 
          ? '3px 3px 0 rgba(0,0,0,0.12)' 
          : undefined,
      }}
      >
      {isBuilding ? (
        <div className="absolute inset-0 flex flex-col justify-between bg-[#f5f5f5] p-2">
          <div className="space-y-1.5">
            <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-black/55">
              Building
            </div>
            <div className="text-[9px] font-semibold leading-tight text-black">
              {slide.title || `Slide ${index + 1}`}
            </div>
            <div className="h-1.5 w-1/2 animate-pulse bg-black/20" />
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-full animate-pulse bg-black/10" />
            <div className="h-1.5 w-5/6 animate-pulse bg-black/10" style={{ animationDelay: '150ms' }} />
            <div className="h-1.5 w-4/6 animate-pulse bg-[#e5ff00]" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      ) : (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center p-2"
          style={{ background: getSlideBackground(slide.type, theme) }}
        >
          <div 
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)',
              backgroundSize: '8px 8px',
            }}
          />
          <span className="relative z-10 line-clamp-2 px-1.5 text-center text-[8px] font-semibold text-white">
            {slide.title || `Slide ${index + 1}`}
          </span>
        </div>
      )}

      <div 
        className="absolute bottom-1 left-1 bg-black px-1.5 py-0.5 text-[9px] font-bold text-white"
        style={{ 
          background: 'rgba(0,0,0,0.9)'
        }}
      >
        {index + 1}
      </div>

      {isActive && (
        <div 
          className="absolute right-1 top-1 h-2 w-2 animate-pulse bg-[#e5ff00]"
        />
      )}

      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
    </button>
  );
}
