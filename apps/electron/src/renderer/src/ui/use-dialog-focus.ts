import { useEffect, useRef } from "react";

const dialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogFocus<T extends HTMLElement>(onClose: () => void): React.RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return undefined;

    (dialog.querySelector<HTMLElement>(dialogFocusableSelector) ?? dialog).focus();
    const backdrop = dialog.parentElement;
    const backgroundStates = backdrop?.parentElement
      ? Array.from(backdrop.parentElement.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop)
        .map((element) => ({
          element,
          inert: element.inert,
          inertAttribute: element.hasAttribute("inert"),
          ariaHidden: element.getAttribute("aria-hidden"),
        }))
      : [];
    backgroundStates.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const escapeLayerClose = dialog.querySelector<HTMLButtonElement>("[data-dialog-escape-close]");
        if (escapeLayerClose) {
          escapeLayerClose.click();
          if (escapeLayerClose.isConnected) escapeLayerClose.focus({ preventScroll: true });
          else window.requestAnimationFrame(() => (dialog.querySelector<HTMLElement>(dialogFocusableSelector) ?? dialog).focus({ preventScroll: true }));
          return;
        }
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(dialogFocusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      backgroundStates.forEach(({ element, inert, inertAttribute, ariaHidden }) => {
        element.inert = inert;
        if (!inertAttribute) element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    };
  }, []);

  return dialogRef;
}
