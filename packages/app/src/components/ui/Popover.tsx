import { onCleanup, onMount, type JSX } from "solid-js";

export interface PopoverProps {
  children: JSX.Element;
  class?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isEventInside(element: HTMLElement, event: Event) {
  const target = event.target;
  return target instanceof Node && element.contains(target);
}

export function Popover(props: PopoverProps) {
  let root: HTMLDivElement | undefined;

  onMount(() => {
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (props.open && root && !isEventInside(root, event)) {
        props.onOpenChange(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (props.open && event.key === "Escape") {
        props.onOpenChange(false);
      }
    };

    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    onCleanup(() => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
      document.removeEventListener("keydown", dismissOnEscape);
    });
  });

  return (
    <div
      ref={(element) => {
        root = element;
      }}
      class={props.class}
    >
      {props.children}
    </div>
  );
}
