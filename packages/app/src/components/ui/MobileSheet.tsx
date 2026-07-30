import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export interface MobileSheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: JSX.Element;
}

export function MobileSheet(props: MobileSheetProps) {
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={props.onClose}
          />
          <section
            class="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl border border-b-0 border-slate-700 bg-slate-950 pb-[env(safe-area-inset-bottom)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
          >
            <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-600" />
            <header class="flex items-start justify-between gap-4 border-b border-slate-800 px-4 pb-3 pt-2">
              <div>
                <h2 class="font-semibold text-slate-100">{props.title}</h2>
                <Show when={props.description}>
                  <p class="mt-0.5 text-xs text-slate-500">
                    {props.description}
                  </p>
                </Show>
              </div>
              <button
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                aria-label="Close"
                onClick={props.onClose}
              >
                ×
              </button>
            </header>
            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              {props.children}
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
