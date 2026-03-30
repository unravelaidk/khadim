import * as React from "react"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-10 w-full rounded-2xl border border-[var(--glass-border)]/20 bg-white/50 backdrop-blur-sm px-4 py-2 text-sm shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--input-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-black/50 dark:border-white/10 dark:focus-visible:ring-white/20 hover:border-[var(--glass-border)]/40 dark:hover:border-white/20 ${className || ""}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
