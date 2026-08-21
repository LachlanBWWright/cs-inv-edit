import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import { ModalBackdrop } from "./ModalBackdrop.js";

export interface ResponsiveInspectorProps {
  open: boolean;
  selectionKey?: string;
  summary: JSX.Element;
  children: JSX.Element;
  label?: string;
}

function inspectorClass(open: boolean, expanded: boolean) {
  const mobileClass = expanded ? "h-[min(82dvh,52rem)]" : "h-20";
  const visibilityClass = open
    ? `fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border border-b-0 pb-[env(safe-area-inset-bottom)] ${mobileClass}`
    : "hidden";
  return `border-slate-700 bg-slate-950 shadow-md shadow-black lg:sticky lg:top-[5.4375rem] lg:order-1 lg:z-auto lg:block lg:h-[calc(100dvh-6.4375rem)] lg:self-start lg:overflow-hidden lg:border-0 lg:bg-transparent lg:shadow-none ${visibilityClass}`;
}

export function ResponsiveInspector(props: ResponsiveInspectorProps) {
  const [expanded, setExpanded] = createSignal(false);

  createEffect(() => {
    void props.selectionKey;
    setExpanded(false);
  });

  createEffect(() => {
    if (!expanded()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  return (
    <>
      <Show when={props.open && expanded()}>
        <ModalBackdrop
          class="fixed inset-0 z-30 lg:hidden"
          label="Collapse item details"
          onClick={() => setExpanded(false)}
        />
      </Show>
      <aside
        class={inspectorClass(props.open, expanded())}
        aria-label={props.label ?? "Selected item details"}
      >
        <button
          type="button"
          class="flex h-20 w-full items-center gap-3 px-4 text-left lg:hidden"
          aria-expanded={expanded()}
          onClick={() => setExpanded((value) => !value)}
        >
          <span class="min-w-0 flex-1">{props.summary}</span>
          <span class="shrink-0 text-xs font-semibold text-cyan-300">
            {expanded() ? "Collapse" : "Details"}
          </span>
          <svg
            class={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              expanded() ? "rotate-180" : ""
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div
          class={`min-h-0 border-t border-slate-800 lg:border-0 ${
            expanded() ? "h-[calc(100%-5rem)] overflow-y-auto p-3" : "hidden"
          } lg:block lg:h-full lg:overflow-hidden lg:p-0`}
        >
          {props.children}
        </div>
      </aside>
    </>
  );
}
