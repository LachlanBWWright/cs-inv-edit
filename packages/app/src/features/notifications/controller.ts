import { createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import type { ToastItem } from "../../shared/ui/ToastViewport.js";

export interface ToastController {
  toasts: Accessor<ToastItem[]>;
  setToasts: Setter<ToastItem[]>;
  pushToast: (toast: Omit<ToastItem, "id">) => string;
  updateToast: (id: string, toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

export function createToastController(): ToastController {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);
  const timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();

  const scheduleDismissal = (id: string, variant?: ToastItem["variant"]) => {
    const previous = timers.get(id);
    if (previous !== undefined) globalThis.clearTimeout(previous);
    timers.set(
      id,
      globalThis.setTimeout(() => {
        timers.delete(id);
        setToasts((current) => current.filter((item) => item.id !== id));
      }, variant === "danger" ? 8000 : 4000),
    );
  };

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => {
      const withoutDuplicate = current.filter(
        (item) =>
          item.title !== toast.title || item.description !== toast.description,
      );
      return [...withoutDuplicate, { id, ...toast }].slice(-3);
    });
    scheduleDismissal(id, toast.variant);
    return id;
  };

  const updateToast = (id: string, toast: Omit<ToastItem, "id">) => {
    setToasts((current) =>
      current.map((item) => (item.id === id ? { id, ...toast } : item)),
    );
    scheduleDismissal(id, toast.variant);
  };

  const dismissToast = (id: string) => {
    const timer = timers.get(id);
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timers.delete(id);
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  return {
    toasts,
    setToasts,
    pushToast,
    updateToast,
    dismissToast,
  };
}
