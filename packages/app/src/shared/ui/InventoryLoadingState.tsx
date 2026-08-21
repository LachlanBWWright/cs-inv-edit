import { For, createEffect } from "solid-js";

export type LoadingSkeletonVariant = "inventory" | "catalog";

export interface InventoryLoadingStateProps {
  active: boolean;
  title: string;
  currentStage?: string;
  variant?: LoadingSkeletonVariant;
}

// Enable temporarily when diagnosing slow backend or GC responses. Loading
// details stay out of the UI so they cannot cause reflow as messages change.
export const VERBOSE_LOADING_LOGS = false;

const skeletonCards = Array.from({ length: 12 }, (_, index) => index);
const inventorySkeletonGridStyle = {
  "grid-template-columns": "repeat(auto-fill, minmax(190px, 1fr))",
};

export function InventoryLoadingState(props: InventoryLoadingStateProps) {
  createEffect(() => {
    if (VERBOSE_LOADING_LOGS && props.active) {
      console.debug(`[loading] ${props.title}`, props.currentStage ?? "pending");
    }
  });

  const catalog = () => props.variant === "catalog";

  return (
    <section
      class="flex min-h-[calc(100vh-12rem)] w-full animate-pulse flex-col gap-4"
      role="status"
      aria-label={props.title}
      aria-busy={props.active}
    >
      <span class="sr-only">{props.title}</span>
      <div class="flex min-h-10 items-center justify-between gap-4" aria-hidden="true">
        <div class="h-7 w-44 rounded bg-slate-800" />
        <div class="h-10 w-28 rounded-lg bg-slate-800" />
      </div>
      <div class="flex flex-wrap gap-3" aria-hidden="true">
        <div class="h-10 min-w-48 flex-1 rounded-lg bg-slate-900" />
        <div class="h-10 w-32 rounded-lg bg-slate-900" />
        <div class="h-10 w-32 rounded-lg bg-slate-900" />
      </div>
      <div
        class={`grid flex-1 items-start ${catalog() ? "gap-4 md:grid-cols-2 2xl:grid-cols-3" : "gap-3"}`}
        style={catalog() ? undefined : inventorySkeletonGridStyle}
        aria-hidden="true"
      >
        <For each={skeletonCards}>
          {() => (
            <div class="flex h-[280px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
              <div class={`${catalog() ? "h-36" : "aspect-[4/3]"} bg-slate-800`} />
              <div class="flex flex-1 flex-col gap-3 p-4">
                <div class="h-4 w-4/5 rounded bg-slate-700" />
                <div class="h-3 w-3/5 rounded bg-slate-800" />
                <div class="mt-auto h-3 w-2/5 rounded bg-slate-800" />
              </div>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
