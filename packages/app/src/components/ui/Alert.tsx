import type { JSX } from "solid-js";

export interface AlertProps {
  children?: JSX.Element;
  class?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Alert(props: AlertProps) {
  const variants = {
    default: "border-slate-700 bg-slate-800/80 text-slate-200",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-100",
    danger: "border-rose-500/40 bg-rose-500/10 text-rose-100",
  };
  return (
    <div
      class={cn(
        "rounded-xl border p-4 text-sm shadow-sm",
        variants[props.variant ?? "default"],
        props.class,
      )}
    >
      {props.children}
    </div>
  );
}
