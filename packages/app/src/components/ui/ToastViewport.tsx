import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "./Button.js";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

export interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastViewport(props: ToastViewportProps) {
  return (
    <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-3">
      <For each={props.toasts}>
        {(toast) => {
          const variants = {
            default: "border-slate-700 bg-slate-900/95 text-slate-100",
            success: "border-emerald-500/30 bg-emerald-950/90 text-emerald-100",
            warning: "border-amber-500/30 bg-amber-950/90 text-amber-100",
            danger: "border-rose-500/30 bg-rose-950/90 text-rose-100",
          };
          return (
            <div class={`pointer-events-auto rounded-xl border p-4 shadow-2xl ${variants[toast.variant ?? "default"]}`}>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold">{toast.title}</p>
                  <Show when={toast.description}>
                    <p class="mt-1 text-sm opacity-80">{toast.description}</p>
                  </Show>
                </div>
                <Button variant="ghost" size="sm" class="p-1" onClick={() => props.onDismiss(toast.id)}>
                  ×
                </Button>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
