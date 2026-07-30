import type { JSX } from "solid-js";

export interface IconButtonProps {
  children: JSX.Element;
  label: string;
  title?: string;
  class?: string;
  disabled?: boolean;
  expanded?: boolean;
  popup?: "menu" | "dialog";
  onClick?: (event: MouseEvent) => void;
}

export function IconButton(props: IconButtonProps) {
  return (
    <button
      type="button"
      class={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60 ${props.class ?? ""}`}
      aria-label={props.label}
      aria-haspopup={props.popup}
      aria-expanded={props.expanded}
      title={props.title ?? props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
