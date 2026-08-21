import { Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { IconButton } from "./IconButton.js";
import { ModalBackdrop } from "./ModalBackdrop.js";
import { useEscapeDismiss } from "./modal-dismiss.js";

export interface MobileSheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: JSX.Element;
}

function SheetHeader(props: { title: string; description?: string; onClose: () => void }) {
  return (
    <header class="flex items-start justify-between gap-4 border-b border-slate-800 px-4 pb-3 pt-2">
      <div>
        <h2 class="font-semibold text-slate-100">{props.title}</h2>
        <Show when={props.description}>
          <p class="mt-0.5 text-xs text-slate-500">{props.description}</p>
        </Show>
      </div>
      <IconButton label="Close" class="border-transparent text-xl text-slate-400" onClick={props.onClose}>
        ×
      </IconButton>
    </header>
  );
}

export function MobileSheet(props: MobileSheetProps) {
  useEscapeDismiss(() => props.open, props.onClose);

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 sm:hidden">
          <ModalBackdrop class="absolute inset-0" label="Close" onClick={props.onClose} />
          <section
            class="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl border border-b-0 border-slate-700 bg-slate-950 pb-[env(safe-area-inset-bottom)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
          >
            <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-600" />
            <SheetHeader title={props.title} description={props.description} onClose={props.onClose} />
            <div class="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
