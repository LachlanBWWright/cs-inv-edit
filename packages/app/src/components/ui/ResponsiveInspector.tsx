import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";

export interface ResponsiveInspectorProps {
  open: boolean;
  selectionKey?: string;
  summary: JSX.Element;
  children: JSX.Element;
  label?: string;
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
        <button
          type="button"
          class="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
          aria-label="Collapse item details"
          onClick={() => setExpanded(false)}
        />
      </Show>
      <aside
        class={`border-slate-700 bg-slate-950/98 shadow-2xl lg:static lg:z-auto lg:block lg:h-full lg:min-h-0 lg:overflow-hidden lg:border-0 lg:bg-transparent lg:shadow-none ${
          props.open
            ? `fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border border-b-0 pb-[env(safe-area-inset-bottom)] ${
                expanded() ? "h-[min(82dvh,52rem)]" : "h-20"
              }`
            : "hidden"
        }`}
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
          class={`min-h-0 border-t border-slate-800 lg:h-full lg:border-0 ${
            expanded() ? "h-[calc(100%-5rem)] overflow-y-auto p-3" : "hidden"
          } lg:block lg:p-0`}
        >
          {props.children}
        </div>
      </aside>
    </>
  );
}
