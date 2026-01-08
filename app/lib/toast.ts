import { toast, Slide } from 'react-toastify';
import type { ToastOptions } from 'react-toastify';

// Default toast options matching the Game Boy theme
const defaultOptions: ToastOptions = {
  position: 'bottom-right',
  autoClose: 4000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  transition: Slide,
};

// Success toast - green accent
export const showSuccess = (message: string, options?: ToastOptions) => {
  toast.success(message, {
    ...defaultOptions,
    ...options,
    className: 'gb-toast gb-toast-success',
    progressClassName: 'gb-toast-progress-success',
  });
};

// Error toast - red accent
export const showError = (message: string, options?: ToastOptions) => {
  toast.error(message, {
    ...defaultOptions,
    autoClose: 6000, // Errors stay longer
    ...options,
    className: 'gb-toast gb-toast-error',
    progressClassName: 'gb-toast-progress-error',
  });
};

// Warning toast - amber accent
export const showWarning = (message: string, options?: ToastOptions) => {
  toast.warning(message, {
    ...defaultOptions,
    ...options,
    className: 'gb-toast gb-toast-warning',
    progressClassName: 'gb-toast-progress-warning',
  });
};

// Info toast - blue accent
export const showInfo = (message: string, options?: ToastOptions) => {
  toast.info(message, {
    ...defaultOptions,
    ...options,
    className: 'gb-toast gb-toast-info',
    progressClassName: 'gb-toast-progress-info',
  });
};

// Loading toast - returns ID to update later
export const showLoading = (message: string, options?: ToastOptions) => {
  return toast.loading(message, {
    ...defaultOptions,
    autoClose: false,
    ...options,
    className: 'gb-toast gb-toast-loading',
  });
};

// Update a loading toast
export const updateToast = (
  toastId: string | number,
  message: string,
  type: 'success' | 'error' | 'warning' | 'info',
  options?: ToastOptions
) => {
  const className = `gb-toast gb-toast-${type}`;
  toast.update(toastId, {
    render: message,
    type,
    isLoading: false,
    autoClose: 4000,
    className,
    ...options,
  });
};

// Dismiss a specific toast
export const dismissToast = (toastId?: string | number) => {
  if (toastId) {
    toast.dismiss(toastId);
  } else {
    toast.dismiss();
  }
};

// Sandbox-specific error messages
export const sandboxErrors = {
  connectionFailed: () => showError('Failed to connect to sandbox. Please try again.'),
  timeout: () => showError('Sandbox operation timed out. The server may be busy.'),
  notReady: () => showWarning('Sandbox is still initializing. Please wait...'),
  disconnected: () => showError('Lost connection to sandbox. Attempting to reconnect...'),
  quotaExceeded: () => showError('Sandbox quota exceeded. Please wait before creating new sandboxes.'),
  fileWriteFailed: (filename: string) => showError(`Failed to write file: ${filename}`),
  commandFailed: (cmd: string) => showError(`Command failed: ${cmd}`),
  previewFailed: () => showError('Failed to start preview server.'),
};

// Agent-specific messages
export const agentMessages = {
  started: () => showInfo('Agent is working on your request...'),
  completed: () => showSuccess('Task completed successfully!'),
  failed: (error?: string) => showError(error || 'Agent encountered an error.'),
  cancelled: () => showWarning('Request was cancelled.'),
};
