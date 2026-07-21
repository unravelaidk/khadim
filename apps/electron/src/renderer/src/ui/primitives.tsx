import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "small" | "medium";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "secondary",
  size = "medium",
  iconOnly = false,
  className,
  type = "button",
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(
        "daisy-btn",
        size === "small" ? "daisy-btn-sm" : "daisy-btn-md",
        iconOnly && "daisy-btn-square",
        variant === "primary" && "daisy-btn-primary",
        variant === "quiet" && "daisy-btn-ghost",
        variant === "danger" && "daisy-btn-error",
        "kh-button",
        `kh-button-${variant}`,
        iconOnly && "kh-button-icon",
        className,
      )}
      {...props}
    />
  );
});

export function IconButton(props: Omit<ButtonProps, "iconOnly">): React.JSX.Element {
  return <Button {...props} iconOnly />;
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({
  className,
  ...props
}, ref) {
  return <input ref={ref} className={classes("daisy-input", "kh-input", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({
  className,
  ...props
}, ref) {
  return <select ref={ref} className={classes("daisy-select", "kh-select", className)} {...props} />;
});

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return <span className={classes("daisy-badge", "daisy-badge-sm", "kh-badge", className)} {...props} />;
}

export function Toggle({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">): React.JSX.Element {
  return <input type="checkbox" className={classes("daisy-toggle", "daisy-toggle-sm", "daisy-toggle-primary", "kh-toggle", className)} {...props} />;
}
