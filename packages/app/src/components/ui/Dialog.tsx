import { Show, createEffect, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
}

export function Dialog(props: DialogProps) {
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" class="absolute inset-0 cursor-default bg-slate-950/80 backdrop-blur-sm" aria-label="Close dialog" onClick={() => props.onOpenChange(false)} />
          <section class="relative z-10 flex max-h-[90vh] w-[min(94vw,88rem)] flex-col rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="collection-dialog-title">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 id="collection-dialog-title" class="text-lg font-semibold">{props.title}</h2>
                <Show when={props.description}><p class="mt-1 text-sm text-slate-400">{props.description}</p></Show>
              </div>
              <button type="button" class="rounded-md px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60" aria-label="Close" onClick={() => props.onOpenChange(false)}>×</button>
            </div>
            <div class="mt-5 min-h-0 overflow-y-auto">{props.children}</div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
