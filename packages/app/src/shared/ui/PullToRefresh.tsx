import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";

const pullThreshold = 72;

export function supportsPullToRefresh() {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}

export interface PullToRefreshProps {
  class?: string;
  children: JSX.Element;
  onRefresh: () => void;
  onScroll?: JSX.EventHandlerUnion<HTMLDivElement, Event>;
  ref?: (element: HTMLDivElement) => void;
}

export function PullToRefresh(props: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);
  let element: HTMLDivElement | undefined;
  let startY: number | undefined;

  onMount(() => {
    if (!element || !supportsPullToRefresh()) return;
    const touchStart = (event: TouchEvent) => {
      if (element?.scrollTop !== 0 || event.touches.length !== 1) return;
      startY = event.touches[0]?.clientY;
    };
    const touchMove = (event: TouchEvent) => {
      if (startY === undefined || !element || element.scrollTop !== 0) return;
      const distance = Math.max(
        0,
        (event.touches[0]?.clientY ?? startY) - startY,
      );
      if (distance === 0) return;
      event.preventDefault();
      setPullDistance(Math.min(distance * 0.55, 104));
    };
    const touchEnd = () => {
      if (pullDistance() >= pullThreshold && !refreshing()) {
        setRefreshing(true);
        props.onRefresh();
        globalThis.setTimeout(() => setRefreshing(false), 700);
      }
      startY = undefined;
      setPullDistance(0);
    };
    element.addEventListener("touchstart", touchStart, { passive: true });
    element.addEventListener("touchmove", touchMove, { passive: false });
    element.addEventListener("touchend", touchEnd, { passive: true });
    element.addEventListener("touchcancel", touchEnd, { passive: true });
    onCleanup(() => {
      element?.removeEventListener("touchstart", touchStart);
      element?.removeEventListener("touchmove", touchMove);
      element?.removeEventListener("touchend", touchEnd);
      element?.removeEventListener("touchcancel", touchEnd);
    });
  });

  return (
    <div
      ref={(node) => {
        element = node;
        props.ref?.(node);
      }}
      class={`relative ${props.class ?? ""}`}
      onScroll={props.onScroll}
    >
      <Show when={supportsPullToRefresh()}>
        <div
          class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center transition-transform duration-150"
          style={{ transform: `translateY(${pullDistance() - 44}px)` }}
          aria-hidden="true"
        >
          <div class="flex h-9 items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 text-xs font-medium text-cyan-200 shadow-sm shadow-black">
            <span
              class={`h-4 w-4 rounded-full border-2 border-slate-700 border-t-cyan-300 ${refreshing() ? "animate-spin" : ""}`}
            />
            {refreshing()
              ? "Refreshing…"
              : pullDistance() >= pullThreshold
                ? "Release to refresh"
                : "Pull to refresh"}
          </div>
        </div>
      </Show>
      {props.children}
    </div>
  );
}
