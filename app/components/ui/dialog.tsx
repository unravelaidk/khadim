import type { ComponentPropsWithoutRef, ElementRef, FC, HTMLAttributes } from "react";
import { forwardRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const Dialog: FC<ComponentPropsWithoutRef<typeof DialogPrimitive.Root>> = DialogPrimitive.Root;
const DialogTrigger: FC<ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>> = DialogPrimitive.Trigger;
const DialogPortal: FC<ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>> = DialogPrimitive.Portal;
const DialogClose: FC<ComponentPropsWithoutRef<typeof DialogPrimitive.Close>> = DialogPrimitive.Close;

type DialogOverlayProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;
type DialogOverlayRef = ElementRef<typeof DialogPrimitive.Overlay>;

const DialogOverlay = forwardRef<DialogOverlayRef, DialogOverlayProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={`fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className || ""}`}
      {...props}
    />
  )
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;
type DialogContentRef = ElementRef<typeof DialogPrimitive.Content>;

const DialogContent = forwardRef<DialogContentRef, DialogContentProps>(
  ({ className, children, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={`fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-gb-bg-card shadow-gb-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${className || ""}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader: FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={`p-6 border-b border-gb-border ${className || ""}`}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter: FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={`p-6 flex gap-3 border-t border-gb-border ${className || ""}`}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

type DialogTitleProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Title>;
type DialogTitleRef = ElementRef<typeof DialogPrimitive.Title>;

const DialogTitle = forwardRef<DialogTitleRef, DialogTitleProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={`text-lg font-semibold text-gb-text ${className || ""}`}
      {...props}
    />
  )
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

type DialogDescriptionProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Description>;
type DialogDescriptionRef = ElementRef<typeof DialogPrimitive.Description>;

const DialogDescription = forwardRef<DialogDescriptionRef, DialogDescriptionProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description
      ref={ref}
      className={`text-sm text-gb-text-muted ${className || ""}`}
      {...props}
    />
  )
);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
