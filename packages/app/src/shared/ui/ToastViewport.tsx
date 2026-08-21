import { For, Show } from "solid-js";
import { Button } from "./Button.js";
import type { StatusTone } from "../ui-types.js";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: StatusTone;
}

export interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

function ToastCard(props: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const variants = {
    default: "border-slate-700 bg-slate-900 text-slate-100",
    success: "border-emerald-700 bg-emerald-950 text-emerald-100",
    warning: "border-amber-700 bg-amber-950 text-amber-100",
    danger: "border-rose-700 bg-rose-950 text-rose-100",
  };

  return (
    <div
      role={props.toast.variant === "danger" ? "alert" : "status"}
      aria-live={props.toast.variant === "danger" ? "assertive" : "polite"}
      class={`pointer-events-auto rounded-xl border p-4 shadow-md shadow-black ${variants[props.toast.variant ?? "default"]}`}
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="font-semibold">{props.toast.title}</p>
          <Show when={props.toast.description}>
            <p class="mt-1 text-sm opacity-80">{props.toast.description}</p>
          </Show>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="p-1"
          label={`Dismiss ${props.toast.title}`}
          onClick={() => props.onDismiss(props.toast.id)}
        >
          ×
        </Button>
      </div>
    </div>
  );
}

export function ToastViewport(props: ToastViewportProps) {
  return (
    <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-3">
      <For each={props.toasts}>
        {(toast) => <ToastCard toast={toast} onDismiss={props.onDismiss} />}
      </For>
    </div>
  );
}
