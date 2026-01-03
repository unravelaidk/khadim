import * as React from "react"
import { useState, useRef, useEffect } from "react"

export const DropdownMenu = ({ children }: { children: React.ReactNode }) => {
  return <div className="relative inline-block text-left">{children}</div>
}

export const DropdownMenuTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
  // Logic is handled by the parent MenuContent usually, but for a simple custom implementation
  // we might need a context or simple state lifting.
  // Actually, for a truly lightweight single-file solution without Context API overhead:
  return <div className="inline-block">{children}</div>
}
// Rethinking: Context is better for compound components.

const DropdownContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export const DropdownRoot = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  );
};

export const DropdownTrigger = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const context = React.useContext(DropdownContext);
  if (!context) throw new Error("DropdownTrigger must be used within DropdownRoot");
  
  return (
    <div onClick={() => context.setOpen(!context.open)} className={`cursor-pointer ${className || ""}`}>
      {children}
    </div>
  );
};

export const DropdownContent = ({ children, className, align = "end" }: { children: React.ReactNode, className?: string, align?: "start" | "end" }) => {
  const context = React.useContext(DropdownContext);
  if (!context || !context.open) return null;

  const alignmentClass = align === "end" ? "right-0" : "left-0";

  return (
    <div className={`absolute ${alignmentClass} mt-2 w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 animate-in fade-in zoom-in-95 duration-100 ${className || ""}`}>
      <div className="py-1" role="menu" aria-orientation="vertical">
        {children}
      </div>
    </div>
  );
};

export const DropdownItem = ({ children, onClick, className }: { children: React.ReactNode, onClick?: () => void, className?: string }) => {
    const context = React.useContext(DropdownContext);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent event bubbling
        if (onClick) onClick();
        context?.setOpen(false);
    }

  return (
    <button
      onClick={handleClick}
      className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${className || ""}`}
      role="menuitem"
    >
      {children}
    </button>
  );
};
