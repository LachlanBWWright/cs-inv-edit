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
    default: "border-slate-700 bg-slate-800 text-slate-200",
    success: "border-emerald-700 bg-emerald-950 text-emerald-200",
    warning: "border-amber-700 bg-amber-950 text-amber-100",
    danger: "border-rose-700 bg-rose-950 text-rose-100",
  };
  return (
    <div
      role={props.variant === "danger" ? "alert" : "status"}
      aria-live={props.variant === "danger" ? "assertive" : "polite"}
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
