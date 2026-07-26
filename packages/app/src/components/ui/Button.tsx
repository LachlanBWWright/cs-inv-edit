import type { JSX } from "solid-js";

export interface ButtonProps {
  children?: JSX.Element;
  class?: string;
  variant?: "default" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
}

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button(props: ButtonProps) {
  const variant = props.variant ?? "default";
  const size = props.size ?? "md";
  const base =
    "inline-flex cursor-pointer items-center justify-center rounded-lg border font-medium transition active:translate-y-px focus:outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60";
  const styles = {
    default: "border-cyan-500/40 bg-cyan-600 text-white hover:bg-cyan-500",
    secondary:
      "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700",
    danger: "border-rose-400/40 bg-rose-600 text-white hover:bg-rose-500",
    ghost:
      "border-transparent bg-transparent text-slate-200 hover:bg-slate-800",
  };
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3 py-2 text-sm",
    lg: "px-4 py-2.5 text-sm",
  };

  return (
    <button
      type={props.type ?? "button"}
      class={cn(base, styles[variant], sizes[size], props.class)}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
