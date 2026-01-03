import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react";
import { forwardRef } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

type ScrollAreaProps = ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  children: ReactNode;
};
type ScrollAreaRef = ElementRef<typeof ScrollAreaPrimitive.Root>;

const ScrollArea = forwardRef<ScrollAreaRef, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={`relative overflow-hidden ${className || ""}`}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

type ScrollBarProps = ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>;
type ScrollBarRef = ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>;

const ScrollBar = forwardRef<ScrollBarRef, ScrollBarProps>(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={`flex touch-none select-none transition-colors ${
        orientation === "vertical"
          ? "h-full w-2 border-l border-l-transparent p-[1px]"
          : "h-2 flex-col border-t border-t-transparent p-[1px]"
      } ${className || ""}`}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-gb-border-dark" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
);
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
