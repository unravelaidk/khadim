export interface WindowCloseEvent {
  preventDefault: () => void;
}

/** Keep the window alive only while the app transitions through its bounded quit path. */
export function handleWindowClose(
  event: WindowCloseEvent,
  quitting: boolean,
  requestQuit: () => void,
): void {
  if (quitting) return;
  event.preventDefault();
  requestQuit();
}
