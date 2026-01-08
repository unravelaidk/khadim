import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import type { SlideTheme } from '../../types/slides';

interface SlideNavigationProps {
  currentSlide: number;
  totalSlides: number;
  theme: SlideTheme;
  onPrevious: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  variant?: 'compact' | 'default';
}

export function SlideNavigation({
  currentSlide,
  totalSlides,
  theme,
  onPrevious,
  onNext,
  onGoTo,
  variant = 'default'
}: SlideNavigationProps) {
  const isCompact = variant === 'compact';

  return (
    <div className={`
      flex items-center justify-between 
      bg-gb-bg-subtle/80 backdrop-blur-sm border-t border-gb-border
      ${isCompact ? 'px-3 py-2' : 'px-4 py-3'}
    `}>
      {/* Previous Button */}
      <button
        onClick={onPrevious}
        disabled={currentSlide === 0}
        className={`
          flex items-center gap-1.5 font-medium text-gb-text-secondary 
          hover:text-gb-text disabled:opacity-30 disabled:cursor-not-allowed 
          transition-all duration-150 hover:scale-105 active:scale-95
          ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}
        `}
      >
        <LuChevronLeft className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        <span className="hidden sm:inline">Previous</span>
      </button>

      {/* Slide Indicators */}
      <div className="flex items-center gap-2">
        <span className={`text-gb-text-muted font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
          {currentSlide + 1} / {totalSlides}
        </span>
        
        <div className="flex items-center gap-1">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <button
              key={index}
              onClick={() => onGoTo(index)}
              className="transition-all duration-200 rounded-full hover:scale-125"
              aria-label={`Go to slide ${index + 1}`}
              style={{
                width: index === currentSlide ? '16px' : '6px',
                height: '6px',
                background: index === currentSlide 
                  ? theme.accentColor 
                  : 'var(--color-gb-border-dark)',
                boxShadow: index === currentSlide 
                  ? `0 0 8px ${theme.accentColor}60` 
                  : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Next Button */}
      <button
        onClick={onNext}
        disabled={currentSlide === totalSlides - 1}
        className={`
          flex items-center gap-1.5 font-medium text-gb-text-secondary 
          hover:text-gb-text disabled:opacity-30 disabled:cursor-not-allowed 
          transition-all duration-150 hover:scale-105 active:scale-95
          ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}
        `}
      >
        <span className="hidden sm:inline">Next</span>
        <LuChevronRight className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      </button>
    </div>
  );
}
