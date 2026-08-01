import { createEffect, onCleanup } from "solid-js";

export function useEscapeDismiss(active: () => boolean, dismiss: () => void) {
  createEffect(() => {
    if (!active()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });
}
