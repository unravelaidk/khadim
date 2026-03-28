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
      border-t-2 border-black bg-white
      ${isCompact ? 'px-3 py-2' : 'px-4 py-3'}
    `}>
      {/* Previous Button */}
      <button
        onClick={onPrevious}
        disabled={currentSlide === 0}
        className={`
          flex items-center gap-1.5 border-2 border-transparent font-medium text-black/60 
          hover:border-black hover:bg-[#f5f5f5] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed 
          transition-all duration-150
          ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}
        `}
      >
        <LuChevronLeft className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        <span className="hidden sm:inline">Previous</span>
      </button>

      {/* Slide Indicators */}
      <div className="flex items-center gap-2">
        <span className={`font-medium text-black/50 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
          {currentSlide + 1} / {totalSlides}
        </span>
        
        <div className="flex items-center gap-1">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <button
              key={index}
              onClick={() => onGoTo(index)}
                className="transition-all duration-200"
                aria-label={`Go to slide ${index + 1}`}
                style={{
                 width: index === currentSlide ? '16px' : '6px',
                 height: '6px',
                 background: index === currentSlide 
                   ? '#e5ff00' 
                   : '#000000',
                 boxShadow: index === currentSlide 
                   ? '2px 2px 0 rgba(0,0,0,0.12)' 
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
          flex items-center gap-1.5 border-2 border-transparent font-medium text-black/60 
          hover:border-black hover:bg-[#f5f5f5] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed 
          transition-all duration-150
          ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}
        `}
      >
        <span className="hidden sm:inline">Next</span>
        <LuChevronRight className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      </button>
    </div>
  );
}
