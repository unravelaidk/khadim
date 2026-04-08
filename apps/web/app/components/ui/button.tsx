"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
  children?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:pointer-events-none hover:-translate-y-0.5 active:translate-y-0 shadow-sm hover:shadow-md";
    
    const variants = {
      primary: "bg-[#10150a] text-[var(--text-inverse)] hover:shadow-gb-neon hover:bg-[#1a1a1a] dark:hover:bg-[#e5e5e5] dark:hover:text-black border border-transparent",
      secondary: "bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 border border-black/5 dark:border-white/5",
      ghost: "text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5",
    };
    
    const sizes = {
      sm: "px-3 py-1.5 text-sm rounded-full",
      md: "px-4 py-2.5 text-sm rounded-full",
      lg: "px-6 py-3 text-base rounded-full",
    };
    
    return (
      <Comp
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className || ""}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
export type { ButtonProps };
