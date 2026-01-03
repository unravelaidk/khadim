import * as React from "react"
import { useState, useRef, useEffect, useContext, createContext } from "react"

// Context
interface SelectContextType {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedLabel: string | null;
  registerOption: (value: string, label: string) => void;
}

const SelectContext = createContext<SelectContextType | null>(null);

// Types
interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

// 1. Root
export const Select = ({ value, onValueChange, children }: SelectProps) => {
  const [open, setOpen] = useState(false);
  const [optionsMap, setOptionsMap] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const registerOption = (val: string, label: string) => {
      // Simple atomic update to map if missing
      setOptionsMap(prev => {
          if (prev[val] === label) return prev;
          return { ...prev, [val]: label };
      });
  };

  const selectedLabel = optionsMap[value] || value;

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, selectedLabel, registerOption }}>
      <div ref={ref} className="relative inline-block w-full">
        {children}
      </div>
    </SelectContext.Provider>
  );
};

// 2. Trigger
interface SelectTriggerProps {
    children: React.ReactNode;
    className?: string;
}
export const SelectTrigger = ({ children, className }: SelectTriggerProps) => {
  const context = useContext(SelectContext);
  if (!context) throw new Error("SelectTrigger must be used within Select");

  return (
    <button
      onClick={() => context.setOpen(!context.open)}
      className={`flex h-10 w-full items-center justify-between rounded-md border border-gb-border bg-white px-3 py-2 text-sm shadow-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
    >
      {children}
      <span className="opacity-50 ml-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
             <path d="m6 9 6 6 6-6"/>
        </svg>
      </span>
    </button>
  );
};

// 3. Value
interface SelectValueProps {
    placeholder?: string;
}
export const SelectValue = ({ placeholder }: SelectValueProps) => {
    const context = useContext(SelectContext);
    if (!context) return null;
    
    return (
        <span className="block truncate">
            {context.value ? context.selectedLabel : placeholder}
        </span>
    );
};

// 4. Content (Dropdown)
export const SelectContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const context = useContext(SelectContext);
  if (!context || !context.open) return null;

  return (
    <div className={`absolute z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-auto rounded-md border border-gb-border bg-white text-gb-text shadow-lg ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in-95 duration-100 ${className || ""}`}>
      <div className="p-1">
        {children}
      </div>
    </div>
  );
};

// 5. Item
interface SelectItemProps {
    value: string;
    children: React.ReactNode;
    className?: string;
}
export const SelectItem = ({ value, children, className }: SelectItemProps) => {
    const context = useContext(SelectContext);
    
    // Register label Effect
    useEffect(() => {
        if (context && typeof children === 'string') {
            context.registerOption(value, children);
        }
    }, [context, value, children]);
    
    if (!context) return null;

    const isSelected = context.value === value;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        context.onValueChange(value);
        context.setOpen(false);
    };

    return (
        <div
            onClick={handleClick}
            className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-gb-bg-subtle hover:text-gb-text data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${isSelected ? "bg-gb-bg-subtle text-gb-accent font-medium" : ""} ${className || ""}`}
        >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="mb-[1px]">
                         <path d="M20 6 9 17l-5-5"/>
                    </svg>
                )}
            </span>
            <span className="truncate">{children}</span>
        </div>
    );
};
