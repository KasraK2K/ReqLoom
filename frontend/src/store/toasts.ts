import { create } from "zustand";
import { getErrorMessage } from "../lib/errors";
import { createClientId } from "../lib/id";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastInput {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
}

export interface ToastRecord {
  id: string;
  title: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastState {
  toasts: ToastRecord[];
  pushToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const DEFAULT_DURATION_MS = 6000;

const DEFAULT_TITLES: Record<ToastVariant, string> = {
  success: "Success",
  error: "Something Went Wrong",
  warning: "Warning",
  info: "Notice",
};

function createToastId() {
  return createClientId("toast");
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: ({
    title,
    message,
    variant = "warning",
    durationMs = DEFAULT_DURATION_MS,
  }) => {
    const toast: ToastRecord = {
      id: createToastId(),
      title: title?.trim() || DEFAULT_TITLES[variant],
      message: message.trim() || "Something went wrong",
      variant,
      durationMs,
    };

    set((state) => ({
      toasts: [toast, ...state.toasts].slice(0, 5),
    }));

    return toast.id;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));

export function showToast(toast: ToastInput) {
  return useToastStore.getState().pushToast(toast);
}

export function dismissToast(id: string) {
  useToastStore.getState().dismissToast(id);
}

export function showSuccessToast(
  message: string,
  title = "Success",
  durationMs?: number,
) {
  return showToast({
    title,
    message,
    variant: "success",
    durationMs,
  });
}

export function showWarningToast(
  message: string,
  title = "Warning",
  durationMs?: number,
) {
  return showToast({
    title,
    message,
    variant: "warning",
    durationMs,
  });
}

export function showErrorToast(
  error: unknown,
  options: {
    title?: string;
    fallbackMessage?: string;
    durationMs?: number;
  } = {},
) {
  return showToast({
    title: options.title ?? DEFAULT_TITLES.error,
    message: getErrorMessage(
      error,
      options.fallbackMessage ?? "Something went wrong",
    ),
    variant: "error",
    durationMs: options.durationMs,
  });
}
