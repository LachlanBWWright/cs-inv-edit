import { createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import type { ToastItem } from "../../components/ui/ToastViewport.js";

export interface ToastController {
  toasts: Accessor<ToastItem[]>;
  setToasts: Setter<ToastItem[]>;
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

export function createToastController(): ToastController {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => {
      const withoutDuplicate = current.filter(
        (item) =>
          item.title !== toast.title || item.description !== toast.description,
      );
      return [...withoutDuplicate, { id, ...toast }].slice(-3);
    });
    globalThis.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, toast.variant === "danger" ? 8000 : 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  return {
    toasts,
    setToasts,
    pushToast,
    dismissToast,
  };
}
