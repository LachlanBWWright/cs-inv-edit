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
    setToasts((current) => [...current, { id, ...toast }]);
    globalThis.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4000);
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
